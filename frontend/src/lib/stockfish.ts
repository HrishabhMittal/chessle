type Task = () => Promise<void>;
let engine: Worker | null = null;
let engineReady = false;
let initPromise: Promise<void> | null = null;
const taskQueue: Task[] = [];
let taskRunning = false;
async function runNextTask() {
    if (taskRunning || taskQueue.length === 0) return;
    taskRunning = true;
    const task = taskQueue.shift()!;
    try { await task(); } finally {
        taskRunning = false;
        runNextTask();
    }
}
function enqueueTask(task: Task): void {
    taskQueue.push(task);
    runNextTask();
}
async function initEngine(): Promise<void> {
    if (engineReady) return;
    if (initPromise) return initPromise;
    initPromise = new Promise<void>((resolve, reject) => {
        fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js')
            .then(r => r.text())
            .then(script => {
                const blob = new Blob([script], { type: 'application/javascript' });
                engine = new Worker(URL.createObjectURL(blob));
                engine.onmessage = (e: MessageEvent) => {
                    if (e.data === 'uciok') {
                        engineReady = true;
                        engine!.postMessage('isready');
                    }
                    if (e.data === 'readyok') {
                        engine!.onmessage = null;
                        resolve();
                    }
                };
                engine.onerror = reject;
                engine.postMessage('uci');
            })
            .catch(reject);
    });
    return initPromise;
}
export function getBotMove(
    fen: string,
    difficulty: 'easy' | 'medium' | 'hard'
): Promise<{ from: string; to: string; promotion?: string } | null> {
    return new Promise((resolve) => {
        enqueueTask(() =>
            new Promise<void>(async (taskDone) => {
                await initEngine();
                if (!engine) { resolve(null); taskDone(); return; }
                const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 5 : 12;
                engine.onmessage = (e: MessageEvent) => {
                    const line: string = e.data;
                    if (line.startsWith('bestmove')) {
                        const moveStr = line.split(' ')[1];
                        if (moveStr && moveStr.length >= 4) {
                            resolve({
                                from: moveStr.substring(0, 2),
                                to: moveStr.substring(2, 4),
                                promotion: moveStr.length === 5 ? moveStr[4] : undefined,
                            });
                        } else {
                            resolve(null);
                        }
                        engine!.onmessage = null;
                        taskDone();
                    }
                };
                engine.postMessage('ucinewgame');
                engine.postMessage('position fen ' + fen);
                engine.postMessage('go depth ' + depth);
            })
        );
    });
}
export function evaluatePosition(
    fen: string,
    depth: number = 14,
    onProgress?: (result: { eval: number; bestMove: string; depth: number }) => void
): Promise<{ eval: number; bestMove: string } | null> {
    return new Promise((resolve) => {
        enqueueTask(() =>
            new Promise<void>(async (taskDone) => {
                await initEngine();
                if (!engine) { resolve(null); taskDone(); return; }
                const sideToMove = fen.split(' ')[1];
                let latestEval = 0;
                let latestBestMove = '';
                engine.onmessage = (e: MessageEvent) => {
                    const line: string = e.data;
                    if (line.startsWith('info') && line.includes('score')) {
                        let rawEval = 0;
                        let infoDepth = 0;
                        let bestMoveInLine = '';
                        const depthMatch = line.match(/depth (\d+)/);
                        if (depthMatch) infoDepth = parseInt(depthMatch[1]);
                        const pvMatch = line.match(/pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
                        if (pvMatch) bestMoveInLine = pvMatch[1];
                        if (line.includes('score cp')) {
                            const m = line.match(/score cp (-?\d+)/);
                            if (m) rawEval = parseInt(m[1]) / 100;
                        } else if (line.includes('score mate')) {
                            const m = line.match(/score mate (-?\d+)/);
                            if (m) rawEval = parseInt(m[1]) > 0 ? 100 : -100;
                        }
                        const absoluteEval = sideToMove === 'b' ? -rawEval : rawEval;
                        latestEval = absoluteEval;
                        if (bestMoveInLine) latestBestMove = bestMoveInLine;
                        if (onProgress && bestMoveInLine) {
                            onProgress({ eval: absoluteEval, bestMove: bestMoveInLine, depth: infoDepth });
                        }
                    }
                    if (line.startsWith('bestmove')) {
                        const parts = line.split(' ');
                        const finalMove = parts[1];
                        if (finalMove && finalMove !== '(none)' && finalMove.length >= 4) {
                            latestBestMove = finalMove;
                        }
                        resolve(latestBestMove ? { eval: latestEval, bestMove: latestBestMove } : null);
                        engine!.onmessage = null;
                        taskDone();
                    }
                };
                engine.postMessage('stop');
                engine.postMessage('ucinewgame');
                engine.postMessage('position fen ' + fen);
                engine.postMessage('go depth ' + depth);
            })
        );
    });
}
