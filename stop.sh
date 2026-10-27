#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.pids"

if [[ ! -f "$PID_FILE" ]]; then
  echo "ℹ  No .pids file found — nothing to stop."
  exit 0
fi

echo "🛑 Stopping Branch Chat..."

while IFS= read -r pid; do
  if [[ -z "$pid" ]]; then continue; fi

  if kill -0 "$pid" 2>/dev/null; then
    # Kill the process group so child processes (tsx, vite) also terminate
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    echo "   Killed PID $pid"
  else
    echo "   PID $pid already stopped"
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "✅ Stopped."
