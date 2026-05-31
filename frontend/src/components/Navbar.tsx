import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, LogOut, Bell, Search, Swords, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  
  const [pendingChallenges, setPendingChallenges] = useState<any[]>([]);
  const [showChallenges, setShowChallenges] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<any>(null);
  
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    loadPendingChallenges();
    const channel = supabase.channel(`challenges:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `challenged_id=eq.${user.id}` }, () => { loadPendingChallenges(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function loadPendingChallenges() {
    const { data } = await api.getPendingChallenges();
    if (data && data.length > 0) {
      const ids = data.map((c: any) => c.challenger_id);
      const { data: profiles } = await supabase.from('profiles').select('id,username').in('id', ids);
      const profileMap: Record<string, string> = {};
      profiles?.forEach((p: any) => { profileMap[p.id] = p.username; });
      setPendingChallenges(data.map((c: any) => ({ ...c, challenger_username: profileMap[c.challenger_id] ?? 'Unknown' })));
    } else {
      setPendingChallenges([]);
    }
  }

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
      const { data } = await api.searchProfiles(searchQuery);
      setSearchResults(data ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function respondToChallenge(challengeId: string, accept: boolean) {
    if (!user) return;
    const challenge = pendingChallenges.find(c => c.id === challengeId);
    if (!challenge) return;
    const color = Math.random() < 0.5 ? 'white' : 'black';
    const gameData = accept ? {
      white_player_id: color === 'white' ? user.id : challenge.challenger_id,
      black_player_id: color === 'black' ? user.id : challenge.challenger_id,
      time_control_minutes: challenge.time_control_minutes,
      time_control_increment: challenge.time_control_increment,
      white_time_ms: challenge.time_control_minutes * 60 * 1000,
      black_time_ms: challenge.time_control_minutes * 60 * 1000,
      status: 'active',
    } : null;
    const { data: newGame } = await api.respondToChallenge(challengeId, { accept, challenge, gameData });
    setPendingChallenges(prev => prev.filter(c => c.id !== challengeId));
    if (newGame) navigate(`/game/${newGame.id}`);
  }

  return (
    <nav className="h-14 shrink-0 bg-[#161512] border-b border-[#2a2825] flex items-center justify-between px-4 sm:px-6 w-full z-40">
      <Link to="/" className="flex items-center gap-2">
        <div className="w-8 h-8 bg-zinc-200 text-zinc-900 flex items-center justify-center rounded font-bold text-xl">♞</div>
        <span className="font-bold text-zinc-100 hidden sm:block tracking-wide">KnightMare</span>
      </Link>

      {user && (
        <div className="flex-1 max-w-md mx-4 relative" ref={searchRef}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Search players..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }} onFocus={() => setShowSearch(true)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500" />
          </div>
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50">
              {searchResults.map(res => (
                <div key={res.id} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-800">
                  <div className="cursor-pointer" onClick={() => { navigate(`/profile/${res.username}`); setShowSearch(false); }}>
                    <div className="text-sm font-medium text-zinc-200">{res.username}</div>
                    <div className="text-xs text-zinc-500">{res.rating}</div>
                  </div>
                  <button onClick={() => { setChallengeTarget(res); setShowChallengeModal(true); setShowSearch(false); }} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1 rounded-md flex items-center gap-1 border border-zinc-700"><Swords size={12}/> Play</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {user ? (
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setShowChallenges(!showChallenges)} className="relative p-2 text-zinc-400 hover:text-zinc-200">
              <Bell size={18} />
              {pendingChallenges.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />}
            </button>
            {showChallenges && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50">
                <div className="px-4 py-2 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">Challenges</div>
                {pendingChallenges.length === 0 ? <div className="p-4 text-center text-sm text-zinc-500">None pending</div> : pendingChallenges.map(c => (
                  <div key={c.id} className="p-3 border-b border-zinc-800 last:border-0">
                    <div className="text-sm text-zinc-200 mb-2"><span className="font-bold">{c.challenger_username}</span> • {c.time_control_minutes}+{c.time_control_increment}</div>
                    <div className="flex gap-2">
                      <button onClick={() => respondToChallenge(c.id, true)} className="flex-1 py-1 bg-green-900/30 text-green-400 border border-green-900/50 rounded flex items-center justify-center gap-1 text-xs"><Check size={12}/> Accept</button>
                      <button onClick={() => respondToChallenge(c.id, false)} className="flex-1 py-1 bg-red-900/30 text-red-400 border border-red-900/50 rounded flex items-center justify-center gap-1 text-xs"><X size={12}/> Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={userMenuRef}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 pl-2 pr-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700">
              <div className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-bold">{profile?.username?.[0]?.toUpperCase() ?? '?'}</div>
              <span className="text-sm font-medium text-zinc-300 hidden sm:block">{profile?.username}</span>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
                <button onClick={() => { navigate(`/profile`); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800"><User size={15} /> Profile</button>
                <button onClick={() => { signOut(); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-zinc-800"><LogOut size={15} /> Sign Out</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link to="/login" className="text-zinc-400 hover:text-zinc-200">Sign In</Link>
          <Link to="/register" className="bg-zinc-200 hover:bg-white text-zinc-900 px-4 py-1.5 rounded-md">Register</Link>
        </div>
      )}

      {/* Challenge Send Modal */}
      {showChallengeModal && challengeTarget && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm text-center">
            <h3 className="text-lg font-bold text-zinc-100 mb-4">Challenge {challengeTarget.username}</h3>
            <button onClick={async () => {
              await api.createChallenge({ challenger_id: user!.id, challenged_id: challengeTarget.id, time_control_minutes: 5, time_control_increment: 0, challenger_color: 'random', status: 'pending' });
              setShowChallengeModal(false);
            }} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold mb-3 hover:bg-blue-500">Send 5+0 Blitz Challenge</button>
            <button onClick={() => setShowChallengeModal(false)} className="w-full py-3 bg-zinc-800 text-zinc-300 rounded-lg font-bold hover:bg-zinc-700">Cancel</button>
          </div>
        </div>
      )}
    </nav>
  );
}
