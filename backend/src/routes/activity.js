/**
 * Activity Ingestion Route — Architecture v2
 *
 * POST /api/v1/activity
 *
 * Flow:
 *  1. Validate payload — return 202 immediately
 *  2. Upsert Session document
 *  3. For each event:
 *     a. If screenshot: upload base64 → MinIO → get s3Key/s3Url
 *     b. Write event document (with s3Key, NOT raw base64)
 *     c. Publish AI task to Redis Streams broker
 *        → falls back to in-memory queue if Redis is unavailable
 */

const express = require('express');
const router  = express.Router();

const Event   = require('../models/Event');
const Session = require('../models/Session');
const { uploadScreenshot } = require('../services/storage');
const { publishTask, getBrokerStatus } = require('../services/broker');
const { computeDHash } = require('../services/frameDedup');

// In-memory fallbacks (dev mode / Redis offline)
const { enqueueAITask } = require('../services/queue');
const memoryEvents   = [];
const memorySessions = new Map();

/* ─── POST / ─────────────────────────────────────────────────────────────── */

router.post('/', async (req, res) => {
  const startTime = Date.now();
  const agentId   = req.agentId || 'agent_demo_user';
  const { sessionId, events } = req.body;

  if (!sessionId || !events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Invalid payload. sessionId and events array required.' });
  }

  // 1. Return 202 immediately — keeps gateway response < 50ms
  res.status(202).json({
    status:        'accepted',
    sessionId,
    receivedCount: events.length,
    timestamp:     new Date().toISOString(),
  });

  // 2. Async processing after response is flushed
  process.nextTick(async () => {
    try {
      const latestEvent = events[events.length - 1];
      const currentUrl  = latestEvent?.url || '';

      // ── Upsert Session ──────────────────────────────────────────────────
      try {
        await Session.findOneAndUpdate(
          { sessionId },
          { agentId, lastActiveAt: new Date(), currentUrl, status: 'active' },
          { upsert: true, new: true }
        );
      } catch {
        memorySessions.set(sessionId, { sessionId, agentId, lastActiveAt: new Date(), currentUrl });
      }

      // ── Process each event ──────────────────────────────────────────────
      for (const evt of events) {
        const ts        = new Date(evt.timestamp || Date.now());
        let s3Key       = null;
        let s3Url       = null;
        let imageHash   = null;

        // ── Upload screenshot to MinIO (strips base64 from Mongo) ─────────
        if (evt.type === 'screenshot' && evt.screenshot) {
          imageHash = computeDHash(evt.screenshot);

          const objectKey = `${agentId}/${sessionId}/${ts.getTime()}.jpg`;
          const uploaded  = await uploadScreenshot(evt.screenshot, objectKey);
          if (uploaded) {
            s3Key = uploaded.s3Key;
            s3Url = uploaded.s3Url;
          }
        }

        // ── Write event document ──────────────────────────────────────────
        const eventDoc = {
          sessionId,
          agentId,
          timestamp: ts,
          meta: { sessionId, userId: agentId },  // time-series metaField
          type:        evt.type  || 'click',
          url:         evt.url   || '',
          tabTitle:    evt.tabTitle || '',
          target:      evt.target   || '',
          coordinates: evt.coordinates || null,
          s3Key,
          s3Url,
          imageHash,
        };

        let savedEventId = null;
        try {
          const saved  = await Event.create(eventDoc);
          savedEventId = saved._id.toString();
        } catch (dbErr) {
          // Plain-collection write (no TS) or general DB error
          try {
            // Try raw driver write to bypass Mongoose schema strictness on TS collection
            const raw = await Event.db.collection('events').insertOne(eventDoc);
            savedEventId = raw.insertedId?.toString();
          } catch {
            eventDoc._id  = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
            savedEventId  = eventDoc._id;
            memoryEvents.push(eventDoc);
          }
        }

        // ── Enqueue AI task ───────────────────────────────────────────────
        if (evt.type === 'screenshot') {
          const task = {
            eventId:   savedEventId,
            sessionId,
            agentId,
            url:       evt.url      || '',
            tabTitle:  evt.tabTitle || '',
            s3Key,
            s3Url,
            imageHash,
            timestamp: ts.getTime(),
          };

          // Prefer Redis Streams; fall back to in-memory queue
          if (getBrokerStatus()) {
            await publishTask(task);
          } else {
            // Attach screenshot for in-memory worker (only in dev/offline mode)
            enqueueAITask({ ...task, screenshot: evt.screenshot });
          }
        }
      }
    } catch (asyncErr) {
      console.error('[Ingest Error]:', asyncErr.message);
    }
  });
});

module.exports = router;
module.exports.memoryEvents   = memoryEvents;
module.exports.memorySessions = memorySessions;
