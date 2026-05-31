import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { formatTime } from '../lib/gameUtils';
import { getBotMove } from '../lib/stockfish';
import { Flag, RotateCcw, Home } from 'lucide-react';

interface GameData { id: string; white_player_id: string | null; black_player_id: string | null; pgn: string; fen: string; status: string; result: string; result_reason: string; time_control_minutes: number; time_control_increment: number; white_time_ms: number; black_time_ms: number; current_turn: string; move_count: number; is_bot_game: boolean; bot_color: string; }

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [game, setGame] = useState<GameData | null>(null);
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState('start');
  const [whiteTimeMs, setWhiteTimeMs] = useState(600000);
  const [blackTimeMs, setBlackTimeMs] = useState(600000);
  const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');
  const [gameStatus, setGameStatus] = useState('active');
  const [result, setResult] = useState('');
  const [resultReason, setResultReason] = useState('');
  const [moveHistory, setMoveHistory] = useState<{ san: string; color: string }[]>([]);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [showResignModal, setShowResignModal] = useState(false);
  const [myColor, setMyColor] = useState<'white' | 'black' | null>(null);
  const [gameOver, setGameOver] = useState(false);

  const botDifficulty = (searchParams.get('bot') as 'easy' | 'medium' | 'hard') || 'medium';
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const botThinkingRef = useRef(false);
  const moveHistoryRef = useRef(moveHistory);
  moveHistoryRef.current = moveHistory;

  useEffect(() => { if (gameId) loadGame(); }, [gameId]);

  async function loadGame() {
    const { data } = await api.getGame(gameId!);
    if (!data) { navigate('/'); return; }
    
    setGame(data); 
    setWhiteTimeMs(data.white_time_ms); 
    setBlackTimeMs(data.black_time_ms); 
    setCurrentTurn(data.current_turn); 
    setGameStatus(data.status); 
    setResult(data.result); 
    setResultReason(data.result_reason);
    
    if (data.pgn) {
      chess.loadPgn(data.pgn); 
      setFen(chess.fen());
      setMoveHistory(chess.history({ verbose: true }).map(m => ({ san: m.san, color: m.color === 'w' ? 'white' : 'black' })));
    }
    if (data.status !== 'active') setGameOver(true);
    
    let color: 'white' | 'black' | null = null;
    if (user) { 
        if (data.white_player_id === user.id) color = 'white'; 
        else if (data.black_player_id === user.id) color = 'black'; 
    }
    setMyColor(color); 
    setBoardOrientation(color ?? 'white'); 
  }

  useEffect(() => {
    if (!gameId) return;
    const channel = supabase.channel(`game:${gameId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
      const updated = payload.new as GameData;
      setWhiteTimeMs(updated.white_time_ms); 
      setBlackTimeMs(updated.black_time_ms); 
      setCurrentTurn(updated.current_turn as 'white' | 'black'); 
      setGameStatus(updated.status); 
      setResult(updated.result); 
      setResultReason(updated.result_reason);
      
      if (updated.pgn !== chess.pgn()) {
        chess.loadPgn(updated.pgn || ''); 
        setFen(chess.fen());
        setMoveHistory(chess.history({ verbose: true }).map(m => ({ san: m.san, color: m.color === 'w' ? 'white' : 'black' })));
      }
      if (updated.status !== 'active') setGameOver(true);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameId, chess]);

  useEffect(() => {
    // Only tick the clock if game is active AND someone has made at least one move
    if (gameOver || gameStatus !== 'active' || moveHistory.length === 0) {
        lastTickRef.current = Date.now();
        return;
    }
    
    clockRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      if (currentTurn === 'white') setWhiteTimeMs(p => { const n = Math.max(0, p - elapsed); if (n === 0) handleTimeout('white'); return n; });
      else setBlackTimeMs(p => { const n = Math.max(0, p - elapsed); if (n === 0) handleTimeout('black'); return n; });
    }, 100);
    
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [currentTurn, gameOver, gameStatus, moveHistory.length]);

  async function handleTimeout(color: 'white' | 'black') {
    if (clockRef.current) clearInterval(clockRef.current);
    await endGame(color === 'white' ? 'black' : 'white', 'timeout');
  }

  async function endGame(winner: 'white' | 'black' | 'draw', reason: string) {
    if (!gameId) return;
    await api.updateGame(gameId, { status: 'completed', result: winner, result_reason: reason, ended_at: new Date().toISOString() });
    setGameOver(true); setResult(winner); setResultReason(reason); setGameStatus('completed');
  }

  useEffect(() => {
    if (!game?.is_bot_game || gameOver) return;
    if (currentTurn !== game.bot_color || botThinkingRef.current) return;
    
    botThinkingRef.current = true;
    setTimeout(() => {
      const moveSan = getBotMove(chess.fen(), botDifficulty);
      if (moveSan) {
        const moveRes = new Chess(chess.fen()).move(moveSan);
        if (moveRes) applyMove(moveRes.from, moveRes.to, moveRes.promotion);
      }
      botThinkingRef.current = false;
    }, 500);
  }, [currentTurn, game, gameOver, chess, botDifficulty]);

  async function applyMove(from: string, to: string, promotion?: string) {
    if (!gameId) return;
    
    const moveResult = chess.move({ from, to, promotion: promotion || 'q' });
    if (!moveResult) return;
    
    const newFen = chess.fen();
    setFen(newFen);
    
    const newHistory = [...moveHistoryRef.current, { san: moveResult.san, color: moveResult.color === 'w' ? 'white' : 'black' }];
    setMoveHistory(newHistory);
    
    const nextTurn = moveResult.color === 'w' ? 'black' : 'white';
    setCurrentTurn(nextTurn);
    lastTickRef.current = Date.now();

    const inc = (game?.time_control_increment ?? 0) * 1000;
    const newWhiteTime = moveResult.color === 'w' ? whiteTimeMs + inc : whiteTimeMs;
    const newBlackTime = moveResult.color === 'b' ? blackTimeMs + inc : blackTimeMs;
    setWhiteTimeMs(newWhiteTime); setBlackTimeMs(newBlackTime);

    let status = 'active', resultVal = '', reason = '';
    if (chess.isCheckmate()) { status = 'completed'; resultVal = moveResult.color === 'w' ? 'white' : 'black'; reason = 'checkmate'; }
    else if (chess.isDraw()) { status = 'completed'; resultVal = 'draw'; reason = 'draw'; }

    await api.updateGame(gameId, { pgn: chess.pgn(), fen: newFen, current_turn: nextTurn, white_time_ms: newWhiteTime, black_time_ms: newBlackTime, move_count: newHistory.length, status, result: resultVal, result_reason: reason });
    await api.createGameMove({ game_id: gameId, move_number: newHistory.length, player_color: moveResult.color === 'w' ? 'white' : 'black', move_san: moveResult.san, move_uci: from + to + (promotion || ''), fen_after: newFen, white_time_ms: newWhiteTime, black_time_ms: newBlackTime });

    if (status === 'completed') { setGameOver(true); setResult(resultVal); setResultReason(reason); setGameStatus('completed'); }
  }

  // --- CORE MULTIPLAYER & PREMOVE LOGIC ---
  function onDrop(sourceSquare: string, targetSquare: string, piece: string) {
    if (gameOver || !myColor) return false;
    
    try {
        // Attempt the move locally on the main chess instance
        const move = chess.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: piece[1]?.toLowerCase() ?? 'q',
        });

        if (move) {
            // Revert it locally. The board state relies strictly on the `applyMove` execution 
            // synchronizing with state and sending off to the backend API.
            chess.undo(); 
            applyMove(sourceSquare, targetSquare, piece[1]?.toLowerCase() ?? 'q');
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
  }

  const oppColor = boardOrientation === 'white' ? 'black' : 'white';
  const myTime = boardOrientation === 'white' ? whiteTimeMs : blackTimeMs;
  const oppTime = oppColor === 'white' ? whiteTimeMs : blackTimeMs;

  function renderClock(color: string, timeMs: number, active: boolean) {
    return (
      <div className={`flex justify-between items-center px-4 py-3 rounded-lg border ${active ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-950 border-zinc-900'}`}>
        <div className="font-bold text-zinc-300 capitalize">{color}</div>
        <div className={`font-mono text-xl font-bold tabular-nums ${timeMs < 30000 && active ? 'text-red-400' : 'text-zinc-200'}`}>{formatTime(timeMs)}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row p-4 gap-4 w-full h-full min-h-0 mx-auto max-w-7xl">
      
      {/* Board Area */}
      <div className="flex-1 flex flex-col justify-center min-w-0 min-h-0 h-full">
        <div className="w-full max-w-[800px] mx-auto flex flex-col h-full gap-2">
          {renderClock(oppColor, oppTime, currentTurn === oppColor && !gameOver)}
          
          <div className="flex-1 min-h-0 relative w-full flex items-center justify-center">
            <div className="h-full aspect-square relative max-w-full">
              <Chessboard
                id="MultiplayerBoard"
                position={fen}
                onPieceDrop={onDrop}
                boardOrientation={boardOrientation}
                // MULTIPLAYER/PREMOVE REQUIREMENT: We must explicitly dictate that players can only ever grab their OWN pieces.
                isDraggablePiece={({ piece }) => myColor ? piece.toLowerCase().startsWith(myColor === 'white' ? 'w' : 'b') : false}
                // Core premove engine toggles
                arePremovesAllowed={true}
                clearPremovesOnRightClick={true}
                // UI Visualizations
                customDarkSquareStyle={{ backgroundColor: '#70828e' }}
                customLightSquareStyle={{ backgroundColor: '#c3cdd4' }}
                customPremoveDarkSquareStyle={{ backgroundColor: '#4f5c65' }}
                customPremoveLightSquareStyle={{ backgroundColor: '#9aa5ac' }}
              />
              {gameOver && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 flex-col gap-4 text-center p-4">
                  <div className="text-3xl font-bold text-white">{result === 'draw' ? 'Draw' : result === myColor ? 'Victory' : 'Defeat'}</div>
                  <div className="text-zinc-400 uppercase tracking-widest text-sm">{resultReason}</div>
                  <button onClick={() => navigate('/')} className="px-6 py-2 bg-zinc-200 text-zinc-900 rounded font-bold hover:bg-white mt-4">New Game</button>
                </div>
              )}
            </div>
          </div>

          {renderClock(boardOrientation, myTime, currentTurn === boardOrientation && !gameOver)}
        </div>
      </div>

      {/* Sidebar Area */}
      <div className="w-full lg:w-80 flex flex-col shrink-0 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-full">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 text-center text-sm font-bold text-zinc-400 uppercase tracking-wider">
          {game?.time_control_minutes}+{game?.time_control_increment} {game?.is_bot_game ? 'Bot' : 'Rated'}
        </div>
        
        {/* Move History */}
        <div className="flex-1 overflow-y-auto p-2 min-h-0 bg-zinc-900">
          <div className="grid grid-cols-2 gap-1 text-sm font-mono">
            {moveHistory.reduce<{w?: string, b?: string, n: number}[]>((acc, move, i) => {
              if (i % 2 === 0) acc.push({ w: move.san, n: Math.floor(i/2)+1 });
              else acc[acc.length-1].b = move.san;
              return acc;
            }, []).map(row => (
              <div key={row.n} className="col-span-2 flex py-1.5 px-2 hover:bg-zinc-800 rounded text-zinc-300">
                <span className="w-12 text-zinc-600">{row.n}.</span>
                <span className="flex-1">{row.w}</span>
                <span className="flex-1">{row.b || ''}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex gap-2 shrink-0">
          <button onClick={() => setBoardOrientation(o => o === 'white' ? 'black' : 'white')} className="p-3 bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg"><RotateCcw size={16} /></button>
          {!gameOver && myColor && (
             <div className="flex-1 flex gap-2">
                <button onClick={() => endGame('draw', 'agreement')} className="flex-1 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-bold hover:bg-zinc-700">Draw</button>
                <button onClick={() => setShowResignModal(true)} className="flex items-center justify-center gap-2 flex-1 bg-red-950/50 text-red-500 border border-red-900/50 rounded-lg text-sm font-bold hover:bg-red-900/50"><Flag size={14} /> Resign</button>
             </div>
          )}
          <button onClick={() => navigate('/')} className="p-3 bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg"><Home size={16} /></button>
        </div>
      </div>

      {showResignModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm text-center">
            <h3 className="text-xl font-bold text-zinc-100 mb-6">Resign the game?</h3>
            <div className="flex gap-4">
              <button onClick={() => setShowResignModal(false)} className="flex-1 py-3 bg-zinc-800 text-zinc-300 rounded-lg font-bold hover:bg-zinc-700">Cancel</button>
              <button onClick={() => { handleResign(); setShowResignModal(false); }} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-500">Resign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
