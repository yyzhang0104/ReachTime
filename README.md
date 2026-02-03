# GlobalSync CRM - Timezone-Aware AI Assistant
A professional web application to help cross-timezone sales teams contact customers at the right time with smart scheduling and AI-generated drafts.

## Project Structure

```
.
├── Dockerfile            # Single-container (frontend+backend) build for Railway
├── .dockerignore         # Optimize docker build context
├── .github/workflows/    # GitHub Actions CI
│   └── main.yml
├── tests/                # Backend API e2e tests (mock external services)
│   └── test_app.py
├── pytest.ini            # Pytest config
├── backend/              # FastAPI backend (OpenAI + Nager.Date integrations)
│   ├── app/              # Application code
│   │   ├── core/         # Configuration
│   │   ├── services/     # OpenAI client service
│   │   └── main.py       # FastAPI entry point
│   ├── config.yaml       # Application configuration
│   ├── requirements.txt  # Python dependencies
│
├── frontend/             # React + Vite frontend
│   ├── src/
│   │   ├── components/   # Shared UI components
│   │   ├── features/     # Feature modules (customers, dashboard)
│   │   ├── services/     # API client, availability, scheduling
│   │   ├── storage/      # Encrypted vault (WebCrypto + IndexedDB)
│   │   └── store/        # Zustand state management
│   └── package.json      # Node.js dependencies
│
```
- **Single-container deployment**: frontend is built with Vite and served by the FastAPI backend.
- **API prefix**: all backend endpoints are under `/api/*` (health: `/api/health`, docs: `/api/docs`).
- **No `.env` files**: set secrets via environment variables (e.g., Railway Variables).


## Features

### 1. Customer Profiles & Security
- Multi-channel contact management (Email, WhatsApp, WeChat, SMS, Phone)
- Country → Timezone auto-mapping with DST support
- Preferred contact hours configuration
- CRM notes with structured tags
- **End-to-end encryption**: All data encrypted locally with AES-256 (WebCrypto + IndexedDB)

### 2. Real-time Dashboard
- Dynamic timezone header with Travel Mode
- Red/Green availability indicators based on working hours and preferences
- Today's Focus list for prioritized contacts
- Smart sorting by availability

### 3. AI-Powered Communication
- Generate personalized drafts via OpenAI API
- Channel-aware formatting (Email vs. IM)
- Multi-language support
- CRM context integration

### 4. Smart Scheduling
- Optimal send time recommendations
- Browser notifications for reminders
- ⏰ Visual indicators for scheduled follow-ups

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- OpenAI API Key

### Single-container (Docker) - Recommended

```bash
# From repo root
docker build -t globalsync .
docker run -p 8000:8000 -e PORT=8000 -e OPENAI_API_KEY=YOUR_KEY globalsync
```

Then open:
- Frontend: http://localhost:8000/
- API health: http://localhost:8000/api/health
- API docs: http://localhost:8000/api/docs

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (no .env files)
export OPENAI_API_KEY=YOUR_KEY

# Run server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm ci

# Configure environment
cp .env.example .env.local
# Edit .env.local to set VITE_API_BASE_URL=http://localhost:8000/api

# Run dev server
npm run dev
```

Open http://localhost:3000 in your browser.

## Deployment

### Railway (Single Container) + GitHub Actions (CI)

1. Connect this GitHub repository to Railway
2. Set the deploy branch to `main` and enable auto-deploy
3. Set Railway Variables:
   - `OPENAI_API_KEY` (required)
   - `CORS_ALLOW_ORIGINS` (optional; usually not needed for same-origin single-container deployment)
4. Deploy and verify:
   - `/` serves the frontend
   - `/api/health` returns API health
   - `/api/docs` shows Swagger docs

### CI (GitHub Actions)

CI runs automatically on push/PR to `main`:
- Backend: `pytest`
- Frontend: `npm ci && npm run build`
- Docker: `docker build` validation of `Dockerfile`

## Security Notes

- All customer data is encrypted client-side before storage
- Password never leaves the browser
- API keys are stored server-side only
- **Important**: If you forget your vault password, data cannot be recovered

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, Vite, TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| State | Zustand |
| Encryption | WebCrypto API, IndexedDB |
| Timezone | date-fns-tz |
| Backend | FastAPI, Python |
| AI | OpenAI API (GPT-4o-mini) |
| Deployment | Railway (single container) |

## License

MIT
