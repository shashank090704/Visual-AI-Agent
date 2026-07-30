/**
 * Event Model — Architecture v2
 *
 * Screenshots are no longer stored as base64 in MongoDB.
 * They are uploaded to MinIO; only the s3Key (path) and s3Url (public link)
 * are persisted here. This keeps the 512MB M0 budget for metadata only.
 *
 * The collection is created as a MongoDB time-series collection by db.js on
 * first boot. This Mongoose schema is used only for reads on the existing
 * collection — writes to a TS collection bypass Mongoose validation.
 */

const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  // Time-series fields (mirror the TS collection's timeField + metaField)
  timestamp: { type: Date, default: Date.now, index: true },
  meta: {
    sessionId: { type: String, index: true },
    userId:    { type: String, index: true },
  },

  // Kept at top-level for backwards compatibility with existing queries
  sessionId: { type: String, required: true, index: true },
  agentId:   { type: String, required: true, index: true },

  type: {
    type: String,
    enum: ['screenshot', 'click', 'scroll', 'navigation'],
    required: true,
  },
  url:       { type: String, default: '' },
  tabTitle:  { type: String, default: '' },
  target:    { type: String, default: '' },
  coordinates: { x: Number, y: Number },

  // Object storage reference — replaces raw base64
  s3Key:  { type: String, default: null },  // e.g. "agentId/sessionId/1775001598000.jpg"
  s3Url:  { type: String, default: null },  // public / presigned URL for dashboard display

  imageHash:      { type: String },         // dHash for dedup
  processedByAI:  { type: Boolean, default: false },
  aiDedupSkipped: { type: Boolean, default: false },
}, { timestamps: true });

// Compound index for per-session time-ordered lookups
EventSchema.index({ sessionId: 1, timestamp: -1 });

module.exports = mongoose.model('Event', EventSchema);
