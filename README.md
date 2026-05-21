# Sketchle

A React + Vite frontend paired with a Node.js + Express backend.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Realtime: Socket.io
- Database: PostgreSQL
- AI: OpenAI Vision API
- Hosting: Vercel (frontend) + Railway (backend)

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill in `OPENAI_API_KEY`, `DATABASE_URL`, and optionally `PORT`.
3. Run:

```bash
npm install
```

## Scripts

- `npm run dev` — Start the Vite frontend.
- `npm run build` — Build the frontend for production.
- `npm run preview` — Preview the built frontend locally.
- `npm start` — Start the backend server at `http://localhost:4000`.
- `npm run server` — Same as `npm start`.

## Backend Endpoints

- `GET /api/health` — Health check.
- `GET /api/db-test` — Simple PostgreSQL connection test.
- `POST /api/vision` — OpenAI Vision API endpoint.

## Deployment

- Frontend: Vercel can deploy the Vite app from this repo.
- Backend: Railway can run `npm start` using `server/server.js`.

## Notes

- Place your private credentials in `.env` and never commit them.
- The backend uses `socket.io` and can be extended for realtime features.
