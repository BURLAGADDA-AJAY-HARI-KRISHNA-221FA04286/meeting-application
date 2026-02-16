@echo off
echo Starting AI Meeting Intelligence System...

:: Start Backend
echo Starting Backend API...
start "Backend API" cmd /k "python -m uvicorn app.main:app --reload --port 8000"

:: Start Frontend
echo Starting Frontend App...
start "Frontend App" cmd /k "cd frontend && npm run dev"

echo Services started!
echo Backend:  http://localhost:8000/docs
echo Frontend: http://localhost:5173
echo Press any key to stop...
pause
