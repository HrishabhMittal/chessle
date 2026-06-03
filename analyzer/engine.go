package main

import (
	"bufio"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
)

type MoveEval struct {
	Eval int
	Mov  string
	PV   []string
}

type Engine struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
}

func NewEngine(path string) (*Engine, error) {
	if path == "" {
		path = "/usr/bin/stockfish"
	}
	cmd := exec.Command(path)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	reader := bufio.NewReader(stdout)

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	engine := &Engine{
		cmd:    cmd,
		stdin:  stdin,
		stdout: reader,
	}

	fmt.Fprintln(engine.stdin, "uci")
	engine.waitFor("uciok")
	fmt.Fprintln(engine.stdin, "setoption name Threads value 1")
	fmt.Fprintln(engine.stdin, "isready")
	engine.waitFor("readyok")

	return engine, nil
}

func (e *Engine) waitFor(target string) {
	for {
		line, err := e.stdout.ReadString('\n')
		if err != nil {
			break
		}
		if strings.Contains(line, target) {
			break
		}
	}
}

func (e *Engine) GetEvalMove(fen string, depth int, timeMs int) (*MoveEval, error) {
	fmt.Fprintf(e.stdin, "position fen %s\n", fen)
	fmt.Fprintf(e.stdin, "go depth %d movetime %d\n", depth, timeMs)

	var finalScore int
	var bestMoveStr string
	var currentPV []string

	for {
		line, err := e.stdout.ReadString('\n')
		if err != nil {
			break
		}
		text := strings.TrimSpace(line)

		if strings.HasPrefix(text, "info") {
			tokens := strings.Fields(text)
			for i, token := range tokens {
				if token == "score" && i+2 < len(tokens) {
					scoreType := tokens[i+1]
					scoreVal, _ := strconv.Atoi(tokens[i+2])
					if scoreType == "cp" {
						finalScore = scoreVal
					} else if scoreType == "mate" {
						if scoreVal > 0 {
							finalScore = 8500 - scoreVal
						} else {
							finalScore = -8500 - scoreVal
						}
					}
				}
				if token == "pv" && i+1 < len(tokens) {
					currentPV = tokens[i+1:]
				}
			}
		} else if strings.HasPrefix(text, "bestmove") {
			tokens := strings.Fields(text)
			if len(tokens) > 1 {
				bestMoveStr = tokens[1]
			}
			break
		}
	}

	isBlackTurn := false
	parts := strings.Fields(fen)
	if len(parts) > 1 && parts[1] == "b" {
		isBlackTurn = true
	}

	eval := finalScore
	if isBlackTurn {
		eval = -finalScore
	}

	if bestMoveStr == "" || bestMoveStr == "(none)" {
		return &MoveEval{Eval: eval, Mov: "", PV: currentPV}, nil
	}

	return &MoveEval{Eval: eval, Mov: bestMoveStr, PV: currentPV}, nil
}

func (e *Engine) GetEval(fen string, depth int) int {
	fmt.Fprintf(e.stdin, "position fen %s\n", fen)
	fmt.Fprintf(e.stdin, "go depth %d\n", depth)

	var finalScore int
	for {
		line, err := e.stdout.ReadString('\n')
		if err != nil {
			break
		}
		text := strings.TrimSpace(line)
		if strings.HasPrefix(text, "info") {
			tokens := strings.Fields(text)
			for i, token := range tokens {
				if token == "score" && i+2 < len(tokens) {
					scoreType := tokens[i+1]
					scoreVal, _ := strconv.Atoi(tokens[i+2])
					if scoreType == "cp" {
						finalScore = scoreVal
					} else if scoreType == "mate" {
						if scoreVal > 0 {
							finalScore = 8500 - scoreVal
						} else {
							finalScore = -8500 - scoreVal
						}
					}
				}
			}
		} else if strings.HasPrefix(text, "bestmove") {
			break
		}
	}

	isBlackTurn := false
	parts := strings.Fields(fen)
	if len(parts) > 1 && parts[1] == "b" {
		isBlackTurn = true
	}

	if isBlackTurn {
		return -finalScore
	}
	return finalScore
}

func (e *Engine) Close() {
	fmt.Fprintln(e.stdin, "quit")
	e.cmd.Wait()
}
