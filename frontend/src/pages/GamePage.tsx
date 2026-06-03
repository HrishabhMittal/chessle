import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
    Chessboard,
    type PieceDropHandlerArgs,
    type PieceHandlerArgs,
    type SquareHandlerArgs,
    type PositionDataType,
    type DraggingPieceDataType,
    type PieceDataType,
} from 'react-chessboard';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { formatTime } from '../lib/gameUtils';
import { getBotMove } from '../lib/stockfish';
import { Flag, RotateCcw, Home, Info, Rabbit, Skull, Handshake } from 'lucide-react';

interface GameData {
    id: string;
    white_player_id: string | null;
    black_player_id: string | null;
    pgn: string;
    fen: string;
    status: string;
    result: string;
    result_reason: string;
    time_control_minutes: number;
    time_control_increment: number;
    white_time_ms: number;
    black_time_ms: number;
    current_turn: string;
    move_count: number;
    is_bot_game: boolean;
    bot_color: string;
}

interface ChatMessage {
    sender: string;
    text: string;
    isSystem?: boolean;
}

function fenToObj(fen: string): PositionDataType {
    const obj: PositionDataType = {};
    const rows = fen.split(' ')[0].split('/');
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (let r = 0; r < 8; r++) {
        let f = 0;
        for (let i = 0; i < rows[r].length; i++) {
            const char = rows[r][i];
            if (isNaN(Number(char))) {
                const sq = `${files[f]}${8 - r}`;
                const pc = `${char === char.toUpperCase() ? 'w' : 'b'}${char.toUpperCase()}`;
                obj[sq] = { pieceType: pc } as PieceDataType;
                f++;
            } else {
                f += Number(char);
            }
        }
    }
    return obj;
}

export default function GamePage() {
    const { gameId } = useParams<{ gameId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    const chessGameRef = useRef(new Chess());
    const chessGame = chessGameRef.current;
    const [chessPosition, setChessPosition] = useState(chessGame.fen());
    const [game, setGame] = useState<GameData | null>(null);

    const [whiteTimeMs, setWhiteTimeMs] = useState(600000);
    const [blackTimeMs, setBlackTimeMs] = useState(600000);
    const [currentTurn, setCurrentTurn] = useState<'white' | 'black'>('white');

    const [gameStatus, setGameStatus] = useState('active');
    const [result, setResult] = useState('');
    const [resultReason, setResultReason] = useState('');
    const [moveHistory, setMoveHistory] = useState<{ san: string; color: string }[]>([]);

    const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
    const [myColor, setMyColor] = useState<'white' | 'black' | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const [showResignModal, setShowResignModal] = useState(false);

    const [moveFrom, setMoveFrom] = useState('');
    const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
    const [premoves, setPremoves] = useState<{ sourceSquare: string, targetSquare: string, piece: DraggingPieceDataType }[]>([]);
    const premovesRef = useRef<{ sourceSquare: string, targetSquare: string, piece: DraggingPieceDataType }[]>([]);
    const [promotionMove, setPromotionMove] = useState<{ sourceSquare: string, targetSquare: string } | null>(null);

    const [drawOfferedBy, setDrawOfferedBy] = useState<'white' | 'black' | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');

    const [_, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const botDifficulty = (searchParams.get('bot') as 'easy' | 'medium' | 'hard') || 'medium';
    const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastTickRef = useRef<number>(Date.now());
    const botThinkingRef = useRef(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    useEffect(() => {
        if (!authLoading && gameId && user) loadGame();
    }, [gameId, user, authLoading]);

    async function loadGame() {
        chessGame.reset();

        const { data } = await api.getGame(gameId!);
        if (!data) { navigate('/'); return; }

        setGame(data);
        setWhiteTimeMs(data.white_time_ms);
        setBlackTimeMs(data.black_time_ms);
        setCurrentTurn(data.current_turn as 'white' | 'black');
        setGameStatus(data.status);

        if (data.pgn) {
            chessGame.loadPgn(data.pgn);
            setChessPosition(chessGame.fen());
            setMoveHistory(chessGame.history({ verbose: true }).map(m => ({ san: m.san, color: m.color === 'w' ? 'white' : 'black' })));
        }
        if (data.status !== 'active') {
            setGameOver(true);
            setResult(data.result);
            setResultReason(data.result_reason);
        }

        let color: 'white' | 'black' | null = null;
        if (data.white_player_id === user?.id) color = 'white';
        else if (data.black_player_id === user?.id) color = 'black';

        setMyColor(color);
        if (color) setBoardOrientation(color);
    }

    useEffect(() => {
        const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000');
        setSocket(newSocket);
        socketRef.current = newSocket;

        if (gameId) {
            newSocket.emit('join_game', gameId);

            newSocket.on('receive_move', (data) => {
                chessGame.move(data.move);
                setChessPosition(chessGame.fen());
                setCurrentTurn(chessGame.turn() === 'w' ? 'white' : 'black');
                setMoveHistory(data.history);
                setDrawOfferedBy(null);

                if (premovesRef.current.length > 0) {
                    const nextPremove = premovesRef.current[0];
                    premovesRef.current.splice(0, 1);
                    setTimeout(() => {
                        const success = onPieceDrop({
                            sourceSquare: nextPremove.sourceSquare,
                            targetSquare: nextPremove.targetSquare,
                            piece: nextPremove.piece,
                        });
                        if (!success) premovesRef.current = [];
                        setPremoves([...premovesRef.current]);
                    }, 300);
                }
            });

            newSocket.on('sync_clocks', (data) => {
                setWhiteTimeMs(data.whiteTimeMs);
                setBlackTimeMs(data.blackTimeMs);
                lastTickRef.current = Date.now();
            });

            newSocket.on('receive_message', (data) => {
                setChatMessages(prev => [...prev, { sender: 'Opponent', text: data.text }]);
            });

            newSocket.on('draw_offered', (data) => {
                setDrawOfferedBy(data.color);
            });

            newSocket.on('draw_declined', () => {
                setDrawOfferedBy(null);
                setChatMessages(prev => [...prev, { sender: 'System', text: 'Draw offer declined.', isSystem: true }]);
            });

            newSocket.on('game_over_update', (data) => {
                endGame(data.winner, data.reason, false);
            });
        }
        return () => { newSocket.disconnect(); };
    }, [gameId, chessGame]);

    useEffect(() => {
        if (gameOver || gameStatus !== 'active' || moveHistory.length === 0) {
            lastTickRef.current = Date.now();
            return;
        }

        lastTickRef.current = Date.now();

        clockRef.current = setInterval(() => {
            const now = Date.now();
            const elapsed = now - lastTickRef.current;
            lastTickRef.current = now;

            if (currentTurn === 'white') {
                setWhiteTimeMs(p => {
                    const n = Math.max(0, p - elapsed);
                    if (n === 0) setTimeout(() => handleTimeout('white'), 0);
                    return n;
                });
            } else {
                setBlackTimeMs(p => {
                    const n = Math.max(0, p - elapsed);
                    if (n === 0) setTimeout(() => handleTimeout('black'), 0);
                    return n;
                });
            }
        }, 100);

        return () => { if (clockRef.current) clearInterval(clockRef.current); };
    }, [currentTurn, gameOver, gameStatus, moveHistory.length]);

    async function handleTimeout(color: 'white' | 'black') {
        if (clockRef.current) clearInterval(clockRef.current);
        await endGame(color === 'white' ? 'black' : 'white', 'timeout', true);
    }

    async function endGame(winner: 'white' | 'black' | 'draw', reason: string, emitState = true) {
        if (!gameId) return;
        setGameOver(true); setResult(winner); setResultReason(reason); setGameStatus('completed');

        if (myColor) await api.updateGame(gameId, { status: 'completed', result: winner, result_reason: reason, ended_at: new Date().toISOString() });

        if (emitState && socketRef.current) {
            socketRef.current.emit('game_over', { gameId, winner, reason });
        }
    }

    function sendChat(e: React.FormEvent) {
        e.preventDefault();
        if (!chatInput.trim() || !gameId) return;

        socketRef.current?.emit('send_message', { gameId, text: chatInput.trim() });
        setChatMessages(prev => [...prev, { sender: 'You', text: chatInput.trim() }]);
        setChatInput('');
    }

    function offerDraw() {
        if (!myColor || !gameId) return;
        setDrawOfferedBy(myColor);
        socketRef.current?.emit('offer_draw', { gameId, color: myColor });
        setChatMessages(prev => [...prev, { sender: 'System', text: 'You offered a draw.', isSystem: true }]);
    }

    function acceptDraw() {
        endGame('draw', 'agreement', true);
    }

    function declineDraw() {
        setDrawOfferedBy(null);
        socketRef.current?.emit('decline_draw', { gameId });
        setChatMessages(prev => [...prev, { sender: 'System', text: 'You declined the draw offer.', isSystem: true }]);
    }

    useEffect(() => {
        if (!game?.is_bot_game || gameOver || currentTurn !== game.bot_color || botThinkingRef.current) return;
        botThinkingRef.current = true;
        setTimeout(async () => {
            const moveData = await getBotMove(chessGame.fen(), botDifficulty);
            if (moveData) {
                try {
                    const moveRes = chessGame.move(moveData);
                    if (moveRes) {
                        setChessPosition(chessGame.fen());
                        broadcastMove(moveRes);
                    }
                } catch (e) {
                    console.error("Bot move error:", e);
                }
            }
            botThinkingRef.current = false;
        }, 500);
    }, [currentTurn, game, gameOver, botDifficulty, chessGame]);

    function broadcastMove(moveResult: any) {
        if (!gameId) return;
        setDrawOfferedBy(null);

        const history = chessGame.history({ verbose: true }).map(m => ({ san: m.san, color: m.color === 'w' ? 'white' : 'black' }));
        setMoveHistory(history);
        const isWhiteMove = chessGame.turn() === 'b';

        if (game?.is_bot_game) {
            const elapsed = Date.now() - lastTickRef.current;
            const inc = (game?.time_control_increment ?? 0) * 1000;
            let newW = whiteTimeMs, newB = blackTimeMs;

            if (isWhiteMove) {
                newW = Math.max(0, whiteTimeMs - elapsed) + inc;
            } else {
                newB = Math.max(0, blackTimeMs - elapsed) + inc;
            }

            setWhiteTimeMs(newW);
            setBlackTimeMs(newB);
            setCurrentTurn(isWhiteMove ? 'black' : 'white');
            lastTickRef.current = Date.now();

            api.updateGame(gameId, { pgn: chessGame.pgn(), fen: chessGame.fen(), current_turn: isWhiteMove ? 'black' : 'white', white_time_ms: newW, black_time_ms: newB, move_count: history.length });
        } else if (socketRef.current) {
            socketRef.current.emit('make_move', {
                gameId,
                move: moveResult,
                history,
                isWhiteMove,
                timeControlIncrement: game?.time_control_increment,
                pgn: chessGame.pgn(),
                fen: chessGame.fen()
            });

            setCurrentTurn(isWhiteMove ? 'black' : 'white');
            lastTickRef.current = Date.now();
        }

        if (chessGame.isGameOver()) {
            if (chessGame.isCheckmate()) endGame(chessGame.turn() === 'w' ? 'black' : 'white', 'checkmate', true);
            else endGame('draw', 'draw', true);
        }
    }

    function getMoveOptions(square: Square) {
        const moves = chessGame.moves({ square, verbose: true });
        if (moves.length === 0) {
            setOptionSquares({});
            return false;
        }
        const newSquares: Record<string, React.CSSProperties> = {};
        for (const move of moves) {
            newSquares[move.to] = {
                background: chessGame.get(move.to as Square) && chessGame.get(move.to as Square)?.color !== chessGame.get(square)?.color
                    ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
                    : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
                borderRadius: '50%'
            };
        }
        newSquares[square] = { background: 'rgba(255, 255, 0, 0.4)' };
        setOptionSquares(newSquares);
        return true;
    }

    function onSquareClick({ square }: SquareHandlerArgs) {
        if (gameOver || !myColor) return;

        const piece = chessGame.get(square as Square);
        if (!moveFrom && piece && piece.color !== myColor[0]) return;

        if (!moveFrom && piece) {
            const hasMoveOptions = getMoveOptions(square as Square);
            if (hasMoveOptions) setMoveFrom(square);
            return;
        }

        const moves = chessGame.moves({ square: moveFrom as Square, verbose: true });
        const foundMove = moves.find(m => m.from === moveFrom && m.to === square);

        if (!foundMove) {
            const hasMoveOptions = getMoveOptions(square as Square);
            setMoveFrom(hasMoveOptions ? square : '');
            return;
        }

        try {
            const moveResult = chessGame.move({ from: moveFrom, to: square, promotion: 'q' });
            if (moveResult) {
                setChessPosition(chessGame.fen());
                broadcastMove(moveResult);
            }
        } catch {
            const hasMoveOptions = getMoveOptions(square as Square);
            if (hasMoveOptions) setMoveFrom(square);
            return;
        }

        setMoveFrom('');
        setOptionSquares({});
    }

    function onPieceDrop({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
        if (gameOver || !myColor) return false;
        if (!targetSquare || sourceSquare === targetSquare) return false;

        const pieceType: string = (piece as any).pieceType || piece;
        const pieceColor = pieceType.charAt(0).toLowerCase();

        if (chessGame.turn() !== pieceColor) {
            if (pieceColor !== myColor[0]) return false;
            premovesRef.current.push({ sourceSquare, targetSquare, piece });
            setPremoves([...premovesRef.current]);
            return true;
        }

        const isPawn = pieceType.toLowerCase().charAt(1) === 'p';
        if (isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1')) {
            const possibleMoves = chessGame.moves({ square: sourceSquare as Square, verbose: true });
            if (possibleMoves.some(m => m.to === targetSquare)) {
                setPromotionMove({ sourceSquare, targetSquare });
                return true;
            }
            return false;
        }

        try {
            const moveResult = chessGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
            if (moveResult) {
                setChessPosition(chessGame.fen());
                broadcastMove(moveResult);
                setMoveFrom('');
                setOptionSquares({});
                return true;
            }
        } catch {
            return false;
        }
        return false;
    }

    function onPromotionPieceSelect(pieceSymbol: string) {
        if (promotionMove) {
            try {
                const moveResult = chessGame.move({
                    from: promotionMove.sourceSquare,
                    to: promotionMove.targetSquare as Square,
                    promotion: pieceSymbol.toLowerCase()
                });
                if (moveResult) {
                    setChessPosition(chessGame.fen());
                    broadcastMove(moveResult);
                    setMoveFrom('');
                    setOptionSquares({});
                }
            } catch { }
        }
        setPromotionMove(null);
    }

    function onSquareRightClick() {
        premovesRef.current = [];
        setPremoves([...premovesRef.current]);
    }

    function canDragPiece({ piece }: PieceHandlerArgs) {
        if (!piece || !myColor || gameOver) return false;
        const pieceType: string = (piece as any).pieceType || piece;
        return pieceType.charAt(0).toLowerCase() === myColor[0];
    }

    const positionObj = fenToObj(chessPosition);
    const customSquareStyles: Record<string, React.CSSProperties> = { ...optionSquares };

    for (const p of premoves) {
        delete positionObj[p.sourceSquare];
        positionObj[p.targetSquare] = p.piece;
        customSquareStyles[p.sourceSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.2)' };
        customSquareStyles[p.targetSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.2)' };
    }

    if (moveHistory.length > 0) {
        const historyVerbose = chessGame.history({ verbose: true });
        if (historyVerbose.length > 0) {
            const lastMoveObj = historyVerbose[historyVerbose.length - 1];
            customSquareStyles[lastMoveObj.from] = { ...customSquareStyles[lastMoveObj.from], backgroundColor: 'rgba(255, 255, 0, 0.4)' };
            customSquareStyles[lastMoveObj.to] = { ...customSquareStyles[lastMoveObj.to], backgroundColor: 'rgba(255, 255, 0, 0.4)' };
        }
    }

    if (chessGame.inCheck()) {
        const board = chessGame.board();
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = board[r][f];
                if (p && p.type === 'k' && p.color === chessGame.turn()) {
                    const sq = `${'abcdefgh'[f]}${8 - r}`;
                    customSquareStyles[sq] = { ...customSquareStyles[sq], backgroundColor: 'rgba(255, 0, 0, 0.6)' };
                }
            }
        }
    }

    const oppColor = boardOrientation === 'white' ? 'black' : 'white';
    const myTime = boardOrientation === 'white' ? whiteTimeMs : blackTimeMs;
    const oppTime = oppColor === 'white' ? whiteTimeMs : blackTimeMs;

    function renderClock(color: string, timeMs: number, active: boolean) {
        return (
            <div className={`flex justify-between items-center px-4 py-3 rounded-lg border transition-all duration-300 ${active ? 'bg-zinc-800 border-zinc-600 shadow-md' : 'bg-zinc-950 border-zinc-900 opacity-80'}`}>
                <div className="font-bold text-zinc-300 capitalize flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${color === 'white' ? 'bg-white' : 'bg-zinc-600'}`} /> {color}
                </div>
                <div className={`font-mono text-xl font-bold tabular-nums ${timeMs < 30000 && active ? 'text-red-400' : 'text-zinc-200'}`}>{formatTime(timeMs)}</div>
            </div>
        );
    }

    const boardOptions = {
        id: "MultiplayerBoard",
        position: positionObj,
        boardOrientation: boardOrientation,
        onPieceDrop: onPieceDrop,
        onSquareClick: onSquareClick,
        onSquareRightClick: onSquareRightClick,
        canDragPiece: canDragPiece,
        squareStyles: customSquareStyles,
        darkSquareStyle: { backgroundColor: '#70828e' },
        lightSquareStyle: { backgroundColor: '#c3cdd4' },
        animationDurationInMs: 200,
    };

    return (
        <div className="flex flex-col lg:flex-row py-4 gap-4 lg:gap-6 w-[calc(100vw-32px)] lg:w-[calc(100vw-200px)] mx-auto h-auto lg:h-[calc(100vh-2rem)] min-h-0">
            <div className="w-full lg:w-[320px] xl:w-[360px] flex flex-col shrink-0 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden h-[400px] lg:h-full shadow-2xl min-h-0">
                <div className="p-4 border-b border-zinc-800 bg-zinc-950 shrink-0">
                    <div className="flex items-center gap-3 text-zinc-300 mb-4">
                        <Rabbit size={24} className="text-zinc-400" />
                        <div>
                            <div className="text-sm font-semibold">{game?.time_control_minutes}+{game?.time_control_increment} • Rated • {game?.is_bot_game ? 'Computer' : 'Rapid'}</div>
                            <div className="text-xs text-zinc-500">Live Game</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 mb-2">
                        <div className="flex items-center gap-2 text-sm text-zinc-200">
                            <span className="w-3 h-3 rounded-full bg-white"></span>
                            <span>White Player</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-zinc-200">
                            <span className="w-3 h-3 rounded-full bg-zinc-600 border border-zinc-500"></span>
                            <span>Black Player</span>
                        </div>
                    </div>

                    {gameOver && (
                        <div className="mt-4 pt-4 border-t border-zinc-800/50 text-sm font-semibold text-center text-zinc-300">
                            {result === 'draw' ? 'Draw' : result === 'white' ? 'White is victorious' : 'Black is victorious'} • {resultReason}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-zinc-900">
                    {chatMessages.map((msg, i) => (
                        <div key={i} className={`text-sm ${msg.isSystem ? 'text-zinc-500 italic text-center' : 'text-zinc-300'}`}>
                            {!msg.isSystem && <span className="font-bold text-zinc-400 mr-2">{msg.sender}:</span>}
                            {msg.text}
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {!game?.is_bot_game && (
                    <form onSubmit={sendChat} className="p-2 border-t border-zinc-800 bg-zinc-900 shrink-0">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Please be nice in the chat!"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                        />
                    </form>
                )}
            </div>

            <div className="flex-1 min-w-0 w-full min-h-[500px] lg:min-h-0 flex flex-col items-center justify-center">

                <div className="w-full max-w-[600px] lg:max-w-[min(100%,calc(100vh-12rem))] flex flex-col gap-3 mx-auto">

                    {renderClock(oppColor, oppTime, currentTurn === oppColor && !gameOver)}

                    <div
                        className="w-full aspect-square relative shadow-2xl rounded-sm bg-zinc-900"
                        onContextMenu={(e) => { e.preventDefault(); onSquareRightClick(); }}
                    >
                        <Chessboard options={boardOptions} />

                        {promotionMove && (
                            <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center backdrop-blur-sm">
                                <div className="bg-zinc-800 p-5 rounded-2xl flex gap-3 shadow-2xl border border-zinc-700">
                                    {['q', 'r', 'n', 'b'].map(p => (
                                        <button key={p} onClick={() => onPromotionPieceSelect(p)} className="w-16 h-16 bg-zinc-700 hover:bg-zinc-600 rounded-xl flex items-center justify-center text-4xl shadow-sm transition-colors">
                                            <img src={`https://www.chess.com/chessathons/pieces/${myColor === 'white' ? 'w' : 'b'}${p}.png`} alt={p} className="w-12 h-12" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = myColor === 'white' ? (p === 'q' ? '♕' : p === 'r' ? '♖' : p === 'n' ? '♘' : '♗') : (p === 'q' ? '♛' : p === 'r' ? '♜' : p === 'n' ? '♞' : '♝') }} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {gameOver && (
                            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 flex-col gap-4 text-center p-4 backdrop-blur-sm">
                                <div className="text-4xl font-extrabold text-white tracking-tight">{result === 'draw' ? 'Draw' : result === myColor ? 'Victory' : 'Defeat'}</div>
                                <div className="text-zinc-400 uppercase tracking-widest text-sm font-semibold">{resultReason}</div>
                                <button onClick={() => navigate('/')} className="px-8 py-3 mt-4 bg-zinc-200 text-zinc-900 rounded-xl font-bold hover:bg-white transition-colors shadow-xl">Return Home</button>
                            </div>
                        )}
                    </div>

                    {renderClock(boardOrientation, myTime, currentTurn === boardOrientation && !gameOver)}
                </div>
            </div>

            <div className="w-full lg:w-[320px] xl:w-[360px] flex flex-col shrink-0 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden h-[400px] lg:h-full shadow-2xl min-h-0">
                <div className="p-5 border-b border-zinc-800 bg-zinc-950 flex items-center gap-2 text-sm font-bold text-zinc-300 uppercase tracking-wider shrink-0">
                    <Info size={16} className="text-zinc-500" /> Game Moves
                </div>

                <div className="flex-1 overflow-y-auto p-2 min-h-0 bg-zinc-900">
                    <div className="grid grid-cols-2 gap-1 text-sm font-mono">
                        {moveHistory.reduce<{ w?: string, b?: string, n: number }[]>((acc, move, i) => {
                            if (i % 2 === 0) acc.push({ w: move.san, n: Math.floor(i / 2) + 1 });
                            else acc[acc.length - 1].b = move.san;
                            return acc;
                        }, []).map(row => (
                            <div key={row.n} className="col-span-2 flex py-2 px-3 hover:bg-zinc-800 rounded-lg text-zinc-300 transition-colors">
                                <span className="w-12 text-zinc-500">{row.n}.</span>
                                <span className="flex-1">{row.w}</span>
                                <span className="flex-1 text-zinc-400">{row.b || ''}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex flex-col gap-3 shrink-0">
                    {drawOfferedBy === oppColor && !gameOver && (
                        <div className="p-3 bg-blue-900/30 border border-blue-800/50 rounded-xl flex flex-col gap-2">
                            <span className="text-blue-200 text-sm font-bold text-center">Opponent offered a draw</span>
                            <div className="flex gap-2">
                                <button onClick={acceptDraw} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-1 text-sm font-bold transition-colors">Accept</button>
                                <button onClick={declineDraw} className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg py-1 text-sm font-bold transition-colors">Decline</button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button onClick={() => setBoardOrientation(o => o === 'white' ? 'black' : 'white')} className="flex-1 py-3 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-xl flex items-center justify-center transition-colors"><RotateCcw size={18} /></button>
                        <button onClick={() => navigate('/')} className="flex-1 py-3 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-xl flex items-center justify-center transition-colors"><Home size={18} /></button>
                    </div>
                    {!gameOver && myColor && (
                        <div className="flex gap-2">
                            <button
                                onClick={offerDraw}
                                disabled={drawOfferedBy === myColor}
                                className="flex items-center justify-center gap-2 flex-1 bg-zinc-800 disabled:opacity-50 text-zinc-300 rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors"
                            >
                                <Handshake size={14} /> {drawOfferedBy === myColor ? 'Sent' : 'Offer Draw'}
                            </button>
                            <button onClick={() => setShowResignModal(true)} className="flex items-center justify-center gap-2 flex-1 bg-red-950/40 text-red-400 border border-red-900/30 rounded-xl text-sm font-bold hover:bg-red-900/60 transition-colors">
                                <Flag size={14} /> Resign
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showResignModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
                        <Skull className="mx-auto text-red-500 mb-4" size={48} />
                        <h3 className="text-xl font-bold text-zinc-100 mb-2">Resign the game?</h3>
                        <p className="text-sm text-zinc-400 mb-8">This will record a loss for your rating.</p>
                        <div className="flex gap-4">
                            <button onClick={() => setShowResignModal(false)} className="flex-1 py-3 bg-zinc-800 text-zinc-300 rounded-xl font-bold hover:bg-zinc-700 transition-colors">Cancel</button>
                            <button onClick={() => { endGame(myColor === 'white' ? 'black' : 'white', 'resignation', true); setShowResignModal(false); }} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition-colors shadow-lg shadow-red-900/20">Resign</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
