# Visual AI Agent

This is a side project I built to track browser activity and process the screen captures using Gemini Vision AI. The goal was to figure out a way to monitor user intent in real time without blocking the browser thread and while handling API limits gracefully.

It consists of a Chrome extension that captures the screen/DOM events, an Express API that ingests everything, Redis to queue it up, a background worker that runs the image processing (Gemini 1.5), and a React dashboard to view the data.

## Architecture 

```text
┌───────────────────────────────────────────────────────────────┐
│                  BROWSER CLIENT (EXTENSION)                   │
│                                                               │
│   ┌────────────────────────┐      ┌────────────────────────┐  │
│   │     Content Script     │      │   Background Worker    │  │
│   │  (DOM Listener/Batch)  │      │   (Tab Screenshot)     │  │
│   └────────────┬───────────┘      └────────────┬───────────┘  │
└────────────────┼───────────────────────────────┼──────────────┘
                 └──────────────┬────────────────┘
                                │ Batched payload · HTTP/2 POST
                                ▼
┌───────────────────────────────────────────────────────────────┐
│               INGESTION GATEWAY (Express API)                 │
│      auth check → strip image → write metadata → enqueue job  │
└───────────┬───────────────────┬────────────────────┬──────────┘
            │                   │                    │
            ▼                   ▼                    ▼
  ┌───────────────────┐  ┌───────────────────┐  ┌────────────────────┐
  │  OBJECT STORAGE   │  │      MongoDB      │  │   MESSAGE BROKER   │
  │  MinIO (S3)       │  │   Atlas / Local   │  │   Redis Streams    │
  │  compressed .jpg  │  │  events · insights│  │   topic: screen_raw│
  └───────────────────┘  └─────────▲─────────┘  └──────────┬─────────┘
                                   │                       │ consume
                                   │ write insights        ▼
                                   │           ┌─────────────────────────────┐
                                   │           │    RATE LIMITER + DEDUP     │
                                   │           │  token bucket · frame-diff  │
                                   │           └───────────────┬─────────────┘
                                   │                           │ approved jobs
                                   │                           ▼
                                   │           ┌─────────────────────────────┐
                                   └───────────│      AI WORKER SERVICE      │
                                               │       Node.js Standalone    │
                                               └───────────────┬─────────────┘
                                                               │ multimodal prompt
                                                               ▼
                                               ┌─────────────────────────────┐
                                               │   GEMINI API — FREE TIER    │
                                               │  Flash / Flash-Lite (vision)│
                                               └─────────────────────────────┘
```

(See `ARCHITECTURE.md` for more details on the data models and component breakdown)

## Tech Stack

- **Extension**: Vanilla JS (Manifest V3)
- **Backend API**: Node.js & Express
- **Worker**: Standalone Node.js process 
- **Message Broker**: Redis Streams
- **Storage**: MinIO (images) & MongoDB (metadata, time-series events)
- **Frontend**: React + Vite
- **AI**: Google Gemini 1.5 Flash Vision API

## Running it locally

You'll need Docker Desktop running for the databases.

1. Clone the repo and boot the infrastructure:
```bash
git clone https://github.com/shashank090704/Visual-AI-Agent.git
cd Visual-AI-Agent
docker-compose up --build -d
```

2. Set up the AI worker API key (Optional):
If you want to use the actual Gemini vision model instead of the fallback rule engine, grab a free API key from Google AI Studio and put it in `backend/.env`:
```env
GEMINI_API_KEY=your_key_here
```
Then restart the worker container: `docker-compose restart worker`

3. Load the Extension:
- Go to `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked" and pick the `extension` folder from this repo
- Pin it in your toolbar and turn it on to start tracking.

## Privacy & Rate Limiting details

I added a few things to make this system actually usable without leaking data or hitting API limits:
- Passwords and credit card inputs are replaced with `[REDACTED]` right in the browser before being sent.
- The worker uses a perceptual difference hash (dHash) to check if the screen actually changed since the last screenshot. If you're just staring at a page and not scrolling, it skips the Gemini API call entirely.
- I wrote a custom token bucket rate limiter to keep the requests under the Gemini free tier limit (10 req/min). If it hits the limit, it just holds the Redis stream messages until a token frees up.
