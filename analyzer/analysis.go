package main

import (
	"math"

	"github.com/corentings/chess"
)


type MoveAnalysis struct {
	Move           string `json:"move"`
	Eval           int    `json:"eval"`
	Classification string `json:"status"`
	BestMove       string `json:"best_move"`
}

func winProb(evalCp int) float64 {
	clamped := float64(evalCp)
	if clamped > 1000.0 {
		clamped = 1000.0
	} else if clamped < -1000.0 {
		clamped = -1000.0
	}
	return 1.0 / (1.0 + math.Pow(10, -clamped/400.0))
}

func classifyMove(playerEvalBefore, playerEvalAfter int, isBestMove bool) string {
	probBefore := winProb(playerEvalBefore)
	probAfter := winProb(playerEvalAfter)
	probLoss := probBefore - probAfter

	if probBefore > 0.8 && probAfter < 0.5 {
		return "miss"
	}
	if isBestMove || probLoss <= 0.0 {
		return "best"
	} else if probLoss <= 0.02 {
		return "great"
	} else if probLoss <= 0.05 {
		return "good"
	} else if probLoss <= 0.10 {
		return "inaccuracy"
	} else if probLoss <= 0.20 {
		return "mistake"
	}
	return "blunder"
}

func moveToUCI(m *chess.Move) string {
	s := m.S1().String() + m.S2().String()
	if m.Promo() != chess.NoPieceType {
		switch m.Promo() {
		case chess.Queen:
			s += "q"
		case chess.Rook:
			s += "r"
		case chess.Bishop:
			s += "b"
		case chess.Knight:
			s += "n"
		}
	}
	return s
}


func AnalyzeGame(game *chess.Game, engine *Engine, searchDepth int, searchTime int) ([]MoveAnalysis, error) {
	var results []MoveAnalysis

	moves := game.Moves()
	positions := game.Positions()

	for i, m := range moves {
		posBefore := positions[i]
		fenBefore := posBefore.String()
		isWhiteTurn := posBefore.Turn() == chess.White

		
		evalBeforeRes, err := engine.GetEvalMove(fenBefore, searchDepth, searchTime)
		if err != nil {
			return nil, err
		}

		evalBefore := evalBeforeRes.Eval
		bestMoveUci := evalBeforeRes.Mov
		if bestMoveUci == "" {
			bestMoveUci = "none"
		}

		playedUci := moveToUCI(m)
		isBest := (bestMoveUci != "none") && (bestMoveUci == playedUci)

		
		fenAfter := positions[i+1].String()
		evalAfter := engine.GetEval(fenAfter, searchDepth)

		playerEvalBefore := evalBefore
		if !isWhiteTurn {
			playerEvalBefore = -evalBefore
		}

		playerEvalAfter := evalAfter
		if !isWhiteTurn {
			playerEvalAfter = -evalAfter
		}

		status := classifyMove(playerEvalBefore, playerEvalAfter, isBest)
		moveSan := chess.AlgebraicNotation{}.Encode(posBefore, m)

		
		results = append(results, MoveAnalysis{
			Move:           moveSan,
			Eval:           playerEvalAfter,
			Classification: status,
			BestMove:       bestMoveUci,
		})
	}

	return results, nil
}
