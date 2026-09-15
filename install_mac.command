#!/bin/bash
# Threadline — macOS installer
# Run this once to set up everything needed.
# Double-click this file in Finder, or run it in Terminal.

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║      Threadline — First-time setup    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Check Python ──────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 is not installed."
  echo ""
  echo "Please install it from https://www.python.org/downloads/"
  echo "Then run this script again."
  open "https://www.python.org/downloads/"
  read -p "Press Enter to close..."
  exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✓  Python $PYTHON_VERSION found"

# ── Create virtual environment ────────────────────────────────────────────────
if [ ! -d ".venv" ]; then
  echo "→  Creating virtual environment..."
  python3 -m venv .venv
fi
echo "✓  Virtual environment ready"

# ── Install dependencies ──────────────────────────────────────────────────────
echo "→  Installing dependencies (this may take a few minutes on first run)..."
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
echo "✓  Dependencies installed"

# ── Check Ollama ──────────────────────────────────────────────────────────────
echo ""
if ! command -v ollama &>/dev/null; then
  echo "⚠️   Ollama is not installed."
  echo "    Threadline will work without it, but AI summaries won't be available."
  echo "    Install it later from https://ollama.com"
else
  echo "✓  Ollama found"
  echo "→  Pulling AI model (llama3.1:8b — ~5 GB, first time only)..."
  ollama pull llama3.1:8b 2>/dev/null && echo "✓  AI model ready" || echo "⚠️   Could not pull model — check your internet connection"
fi

echo ""
echo "✅  Setup complete!"
echo ""
echo "To start Threadline, double-click: start_mac.command"
echo ""
read -p "Press Enter to close..."
