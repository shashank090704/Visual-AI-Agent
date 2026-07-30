# Visual AI Tracking Agent — Architecture v2 Technical Specification

## Executive Overview

The **Visual AI Tracking Agent (v2)** is a high-throughput, privacy-focused telemetry and multimodal vision processing pipeline. It captures browser user-interaction events and viewport screenshots, strips sensitive DOM inputs locally, streams payloads via an Express gateway into a **Redis Streams broker**, stores binary assets in **MinIO object storage**, executes perceptual dHash frame deduplication and token-bucket rate limiting against **Gemini Vision AI (Free Tier)** in a standalone worker, and persists metadata to **MongoDB Time-Series collections**.

---

## 1. System Architecture Diagram

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

---

## 2. Component Specifications

### A. Edge Layer (Chrome Extension — Manifest V3)
- **Content Script** ([`extension/content/content.js`](file:///d:/neoflowai/extension/content/content.js)):
  - Captures `click` and `scroll` events.
  - Client-side redaction before transmission:
    - Inputs with `type="password"`, `autocomplete="cc-number"`, `autocomplete="cvv"`.
    - Elements matching `data-private` or `.data-private`.
  - Batches DOM events in-memory every 3 seconds.
- **Service Worker** ([`extension/background/service-worker.js`](file:///d:/neoflowai/extension/background/service-worker.js)):
  - `chrome.alarms` triggers viewport capture every 10 seconds.
  - Quality compression: JPEG at 45% quality to optimize network throughput.
  - Session persistence: `chrome.storage.local` generates and tracks session UUIDs.

---

### B. Ingestion Gateway (Express Server)
- **API File**: [`backend/src/routes/activity.js`](file:///d:/neoflowai/backend/src/routes/activity.js)
- **Execution Target**: `< 50ms` response latency (returns `202 Accepted` immediately).
- **Asynchronous Execution (`process.nextTick`)**:
  1. Upserts `Session` document in MongoDB.
  2. Uploads base64 screenshot to MinIO via [`storage.js`](file:///d:/neoflowai/backend/src/services/storage.js).
  3. Writes `Event` document (storing `s3Key` and `s3Url`, omitting raw base64).
  4. Publishes task payload to Redis stream `screen_raw` using `XADD`.

---

### C. Message Broker (Redis Streams)
- **Stream Key**: `screen_raw`
- **Consumer Group**: `ai-workers`
- **Pattern**: `XADD` (producer) + `XREADGROUP` (consumer) + `XACK` (acknowledgment).
- **Resilience**: Messages remain in the Pending Entry List (PEL) until explicitly `XACK`ed by a worker. Process crashes do not result in telemetry loss.

---

### D. Object Storage (MinIO)
- **Bucket**: `visual-ai-screenshots`
- **Object Key Structure**: `agentId/sessionId/timestamp.jpg`
- **Gateway Image Proxy** ([`backend/src/routes/screenshots.js`](file:///d:/neoflowai/backend/src/routes/screenshots.js)):
  - Exposes `GET /api/v1/screenshots/*` on the gateway port (5000).
  - Streams objects directly from MinIO using `@aws-sdk/client-s3`.
  - Prevents CORS issues and authentication errors in front-end browser clients.

---

### E. AI Worker Service (Standalone Process)
- **File**: [`backend/worker/worker.js`](file:///d:/neoflowai/backend/worker/worker.js)
- **Pipeline Order**:
  1. **Perceptual dHash Deduplication**: Computes 64-bit difference hash on incoming frame. If Hamming distance difference `< 8%` vs previous frame in session, frame is marked `dedup_skipped` and `XACK`ed without invoking Gemini.
  2. **Token Bucket Rate Limiter (RPM)**: Enforces per-minute limit (`GEMINI_RPM_LIMIT`, default 10 RPM). Exponential backoff (2s–30s) on zero tokens.
  3. **Daily Quota Limiter (RPD)**: Enforces daily request cap (`GEMINI_RPD_LIMIT`, default 1500). Holds stream without `XACK` for 60s when daily quota is exhausted.
  4. **Multimodal Vision Analysis**: Calls Gemini 1.5 Flash Vision AI. Returns structured JSON: `detectedTask`, `actionSummary`, `userIntent`, `uiElementsIdentified`, `confidence`, `riskOrAnomalyScore`.
  5. **Rule Fallback Engine**: If API key is missing or invalid, seamlessly triggers deterministic domain classifier (GitHub, YouTube, StackOverflow, local dev apps).

---

### F. MongoDB Database Layer
- **`sessions`**: Active session registry indexed by `{ agentId: 1, lastActiveAt: -1 }`.
- **`events`**: Native **MongoDB Time-Series collection**:
  - `timeField`: `timestamp`
  - `metaField`: `meta` (`{ sessionId, userId }`)
  - `granularity`: `seconds`
  - `expireAfterSeconds`: `2,592,000` (30-day automatic TTL eviction).
- **`ai_insights`**: Stores processed Vision AI classifications indexed by `{ sessionId: 1, processedAt: -1 }`.

---

## 3. Data Models

### `events` (MongoDB Time Series)
```json
{
  "timestamp": "2026-07-31T02:00:00.000Z",
  "meta": {
    "sessionId": "sess_1785443718493_sdhyy1",
    "userId": "agent_demo_user"
  },
  "sessionId": "sess_1785443718493_sdhyy1",
  "agentId": "agent_demo_user",
  "type": "screenshot",
  "url": "https://github.com/user/repo",
  "tabTitle": "GitHub Repository",
  "s3Key": "agent_demo_user/sess_1785443718493_sdhyy1/1785443718000.jpg",
  "s3Url": "http://localhost:5000/api/v1/screenshots/agent_demo_user/sess_1785443718493_sdhyy1/1785443718000.jpg",
  "imageHash": "1010101001010101...",
  "processedByAI": true,
  "aiDedupSkipped": false
}
```

### `ai_insights`
```json
{
  "_id": "66a9df8b2c451e0012345678",
  "traceId": "tr_1785443718000_a1b2c3",
  "sessionId": "sess_1785443718493_sdhyy1",
  "agentId": "agent_demo_user",
  "detectedTask": "Software Development & Code Review",
  "actionSummary": "User is inspecting GitHub pull requests and commit diffs.",
  "userIntent": "Evaluating code quality and architectural changes",
  "uiElementsIdentified": ["Code View", "Diff Box", "Branch Selector"],
  "confidence": 0.96,
  "riskOrAnomalyScore": 0.0,
  "modelUsed": "gemini-1.5-flash",
  "screenshotUrl": "http://localhost:5000/api/v1/screenshots/agent_demo_user/sess_1785443718493_sdhyy1/1785443718000.jpg",
  "processedAt": "2026-07-31T02:00:05.000Z"
}
```

---

## 4. Docker Service Matrix

| Container Name | Service | Base Image | Port | Description |
|---|---|---|---|---|
| `visual_ai_mongo` | Database | `mongo:7.0` | 27017 | MongoDB Atlas / Time-Series Database |
| `visual_ai_redis` | Message Broker | `redis:7.2-alpine` | 6379 | Redis Streams broker for `screen_raw` stream |
| `visual_ai_minio` | Object Storage | `minio/minio:latest` | 9000 / 9001 | S3-compatible binary screenshot store |
| `visual_ai_gateway` | API Gateway | `node:20-alpine` | 5000 | Express Ingestion API & Image Proxy |
| `visual_ai_worker` | AI Pipeline | `node:20-alpine` | — | Redis consumer, dHash dedup & Gemini Vision worker |
| `visual_ai_dashboard` | Web Dashboard | `node:20-alpine` | 3000 | React + Vite UI dashboard |
