/**
 * Redis Streams Broker
 * Publishes AI tasks to the "screen_raw" stream and provides a consumer interface
 * for the standalone AI Worker process.
 *
 * Stream layout:
 *   Key:            process.env.REDIS_STREAM  (default: "screen_raw")
 *   Consumer group: process.env.REDIS_CONSUMER_GROUP (default: "ai-workers")
 *
 * Messages are XADD'd by the gateway and XREADGROUP'd + XACK'd by the worker.
 * If Redis is unavailable the module exports a no-op so the gateway still boots.
 */

require('dotenv').config();
const Redis = require('ioredis');

const STREAM   = process.env.REDIS_STREAM         || 'screen_raw';
const GROUP    = process.env.REDIS_CONSUMER_GROUP  || 'ai-workers';
const CONSUMER = process.env.REDIS_CONSUMER_NAME   || 'worker-1';

let publisher  = null;   // ioredis client used by the gateway to publish
let subscriber = null;   // ioredis client used by the worker to consume
let brokerReady = false;

/* ─── Connection ──────────────────────────────────────────────────────────── */

function buildClient(name) {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  const client = new Redis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      if (times > 3) return null;   // stop retrying after 3 attempts
      return Math.min(times * 200, 2000);
    },
    maxRetriesPerRequest: 1,
    commandTimeout: name === 'sub' ? undefined : 3000,
  });

  client.on('connect',   () => { brokerReady = true;  console.log(`[Redis][${name}] Connected to ${url}`); });
  client.on('close',     () => { brokerReady = false; console.warn(`[Redis][${name}] Connection closed.`); });
  client.on('error',     (err) => console.warn(`[Redis][${name}] Error: ${err.message}`));

  return client;
}

/**
 * Initialise the broker's publisher client.
 * Called once at gateway startup.
 */
async function initBroker() {
  try {
    publisher = buildClient('pub');
    await publisher.connect();
  } catch (err) {
    brokerReady = false;
    console.warn(`[Redis] Broker unavailable (${err.message}). Falling back to in-memory queue.`);
  }
}

/**
 * Initialise the subscriber client used by the standalone worker.
 * Also creates the consumer group idempotently.
 */
async function initWorkerConsumer() {
  try {
    subscriber = buildClient('sub');
    await subscriber.connect();
    await createConsumerGroup(subscriber);
  } catch (err) {
    console.warn(`[Redis] Worker consumer init failed: ${err.message}`);
  }
}

/* ─── Consumer Group ──────────────────────────────────────────────────────── */

async function createConsumerGroup(client) {
  const c = client || subscriber;
  if (!c) return;
  try {
    // MKSTREAM creates the stream if it doesn't exist yet
    await c.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM');
    console.log(`[Redis] Consumer group "${GROUP}" created on stream "${STREAM}".`);
  } catch (err) {
    if (err.message.includes('BUSYGROUP')) {
      // Group already exists — expected on restarts
    } else {
      throw err;
    }
  }
}

/* ─── Publisher (Gateway) ─────────────────────────────────────────────────── */

/**
 * Publish an AI task to the Redis stream.
 * @param {object} task — { eventId, sessionId, agentId, url, tabTitle, s3Key, imageHash, timestamp }
 * @returns {string|null} Redis stream entry ID, or null on failure
 */
async function publishTask(task) {
  if (!publisher || !brokerReady) return null;

  try {
    const fields = [];
    for (const [k, v] of Object.entries(task)) {
      if (v !== null && v !== undefined) {
        fields.push(k, String(v));
      }
    }
    const id = await publisher.xadd(STREAM, '*', ...fields);
    return id;
  } catch (err) {
    console.warn(`[Redis] publishTask failed: ${err.message}`);
    return null;
  }
}

/* ─── Consumer (Worker) ───────────────────────────────────────────────────── */

/**
 * Read up to `count` pending messages from the stream.
 * Blocks for `blockMs` ms if stream is empty (long-poll).
 * @returns {Array<{ id: string, task: object }>}
 */
async function consumeTasks(count = 5, blockMs = 2000) {
  const c = subscriber;
  if (!c) return [];

  try {
    const result = await c.xreadgroup(
      'GROUP', GROUP, CONSUMER,
      'COUNT', count,
      'BLOCK', blockMs,
      'STREAMS', STREAM, '>'
    );

    if (!result) return [];   // timed out (BLOCK expired with no messages)

    const [, entries] = result[0];
    return entries.map(([id, fields]) => {
      const task = {};
      for (let i = 0; i < fields.length; i += 2) {
        task[fields[i]] = fields[i + 1];
      }
      return { id, task };
    });
  } catch (err) {
    console.warn(`[Redis] consumeTasks error: ${err.message}`);
    return [];
  }
}

/**
 * Acknowledge a processed message so it's removed from the PEL.
 * @param {string} messageId — Redis stream entry ID
 */
async function ackTask(messageId) {
  const c = subscriber;
  if (!c || !messageId) return;
  try {
    await c.xack(STREAM, GROUP, messageId);
  } catch (err) {
    console.warn(`[Redis] ackTask failed for ${messageId}: ${err.message}`);
  }
}

/**
 * Return the current number of messages in the stream (all, not just pending).
 */
async function getStreamLength() {
  const c = publisher || subscriber;
  if (!c || !brokerReady) return null;
  try {
    return await c.xlen(STREAM);
  } catch {
    return null;
  }
}

/**
 * Return the number of messages pending (delivered but not yet acked) for the group.
 */
async function getPendingCount() {
  const c = publisher || subscriber;
  if (!c || !brokerReady) return null;
  try {
    const info = await c.xpending(STREAM, GROUP, '-', '+', 1);
    const summary = await c.xpending(STREAM, GROUP);
    return typeof summary === 'number' ? summary : (summary?.[0] ?? 0);
  } catch {
    return null;
  }
}

function getBrokerStatus() {
  return brokerReady;
}

module.exports = {
  initBroker,
  initWorkerConsumer,
  createConsumerGroup,
  publishTask,
  consumeTasks,
  ackTask,
  getStreamLength,
  getPendingCount,
  getBrokerStatus,
};
