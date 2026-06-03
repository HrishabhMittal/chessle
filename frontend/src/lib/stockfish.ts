
let engine: Worker | null = null;

export async function getBotMove(fen: string, difficulty: 'easy' | 'medium' | 'hard'): Promise<{ from: string, to: string, promotion?: string } | null> {
    if (!engine) {
        try {
            const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
            const script = await response.text();

            const blob = new Blob([script], { type: 'application/javascript' });
            engine = new Worker(URL.createObjectURL(blob));
        } catch (e) {
            console.error("Failed to load Stockfish Web Worker", e);
            return null;
        }
    }

    return new Promise((resolve) => {
        const skill = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 10 : 20;
        const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 5 : 12;
        engine!.onmessage = (event: MessageEvent | string) => {
            const line = typeof event === 'string' ? event : event.data;
            if (line && line.startsWith('bestmove')) {
                const move = line.split(' ')[1];
                if (!move || move === '(none)') {
                    resolve(null);
                    return;
                }
                const from = move.slice(0, 2);
                const to = move.slice(2, 4);
                const promotion = move.length > 4 ? move[4] : undefined;
                resolve({ from, to, promotion });
            }
        };

        engine!.postMessage('uci');
        engine!.postMessage(`setoption name Skill Level value ${skill}`);
        engine!.postMessage(`position fen ${fen}`);
        engine!.postMessage(`go depth ${depth}`);
    });
}
