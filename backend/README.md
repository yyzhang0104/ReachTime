# GlobalSync CRM - Backend

FastAPI backend for the GlobalSync CRM application. Provides AI-powered draft generation via OpenAI API.

## API Endpoints

### `POST /generate_draft`

Generate a personalized business communication draft.

**Request Body:**
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

**Response:**
```json
{
  "subject": "Follow-up on Product Sample",
  "content": "Dear John Smith,\n\n..."
}
```

### `GET /`

Health check endpoint.

## Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
# Edit .env and add your OPENAI_API_KEY

# Run server
uvicorn app.main:app --reload --port 8000
```

## Configuration

### `.env` (Sensitive - Do not commit)
```
OPENAI_API_KEY=sk-your-api-key-here
```

### `config.yaml` (Non-sensitive)
```yaml
openai:
  model: gpt-4o-mini

cors:
  allow_origins:
    - "http://localhost:3000"
    - "https://your-app.netlify.app"
```

## Deployment

### Render
1. Create a new Web Service
2. Connect your repository
3. Set root directory to `backend`
4. Set build command: `pip install -r requirements.txt`
5. Set start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variable: `OPENAI_API_KEY`

### Fly.io
```bash
cd backend
fly launch
fly secrets set OPENAI_API_KEY=sk-your-key
fly deploy
```

## CORS Configuration

Update `config.yaml` to add your frontend domain:

```yaml
cors:
  allow_origins:
    - "http://localhost:3000"
    - "https://your-app.netlify.app"
```
