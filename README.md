# Visual AI Agent — Chrome Browser Monitoring & Analysis Tool

A privacy-focused, real-time **Visual AI Agent** built with **Chrome Extension (Manifest V3)**, **Express Node.js Gateway**, **MongoDB Atlas (Time-Series & Insights)**, **Gemini 1.5 Flash Vision AI**, and a **React Dashboard**.

---

## 🌟 Key Features

- 🔌 **Chrome Extension (Manifest V3)**: Captures compressed tab screenshots and DOM activity events while auto-scrubbing sensitive input fields (`password`, credit cards, `data-private`).
- ⚡ **Express Ingestion Gateway**: Fast-response ingestion returning `202 Accepted` in `<50ms`.
- 🗄️ **MongoDB Atlas / Time Series**: Stores user sessions, granular activity events, and AI structured analysis.
- 🧠 **Gemini Vision AI Pipeline**: Multimodal prompt analysis classifying user actions, UI elements, intents, and confidence scores.
- 🛡️ **Token Bucket Rate Limiter & Frame Deduplication**: Uses perceptual dHash frame difference calculation to avoid duplicate AI processing on idle screens and enforces Gemini Free Tier caps.
- 📊 **React + Vite Dashboard**: Interactive activity timeline, screenshot visualizer, AI insight panel, and rate limit status monitor.

---

## 📁 Repository Structure

```
.
├── extension/      # Chrome Extension (Manifest V3)
├── backend/        # Node.js + Express Gateway & Gemini AI Worker
├── dashboard/      # React + Vite Web Dashboard
├── docker-compose.yml # Local MongoDB Docker Setup
└── README.md
```

---

## 🚀 Getting Started

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Add your GEMINI_API_KEY and MONGO_URI in .env
npm start
```

### 2. Chrome Extension Installation
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top-right toggle.
3. Click **Load unpacked** and select the `extension` folder from this repository.
4. Click on the Visual AI Agent extension icon to toggle active monitoring.

### 3. Dashboard Setup
```bash
cd dashboard
npm install
npm run dev
```

---

## 🔐 Privacy & Security Safeguards

- DOM content script sanitizes `type="password"`, `autocomplete="cc-number"`, and `data-private` elements locally before data leaves the browser.
- Incognito tabs are ignored by default.
- Users can pause/resume tracking at any time using the extension popup UI.
