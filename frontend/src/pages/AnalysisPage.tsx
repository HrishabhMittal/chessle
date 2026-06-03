import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { evaluatePosition } from '../lib/stockfish';
import { ChevronLeft, ChevronRight, FastForward, Rewind, BarChart2, Loader2, ArrowLeft } from 'lucide-react';

interface ServerAnalysisMove {
    move: string;
    eval: number;
    status: string;
    best_move: string;
}

export default function AnalysisPage() {
    const { gameId } = useParams<{ gameId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const chessGameRef = useRef(new Chess());
    const chessGame = chessGameRef.current;


    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
    const [positionFen, setPositionFen] = useState(chessGame.fen());
    const [moveHistory, setMoveHistory] = useState<{ san: string; from: string, to: string, fen: string }[]>([]);


    const [liveEval, setLiveEval] = useState<number>(0.0);
    const [liveBestMove, setLiveBestMove] = useState<string>('');
    const [isEvaluating, setIsEvaluating] = useState(false);


    const [serverAnalysis, setServerAnalysis] = useState<ServerAnalysisMove[] | null>(null);
    const [isRequestingAnalysis, setIsRequestingAnalysis] = useState(false);


    useEffect(() => {
        if (gameId) loadGame();
    }, [gameId]);

    async function loadGame() {
        const { data } = await api.getGame(gameId!);
        if (!data || !data.pgn) { navigate('/'); return; }

        chessGame.loadPgn(data.pgn);


        const history = chessGame.history({ verbose: true });
        const tempGame = new Chess();
        const fullHistory = history.map(m => {
            tempGame.move(m);
            return { san: m.san, from: m.from, to: m.to, fen: tempGame.fen() };
        });

        setMoveHistory(fullHistory);
        setCurrentMoveIndex(fullHistory.length - 1);


        if (data.analysis_json) {
            setServerAnalysis(data.analysis_json);
        }
    }


    useEffect(() => {
        if (moveHistory.length === 0) return;

        let fenToAnalyze = '';
        if (currentMoveIndex === -1) {
            const emptyGame = new Chess();
            fenToAnalyze = emptyGame.fen();
            setPositionFen(fenToAnalyze);
        } else {
            fenToAnalyze = moveHistory[currentMoveIndex].fen;
            setPositionFen(fenToAnalyze);
        }


        runLocalEvaluation(fenToAnalyze);
    }, [currentMoveIndex, moveHistory]);

    async function runLocalEvaluation(fen: string) {
        setIsEvaluating(true);
        const result = await evaluatePosition(fen, 14);
        if (result) {


            const turn = fen.split(' ')[1];
            let absoluteEval = result.eval;
            if (turn === 'b') absoluteEval = -absoluteEval;

            setLiveEval(absoluteEval);
            setLiveBestMove(result.bestMove);
        }
        setIsEvaluating(false);
    }


    async function requestFullAnalysis() {
        if (!gameId) return;
        setIsRequestingAnalysis(true);
        try {
            const { data, error } = await api.requestAnalysis(gameId);
            if (data) {
                setServerAnalysis(data);
            } else if (error) {
                alert("Failed to analyze game: " + error.message);
            }
        } catch (e) {
            console.error("Analysis Request Error:", e);
        }
        setIsRequestingAnalysis(false);
    }


    const goToStart = () => setCurrentMoveIndex(-1);
    const goPrev = () => setCurrentMoveIndex(prev => Math.max(-1, prev - 1));
    const goNext = () => setCurrentMoveIndex(prev => Math.min(moveHistory.length - 1, prev + 1));
    const goToEnd = () => setCurrentMoveIndex(moveHistory.length - 1);



    const clampedEval = Math.max(-10, Math.min(10, liveEval));
    const whiteBarPercentage = ((clampedEval + 10) / 20) * 100;


    const engineArrows = [];
    if (liveBestMove && liveBestMove.length >= 4) {
        engineArrows.push([
            liveBestMove.substring(0, 2),
            liveBestMove.substring(2, 4),
            'rgb(34, 197, 94)'
        ]);
    }


    const getStatusColor = (status: string) => {
        switch (status) {
            case 'blunder': return 'text-red-500';
            case 'mistake': return 'text-orange-500';
            case 'inaccuracy': return 'text-yellow-500';
            case 'good': return 'text-green-400';
            case 'best': return 'text-green-500 font-bold';
            case 'great': return 'text-cyan-400 font-bold';
            case 'miss': return 'text-pink-500';
            default: return 'text-zinc-400';
        }
    };


    const boardOptions: any = {
        id: "AnalysisBoard",
        position: positionFen,
        boardOrientation: "white",
        customArrows: engineArrows,
        customDarkSquareStyle: { backgroundColor: '#70828e' },
        customLightSquareStyle: { backgroundColor: '#c3cdd4' },
        animationDurationInMs: 200,
        arePiecesDraggable: false
    };

    return (
        <div className="flex flex-col lg:flex-row p-4 lg:p-6 w-full max-w-7xl mx-auto h-[calc(100vh-56px)] gap-6">

            {/* LEFT COLUMN: Evaluation Bar & Board */}
            <div className="flex gap-4 w-full lg:w-2/3 h-full max-h-[800px]">

                {/* Evaluation Bar */}
                <div className="w-8 shrink-0 bg-zinc-800 rounded-md overflow-hidden relative flex flex-col justify-end border border-zinc-700">
                    <div
                        className="w-full bg-white transition-all duration-500 ease-in-out"
                        style={{ height: `${whiteBarPercentage}%` }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-between py-2 pointer-events-none">
                        <span className={`text-xs font-bold z-10 ${liveEval > 0 ? 'text-black' : 'text-white'}`}>
                            {liveEval > 0 ? '+' : ''}{liveEval.toFixed(1)}
                        </span>
                        {isEvaluating && <Loader2 size={14} className="animate-spin text-zinc-500 mix-blend-difference" />}
                    </div>
                </div>

                {/* Chess Board */}
                <div className="flex-1 aspect-square max-h-full">
                    {/* Render standard spread of options or use options prop if custom */}
                    <Chessboard {...boardOptions} options={boardOptions} />

                    {/* Media Controls */}
                    <div className="flex justify-center items-center gap-2 mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-2">
                        <button onClick={goToStart} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"><Rewind size={20} /></button>
                        <button onClick={goPrev} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"><ChevronLeft size={24} /></button>
                        <button onClick={goNext} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"><ChevronRight size={24} /></button>
                        <button onClick={goToEnd} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"><FastForward size={20} /></button>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Move List & Analysis Data */}
            <div className="w-full lg:w-1/3 flex flex-col gap-4 h-full">

                {/* Back to Game / Request Analysis Header */}
                <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <button onClick={() => navigate(`/game/${gameId}`)} className="text-sm font-semibold text-zinc-400 hover:text-white flex items-center gap-2">
                        <ArrowLeft size={16} /> Back
                    </button>
                    {!serverAnalysis && (
                        <button
                            onClick={requestFullAnalysis}
                            disabled={isRequestingAnalysis}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isRequestingAnalysis ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                            Request Full Analysis
                        </button>
                    )}
                </div>

                {/* Move List */}
                <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-zinc-800 font-bold text-zinc-200 bg-zinc-950">
                        Move History
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono">
                            {moveHistory.map((m, i) => {

                                if (i % 2 !== 0) return null;
                                const whiteMove = m;
                                const blackMove = moveHistory[i + 1];

                                const whiteClass = i === currentMoveIndex ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800 cursor-pointer';
                                const blackClass = i + 1 === currentMoveIndex ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800 cursor-pointer';


                                const whiteAnalysis = serverAnalysis?.[i];
                                const blackAnalysis = serverAnalysis?.[i + 1];

                                return (
                                    <React.Fragment key={i}>
                                        <div
                                            className={`px-2 py-1.5 rounded flex justify-between ${whiteClass}`}
                                            onClick={() => setCurrentMoveIndex(i)}
                                        >
                                            <span>{Math.floor(i / 2) + 1}. {whiteMove.san}</span>
                                            {whiteAnalysis && (
                                                <span className={`text-xs ${getStatusColor(whiteAnalysis.status)}`}>
                                                    {whiteAnalysis.status.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        {blackMove ? (
                                            <div
                                                className={`px-2 py-1.5 rounded flex justify-between ${blackClass}`}
                                                onClick={() => setCurrentMoveIndex(i + 1)}
                                            >
                                                <span>{blackMove.san}</span>
                                                {blackAnalysis && (
                                                    <span className={`text-xs ${getStatusColor(blackAnalysis.status)}`}>
                                                        {blackAnalysis.status.toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                        ) : <div />}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Local Engine Inspector */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Local Engine (Depth 14)</h4>
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-sm text-zinc-400">Best Move</div>
                            <div className="text-xl font-bold font-mono text-zinc-200">
                                {liveBestMove || '...'}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-zinc-400">Eval</div>
                            <div className={`text-xl font-bold font-mono ${liveEval > 0 ? 'text-white' : 'text-zinc-400'}`}>
                                {liveEval > 0 ? '+' : ''}{liveEval.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
