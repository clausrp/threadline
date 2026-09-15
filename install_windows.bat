@echo off
REM Threadline — Windows installer
REM Run this once to set up everything needed.
REM Double-click this file to run it.

echo.
echo ========================================
echo   Threadline - First-time setup
echo ========================================
echo.

REM ── Check Python ──────────────────────────────────────────────────────────
python --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo ERROR: Python is not installed.
    echo.
    echo Please install it from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo Then run this script again.
    start https://www.python.org/downloads/
    pause
    exit /b 1
)
echo OK - Python found
FOR /F "tokens=*" %%i IN ('python --version') DO echo    %%i

REM ── Create virtual environment ────────────────────────────────────────────
IF NOT EXIST ".venv" (
    echo.
    echo Creating virtual environment...
    python -m venv .venv
)
echo OK - Virtual environment ready

REM ── Install dependencies ──────────────────────────────────────────────────
echo.
echo Installing dependencies (this may take a few minutes on first run)...
.venv\Scripts\pip install --quiet --upgrade pip
.venv\Scripts\pip install --quiet -r requirements.txt
echo OK - Dependencies installed

REM ── Check Ollama ──────────────────────────────────────────────────────────
echo.
where ollama >nul 2>&1
IF ERRORLEVEL 1 (
    echo NOTE: Ollama is not installed.
    echo   Threadline will work without it but AI summaries won't be available.
    echo   Install it later from https://ollama.com
) ELSE (
    echo OK - Ollama found
    echo Pulling AI model - llama3.1:8b, about 5 GB, first time only...
    ollama pull llama3.1:8b
    echo OK - AI model ready
)

echo.
echo ========================================
echo   Setup complete!
echo   To start Threadline, double-click:
echo   start_windows.bat
echo ========================================
echo.
pause
