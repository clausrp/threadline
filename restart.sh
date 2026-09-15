#!/bin/bash
# Threadline — dev restart
# Kills any running instance and starts fresh.

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Kill anything on port 8000 (or nearby)
for port in 8000 8001 8002 8003; do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null
    echo "✓  Killed process on port $port"
  fi
done

echo "→  Starting Threadline..."
.venv/bin/python backend/app.py
