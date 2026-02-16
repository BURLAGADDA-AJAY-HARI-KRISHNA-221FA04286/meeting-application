# AI Meeting Intelligence System — COMPLETE IMPLEMENTATION SPECIFICATION
**For Anti-Gravity AI Code Generation | 100% Production-Ready | February 16, 2026**

This document provides **EXACT files, prompts, and step-by-step instructions** for Anti-Gravity to build the complete system. Follow phases sequentially. Each task includes precise code requirements and validation criteria.

***

## 🎯 PHASE 1: PROJECT FOUNDATION (Week 1-2 | 25 Files)
**Goal**: Authenticated CRUD API + React scaffold. Dockerized. 80% test coverage.

### 1.1 Backend Setup (12 Files)
```
TASK 1: Root Files + Docker
```
**Prompt for Anti-Gravity**: "Create production FastAPI meeting app root structure with Docker. Generate these EXACT files:

1. `requirements.txt` - ALL dependencies from doc + celery[redis], redis, asyncpg, alembic, pytest-asyncio, httpx, python-multipart
2. `Dockerfile` - Python 3.12 slim, multi-stage build, uvicorn worker:4 
3. `docker-compose.yml` - FastAPI:8000, Postgres:5432, Redis:6379
4. `.env.example` - ALL 20 env vars from documentation with validation
5. `.gitignore` - Python + Node + Docker complete
6. `README.md` - Complete setup/run instructions
7. `reset_db.py` - Alembic migrate + seed admin user (email:admin@meeting.ai, pass:admin123)"

**Validation**: `docker-compose up` → API:8000/docs loads, health check 200, DB tables created.

```
TASK 2: FastAPI Core (main.py + config)
```
**Prompt**: "Create FastAPI main.py with lifespan events, CORS (5173,3000), SlowAPI rate limit (60/min), RequestIdMiddleware, exception handlers (404→NotFound, 500→InternalError). Create app/core/config.py with Pydantic Settings (all 20 env vars, validate_required). Startup: create_tables(). Shutdown: db.close(). Log startup banner with version 2.1.0."

```
TASK 3: Database Layer (9 Files)
```
**Prompt**: "Generate complete SQLAlchemy async setup:
- `app/db/base_class.py` - AsyncBase
- `app/db/session.py` - async_engine, get_session
- `app/db/base.py` - import_all_models()
- `models/user.py` - User(email, hashed_password, full_name, is_active, created_at)
- `models/meeting.py` - Meeting(user_id, title, consent_given, created_at, ended_at)
- `models/subtitle.py` - Subtitle(meeting_id, speaker_id, speaker_name, text, start_time, end_time, confidence)
- `schemas/auth.py` - UserCreate, UserOut, Token, LoginRequest
- `schemas/meeting.py` - MeetingCreate, MeetingOut
- Alembic setup: versions/001_initial.py with all tables + indexes"

**Validation**: `pytest app/models/` passes.

### 1.2 Authentication (5 Files)
```
TASK 4: JWT Security
```
**Prompt**: "Implement FastAPI JWT auth per documentation:
- `app/core/security.py` - verify_password(), get_password_hash(), create_access_token(360min), create_refresh_token(10080min), verify_token()
- `api/deps.py` - get_current_user(session: AsyncSession, token: str = Depends(OAuth2PasswordBearer))
- `api/v1/auth.py` - POST /register, /login, /refresh, GET/PATCH /me, POST /me/change-password
- All endpoints use current_user: User = Depends(get_current_user)"

**Validation**: Register → login → /me → 200 with user data.

### 1.3 Frontend Scaffold (8 Files)
```
TASK 5: React + Vite Base
```
**Prompt**: "Create React 19 + Vite meeting app:
- `frontend/package.json` - React19, Vite7, ReactRouter7, Axios1.13, Framer12, Lucide0.563, HotToast2.6, Recharts3.7, Zustand, TanStackQuery
- `frontend/src/main.jsx` - StrictMode, AuthProvider, RouterProvider
- `frontend/src/App.jsx` - Routes (auth guard), ToastContainer
- `frontend/src/context/AuthContext.jsx` - login(), logout(), token refresh interceptor
- `frontend/src/api/index.js` - axios.create(), interceptors (401→refresh→retry)
- `frontend/src/pages/Login.jsx` - Form + validation
- `frontend/src/pages/Dashboard.jsx` - Stat cards skeleton
- `frontend/vite.config.js` - proxy /api → :8000"

**Validation**: `npm run dev` → localhost:5173 login/register works, redirects to dashboard.

***

## 🎯 PHASE 2: MEETINGS + AI CORE (Week 3-5 | 35 Files)
**Goal**: Transcript upload → 5-agent AI analysis → RAG chat working.

### 2.1 Meeting Management (8 Files)
```
TASK 6: Meeting CRUD
```
**Prompt**: "Complete meeting endpoints + frontend:
**Backend**:
- `models/ai_result.py` - AiResult(meeting_id unique, summary_json, actions_json, risks_json, sentiment_json)
- `schemas/meeting.py` + DashboardStatsOut (total_meetings, total_tasks, analyzed_count)
- `api/v1/meetings.py` - POST /meetings (parse transcript → Subtitle records), GET /meetings?page=1&limit=20&search=, GET /dashboard, GET/{id}, PATCH/{id}, DELETE/{id}
**Frontend**:
- `pages/DashboardPage.jsx` - Stats grid, recent meetings table
- `pages/MeetingsPage.jsx` - Search, pagination, analysis status badges
- `pages/NewMeetingPage.jsx` - Transcript textarea, consent checkbox"

```
TASK 7: Transcript Parser
```
**Prompt**: "Create transcript parser in `services/transcript_parser.py`:
- Input: raw_text (handles 'Speaker1: hello', '[00:01] John: hi', VTT/SRT formats)
- Output: List[SubtitleCreate] with estimated timestamps, speaker_id, confidence=0.9
- Test: 'John: Task assigned\nAlice: Due Friday' → 2 subtitle records"

### 2.2 AI Pipeline (12 Files)
```
TASK 8: Gemini Client + Agents
```
**Prompt**: "Build production AI layer:
**app/ai/**:
- `gemini_client.py` - class GeminiClient with retry(3, backoff), json_mode=True, temperature=0.3
- `agents.py` - 5 functions: summary_agent(), decisions_agent(), actions_agent(), risks_agent(), sentiment_agent()
- `orchestrator.py` - async analyze_meeting(meeting_id) → run 5 agents → save AiResult atomically
**Prompt templates** (EXACT):
```
Summary: 'Analyze meeting transcript. Return JSON: {executive_summary, key_points[list], topics[list], meeting_type}'
Actions: 'Extract ALL action items. JSON: {action_items[{task, owner, priority, deadline, dependencies}]}'
```
- `api/v1/ai.py` - POST /ai/{id}/analyze (trigger orchestrator), GET /ai/{id}/results"

```
TASK 9: RAG System
```
**Prompt**: "Complete RAG per documentation:
- `ai/rag.py` - build_index(meeting_id), query(question, meeting_id, top_k=5)
- Sliding window: 3 subtitles/chunk, 50% overlap, all-MiniLM-L6-v2 embeddings, FAISS IndexFlatIP
- `api/v1/ai.py` + POST /ai/{id}/rag-query → 'Answer ONLY from evidence, cite timestamps/speakers'
**Frontend**: `pages/MeetingDetail.jsx` - 5 tabs (Summary/Actions/Risks/Sentiment/Chat), RAG chat input"

### 2.3 Tasks System (5 Files)
```
TASK 10: Task Management
```
**Prompt**: "Tasks from AI → Kanban:
- `models/task.py` - Task(meeting_id, title, owner, status:TODO|IN_PROGRESS|DONE, priority:LOW|MEDIUM|HIGH)
- `api/v1/tasks.py` - POST /meetings/{id}/generate-tasks (from ai_result.actions_json), PATCH/{id}, DELETE/{id}
- `pages/TaskBoard.jsx` - 3-column drag-drop (react-beautiful-dnd), priority badges"

**Validation**: Upload transcript → analyze → generate tasks → drag between columns → persists.

***

## 🎯 PHASE 3: LIVE MEETINGS + PRODUCTION (Week 6-8 | 40 Files)
**Goal**: Real-time WebSocket + Celery background jobs + monitoring.

### 3.1 WebSocket Live Meetings (10 Files)
```
TASK 11: Live Transcription WS
```
**Prompt**: "Real-time meeting transcription:
**Backend**:
- `app/core/socket_manager.py` - ConnectionManager with broadcast(), disconnect cleanup
- `ai/speech_service.py` - process_audio_chunk(base64_audio) → Whisper → Pyannote → Subtitle
- `api/v1/process_meeting.py` - WS /ws/meeting/{id} → auth → participant tracking → audio→transcribe→broadcast
**Frontend**:
- `pages/LiveMeetingPage.jsx` - MediaRecorder, audio chunks every 3s, live subtitle feed, participant list, audio level viz"

```
TASK 12: Celery Background Jobs
```
**Prompt**: "Async AI processing:
- `celery_app.py` - Celery(backend=redis, broker=redis)
- `tasks/ai_tasks.py` - @task analyze_meeting_background.delay(meeting_id)
- Update `api/v1/ai.py` - POST /analyze → queue job → return job_id + websocket updates"

### 3.2 GitHub Integration (5 Files)
```
TASK 13: GitHub Export
```
**Prompt**: "Export tasks → GitHub Issues:
- `services/github_service.py` - create_issue(repo, task) → labels=['meeting-task', 'priority-high']
- `api/v1/tasks.py` + POST /meetings/{id}/export-github {repo:'owner/repo'}"

### 3.3 Frontend Complete (15 Files)
```
TASK 14: All Pages + Components
```
**Prompt**: "Complete React app:
- Layout.jsx (sidebar, header, shortcuts: ? → help)
- MeetingDetailPage.jsx (6 tabs + report download)
- SettingsPage.jsx (profile, password, API keys)
- Components: StatCard, MeetingCard, PriorityBadge, SentimentChart"

### 3.4 Monitoring + Tests (10 Files)
```
TASK 15: Production Readiness
```
**Prompt**: "Production checklist:
- `middleware/prometheus.py` - Metrics endpoint /metrics
- `tests/` - 50+ tests (80% coverage), test_api_flow.py (full E2E)
- `scripts/deploy.sh` - Docker build/push
- Update README.md - Production deployment guide (Render/Fly.io)"

***

## 🚀 FINAL VALIDATION CHECKLIST
```
[ ] docker-compose up → All services healthy
[ ] Register → Login → Dashboard stats load
[ ] Upload transcript → Analyze (<60s) → 5 tabs populate
[ ] RAG chat → Cited answers with timestamps
[ ] Tasks → Drag-drop → GitHub export
[ ] Live meeting → 2 browser tabs → Real-time subtitles sync
[ ] API docs: http://localhost:8000/docs → All endpoints work
[ ] Tests: pytest → 80%+ coverage
[ ] Frontend: npm run build → 0 errors
```

## 📁 COMPLETE FILE COUNT: 112 Files
**Anti-Gravity Instructions**: Execute tasks 1-15 sequentially. Commit after each phase. Test validation criteria before proceeding. Generate ALL imports, types, error handling, logging per production standards.

**SUCCESS = 100% WORKING PRODUCTION APP** 🎉

***

**How to Use This Document:**
1. Copy this specification when starting a new implementation
2. Follow each task sequentially - do not skip ahead
3. Validate each task's criteria before proceeding
4. Reference PROJECT_DOCUMENTATION.md for architectural details
5. Each prompt is designed for AI code generation tools
6. Adjust file counts and timelines based on team size

---

*Implementation Specification v2.1.0 | Generated: February 16, 2026*
