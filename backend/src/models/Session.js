const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  agentId: { type: String, required: true, index: true },
  startedAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
  currentUrl: { type: String, default: '' },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  summary: { type: String, default: '' }
}, { timestamps: true });

SessionSchema.index({ agentId: 1, lastActiveAt: -1 });

module.exports = mongoose.model('Session', SessionSchema);
