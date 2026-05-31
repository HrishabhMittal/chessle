import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  return res.json();
}

export const api = {
  // Profiles
  getProfileByUsername: (username: string) => fetchAPI(`/profiles/${username}`),
  getMyProfile: (id: string) => fetchAPI(`/users/${id}/profile`),
  searchProfiles: (query: string) => fetchAPI(`/profiles/search/${query}`),
  
  // Games
  getGamesByUser: (userId: string) => fetchAPI(`/games/user/${userId}`),
  getGame: (gameId: string) => fetchAPI(`/games/${gameId}`),
  createGame: (payload: any) => fetchAPI(`/games`, { method: 'POST', body: JSON.stringify(payload) }),
  updateGame: (gameId: string, payload: any) => fetchAPI(`/games/${gameId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createGameMove: (payload: any) => fetchAPI(`/games/moves`, { method: 'POST', body: JSON.stringify(payload) }),

  // Matchmaking
  joinMatchmaking: (payload: any) => fetchAPI('/matchmaking/join', { method: 'POST', body: JSON.stringify(payload) }),
  getMatchmakingStatus: (ticketId: string) => fetchAPI(`/matchmaking/status/${ticketId}`),
  cancelMatchmaking: () => fetchAPI('/matchmaking/cancel', { method: 'POST' }),

  // Challenges
  getPendingChallenges: () => fetchAPI(`/challenges/pending`),
  createChallenge: (payload: any) => fetchAPI(`/challenges`, { method: 'POST', body: JSON.stringify(payload) }),
  respondToChallenge: (id: string, payload: any) => fetchAPI(`/challenges/${id}/respond`, { method: 'PUT', body: JSON.stringify(payload) })
};
