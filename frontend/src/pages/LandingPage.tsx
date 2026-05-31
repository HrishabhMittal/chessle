import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FEATURED_TIME_CONTROLS, TIME_CONTROLS, createGame } from '../lib/gameUtils';
import { Bot, Users, X } from 'lucide-react';
import { api } from '../lib/api';

export default function LandingPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  

  const [isSearching, setIsSearching] = useState(false);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);


  const [showBotModal, setShowBotModal] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [botColor, setBotColor] = useState<'white' | 'black' | 'random'>('random');
  const [botTc, setBotTc] = useState(TIME_CONTROLS[7]);


  useEffect(() => {
    if (!isSearching || !activeTicketId) return;

    const timer = setInterval(() => setSearchSeconds(s => s + 1), 1000);
    
    const poll = setInterval(async () => {
      const { matchedGameId } = await api.getMatchmakingStatus(activeTicketId);
      if (matchedGameId) {
        clearInterval(poll);
        clearInterval(timer);
        navigate(`/game/${matchedGameId}`);
      }
    }, 1000);

    return () => { clearInterval(timer); clearInterval(poll); };
  }, [isSearching, activeTicketId, navigate]);

  async function startMatchmaking(minutes: number, increment: number) {
    if (!user || !profile) { navigate('/login'); return; }
    
    setIsSearching(true);
    setSearchSeconds(0);
    
    const { ticketId } = await api.joinMatchmaking({
      timeMin: minutes,
      timeInc: increment,
      rating: profile.rating
    });
    
    setActiveTicketId(ticketId);
  }

  async function cancelMatchmaking() {
    await api.cancelMatchmaking();
    setIsSearching(false);
    setActiveTicketId(null);
  }

  async function startBotGame() {
    if (!user || !profile) { navigate('/login'); return; }
    const resolvedColor = botColor === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : botColor;
    const whiteId = resolvedColor === 'white' ? user.id : null;
    const blackId = resolvedColor === 'black' ? user.id : null;
    const { data, error } = await createGame(whiteId, blackId, botTc.minutes, botTc.increment, true, resolvedColor === 'white' ? 'black' : 'white');
    if (!error && data) navigate(`/game/${data.id}?bot=${botDifficulty}`);
    setShowBotModal(false);
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 h-full">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center gap-12 lg:gap-24">
        
        {/* Left Side: Hero */}
        <div className="flex-1 text-center lg:text-left">
          <h1 className="text-5xl lg:text-7xl font-extrabold text-zinc-100 tracking-tight mb-4">
            Play Chess<br />
            <span className="text-zinc-600">Free, Forever.</span>
          </h1>
          <p className="text-zinc-400 text-lg mb-8 max-w-md mx-auto lg:mx-0">
            Clean interface. Infinite Game Analysis. Personalised Suggestions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <button onClick={() => user ? document.getElementById('quick-pair')?.scrollIntoView({behavior: 'smooth'}) : navigate('/register')} className="flex items-center justify-center gap-2 bg-zinc-200 hover:bg-white text-zinc-900 font-bold px-8 py-4 rounded-xl transition-colors">
              <Users size={20} /> {user ? 'Find Opponent' : 'Create Account'}
            </button>
            <button onClick={() => setShowBotModal(true)} className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold px-8 py-4 rounded-xl transition-colors">
              <Bot size={20} /> Play Computer
            </button>
          </div>
        </div>

        <div id="quick-pair" className="w-full max-w-[420px] bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-xs font-bold text-zinc-500 mb-4 uppercase tracking-wider text-center">Quick Pairing</h2>
          <div className="grid grid-cols-3 gap-3">
            {FEATURED_TIME_CONTROLS.map(tc => {
              return (
                <button
                  key={`${tc.minutes}+${tc.increment}`}
                  onClick={() => startMatchmaking(tc.minutes, tc.increment)}
                  disabled={isSearching}
                  className="relative flex flex-col items-center justify-center py-5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all disabled:opacity-50"
                >
                  <span className="text-2xl font-bold text-zinc-200 mb-1">{tc.label}</span>
                  <span className="text-xs text-zinc-500 capitalize font-medium">{tc.category}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isSearching && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm text-center flex flex-col items-center">
             <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6" />
             <h3 className="text-xl font-bold text-zinc-100 mb-2">Finding Opponent...</h3>
             <p className="text-zinc-500 font-mono text-sm mb-8">Time elapsed: {searchSeconds}s</p>
             <button onClick={cancelMatchmaking} className="w-full py-3 bg-zinc-900 text-zinc-400 hover:text-zinc-200 rounded-xl border border-zinc-800 transition-colors flex items-center justify-center gap-2 font-bold">
               <X size={18} /> Cancel Search
             </button>
          </div>
        </div>
      )}

      {showBotModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowBotModal(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-zinc-100 mb-6 text-center">Setup Bot Game</h3>
            
            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Difficulty</label>
                <div className="flex gap-2">
                  {(['easy', 'medium', 'hard'] as const).map(d => (
                    <button key={d} onClick={() => setBotDifficulty(d)} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${botDifficulty === d ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Color</label>
                <div className="flex gap-2">
                  {(['white', 'black', 'random'] as const).map(c => (
                    <button key={c} onClick={() => setBotColor(c)} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${botColor === c ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Time Control</label>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_CONTROLS.map(tc => {
                    const isSelected = botTc.minutes === tc.minutes && botTc.increment === tc.increment;
                    return (
                      <button key={`${tc.minutes}+${tc.increment}`} onClick={() => setBotTc(tc)} className={`py-1.5 rounded-md text-xs font-medium transition-colors ${isSelected ? 'bg-blue-600 text-white border border-blue-500' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800'}`}>
                        {tc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowBotModal(false)} className="flex-1 py-2.5 bg-zinc-900 text-zinc-400 rounded-lg text-sm font-medium hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={startBotGame} className="flex-1 py-2.5 bg-zinc-200 text-zinc-900 rounded-lg text-sm font-bold hover:bg-white transition-colors">Start Game</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
