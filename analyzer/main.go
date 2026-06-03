package main

import (
	"net/http"
	"strings"

	"github.com/corentings/chess"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)


type AnalyzeRequest struct {
	PGN string `json:"pgn"`
}

func main() {
	
	e := echo.New()

	
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	
	e.POST("/analyze", handleAnalyze)

	
	e.Logger.Fatal(e.Start(":8080"))
}

func handleAnalyze(c echo.Context) error {
	var req AnalyzeRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid JSON format"})
	}

	if req.PGN == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "PGN cannot be empty"})
	}

	
	pgnOpt, err := chess.PGN(strings.NewReader(req.PGN))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Failed to parse PGN: " + err.Error()})
	}
	game := chess.NewGame(pgnOpt)

	
	engine, err := NewEngine("")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to start Stockfish engine"})
	}
	defer engine.Close()

	
	results, err := AnalyzeGame(game, engine, 15, 1000)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Analysis failed: " + err.Error()})
	}

	
	return c.JSON(http.StatusOK, map[string]interface{}{
		"data": results,
	})
}
