@echo off
:: ============================================================
:: start.bat — Synergy Sales Genius Dev Launcher (Windows)
:: ============================================================
:: Opens two PowerShell windows:
::   1. FastAPI backend (uvicorn)  →  http://localhost:8000
::   2. Vite frontend (bun/npm)    →  http://localhost:5173
:: ============================================================

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Synergy Sales Genius — Dev Start   ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Starting FastAPI backend (port 8000)...
echo  Starting Vite frontend  (port 5173)...
echo.

:: --- Backend: activate venv and run uvicorn ---
start "Synergy Backend (FastAPI)" powershell -NoExit -Command ^
  "cd '%~dp0backend'; ^
   if (Test-Path '.\venv\Scripts\Activate.ps1') { ^
     .\venv\Scripts\Activate.ps1 ^
   } else { ^
     Write-Host '[WARN] venv not found. Run: python -m venv venv && .\venv\Scripts\pip install -r requirements.txt' -ForegroundColor Yellow ^
   }; ^
   Write-Host '' ; ^
   Write-Host ' Backend → http://localhost:8000' -ForegroundColor Cyan ; ^
   Write-Host ' Docs    → http://localhost:8000/docs' -ForegroundColor Cyan ; ^
   Write-Host '' ; ^
   python -m uvicorn main:app --reload --port 8000"

:: Short pause so the backend terminal opens first
timeout /t 1 /nobreak >nul

:: --- Frontend: run bun/npm dev in project root ---
start "Synergy Frontend (Vite)" powershell -NoExit -Command ^
  "cd '%~dp0'; ^
   Write-Host '' ; ^
   Write-Host ' Frontend → http://localhost:5173' -ForegroundColor Green ; ^
   Write-Host '' ; ^
   if (Get-Command bun -ErrorAction SilentlyContinue) { bun run dev } else { npm run dev }"

echo  Both servers launched. See the new terminal windows.
echo  Press any key to exit this launcher window.
pause >nul
