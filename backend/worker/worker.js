/**
 * Visual AI — Standalone AI Worker Process — Architecture v2
 *
 * This process runs independently of the Express gateway.
 * It consumes AI tasks from the Redis "screen_raw" stream and:
 *   1. Deduplicates frames (perceptual dHash, skips < 8% change)
 *   2. Checks the token bucket rate limiter (RPM)
 *   3. Checks daily quota — if exhausted, holds stream and sleeps
 *   4. Calls Gemini Vision API
 *   5. Persists AIInsight to MongoDB
 *   6. ACKs the Redis message
 *
 * On RPM throttle  → exponential backoff, then retry (message stays in PEL)
 * On RPD exhaustion → sleep 60s, do NOT ack (Kafka/Redis holds the backlog)
 * On non-quota error → log + ack anyway (avoids poison-pill loops)
 *
 * Heartbeat: writes a Redis key every HEARTBEAT_INTERVAL ms so the dashboard
 * can show "worker last seen" without a dedicated health endpoint.
 *
 * Dev/offline fallback: if Redis is unreachable, polls the in-memory queue
 * exported from ../src/services/queue.js so development without Docker works.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectDB, getDBStatus }          = require('../src/config/db');
const { initWorkerConsumer, consumeTasks,
        ackTask, getBrokerStatus }         = require('../src/services/broker');
const { initStorage, getScreenshotBase64 }     = require('../src/services/storage');
const { isDuplicateFrame }                = require('../src/services/frameDedup');
const { geminiRateLimiter }               = require('../src/services/rateLimiter');
const { analyzeScreenCapture,
        GeminiRpmThrottleError,
        GeminiRpdExhaustedError }          = require('../src/services/gemini');
const AIInsight                           = require('../src/models/AIInsight');
const Event                               = require('../src/models/Event');

// In-memory queue fallback (dev mode when Redis is offline)
const { taskQueue } = require('../src/services/queue');

const HEARTBEAT_INTERVAL = 30_000;  // ms
const POLL_INTERVAL      = 1_000;   // ms between empty-stream polls
const BATCH_SIZE         = 5;       // messages per XREADGROUP call
const BACKOFF_BASE_MS    = 2_000;   // starting backoff on RPM throttle

let running = true;

/* ─── Graceful shutdown ──────────────────────────────────────────────────── */

process.on('SIGTERM', () => { console.log('[Worker] SIGTERM — shutting down.'); running = false; });
process.on('SIGINT',  () => { console.log('[Worker] SIGINT — shutting down.');  running = false; });

/* ─── Heartbeat (writes to Redis key) ───────────────────────────────────── */

async function startHeartbeat() {
  const Redis = require('ioredis');
  const url   = process.env.REDIS_URL || 'redis://localhost:6379';
  let hb;
  try {
    hb = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 2000 });
    await hb.connect();
  } catch {
    console.warn('[Worker] Heartbeat Redis client unavailable — skipping heartbeat.');
    return;
  }
  const tick = async () => {
    try {
      await hb.set('worker:heartbeat', new Date().toISOString(), 'EX', 120);
    } catch { /* ignore */ }
  };
  await tick();
  setInterval(tick, HEARTBEAT_INTERVAL);
}

/* ─── Process a single task ──────────────────────────────────────────────── */

async function processTask(task) {
  const { sessionId, agentId, url, tabTitle, s3Key, s3Url, imageHash, screenshot } = task;

  // 1. Frame dedup (use screenshot in dev mode; s3Key reference in prod)
  //    In prod (Redis mode) screenshot is not in the stream — only imageHash is.
  //    We compare the hash directly against the last seen hash for this session.
  if (imageHash) {
    const prev = isDuplicateFrame._lastHashes?.get(sessionId);
    if (prev && prev === imageHash) {
      console.log(`[Worker] Frame dedup-skipped (identical hash) session: ${sessionId}`);
      return { status: 'dedup_skipped' };
    }
    if (!isDuplicateFrame._lastHashes) isDuplicateFrame._lastHashes = new Map();
    isDuplicateFrame._lastHashes.set(sessionId, imageHash);
  } else if (screenshot) {
    // Dev/in-memory mode — do full dHash comparison
    const result = isDuplicateFrame(sessionId, screenshot, 0.08);
    if (result.isDuplicate) {
      console.log(`[Worker] Frame dedup-skipped (diff: ${(result.diffRatio * 100).toFixed(1)}%) session: ${sessionId}`);
      return { status: 'dedup_skipped' };
    }
  }

  // 2. Daily quota check — hold the stream, don't ack
  if (geminiRateLimiter.isDailyQuotaExhausted()) {
    console.warn('[Worker] Daily Gemini quota exhausted. Holding stream — sleeping 60s.');
    await sleep(60_000);
    return { status: 'held_daily_quota' };
  }

  // 3. Token bucket (RPM)
  if (!geminiRateLimiter.tryConsume()) {
    return { status: 'rpm_throttled' };  // caller will backoff + retry
  }

  // 4. Call Gemini (fetch image directly from MinIO via S3 SDK)
  const screenData = screenshot || (s3Key ? await getScreenshotBase64(s3Key) : (s3Url ? await fetchScreenshotFromUrl(s3Url) : null));
  if (!screenData) {
    console.warn(`[Worker] No screenshot data for session ${sessionId} — skipping AI call.`);
    return { status: 'no_data' };
  }

  const analysis = await analyzeScreenCapture({ screenshot: screenData, url, tabTitle });

  // 5. Persist AIInsight
  const traceId = `tr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const doc = {
    traceId,
    sessionId,
    agentId: agentId || 'agent_demo_user',
    detectedTask:         analysis.detectedTask,
    actionSummary:        analysis.actionSummary,
    userIntent:           analysis.userIntent,
    uiElementsIdentified: analysis.uiElementsIdentified,
    confidence:           analysis.confidence,
    riskOrAnomalyScore:   analysis.riskOrAnomalyScore,
    modelUsed:            analysis.modelUsed,
    screenshotUrl:        s3Url || null,
    processedAt:          new Date(),
  };

  try {
    await AIInsight.create(doc);
    if (task.eventId && getDBStatus()) {
      await Event.updateOne({ _id: task.eventId }, { processedByAI: true }).catch(() => {});
    }
    console.log(`[Worker] Insight saved: "${analysis.detectedTask}" (session: ${sessionId})`);
  } catch (dbErr) {
    console.error('[Worker] Failed to save insight to MongoDB:', dbErr.message);
  }

  return { status: 'processed', traceId };
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchScreenshotFromUrl(url) {
  // Only used in prod when the image lives in MinIO — fetch it back as base64
  // for the Gemini inline-data call.
  try {
    const https = url.startsWith('https') ? require('https') : require('http');
    return await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => resolve(Buffer.concat(chunks).toString('base64')));
        res.on('error', reject);
      }).on('error', reject);
    });
  } catch {
    return null;
  }
}

/* ─── Redis Streams consumer loop ────────────────────────────────────────── */

async function redisLoop(redisClient) {
  let backoffMs = BACKOFF_BASE_MS;

  console.log('[Worker] Starting Redis Streams consumer loop...');

  while (running) {
    try {
      const messages = await consumeTasks(BATCH_SIZE, 5000);

      if (!messages.length) {
        backoffMs = BACKOFF_BASE_MS;  // reset backoff on empty poll
        continue;
      }

      for (const { id, task } of messages) {
        let result;
        try {
          result = await processTask(task);
        } catch (err) {
          if (err instanceof GeminiRpdExhaustedError) {
            geminiRateLimiter.markDailyQuotaExhausted();
            console.warn('[Worker] RPD_EXHAUSTED — holding stream for 60s. Message NOT acked.');
            await sleep(60_000);
            // Do not ack — message stays in PEL for retry after quota resets
            continue;
          }

          if (err instanceof GeminiRpmThrottleError) {
            console.warn(`[Worker] RPM_THROTTLE — backoff ${backoffMs}ms`);
            await sleep(backoffMs);
            backoffMs = Math.min(backoffMs * 2, 30_000);  // exponential, max 30s
            // Do not ack — will be re-delivered or claimed after visibility timeout
            continue;
          }

          // Unknown error — ack to avoid poison pill
          console.error(`[Worker] Unexpected error processing ${id}:`, err.message);
          await ackTask(id);
          continue;
        }

        // Ack on success or benign skips
        if (['processed', 'dedup_skipped', 'no_data'].includes(result.status)) {
          await ackTask(id);
          backoffMs = BACKOFF_BASE_MS;
        }
        // held_daily_quota and rpm_throttled: do NOT ack, loop will retry
      }
    } catch (loopErr) {
      console.error('[Worker] Loop error:', loopErr.message);
      await sleep(POLL_INTERVAL);
    }
  }
}

/* ─── In-memory fallback loop (dev without Redis) ────────────────────────── */

async function memoryLoop() {

  console.log('[Worker] Running in in-memory fallback mode (Redis unavailable).');

  while (running) {
    if (!taskQueue || taskQueue.length === 0) {
      await sleep(POLL_INTERVAL);
      continue;
    }

    const task = taskQueue.shift();
    try {
      await processTask(task);
    } catch (err) {
      if (err instanceof GeminiRpmThrottleError) {
        taskQueue.unshift(task);
        await sleep(BACKOFF_BASE_MS);
      } else if (err instanceof GeminiRpdExhaustedError) {
        geminiRateLimiter.markDailyQuotaExhausted();
        taskQueue.unshift(task);
        await sleep(60_000);
      } else {
        console.error('[Worker] In-memory loop error:', err.message);
      }
    }
  }
}

/* ─── Bootstrap ──────────────────────────────────────────────────────────── */

(async () => {
  console.log('\n==============================================');
  console.log(' 🤖 Visual AI Worker — Architecture v2');
  console.log('==============================================\n');

  await connectDB();
  await initStorage();
  await initWorkerConsumer();

  const brokerUp = getBrokerStatus();

  if (brokerUp) {
    await startHeartbeat();
    await redisLoop();
  } else {
    await memoryLoop();
  }
})().catch(err => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
