# AI Meeting Intelligence System — Complete Project Documentation
### Version 2.1.0 | Full-Stack AI-Powered Meeting Platform

---

## 1. PROJECT OVERVIEW

The **AI Meeting Intelligence System** is a production-grade, full-stack web application that transforms raw meeting transcripts into actionable intelligence using Google Gemini AI. Users can upload or live-record meeting transcripts, and the system automatically generates summaries, extracts action items, detects risks, analyzes sentiment, and enables natural-language Q&A over meeting content via RAG (Retrieval-Augmented Generation).

### Core Value Proposition
- **One-click AI Analysis** — Upload a transcript and get summary, decisions, actions, risks, and sentiment in seconds.
- **Live Meeting Support** — Real-time audio capture with Whisper STT and speaker diarization via WebSocket.
- **RAG-Powered Q&A** — Ask natural language questions about any meeting and get cited, evidence-based answers.
- **Task Management** — Auto-generate tasks from AI-extracted action items with Kanban board management.
- **GitHub Integration** — Export meeting tasks directly as GitHub Issues.

---

## 2. TECHNOLOGY STACK

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.12+ | Core language |
| **FastAPI** | 0.116.1 | Async REST API framework |
| **Uvicorn** | 0.35.0 | ASGI server |
| **SQLAlchemy** | 2.0.43 | ORM & database toolkit |
| **Pydantic** | 2.11.7 | Data validation & serialization |
| **Pydantic-Settings** | 2.10.1 | Environment config management |
| **python-jose** | 3.5.0 | JWT token encoding/decoding |
| **passlib** | 1.7.4 | Password hashing (PBKDF2-SHA256) |
| **SlowAPI** | 0.1.9 | Rate limiting middleware |
| **Google GenerativeAI** | 0.8.5 | Gemini LLM integration |
| **Sentence-Transformers** | 5.1.0 | Text embeddings for RAG |
| **FAISS-CPU** | 1.12.0 | Vector similarity search |
| **OpenAI Whisper** | latest | Speech-to-text transcription |
| **Pyannote.audio** | latest | Speaker diarization |
| **PyDub** | latest | Audio format conversion |
| **Torch / Torchaudio** | latest | ML model runtime |
| **Requests** | latest | GitHub API integration |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.2.0 | UI framework |
| **Vite** | 7.3.1 | Build tool & dev server |
| **React Router DOM** | 7.13.0 | Client-side routing |
| **Axios** | 1.13.5 | HTTP client with interceptors |
| **Framer Motion** | 12.34.0 | Animations & transitions |
| **Lucide React** | 0.563.0 | Icon library |
| **React Hot Toast** | 2.6.0 | Toast notifications |
| **Recharts** | 3.7.0 | Data visualization charts |

### Database
| Technology | Purpose |
|---|---|
| **SQLite** | Default local development DB |
| **PostgreSQL 16** | Production database (via Docker) |

### DevOps
| Technology | Purpose |
|---|---|
| **Docker** | Container for backend API |
| **Docker Compose** | Multi-service orchestration (API + PostgreSQL) |

---

## 3. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐ │
│  │Dashboard │ │Meetings  │ │Meeting    │ │Live      │ │Task     │ │
│  │Page      │ │List Page │ │Detail Page│ │Meeting   │ │Board    │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └────┬─────┘ └────┬────┘ │
│       │             │             │             │            │      │
│       └─────────────┴──────┬──────┴─────────────┴────────────┘      │
│                            │                                        │
│                   ┌────────┴────────┐                               │
│                   │   api.js        │  Axios + JWT Interceptors      │
│                   │   AuthContext   │  Token Management              │
│                   └────────┬────────┘                               │
└────────────────────────────┼────────────────────────────────────────┘
                             │ HTTP REST + WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Python)                       │
│                                                                     │
│  ┌─────────────────── API Layer (app/api/v1/) ──────────────────┐  │
│  │  auth.py │ meetings.py │ ai.py │ tasks.py │ process_meeting  │  │
│  └────┬─────┴──────┬──────┴───┬───┴────┬─────┴───────┬──────────┘  │
│       │            │          │        │             │              │
│  ┌────┴────────────┴──────────┴────────┴─────────────┴──────────┐  │
│  │                    Core Layer (app/core/)                      │  │
│  │  config.py (Settings) │ security.py (JWT) │ socket_manager.py │  │
│  └───────────────────────┴──────────────┬────┴──────────────────┘  │
│                                          │                         │
│  ┌──────────────── AI Layer (app/ai/) ──┴───────────────────────┐  │
│  │  orchestrator.py │ agents.py │ gemini_client.py │ rag.py     │  │
│  │                  │           │                  │            │  │
│  │  speech_service.py (Whisper + Pyannote)                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────── Data Layer ──────────────────────────────────┐  │
│  │  Models: User, Meeting, Task, Participant, Subtitle, AIResult│  │
│  │  Schemas: auth.py, meeting.py, task.py (Pydantic validation) │  │
│  │  DB: SQLAlchemy ORM → SQLite / PostgreSQL                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. COMPLETE FILE STRUCTURE

```
meeting app/
├── .env                          # Environment variables (secrets, API keys)
├── .env.example                  # Template for environment setup
├── .gitignore
├── Dockerfile                    # Backend container image
├── docker-compose.yml            # Multi-service orchestration
├── requirements.txt              # Python dependencies
├── reset_db.py                   # Database reset utility
├── reset_db_debug.py             # Debug database reset
│
├── app/                          # ── BACKEND APPLICATION ──
│   ├── __init__.py
│   ├── main.py                   # FastAPI app factory, middleware, lifespan
│   │
│   ├── core/                     # Core infrastructure
│   │   ├── config.py             # Settings via pydantic-settings
│   │   ├── security.py           # JWT & password hashing
│   │   └── socket_manager.py     # WebSocket connection manager
│   │
│   ├── db/                       # Database layer
│   │   ├── base.py               # Model registry (imports all models)
│   │   ├── base_class.py         # SQLAlchemy DeclarativeBase
│   │   └── session.py            # Engine & SessionLocal factory
│   │
│   ├── models/                   # SQLAlchemy ORM models
│   │   ├── user.py               # User accounts
│   │   ├── meeting.py            # Meeting records
│   │   ├── task.py               # Action item tasks
│   │   ├── participant.py        # Meeting participants
│   │   ├── subtitle.py           # Transcript lines with timestamps
│   │   ├── ai_result.py          # Cached AI analysis (1:1 with Meeting)
│   │   └── chat_message.py       # In-meeting chat messages
│   │
│   ├── schemas/                  # Pydantic request/response models
│   │   ├── auth.py               # UserCreate, LoginRequest, TokenResponse, etc.
│   │   ├── meeting.py            # MeetingCreate, MeetingOut, DashboardStats, etc.
│   │   └── task.py               # TaskOut, TaskUpdate
│   │
│   ├── api/                      # API endpoints
│   │   ├── deps.py               # Dependency injection (get_current_user)
│   │   └── v1/
│   │       ├── router.py         # Central router aggregator
│   │       ├── auth.py           # Register, Login, Refresh, Profile, Password
│   │       ├── meetings.py       # CRUD, Dashboard, Stats, Transcript
│   │       ├── ai.py             # Analyze, Get Results, RAG Q&A
│   │       ├── tasks.py          # Generate, List, Update, Batch, GitHub Export
│   │       └── process_meeting.py # WebSocket for live meetings
│   │
│   ├── ai/                       # AI & ML modules
│   │   ├── gemini_client.py      # Reusable Gemini LLM wrapper
│   │   ├── agents.py             # Specialized analysis agents
│   │   ├── orchestrator.py       # 5-step AI analysis pipeline
│   │   ├── rag.py                # FAISS + SentenceTransformer RAG system
│   │   └── speech_service.py     # Whisper STT + Pyannote diarization
│   │
│   └── services/                 # Business logic services (extensible)
│       └── __init__.py
│
├── frontend/                     # ── FRONTEND APPLICATION ──
│   ├── index.html                # SPA entry point
│   ├── package.json              # Node dependencies
│   ├── vite.config.js            # Vite configuration
│   └── src/
│       ├── main.jsx              # React DOM root
│       ├── App.jsx               # Routes, auth guards, toast config
│       ├── api.js                # Axios client, JWT interceptors, API wrappers
│       ├── index.css             # Global styles & design system
│       ├── context/
│       │   └── AuthContext.jsx   # Auth state provider (login/register/logout)
│       ├── components/
│       │   ├── Layout.jsx        # Sidebar navigation, header, keyboard shortcuts
│       │   └── Layout.css
│       └── pages/
│           ├── LoginPage.jsx / Auth.css
│           ├── RegisterPage.jsx
│           ├── DashboardPage.jsx / Dashboard.css
│           ├── MeetingsPage.jsx / Meetings.css
│           ├── NewMeetingPage.jsx / NewMeeting.css
│           ├── MeetingDetailPage.jsx / MeetingDetail.css
│           ├── LiveMeetingPage.jsx / LiveMeeting.css
│           ├── TaskBoardPage.jsx / TaskBoard.css
│           └── SettingsPage.jsx / Settings.css
│
└── tests/                        # Backend tests
    ├── test_health.py            # Health endpoint test
    └── test_api_flow.py          # Full API flow test
```

---

## 5. DATABASE SCHEMA

### Entity Relationship Diagram

```
┌──────────┐       ┌───────────────┐       ┌──────────────┐
│  Users   │1─────*│   Meetings    │1─────*│   Tasks      │
│──────────│       │───────────────│       │──────────────│
│ id (PK)  │       │ id (PK)       │       │ id (PK)      │
│ email    │       │ user_id (FK)  │       │ meeting_id   │
│ password │       │ title         │       │ title        │
│ full_name│       │ consent_given │       │ owner        │
│ created  │       │ created_at    │       │ status       │
│ updated  │       │ ended_at      │       │ priority     │
└──────────┘       └───────┬───────┘       └──────────────┘
      │                    │
      │1                   │1────────────┐
      │                    │             │
      │*                   │*            │1
┌─────────────┐    ┌───────────────┐  ┌──────────────┐
│Participants │    │  Subtitles    │  │  AIResult    │
│─────────────│    │───────────────│  │──────────────│
│ id (PK)     │    │ id (PK)       │  │ id (PK)      │
│ meeting_id  │    │ meeting_id    │  │ meeting_id   │
│ user_id     │    │ speaker_id    │  │ summary_json │
│ join_time   │    │ speaker_name  │  │ decisions    │
│ leave_time  │    │ text          │  │ actions_json │
│ speak_time  │    │ start_time    │  │ risks_json   │
└─────────────┘    │ end_time      │  │ sentiment    │
                   │ confidence    │  └──────────────┘
                   └───────────────┘
```

### Table Details

| Table | Key Columns | Relationships |
|---|---|---|
| **users** | id, email (unique), password_hash, full_name, created_at, updated_at | → meetings, → participations |
| **meetings** | id, user_id (FK→users), title, consent_given, created_at, ended_at | → tasks, → participants, → subtitles, → ai_result |
| **tasks** | id, meeting_id (FK), title, owner, status (todo/in-progress/done), priority (low/medium/high) | → meeting |
| **participants** | id, meeting_id (FK), user_id (FK), join_time, leave_time, total_speaking_time | → meeting, → user |
| **subtitles** | id, meeting_id (FK), speaker_id, speaker_name, text, start_time, end_time, confidence | → meeting |
| **ai_results** | id, meeting_id (FK unique), summary_json, decisions_json, actions_json, risks_json, sentiment_json | → meeting (1:1) |
| **chat_messages** | id, meeting_id (FK), sender_name, sender_id, message, timestamp | → meeting |

---

## 6. API ENDPOINTS — COMPLETE REFERENCE

### Authentication (`/api/v1/`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/register` | Create account → returns JWT tokens | ✗ |
| POST | `/login` | Authenticate → returns JWT tokens | ✗ |
| POST | `/refresh` | Refresh expired access token | ✗ |
| GET | `/me` | Get current user profile | ✓ |
| PATCH | `/me` | Update profile (name, email) | ✓ |
| POST | `/me/change-password` | Change password | ✓ |

### Meetings (`/api/v1/meetings/`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/meetings` | Create meeting (with optional transcript) | ✓ |
| GET | `/meetings` | List all meetings (search, pagination) | ✓ |
| GET | `/meetings/dashboard` | Dashboard stats (totals, recent, risks) | ✓ |
| GET | `/meetings/{id}` | Get meeting detail with transcript & AI results | ✓ |
| GET | `/meetings/{id}/stats` | Per-meeting stats (speakers, duration, counts) | ✓ |
| PATCH | `/meetings/{id}` | Update meeting title | ✓ |
| DELETE | `/meetings/{id}` | Delete meeting + cascade all data | ✓ |

### AI Analysis (`/api/v1/ai/`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/ai/{id}/analyze` | Run 5-step AI pipeline (cached or force re-run) | ✓ |
| GET | `/ai/{id}/results` | Retrieve cached AI analysis | ✓ |
| POST | `/ai/{id}/rag-query` | RAG Q&A — ask a question about the meeting | ✓ |

### Tasks (`/api/v1/`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/meetings/{id}/generate-tasks` | Auto-generate tasks from AI action items | ✓ |
| GET | `/tasks` | List all tasks (filter by status/priority) | ✓ |
| PATCH | `/tasks/{id}` | Update task (status, owner, priority, title) | ✓ |
| DELETE | `/tasks/{id}` | Delete a task | ✓ |
| POST | `/tasks/batch-update` | Batch update status for multiple tasks | ✓ |
| POST | `/meetings/{id}/export-github` | Export tasks as GitHub Issues | ✓ |

### WebSocket
| Protocol | Endpoint | Description |
|---|---|---|
| WS | `/api/v1/ws/meeting/{id}?token=JWT` | Live meeting — audio streaming, subtitles, participant tracking |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | System health check (version, AI status, GitHub status) |

---

## 7. WORKING MECHANISM — END-TO-END FLOWS

### Flow 1: User Registration & Authentication
```
User → POST /register (email, password, name)
  → Server hashes password (PBKDF2-SHA256)
  → Creates User in DB
  → Generates JWT access_token (6hr) + refresh_token (7d)
  → Returns tokens + user profile
  → Frontend stores tokens in localStorage
  → All subsequent requests attach "Bearer <token>" header
  → On 401, Axios interceptor auto-refreshes via /refresh
```

### Flow 2: Meeting Creation with Transcript Upload
```
User → POST /meetings { title, transcript, consent_given }
  → Server creates Meeting record
  → Parses transcript line-by-line ("Speaker: text" format)
  → Creates Subtitle records with computed timestamps
  → Returns enriched meeting with subtitle/task counts
```

### Flow 3: One-Click AI Analysis (5-Step Pipeline)
```
User → POST /ai/{id}/analyze
  → Orchestrator reconstructs transcript from Subtitles
  → Runs 5 sequential Gemini API calls:
     1. Summary Agent → executive_summary, key_points, topics, meeting_type
     2. Decision Agent → decisions with context, stakeholders, impact
     3. Action Items Agent → tasks with owner, deadline, priority, dependencies
     4. Risk Detection Agent → risks with severity, type, mitigation, owner
     5. Sentiment Agent → overall_tone, score, per-speaker sentiment & emotions
  → Each call: structured prompt → JSON extraction → retry with exponential backoff
  → Saves all results atomically to AIResult table (1:1 with Meeting)
  → Invalidates RAG cache for this meeting
  → Returns complete analysis results
```

### Flow 4: RAG Q&A (Retrieval-Augmented Generation)
```
User → POST /ai/{id}/rag-query { question: "What did John say about the deadline?" }
  → RAG System:
     1. BUILD INDEX (if not cached):
        - Fetch all Subtitles ordered by time
        - Sliding window chunking (N subtitles per chunk, 50% overlap)
        - Encode chunks using SentenceTransformer (all-MiniLM-L6-v2)
        - Build FAISS IndexFlatIP (cosine similarity via inner product)
     2. RETRIEVE:
        - Encode question → vector
        - FAISS search → top-K most relevant chunks
     3. GENERATE:
        - Format evidence with timestamps and speakers
        - Prompt Gemini: "Answer based ONLY on this evidence, cite speakers/timestamps"
     4. RETURN:
        - Generated answer + evidence chunks with relevance scores
```

### Flow 5: Live Meeting (WebSocket Real-Time)
```
User → Opens LiveMeetingPage → connects WS to /ws/meeting/{id}?token=JWT
  → Server authenticates token, validates meeting exists
  → Registers Participant (join_time)
  → Broadcasts JOIN event to all connected clients
  → Client starts microphone recording (MediaRecorder API)
  → Every N seconds, sends AUDIO_CHUNK (base64 encoded) via WebSocket
  → Server processes:
     1. Decodes base64 → raw audio bytes
     2. Converts via PyDub (16kHz mono PCM)
     3. Whisper transcription → text
     4. Pyannote diarization → speaker attribution
     5. Creates Subtitle record in DB
     6. Broadcasts SUBTITLE event to all clients
  → All clients see real-time live subtitles
  → On disconnect: records leave_time, broadcasts LEAVE event
```

### Flow 6: Task Auto-Generation & GitHub Export
```
User → POST /meetings/{id}/generate-tasks
  → Reads AIResult.actions_json.action_items
  → Deduplicates against existing task titles
  → Creates Task records (title, owner, priority, status=todo)
  → Returns created tasks

User → POST /meetings/{id}/export-github { repo: "owner/repo" }
  → For each task: creates GitHub Issue via REST API
  → Issue body includes: meeting title, priority, owner, source reference
  → Labels: "meeting-task" + "priority: {level}"
  → Returns: exported count, issue URLs
```

---

## 8. FEATURE BREAKDOWN

### 8.1 Dashboard
- Total meetings, tasks, analyzed meetings counts
- Task breakdown by status (todo / in-progress / done)
- High priority task count, risk count
- Recent meetings list with quick navigation
- Animated progress bars and stat cards

### 8.2 Meetings Management
- Create meetings with title + paste-in transcript
- Search meetings by title
- Paginated meeting list with analysis status indicators
- Delete meetings with full cascade cleanup

### 8.3 Meeting Detail & Analysis
- **Transcript View** — Full reconstructed transcript with copy/download
- **Summary Tab** — Executive summary, key points, topics, meeting type
- **Actions Tab** — Action items with owner, deadline, priority, dependencies
- **Risks Tab** — Identified risks with severity badges and mitigation
- **Sentiment Tab** — Overall tone + per-speaker sentiment with emotion tags
- **RAG Chat Tab** — Interactive Q&A with evidence citations
- **Report Download** — Export full analysis as text report
- **GitHub Export** — Push tasks to any GitHub repository

### 8.4 Live Meeting
- WebSocket-based real-time connection
- Microphone audio capture (MediaRecorder API)
- Audio level visualization
- Real-time live subtitles from Whisper STT
- Participant count tracking
- Invite link sharing
- Transcript download during/after meeting

### 8.5 Task Board (Kanban)
- Three-column board: Todo → In Progress → Done
- Drag/move tasks between columns
- Priority badges (high/medium/low)
- Owner attribution
- Filter by priority

### 8.6 Settings
- Profile editing (name, email)
- Password change with validation
- Keyboard shortcuts reference
- Application info display

### 8.7 Security & Auth
- JWT access + refresh token flow
- Auto token refresh on 401 (Axios interceptor)
- PBKDF2-SHA256 password hashing
- Route guards (PrivateRoute / PublicRoute)
- Per-user data isolation (all queries filter by user_id)

---

## 9. AI AGENTS — DETAILED BREAKDOWN

| Agent | Module | Input | Output | Gemini Prompt Focus |
|---|---|---|---|---|
| **Summary** | orchestrator.py | Transcript | executive_summary, key_points, topics, meeting_type | Comprehensive high-level overview |
| **Decision** | orchestrator.py | Transcript | decisions[] with context, stakeholders, impact | Explicit decisions & their reasoning |
| **Action Items** | orchestrator.py | Transcript | action_items[] with task, owner, deadline, priority, dependencies | Explicit + implied commitments |
| **Risk Detection** | orchestrator.py | Transcript | risks[] with description, severity, type, mitigation, owner | Technical, resource, timeline, budget risks |
| **Sentiment** | orchestrator.py | Transcript | overall_tone, score, speakers[] with sentiment, emotions, quotes | Per-speaker emotional analysis |

### Common AI Patterns
- **Retry with Exponential Backoff** — 1s, 2s delays on failure (configurable retries)
- **JSON Extraction** — Direct parse → markdown block extraction → regex fallback
- **Structured Prompts** — Each agent receives task description + expected JSON schema
- **Graceful Degradation** — Returns fallback empty objects if Gemini is unavailable

---

## 10. MIDDLEWARE & CROSS-CUTTING CONCERNS

| Middleware | Purpose |
|---|---|
| **CORS** | Allows frontend origins (localhost:3000, 5173, 5174) |
| **RequestIdMiddleware** | Attaches UUID per request, logs method/path/status/timing |
| **Rate Limiter (SlowAPI)** | 60 requests/minute per IP (configurable) |
| **Global Exception Handlers** | ValueError→400, Exception→500 with logging |
| **Lifespan Manager** | Startup: DB table creation, banner logging. Shutdown: graceful cleanup |

---

## 11. ENVIRONMENT CONFIGURATION

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | AI Meeting Intelligence System | Application display name |
| `ENV` | dev | Environment (dev/prod) |
| `SECRET_KEY` | change-me-in-production | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 360 | Access token TTL (6 hours) |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | 10080 | Refresh token TTL (7 days) |
| `DATABASE_URL` | sqlite:///./meeting_intel.db | DB connection string |
| `GEMINI_API_KEY` | (empty) | Google Gemini API key |
| `GEMINI_MODEL` | gemini-1.5-flash | Gemini model name |
| `GEMINI_TEMPERATURE` | 0.3 | LLM creativity (0=deterministic) |
| `CORS_ORIGINS` | localhost:3000,5173,5174 | Allowed frontend origins |
| `RATE_LIMIT_PER_MINUTE` | 60 | API rate limit |
| `HF_API_KEY` | (none) | Hugging Face token for Pyannote |
| `GITHUB_TOKEN` | (none) | GitHub PAT for issue export |
| `RAG_CHUNK_SIZE` | 3 | Subtitles per RAG chunk |
| `RAG_TOP_K` | 5 | Top-K retrieval results |
| `RAG_MODEL_NAME` | all-MiniLM-L6-v2 | Embedding model |

---

## 12. SETUP & RUNNING INSTRUCTIONS

### Prerequisites
- Python 3.12+, Node.js 18+, npm

### Backend Setup
```bash
# 1. Create virtual environment
python -m venv .venv313
.venv313\Scripts\activate        # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
copy .env.example .env
# Edit .env with your GEMINI_API_KEY, SECRET_KEY, DATABASE_URL

# 4. Run backend
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Run dev server
npm run dev
# → Runs on http://localhost:5173
```

### Docker Setup (Production)
```bash
docker-compose up --build
# → API on :8000, PostgreSQL on :5432
```

### API Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 13. KEY DESIGN DECISIONS

1. **Subtitle-as-Source-of-Truth** — All transcript data is stored as individual Subtitle records with timestamps, enabling timeline reconstruction, speaker filtering, and granular RAG chunking.

2. **One-to-One AIResult** — Each meeting has at most one AIResult record. Re-analysis overwrites the existing record. This avoids stale data proliferation.

3. **Sliding Window RAG Chunks** — Subtitles are grouped in overlapping windows (50% overlap) for better semantic context in vector search, rather than treating each subtitle independently.

4. **Lazy Model Loading** — SentenceTransformer and Whisper models are loaded on first use (singleton pattern) to avoid slow cold starts when those features aren't needed.

5. **JWT Dual Token** — Short-lived access tokens (6hr) + long-lived refresh tokens (7d) with automatic frontend refresh via Axios interceptor, balancing security and UX.

6. **Atomic AI Pipeline** — All 5 analysis steps run sequentially and save atomically. If the pipeline fails mid-way, partial results are not persisted.

7. **User Data Isolation** — Every query filters by `user_id` to ensure users can only access their own meetings, tasks, and analysis results.

---

*Document generated: February 16, 2026 | AI Meeting Intelligence System v2.1.0*
