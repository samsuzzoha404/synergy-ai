#!/usr/bin/env bash
# ============================================================
# start.sh — Synergy Sales Genius Dev Launcher (Mac / Linux)
# ============================================================
# Spawns two background processes:
#   1. FastAPI backend (uvicorn)  →  http://localhost:8000
#   2. Vite frontend (bun/npm)    →  http://localhost:5173
#
# Usage:
#   chmod +x start.sh   # once
#   ./start.sh
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_ACTIVATE="$BACKEND_DIR/venv/bin/activate"

echo ""
echo " ╔══════════════════════════════════════╗"
echo " ║   Synergy Sales Genius — Dev Start   ║"
echo " ╚══════════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------------------
# Backend — FastAPI via uvicorn
# ---------------------------------------------------------------------------
if [ ! -f "$VENV_ACTIVATE" ]; then
  echo " [WARN] Python venv not found. Setting it up first…"
  python3 -m venv "$BACKEND_DIR/venv"
  "$BACKEND_DIR/venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt" --quiet
  echo " [OK]   venv created and dependencies installed."
fi

echo " Starting FastAPI backend → http://localhost:8000"
echo "         Swagger UI       → http://localhost:8000/docs"

(
  # shellcheck disable=SC1090
  source "$VENV_ACTIVATE"
  cd "$BACKEND_DIR"
  python -m uvicorn main:app --reload --port 8000
) &
BACKEND_PID=$!
echo " [PID $BACKEND_PID] Backend started."

# ---------------------------------------------------------------------------
# Frontend — Vite via bun or npm
# ---------------------------------------------------------------------------
echo ""
echo " Starting Vite frontend → http://localhost:5173"

(
  cd "$ROOT_DIR"
  if command -v bun &>/dev/null; then
    bun run dev
  else
    npm run dev
  fi
) &
FRONTEND_PID=$!
echo " [PID $FRONTEND_PID] Frontend started."

echo ""
echo " Both servers are running. Press Ctrl+C to stop both."
echo ""

# Wait for either process to exit, then kill the other.
wait -n "$BACKEND_PID" "$FRONTEND_PID"
echo " One server stopped. Shutting down the other…"
kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
wait 2>/dev/null || true
echo " All servers stopped."
