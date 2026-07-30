/**
 * Queue / Broker Status Route
 * GET /api/v1/queue/status
 *
 * Returns Redis Streams broker health, MinIO storage health,
 * stream message counts, worker last heartbeat (read from Redis key),
 * and rate limiter state for the dashboard.
 */

const express = require('express');
const router  = express.Router();

const { getBrokerStatus, getStreamLength, getPendingCount } = require('../services/broker');
const { getStorageStatus } = require('../services/storage');
const { getRateLimiterStatus } = require('../services/rateLimiter');

// Read worker heartbeat from Redis directly
async function getWorkerHeartbeat() {
  if (!getBrokerStatus()) return null;
  try {
    // Borrow ioredis from broker internals via its own connect
    const Redis = require('ioredis');
    const url   = process.env.REDIS_URL || 'redis://localhost:6379';
    const tmp   = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 2000 });
    await tmp.connect();
    const val = await tmp.get('worker:heartbeat');
    tmp.disconnect();
    return val;
  } catch {
    return null;
  }
}

router.get('/status', async (req, res) => {
  const [streamLength, pendingCount, workerHeartbeat] = await Promise.all([
    getStreamLength(),
    getPendingCount(),
    getWorkerHeartbeat(),
  ]);

  res.json({
    broker: {
      connected:    getBrokerStatus(),
      streamLength: streamLength ?? 'N/A',
      pendingCount: pendingCount ?? 'N/A',
    },
    storage: {
      connected: getStorageStatus(),
    },
    worker: {
      lastHeartbeat: workerHeartbeat ?? 'No heartbeat received yet',
    },
    rateLimiter: getRateLimiterStatus(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
