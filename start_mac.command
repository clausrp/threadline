#!/bin/bash
# Threadline — macOS launcher
# Double-click this file in Finder to start Threadline.

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Starting Threadline           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Check setup has been run ──────────────────────────────────────────────────
if [ ! -d ".venv" ]; then
  echo "❌  Setup has not been run yet."
  echo "    Please double-click install_mac.command first."
  read -p "Press Enter to close..."
  exit 1
fi

# ── Start Ollama if installed ─────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
  if ! pgrep -x "ollama" &>/dev/null; then
    echo "→  Starting Ollama..."
    ollama serve &>/dev/null &
    sleep 2
  fi
  echo "✓  Ollama running"
fi

# ── Start Threadline ──────────────────────────────────────────────────────────
echo "→  Starting Threadline server..."
echo "   Opening http://127.0.0.1:8000 in your browser..."
echo ""
echo "   To stop Threadline, close this window or press Ctrl+C"
echo ""

.venv/bin/python backend/app.py
