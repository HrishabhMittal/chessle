import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Trophy, Swords, Minus, TrendingUp } from 'lucide-react';

interface Profile { id: string; username: string; rating: number; games_played: number; wins: number; losses: number; draws: number; }
interface GameRecord { id: string; white_player_id: string | null; black_player_id: string | null; result: string; result_reason: string; time_control_minutes: number; time_control_increment: number; }

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { profile: myProfile } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProfile(); }, [username]);

  async function loadProfile() {
    setLoading(true);
    let profileData = (!username || (myProfile && myProfile.username === username)) ? myProfile : null;
    if (!profileData && username) {
      const { data } = await api.getProfileByUsername(username);
      profileData = data;
    }
    if (!profileData) { navigate('/'); return; }
    setProfile(profileData as Profile);
    const { data: gamesData } = await api.getGamesByUser(profileData.id);
    if (gamesData) setGames(gamesData);
    setLoading(false);
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!profile) return null;

  const winRate = profile.games_played > 0 ? Math.round((profile.wins / profile.games_played) * 100) : 0;
  const drawRate = profile.games_played > 0 ? Math.round((profile.draws / profile.games_played) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 w-full max-w-4xl mx-auto h-full min-h-0 gap-6">
      
      {/* Top Banner & Stats */}
      <div className="shrink-0 flex flex-col md:flex-row gap-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 items-center md:items-stretch">
        <div className="flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-zinc-800 pb-4 md:pb-0 md:pr-8 text-center">
          <div className="w-20 h-20 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-3xl font-bold text-zinc-100 mb-3">{profile.username[0].toUpperCase()}</div>
          <h1 className="text-xl font-bold text-zinc-100">{profile.username}</h1>
          <div className="text-zinc-400 font-mono text-sm mt-1">{profile.rating} Rating</div>
        </div>

        <div className="flex-1 grid grid-cols-4 gap-4 w-full">
          {[
            { icon: <Swords size={20} />, label: 'Games', value: profile.games_played, c: 'text-zinc-200' },
            { icon: <Trophy size={20} />, label: 'Wins', value: profile.wins, c: 'text-green-500' },
            { icon: <Minus size={20} />, label: 'Draws', value: profile.draws, c: 'text-zinc-500' },
            { icon: <TrendingUp size={20} />, label: 'Losses', value: profile.losses, c: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <div className={`mb-2 ${s.c}`}>{s.icon}</div>
              <div className="text-xl font-bold text-zinc-100">{s.value}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Win Rate Bar */}
      {profile.games_played > 0 && (
        <div className="shrink-0 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-3">
            <span className="text-green-500">{profile.wins} W</span>
            <span className="text-zinc-500">{winRate}% WIN</span>
            <span className="text-red-500">{profile.losses} L</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-zinc-950">
            <div className="bg-green-500" style={{ width: `${winRate}%` }} />
            <div className="bg-zinc-500" style={{ width: `${drawRate}%` }} />
            <div className="bg-red-500 flex-1" />
          </div>
        </div>
      )}

      {/* Scrollable Game History */}
      <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden min-h-0">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950"><h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Recent Matches</h2></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {games.length === 0 ? <p className="text-zinc-500 text-sm text-center py-8">No completed games yet</p> : games.map(game => {
            const isWhite = game.white_player_id === profile.id;
            const result = game.result === 'draw' ? 'Draw' : ((game.result === 'white' && isWhite) || (game.result === 'black' && !isWhite)) ? 'Victory' : 'Defeat';
            return (
              <div key={game.id} onClick={() => navigate(`/game/${game.id}`)} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-600 cursor-pointer transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded bg-zinc-900 flex items-center justify-center text-lg ${isWhite ? 'text-zinc-200' : 'text-zinc-600'}`}>{isWhite ? '♔' : '♚'}</div>
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{game.time_control_minutes}+{game.time_control_increment} Rated</div>
                    <div className="text-xs text-zinc-500 capitalize">{game.result_reason}</div>
                  </div>
                </div>
                <div className={`text-sm font-bold ${result === 'Victory' ? 'text-green-500' : result === 'Defeat' ? 'text-red-500' : 'text-zinc-500'}`}>{result}</div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
