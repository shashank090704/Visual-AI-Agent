const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const Event = require('../models/Event');
const AIInsight = require('../models/AIInsight');
const { memorySessions, memoryEvents } = require('./activity');
const { memoryInsights } = require('../services/queue');

// GET /api/v1/sessions - List all sessions
router.get('/', async (req, res) => {
  const agentId = req.agentId || 'agent_demo_user';

  try {
    const sessions = await Session.find({ agentId }).sort({ lastActiveAt: -1 }).limit(50);
    if (sessions && sessions.length > 0) {
      return res.json({ sessions });
    }
  } catch (err) {
    // fallback to memory
  }

  const memList = Array.from(memorySessions.values()).reverse();
  res.json({ sessions: memList });
});

// GET /api/v1/sessions/:id - Get session details with event timeline
router.get('/:id', async (req, res) => {
  const sessionId = req.params.id;

  try {
    const session = await Session.findOne({ sessionId });
    const events = await Event.find({ sessionId }).sort({ timestamp: 1 });
    const insights = await AIInsight.find({ sessionId }).sort({ processedAt: 1 });

    return res.json({
      session: session || { sessionId, status: 'active' },
      events,
      insights
    });
  } catch (err) {
    const events = memoryEvents.filter(e => e.sessionId === sessionId);
    const insights = memoryInsights.filter(i => i.sessionId === sessionId);
    res.json({
      session: { sessionId, status: 'active' },
      events,
      insights
    });
  }
});

module.exports = router;
