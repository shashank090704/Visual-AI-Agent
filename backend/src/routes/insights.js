const express = require('express');
const router = express.Router();
const AIInsight = require('../models/AIInsight');
const { memoryInsights } = require('../services/queue');
const { getRateLimiterStatus } = require('../services/rateLimiter');

// GET /api/v1/insights - List AI Insights
router.get('/', async (req, res) => {
  const agentId = req.agentId || 'agent_demo_user';

  try {
    const insights = await AIInsight.find({ agentId }).sort({ processedAt: -1 }).limit(100);
    if (insights && insights.length > 0) {
      return res.json({ 
        insights,
        rateLimiter: getRateLimiterStatus()
      });
    }
  } catch (err) {
    // memory fallback
  }

  res.json({
    insights: [...memoryInsights].reverse(),
    rateLimiter: getRateLimiterStatus()
  });
});

module.exports = router;
