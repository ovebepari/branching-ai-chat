#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.pids"

# Check if already running
if [[ -f "$PID_FILE" ]]; then
  echo "⚠  Servers may already be running (found .pids file)."
  echo "   Run ./stop.sh first, or delete .pids if stale."
  exit 1
fi

# Check for node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install it first — see README.md"
  exit 1
fi

# Check for npm dependencies
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo "📦 Installing dependencies..."
  npm --prefix "$SCRIPT_DIR" install
fi

echo "🚀 Starting Branch Chat..."

# Start backend (Express API server)
npm --prefix "$SCRIPT_DIR" run server &
SERVER_PID=$!

# Small delay to let the server bind its port
sleep 1

# Start frontend (Vite dev server)
npm --prefix "$SCRIPT_DIR" run dev &
DEV_PID=$!

# Save PIDs
echo "$SERVER_PID" >  "$PID_FILE"
echo "$DEV_PID"    >> "$PID_FILE"

echo ""
echo "✅ Branch Chat is running!"
echo "   Frontend:  http://localhost:5173/"
echo "   Backend:   http://localhost:3001/"
echo ""
echo "   To stop:   ./stop.sh"
echo "   PIDs:      server=$SERVER_PID  dev=$DEV_PID"

# Wait for both — if either exits, we still keep the other alive
wait
