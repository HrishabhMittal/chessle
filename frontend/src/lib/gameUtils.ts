import { api } from './api';

export interface TimeControl { 
  minutes: number; 
  increment: number; 
  label: string; 
  category: string; 
}

export const TIME_CONTROLS: TimeControl[] = [
  { minutes: 1, increment: 0, label: '1+0', category: 'bullet' },
  { minutes: 1, increment: 1, label: '1+1', category: 'bullet' },
  { minutes: 2, increment: 1, label: '2+1', category: 'bullet' },
  { minutes: 3, increment: 0, label: '3+0', category: 'blitz' },
  { minutes: 3, increment: 2, label: '3+2', category: 'blitz' },
  { minutes: 5, increment: 0, label: '5+0', category: 'blitz' },
  { minutes: 5, increment: 3, label: '5+3', category: 'blitz' },
  { minutes: 10, increment: 0, label: '10+0', category: 'rapid' },
  { minutes: 10, increment: 5, label: '10+5', category: 'rapid' },
  { minutes: 15, increment: 10, label: '15+10', category: 'rapid' },
  { minutes: 30, increment: 0, label: '30+0', category: 'classical' },
  { minutes: 30, increment: 20, label: '30+20', category: 'classical' },
];

export const FEATURED_TIME_CONTROLS: TimeControl[] = [
  { minutes: 1, increment: 0, label: '1+0', category: 'bullet' },
  { minutes: 2, increment: 1, label: '2+1', category: 'bullet' },
  { minutes: 3, increment: 0, label: '3+0', category: 'blitz' },
  { minutes: 3, increment: 2, label: '3+2', category: 'blitz' },
  { minutes: 5, increment: 0, label: '5+0', category: 'blitz' },
  { minutes: 10, increment: 0, label: '10+0', category: 'rapid' },
  { minutes: 10, increment: 5, label: '10+5', category: 'rapid' },
  { minutes: 15, increment: 10, label: '15+10', category: 'rapid' },
  { minutes: 30, increment: 0, label: '30+0', category: 'classical' },
];

export function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export async function createGame(whiteId: string | null, blackId: string | null, timeMinutes: number, timeIncrement: number, isBotGame = false, botColor = '') {
  const timeMs = timeMinutes * 60 * 1000;
  return await api.createGame({
    white_player_id: whiteId,
    black_player_id: blackId,
    time_control_minutes: timeMinutes,
    time_control_increment: timeIncrement,
    white_time_ms: timeMs,
    black_time_ms: timeMs,
    is_bot_game: isBotGame,
    bot_color: botColor,
    status: 'active',
  });
}
