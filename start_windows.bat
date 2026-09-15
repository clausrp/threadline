@echo off
REM Threadline — Windows launcher
REM Double-click this file to start Threadline.

echo.
echo ========================================
echo   Starting Threadline
echo ========================================
echo.

REM ── Check setup has been run ──────────────────────────────────────────────
IF NOT EXIST ".venv" (
    echo ERROR: Setup has not been run yet.
    echo Please double-click install_windows.bat first.
    pause
    exit /b 1
)

REM ── Start Ollama if installed ─────────────────────────────────────────────
where ollama >nul 2>&1
IF NOT ERRORLEVEL 1 (
    tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul
    IF ERRORLEVEL 1 (
        echo Starting Ollama...
        start /B ollama serve
        timeout /t 2 /nobreak >nul
    )
    echo OK - Ollama running
)

REM ── Start Threadline ──────────────────────────────────────────────────────
echo Starting Threadline server...
echo Opening http://127.0.0.1:8000 in your browser...
echo.
echo To stop Threadline, close this window.
echo.

.venv\Scripts\python backend\app.py
pause
