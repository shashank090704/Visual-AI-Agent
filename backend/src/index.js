/**
 * Visual AI Backend — Main Express Server Entry Point — Architecture v2
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const { connectDB, getDBStatus }  = require('./config/db');
const { initBroker, getBrokerStatus } = require('./services/broker');
const { initStorage, getStorageStatus } = require('./services/storage');
const { authenticateAgent }       = require('./middleware/auth');
const { getRateLimiterStatus }    = require('./services/rateLimiter');

const activityRoutes   = require('./routes/activity');
const sessionRoutes    = require('./routes/sessions');
const insightRoutes    = require('./routes/insights');
const queueRoutes      = require('./routes/queue');
const screenshotRoutes = require('./routes/screenshots');

const app  = express();
const PORT = process.env.PORT || 5000;

/* ─── Boot sequence ──────────────────────────────────────────────────────── */

(async () => {
  await connectDB();
  await initBroker();
  await initStorage();
})();

/* ─── Global Middleware ──────────────────────────────────────────────────── */

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

/* ─── Routes ─────────────────────────────────────────────────────────────── */

app.use('/api/v1/screenshots', screenshotRoutes); // Public image proxy route
app.use('/api/v1', authenticateAgent);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/insights', insightRoutes);
app.use('/api/v1/queue',    queueRoutes);

/* ─── Health ─────────────────────────────────────────────────────────────── */

app.get('/health', (req, res) => {
  res.json({
    status:          'ok',
    service:         'Visual AI Gateway API — v2',
    mongoConnected:  getDBStatus(),
    redisConnected:  getBrokerStatus(),
    minioConnected:  getStorageStatus(),
    rateLimiter:     getRateLimiterStatus(),
    timestamp:       new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Visual AI Gateway API v2. Endpoints: /api/v1/{activity,sessions,insights,queue}' });
});

/* ─── Start ──────────────────────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` 🚀 Visual AI Express Server v2 — port ${PORT}`);
  console.log(` 🔗 Ingest:       http://localhost:${PORT}/api/v1/activity`);
  console.log(` 📊 Health:       http://localhost:${PORT}/health`);
  console.log(` 🔴 Queue status: http://localhost:${PORT}/api/v1/queue/status`);
  console.log(`==================================================\n`);
});
