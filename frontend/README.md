# ReachTime - Frontend

React + Vite + TypeScript frontend for the ReachTime application.

## Features

- End-to-end encrypted local storage (WebCrypto + IndexedDB)
- Real-time timezone-aware dashboard
- AI-powered draft generation (via backend API)
- Smart scheduling with browser notifications
- Framer Motion animations

## Development

```bash
# Install dependencies
npm ci

# Configure environment
cp .env.example .env.local
# Edit .env.local only if you run backend on a different origin

# Start dev server
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `/api` |

Notes:
- In **single-container deployment**, frontend and backend share the same origin, so the default `/api` works.
- For local dev with a separate backend, set `VITE_API_BASE_URL=http://localhost:8000/api`.

## Project Structure

```
src/
├── components/         # Shared UI components
│   ├── VaultScreen.tsx # Lock/unlock screen
│   └── TimeHeader.tsx  # Top bar with time & travel mode
├── features/
│   ├── customers/      # Customer form & management
│   └── dashboard/      # Main dashboard & detail drawer
├── services/
│   ├── apiClient.ts    # Backend API calls
│   ├── availability.ts # Timezone & status calculations
│   └── scheduling.ts   # Optimal time recommendations
├── storage/vault/      # Encrypted storage layer
├── store/              # Zustand state management
├── types.ts            # TypeScript type definitions
├── App.tsx             # Main application component
└── main.tsx            # Entry point
```

## Building for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

## Deployment

This project is deployed as a **single container** (frontend built by Vite and served by the FastAPI backend). See the root `README.md` for Railway deployment.
