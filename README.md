# Chessle

Chessle is a full-stack chess application featuring gameplay, engine analysis, and user management. The repository is divided into three primary services: a frontend web client, a Node.js backend, and a Go-based analysis engine.

## Project Structure
* **frontend**: A React application built with TypeScript and Vite. It handles the user interface and routing, which includes dedicated pages for Login, Registration, Landing, Game, Analysis, and User Profiles. It integrates with Supabase for backend services and uses Stockfish for local game evaluation.
* **backend**: A Node.js server written in TypeScript that manages the primary API endpoints.
* **analyzer**: A dedicated service written in Go for handling intensive chess analysis and engine operations.

## Features
* **Play**: Interactive chess interface for playing games against the bot or against other players.
* **Analysis**: Post-game analysis and board evaluation powered by Stockfish.
* **Authentication**: Secure user login and registration flows managed via Supabase.
* **User Profiles**: Track user history and preferences.

## Technology Stack
* **Frontend**: React, TypeScript, Vite, Tailwind CSS.
* **Backend**: Node.js, TypeScript.
* **Analyzer**: Go.
* **Database & Auth**: Supabase.


## How To Use
1. **Clone the repository:**
```bash
git clone https://github.com/HrishabhMittal/chessle.git
cd chessle

```

2.  **Start the Frontend:**
```bash
cd frontend
npm install
npm run dev

```

3. **Start the Backend:**
```bash
cd backend
npm install
npm run dev

```

4.  **Start the Analyzer:**
```bash
cd analyzer
go mod tidy
go run main.go

```
