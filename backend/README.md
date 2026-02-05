# ReachTime - Backend

FastAPI backend for ReachTime. In the **single-container deployment**, the backend also serves the built frontend and exposes all APIs under the `/api/*` prefix.

## API Endpoints (prefixed)

- `GET /api/health`: health check
- `POST /api/generate_draft`: generate a draft via OpenAI
- `POST /api/extract_preferences`: extract structured preferences via OpenAI
- `POST /api/holiday_status`: single-date holiday/weekend status (Nager.Date, cached per year)
- `POST /api/holiday_status_batch`: **batch holiday lookup** (returns `date -> holiday_name` mapping for holidays only)

### Example: `POST /api/generate_draft`

**Request Body**

```json
{
  "user_intent": "Follow up on product sample",
  "communication_channel": "Email",
  "crm_notes": "Customer is logistics-sensitive",
  "target_language": "British English",
  "customer_name": "John Smith",
  "sender_name": "Jane Doe"
}
```

**Response**

```json
{
  "subject": "Follow-up on Product Sample",
  "content": "Dear John,\n\n..."
}
```

## Local Development (backend only)

```bash
cd backend

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# No .env files: set secrets via environment variables
export OPENAI_API_KEY=YOUR_KEY

uvicorn app.main:app --reload --port 8000
```

Open:
- API docs: `http://localhost:8000/api/docs`
- Health: `http://localhost:8000/api/health`

## Configuration

- **Secrets**: environment variables
  - `OPENAI_API_KEY` (required)
  - `CORS_ALLOW_ORIGINS` (optional, comma-separated; usually not needed for same-origin single-container)
- **Non-sensitive defaults**: `backend/config.yaml`

## Deployment (Railway single container)

Deploy from repo root using the root `Dockerfile`. Railway injects `PORT` automatically; set `OPENAI_API_KEY` in Railway Variables. See the root `README.md` for full instructions.
