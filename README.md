# 🎙️ AI Meeting Intelligence System v2.1.0

✨ **Production-grade AI-powered meeting intelligence platform** with transcript analysis, real-time sync subtitles, automated task generation, RAG queries, and GitHub integration.

<div align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-blue.svg" alt="Python Version" />
  <img src="https://img.shields.io/badge/React-19-blue.svg" alt="React" />
  <img src="https://img.shields.io/badge/Gemini-1.5%20Pro-orange.svg" alt="Gemini" />
  <img src="https://img.shields.io/badge/Status-Production%20Ready-success.svg" alt="Status" />
</div>

<br/>

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 16 (or use Docker)
- Redis (for background jobs, optional)
- **FFmpeg 6.0+** (Essential for audio processing. Add to system PATH)

### Option 1: Docker (Recommended)

```bash
# 1. Clone and navigate
cd "meeting app"

# 2. Configure environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

# 3. Start all services
docker-compose up --build

# API: http://localhost:8000
# Frontend: http://localhost:5173
# Docs: http://localhost:8000/docs
```

### Option 2: Manual Setup

#### Backend Setup

```bash
# 1. Create virtual environment
python -m venv .venv313
.venv313\Scripts\activate  # Windows
source .venv313/bin/activate  # Linux/Mac

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your configuration:
# - GEMINI_API_KEY (required for AI features)
# - DATABASE_URL (defaults to SQLite)
# - SECRET_KEY (generate with: openssl rand -hex 32)
# - HF_API_KEY (optional, for speaker diarization)
# - GITHUB_TOKEN (optional, for GitHub export)

# 4. Initialize database
python reset_db.py

# 5. Run backend
uvicorn app.main:app --reload --port 8000
```

#### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Open http://localhost:5173
```

### Option 3: One-Click Start (Windows)

Double-click `start_dev.bat` to launch both backend and frontend servers automatically.

## 📚 Documentation

- **[PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)**: Complete technical documentation
  - Architecture overview
  - Database schema
  - All API endpoints
  - Working mechanisms
  - Environment configuration

- **[IMPLEMENTATION_SPECIFICATION.md](./IMPLEMENTATION_SPECIFICATION.md)**: Step-by-step build guide
  - Phased implementation plan
  - Task-by-task instructions
  - Validation criteria

## 🎯 Key Features

### ✅ Core Features
- **User Authentication**: JWT-based auth with access/refresh tokens
- **Meeting Management**: Create, list, search, and delete meetings
- **Transcript Upload**: Paste transcripts with automatic speaker/timestamp parsing
- **AI Analysis** (5-step pipeline):
  - Executive summary & key points
  - Decisions extraction
  - Action items with owners/priorities
  - Risk detection
  - Sentiment analysis
- **RAG Q&A**: Ask questions about meetings, get evidence-cited answers
- **Task Management**: Auto-generate tasks from AI, Kanban board (Todo/In Progress/Done)
- **Dashboard**: Stats overview, recent meetings, task breakdown

### 📡 Live Meeting Features
- **Resilient WebRTC Signaling**: Reliable peer-to-peer audio/video streaming with automatic connection recovery.
- **WebSocket-based Real-time Audio Capture**: Captures clear audio via the MediaRecorder API.
- **Whisper STT**: Industry-leading Speech-to-text with OpenAI Whisper.
- **Speaker Diarization**: Pyannote.audio for accurate speaker attribution.
- **Real-Time Subtitle Broadcasting**: Local SpeechRecognition API transcripts are instantly broadcast to all room participants via WebSocket, creating synchronized global subtitles.
- **Background-Tab Resilience**: Smart `visibilitychange` listeners automatically pause the microphone when switching tabs, gracefully reconnecting upon return to prevent hardware lockups.
- **Participant Tracking**: Accurate real-time tracking of join/leave events and participant count.

### 🔄 Integrations
- **GitHub Export**: Export meeting tasks as GitHub Issues
- **Google Gemini**: AI-powered analysis via Gemini 1.5 Flash

## 🏗️ Project Structure

```
meeting app/
├── app/                      # Backend (FastAPI)
│   ├── main.py              # Application entry point
│   ├── core/                # Config, security, WebSocket
│   ├── db/                  # Database setup
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic validation schemas
│   ├── api/v1/              # REST API endpoints
│   └── ai/                  # AI modules (Gemini, RAG, Whisper)
│
├── frontend/                # Frontend (React + Vite)
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # Reusable components
│   │   ├── context/        # React context (Auth)
│   │   └── api.js          # Axios API client
│   └── package.json
│
├── tests/                   # Backend tests
├── .env                     # Environment variables (create from .env.example)
├── requirements.txt         # Python dependencies
├── docker-compose.yml       # Multi-service orchestration
└── Dockerfile              # Backend container image
```

## 🔧 API Endpoints

### Authentication
- `POST /api/v1/register` - Create account
- `POST /api/v1/login` - Login
- `POST /api/v1/refresh` - Refresh token
- `GET /api/v1/me` - Get current user
- `PATCH /api/v1/me` - Update profile
- `POST /api/v1/me/change-password` - Change password

### Meetings
- `POST /api/v1/meetings` - Create meeting
- `GET /api/v1/meetings` - List meetings
- `GET /api/v1/meetings/dashboard` - Dashboard stats
- `GET /api/v1/meetings/{id}` - Get meeting detail
- `PATCH /api/v1/meetings/{id}` - Update meeting
- `DELETE /api/v1/meetings/{id}` - Delete meeting

### AI Analysis
- `POST /api/v1/ai/{id}/analyze` - Run 5-step AI analysis
- `GET /api/v1/ai/{id}/results` - Get cached results
- `POST /api/v1/ai/{id}/rag-query` - RAG Q&A

### Tasks
- `POST /api/v1/meetings/{id}/generate-tasks` - Generate from AI
- `GET /api/v1/tasks` - List tasks
- `PATCH /api/v1/tasks/{id}` - Update task
- `DELETE /api/v1/tasks/{id}` - Delete task
- `POST /api/v1/meetings/{id}/export-github` - Export to GitHub

### WebSocket
- `WS /api/v1/ws/meeting/{id}?token={JWT}` - Live meeting

Full API documentation: http://localhost:8000/docs

## 🧪 Testing

```bash
# Run all tests
pytest

# With coverage report
pytest --cov=app --cov-report=html

# Specific test file
pytest tests/test_api_flow.py -v
```

## 🔐 Security

- **Password Hashing**: PBKDF2-SHA256 via passlib
- **JWT Tokens**: HS256 algorithm
  - Access tokens: 6 hours
  - Refresh tokens: 7 days
- **Rate Limiting**: 60 requests/minute per IP
- **CORS**: Configurable allowed origins
- **Data Isolation**: All queries filtered by user_id

## 📊 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ | - | Google Gemini API key |
| `SECRET_KEY` | ✅ | change-me | JWT signing key |
| `DATABASE_URL` | ❌ | SQLite | PostgreSQL connection string |
| `HF_API_KEY` | ❌ | - | Hugging Face token (for speaker diarization) |
| `GITHUB_TOKEN` | ❌ | - | GitHub PAT (for issue export) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | 360 | JWT access token TTL |
| `CORS_ORIGINS` | ❌ | localhost | Allowed frontend origins |

See `.env.example` for complete list.

## 🐛 Troubleshooting

### Backend not starting?
```bash
# Check database connection
python -c "from app.db.session import engine; print(engine.connect())"

# Reset database
python reset_db.py
```

### AI analysis failing?
```bash
# Verify Gemini API key
python -c "import google.generativeai as genai; genai.configure(api_key='YOUR_KEY'); print(genai.list_models())"
```

### WebSocket connection issues?
- Ensure backend is running on correct port (8000)
- Check browser console for connection errors
- Verify JWT token is valid

## 🚢 Production Deployment

### Using Render/Railway/Fly.io

1. Set environment variables in platform dashboard
2. Use PostgreSQL addon for database
3. Deploy command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Build command (frontend): `cd frontend && npm run build`

### Using Docker

```bash
docker build -t meeting-ai .
docker run -p 8000:8000 --env-file .env meeting-ai
```

## 📝 License

Proprietary - AI Meeting Intelligence System

## 👨‍💻 Support

For issues or questions:
- Check documentation: `PROJECT_DOCUMENTATION.md`
- Review implementation guide: `IMPLEMENTATION_SPECIFICATION.md`
- Test with: http://localhost:8000/docs

---

**Version**: 2.1.0  
**Last Updated**: February 16, 2026
