# GlobalSync CRM - Frontend

React + Vite + TypeScript frontend for the GlobalSync CRM application.

## Features

- End-to-end encrypted local storage (WebCrypto + IndexedDB)
- Real-time timezone-aware dashboard
- AI-powered draft generation (via backend API)
- Smart scheduling with browser notifications
- Framer Motion animations

## Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local to set your backend URL

# Start dev server
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:8000` |

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

## Deployment to Netlify

1. Connect your repository to Netlify
2. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Add environment variable `VITE_API_BASE_URL` pointing to your backend

The `netlify.toml` file is already configured for SPA routing.
