/**
 * AI Task Queue Runner
 * Applies Frame Deduplication + Rate Limiting -> Gemini AI -> Mongoose Persistence.
 */

const { isDuplicateFrame } = require('./frameDedup');
const { geminiRateLimiter } = require('./rateLimiter');
const { analyzeScreenCapture } = require('./gemini');
const AIInsight = require('../models/AIInsight');
const Event = require('../models/Event');

const taskQueue = [];
const memoryInsights = [];
let isProcessing = false;

function enqueueAITask(task) {
  taskQueue.push(task);
  triggerQueueRunner();
}

async function triggerQueueRunner() {
  if (isProcessing || taskQueue.length === 0) return;
  isProcessing = true;

  while (taskQueue.length > 0) {
    const task = taskQueue.shift();

    try {
      // 1. Frame Deduplication Check (Skip if < 8% visual change)
      const dedupResult = isDuplicateFrame(task.sessionId, task.screenshot, 0.08);
      if (dedupResult.isDuplicate) {
        console.log(`[AI Queue] Frame skipped by Dedup Engine (diff: ${(dedupResult.diffRatio * 100).toFixed(1)}%)`);
        try {
          if (task.eventId) {
            await Event.findByIdAndUpdate(task.eventId, { aiDedupSkipped: true });
          }
        } catch (e) {}
        continue;
      }

      // 2. Token Bucket Rate Limiter Check
      if (!geminiRateLimiter.tryConsume()) {
        console.warn('[AI Queue] Gemini Rate Limit reached (0 tokens left). Requeuing task with 3s backoff.');
        taskQueue.unshift(task);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      // 3. Process image with Gemini Vision AI
      console.log(`[AI Queue] Processing screenshot for session: ${task.sessionId} (${task.url})`);
      const analysis = await analyzeScreenCapture({
        screenshot: task.screenshot,
        url: task.url,
        tabTitle: task.tabTitle
      });

      const traceId = `tr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const insightDoc = {
        traceId,
        sessionId: task.sessionId,
        agentId: task.agentId || 'agent_demo_user',
        eventId: task.eventId || '',
        detectedTask: analysis.detectedTask,
        actionSummary: analysis.actionSummary,
        userIntent: analysis.userIntent,
        uiElementsIdentified: analysis.uiElementsIdentified,
        confidence: analysis.confidence,
        riskOrAnomalyScore: analysis.riskOrAnomalyScore,
        modelUsed: analysis.modelUsed,
        screenshotUrl: task.screenshot,
        processedAt: new Date()
      };

      // 4. Save to MongoDB
      try {
        await AIInsight.create(insightDoc);
        if (task.eventId) {
          await Event.findByIdAndUpdate(task.eventId, { processedByAI: true });
        }
      } catch (dbErr) {
        memoryInsights.push(insightDoc);
      }

      console.log(`[AI Queue] Insight generated: "${analysis.detectedTask}"`);
    } catch (error) {
      console.error('[AI Queue] Error processing task:', error.message);
    }
  }

  isProcessing = false;
}

module.exports = { enqueueAITask, memoryInsights, taskQueue };
