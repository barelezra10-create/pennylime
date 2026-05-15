# pennylime-voice

WebSocket server handling Twilio ConversationRelay for the PennyLime AI support phone line.

Run locally: `npm install && npm run dev`. Listens on port 8080.

Env vars required: `GEMINI_API_KEY`, `DATABASE_URL`, `AGENT_CONFIRM_SECRET` (must match the web service so confirmation tokens validate across surfaces).

Deploy: add as a second service in the PennyLime Railway project; root directory = `voice/`. Build command: `npm install`. Start command: `npm start`.
