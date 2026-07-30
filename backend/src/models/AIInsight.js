const mongoose = require('mongoose');

const AIInsightSchema = new mongoose.Schema({
  traceId: { type: String, required: true, unique: true, index: true },
  sessionId: { type: String, required: true, index: true },
  agentId: { type: String, required: true, index: true },
  eventId: { type: String },
  detectedTask: { type: String, required: true },
  actionSummary: { type: String, required: true },
  userIntent: { type: String, default: 'Unspecified' },
  uiElementsIdentified: [{ type: String }],
  confidence: { type: Number, default: 0.9 },
  riskOrAnomalyScore: { type: Number, default: 0.0 },
  modelUsed: { type: String, default: 'gemini-1.5-flash' },
  screenshotUrl: { type: String },
  processedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

AIInsightSchema.index({ sessionId: 1, processedAt: -1 });

module.exports = mongoose.model('AIInsight', AIInsightSchema);
