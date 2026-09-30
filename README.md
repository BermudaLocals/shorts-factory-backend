# 🎬 Shorts Factory Backend
### Dollar Double Empire — AI YouTube Shorts Pipeline

Takes a script payload from the frontend, runs the full generation pipeline, and returns a YouTube Shorts-ready MP4.

---

## Pipeline

```
POST /generate  →  Images (Replicate Flux)  →  Voice (ElevenLabs)  →  Assembly (FFmpeg)  →  MP4
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/generate` | Start a video job |
| GET | `/status/:jobId` | Poll job progress |
| GET | `/download/:jobId` | Download final MP4 |
| GET | `/jobs` | List recent jobs |

### POST /generate — Request Body
```json
{
  "title": "5 Shocking Ocean Facts",
  "hook": "You won't believe what lives down there...",
  "scenes": [
    {
      "num": 1,
      "title": "The Deep Dark",
      "visual": "A glowing anglerfish swimming in pitch-black water, bioluminescent, magical",
      "narration": "The ocean is so deep, sunlight can't even reach the bottom!"
    }
  ]
}
```

### GET /status/:jobId — Response
```json
{
  "id": "abc-123",
  "title": "5 Shocking Ocean Facts",
  "status": "processing",
  "progress": 65,
  "step": "Generating voiceover...",
  "scenes": 6,
  "createdAt": "2025-01-01T00:00:00Z",
  "completedAt": null,
  "videoUrl": null,
  "error": null
}
```

Status values: `queued` → `processing` → `complete` | `failed`

---

## Deploy to Railway

### Step 1 — Push to GitHub
```bash
cd shorts-factory
git init
git add .
git commit -m "Shorts Factory backend"
git remote add origin https://github.com/BermudaLocals/shorts-factory-backend
git push -u origin main
```

### Step 2 — Create Railway Service
1. Go to railway.app → New Project → Deploy from GitHub
2. Select `BermudaLocals/shorts-factory-backend`
3. Railway detects the Dockerfile automatically

### Step 3 — Add Environment Variables in Railway
```
REPLICATE_API_TOKEN   = r8_your_token
ELEVENLABS_API_KEY    = your_key
RAILWAY_PUBLIC_URL    = (copy from Railway after first deploy)
FRONTEND_URL          = https://your-frontend.up.railway.app
```

### Step 4 — Update Frontend
In your React app, set the backend URL:
```javascript
const BACKEND_URL = 'https://your-backend.up.railway.app';

// On "Generate My Video" click:
const res = await fetch(`${BACKEND_URL}/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(scriptPayload)
});
const { jobId } = await res.json();

// Poll for status:
const poll = setInterval(async () => {
  const status = await fetch(`${BACKEND_URL}/status/${jobId}`).then(r => r.json());
  if (status.status === 'complete') {
    clearInterval(poll);
    window.open(status.videoUrl); // Download the MP4
  }
}, 3000);
```

---

## Cost Per Video

| Step | Service | ~Cost |
|------|---------|-------|
| 6 images | Replicate Flux Schnell | $0.02–0.04 |
| Voiceover | ElevenLabs Turbo v2 | $0.09 |
| Motion clips | Kling (optional upgrade) | $0.85–1.60 |
| Assembly | Railway compute | $0.01 |
| **Total** | | **~$0.12–$1.75** |

---

## Local Development
```bash
npm install
cp .env.example .env
# Fill in your API keys
npm run dev
```

Test with curl:
```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Video",
    "scenes": [
      { "num": 1, "title": "Intro", "visual": "Bright ocean scene", "narration": "Hello world!" }
    ]
  }'
```
