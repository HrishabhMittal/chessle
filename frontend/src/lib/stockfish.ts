import { Chess } from 'chess.js';

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

function evaluate(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -99999 : 99999;
  if (chess.isDraw()) return 0;
  let score = 0;
  chess.board().forEach((row, r) => row.forEach((p, f) => {
    if (!p) return;
    const val = PIECE_VALUES[p.type] ?? 0;
    const psv = p.type === 'p' ? (PAWN_TABLE[p.color === 'w' ? (7-r)*8+f : r*8+f] ?? 0) : 0;
    score += (p.color === 'w' ? 1 : -1) * (val + psv);
  }));
  return score;
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess);
  const moves = chess.moves();
  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const val = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      maxEval = Math.max(maxEval, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const val = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      minEval = Math.min(minEval, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export function getBotMove(fen: string, difficulty: 'easy' | 'medium' | 'hard'): string | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)].san;
  
  const depth = difficulty === 'hard' ? 3 : 2;
  const isMaximizing = chess.turn() === 'w';
  let bestMove = moves[0].san;
  let bestVal = isMaximizing ? -Infinity : Infinity;

  for (const move of moves) {
    chess.move(move);
    const val = minimax(chess, depth - 1, -Infinity, Infinity, !isMaximizing);
    chess.undo();
    if (isMaximizing ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = move.san;
    }
  }
  return bestMove;
}
