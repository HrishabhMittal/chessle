import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TIME_CONTROLS, createGame } from '../lib/gameUtils';
import { Bot, Users, X, Swords, Info } from 'lucide-react';
import { api } from '../lib/api';
import { io, Socket } from 'socket.io-client';

const QUICK_CONTROLS = [
    { min: 1, inc: 0, cat: 'Bullet' },
    { min: 2, inc: 1, cat: 'Bullet' },
    { min: 3, inc: 0, cat: 'Blitz' },
    { min: 3, inc: 2, cat: 'Blitz' },
    { min: 5, inc: 0, cat: 'Blitz' },
    { min: 5, inc: 3, cat: 'Blitz' },
    { min: 10, inc: 0, cat: 'Rapid' },
    { min: 10, inc: 5, cat: 'Rapid' },
    { min: 15, inc: 10, cat: 'Rapid' },
    { min: 30, inc: 0, cat: 'Classical' },
    { min: 30, inc: 20, cat: 'Classical' },
];

export default function LandingPage() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState<'quick' | 'lobby'>('quick');
    const [isSearching, setIsSearching] = useState(false);
    const [searchSeconds, setSearchSeconds] = useState(0);
    const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
    const [lobby, setLobby] = useState<any[]>([]);
    const [showBotModal, setShowBotModal] = useState(false);
    const [botDifficulty, setBotDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
    const [botColor, setBotColor] = useState<'white' | 'black' | 'random'>('random');
    const [botTc, setBotTc] = useState(TIME_CONTROLS[7]);
    const [showChallengeModal, setShowChallengeModal] = useState(false);
    const [challengeMin, setChallengeMin] = useState(10);
    const [challengeInc, setChallengeInc] = useState(0);
    const [challengeIsRated, setChallengeIsRated] = useState(true);
    const [challengeColor, setChallengeColor] = useState<'white' | 'black' | 'random'>('random');

    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!isSearching || !activeTicketId) return;
        const timer = setInterval(() => setSearchSeconds(s => s + 1), 1000);
        const poll = setInterval(async () => {
            const { matchedGameId } = await api.getMatchmakingStatus(activeTicketId);
            if (matchedGameId) {
                clearInterval(poll); clearInterval(timer);
                navigate(`/game/${matchedGameId}`);
            }
        }, 1000);
        return () => { clearInterval(timer); clearInterval(poll); };
    }, [isSearching, activeTicketId, navigate]);

    useEffect(() => {
        if (tab !== 'lobby') return;
        fetchLobby();
        const interval = setInterval(fetchLobby, 5000);
        return () => clearInterval(interval);
    }, [tab]);


    useEffect(() => {
        if (!user) return;

        const socketUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
        const newSocket = io(socketUrl);
        socketRef.current = newSocket;

        newSocket.emit('join_user_room', user.id);

        const handleNewLobbyChallenge = (challengeData: any) => {
            if (challengeData.challenger_id !== user.id) {
                setLobby(prev => [challengeData, ...prev]);
            }
        };

        const handleChallengeAccepted = (data: { gameId: string }) => {
            navigate(`/game/${data.gameId}`);
        };

        newSocket.on('lobby_challenge_received', handleNewLobbyChallenge);
        newSocket.on('challenge_accepted', handleChallengeAccepted);

        return () => {
            newSocket.off('lobby_challenge_received', handleNewLobbyChallenge);
            newSocket.off('challenge_accepted', handleChallengeAccepted);
            newSocket.disconnect();
        };
    }, [user, navigate]);

    async function fetchLobby() {
        const { data } = await api.getLobbyChallenges();
        console.log("fetching lobby", data)
        if (data) setLobby(data);
    }

    async function startMatchmaking(minutes: number, increment: number) {
        if (!user || !profile) { navigate('/login'); return; }
        setIsSearching(true);
        setSearchSeconds(0);
        const { ticketId } = await api.joinMatchmaking({ timeMin: minutes, timeInc: increment, rating: profile.rating });
        setActiveTicketId(ticketId);
    }

    async function cancelMatchmaking() {
        await api.cancelMatchmaking();
        setIsSearching(false);
        setActiveTicketId(null);
    }
    async function acceptLobbyChallenge(id: string) {
        if (!user) { navigate('/login'); return; }
        

        const { data, error } = await api.acceptLobbyChallenge(id);
        
        if (data) {
            navigate(`/game/${data.id}`);
        } else if (error) {
            alert("Failed to start game: " + (error.message || error));
            fetchLobby();
        }
    }
    async function createOpenChallenge() {
        if (!user || !profile) { navigate('/login'); return; }

        const payload = {
            challenger_id: user.id,
            challenged_id: null,
            time_control_minutes: challengeMin,
            time_control_increment: challengeInc,
            challenger_color: challengeColor,
            is_rated: challengeIsRated,
            status: 'open'
        };


        const { data, error } = await api.createChallenge(payload);

        if (error) {
            console.error("Supabase Insertion Error:", error);
            alert("Failed to publish challenge: " + error.message);
            return;
        }

        console.log("Successfully created:", data);

        if (data && socketRef.current) {
            socketRef.current.emit('send_challenge', {
                ...data,
                challenger: { username: profile.username, rating: profile.rating }
            });
        }

        setShowChallengeModal(false);
        setTab('lobby');
        fetchLobby();
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
        <div className="flex-1 flex flex-col items-center pt-8 pb-6 px-4 sm:px-6 h-full overflow-y-auto w-full">
            <div className="w-full max-w-4xl flex flex-col gap-6">
                <div className="flex justify-end items-center w-full gap-4">
                    <button onClick={() => setShowBotModal(true)} className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors">
                        <Bot size={18} /> Play Computer
                    </button>
                    <button onClick={() => setShowChallengeModal(true)} className="flex items-center gap-2 bg-zinc-200 hover:bg-white text-zinc-900 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors">
                        <Users size={18} /> Find Opponent
                    </button>
                </div>
                <div className="flex justify-center gap-12 border-b border-zinc-800 w-full mt-2">
                    <button onClick={() => setTab('quick')} className={`pb-3 text-lg font-semibold border-b-2 transition-colors ${tab === 'quick' ? 'text-zinc-200 border-zinc-200' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>Quick pairing</button>
                    <button onClick={() => setTab('lobby')} className={`pb-3 text-lg font-semibold border-b-2 transition-colors ${tab === 'lobby' ? 'text-zinc-200 border-zinc-200' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>Lobby</button>
                </div>
                {tab === 'quick' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
                        {QUICK_CONTROLS.map(c => (
                            <button
                                key={`${c.min}+${c.inc}`}
                                onClick={() => startMatchmaking(c.min, c.inc)}
                                disabled={isSearching}
                                className="relative flex flex-col items-center justify-center py-10 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-xl transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-3xl font-bold text-zinc-300 mb-1">{c.min}+{c.inc}</span>
                                <span className="text-sm text-zinc-500 capitalize">{c.cat}</span>
                            </button>
                        ))}
                        <button
                            onClick={() => setShowChallengeModal(true)}
                            disabled={isSearching}
                            className="relative flex flex-col items-center justify-center py-10 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-xl transition-all shadow-xl disabled:opacity-50"
                        >
                            <span className="text-2xl font-bold text-zinc-400">Custom</span>
                        </button>
                    </div>
                )}
                {tab === 'lobby' && (
                    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                        <div className="grid grid-cols-4 px-4 py-3 border-b border-zinc-800 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                            <div className="col-span-1 pl-2">Player</div>
                            <div className="col-span-1 text-center">Rating</div>
                            <div className="col-span-1 text-center">Time</div>
                            <div className="col-span-1 text-center">Mode</div>
                        </div>
                        <div className="flex flex-col divide-y divide-zinc-800/50">
                            {lobby.map(c => (
                                <button key={c.id} onClick={() => acceptLobbyChallenge(c.id)} className="grid grid-cols-4 px-4 py-4 hover:bg-zinc-900 transition-colors text-sm text-zinc-300 items-center">
                                    <div className="col-span-1 text-left truncate pl-2">{c.challenger?.username || 'Unknown'}</div>
                                    <div className="col-span-1 text-center font-mono">{c.challenger?.rating || 1200}</div>
                                    <div className="col-span-1 text-center">{c.time_control_minutes}+{c.time_control_increment}</div>
                                    <div className="col-span-1 flex items-center justify-center gap-2 text-zinc-400">
                                        {c.is_rated ? <Swords size={14} /> : <Info size={14} />} {c.is_rated ? 'Rated' : 'Casual'}
                                    </div>
                                </button>
                            ))}
                            {lobby.length === 0 && <div className="p-8 text-center text-zinc-500">No open challenges available in your range.</div>}
                        </div>
                    </div>
                )}
            </div>
            {isSearching && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm text-center flex flex-col items-center shadow-2xl">
                        <div className="w-12 h-12 border-4 border-zinc-200 border-t-transparent rounded-full animate-spin mb-6" />
                        <h3 className="text-xl font-bold text-zinc-100 mb-2">Finding Opponent...</h3>
                        <p className="text-zinc-500 font-mono text-sm mb-8">Time elapsed: {searchSeconds}s</p>
                        <button onClick={cancelMatchmaking} className="w-full py-3 bg-zinc-950 text-zinc-400 hover:text-zinc-200 rounded-xl border border-zinc-800 transition-colors flex items-center justify-center gap-2 font-bold">
                            <X size={18} /> Cancel Search
                        </button>
                    </div>
                </div>
            )}
            {showChallengeModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowChallengeModal(false)}>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-zinc-100 mb-6 text-center">Create a Game</h3>
                        <div className="space-y-6">
                            <div className="flex p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                                <button onClick={() => setChallengeIsRated(true)} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${challengeIsRated ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>Rated</button>
                                <button onClick={() => setChallengeIsRated(false)} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${!challengeIsRated ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>Casual</button>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase mb-2 block">Minutes per side</label>
                                    <input type="number" min="1" max="180" value={challengeMin} onChange={e => setChallengeMin(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 outline-none focus:border-zinc-500 [color-scheme:dark]" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase mb-2 block">Increment (seconds)</label>
                                    <input type="number" min="0" max="180" value={challengeInc} onChange={e => setChallengeInc(Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 outline-none focus:border-zinc-500 [color-scheme:dark]" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-2 block">Starting Color</label>
                                <div className="flex gap-2">
                                    {(['white', 'random', 'black'] as const).map(c => (
                                        <button key={c} onClick={() => setChallengeColor(c)} className={`flex-1 py-3 rounded-lg text-sm font-medium capitalize border transition-colors ${challengeColor === c ? 'bg-zinc-200 text-zinc-900 border-white' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'}`}>
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setShowChallengeModal(false)} className="flex-1 py-3 bg-zinc-950 text-zinc-400 border border-zinc-800 rounded-xl font-bold hover:bg-zinc-800">Cancel</button>
                            <button onClick={createOpenChallenge} className="flex-1 py-3 bg-zinc-200 text-zinc-900 rounded-xl font-bold hover:bg-white">Publish Challenge</button>
                        </div>
                    </div>
                </div>
            )}
            {showBotModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowBotModal(false)}>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-zinc-100 mb-6 text-center">Setup Bot Game</h3>
                        <div className="space-y-6">
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Difficulty</label>
                                <div className="flex gap-2">
                                    {(['easy', 'medium', 'hard'] as const).map(d => (
                                        <button key={d} onClick={() => setBotDifficulty(d)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium capitalize border transition-colors ${botDifficulty === d ? 'bg-zinc-200 text-zinc-900 border-white' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'}`}>
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Color</label>
                                <div className="flex gap-2">
                                    {(['white', 'black', 'random'] as const).map(c => (
                                        <button key={c} onClick={() => setBotColor(c)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium capitalize border transition-colors ${botColor === c ? 'bg-zinc-200 text-zinc-900 border-white' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'}`}>
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
                                            <button key={`${tc.minutes}+${tc.increment}`} onClick={() => setBotTc(tc)} className={`py-2 rounded-md text-xs font-medium border transition-colors ${isSelected ? 'bg-zinc-200 text-zinc-900 border-white' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'}`}>
                                                {tc.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setShowBotModal(false)} className="flex-1 py-3 bg-zinc-950 text-zinc-400 border border-zinc-800 rounded-xl font-bold hover:bg-zinc-800 transition-colors">Cancel</button>
                            <button onClick={startBotGame} className="flex-1 py-3 bg-zinc-200 text-zinc-900 rounded-xl font-bold hover:bg-white transition-colors">Start Game</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
