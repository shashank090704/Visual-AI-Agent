/**
 * MongoDB Connection & Time-Series Collection Bootstrap
 *
 * On first connection, ensures the `events` collection is created as a
 * MongoDB time-series collection with a 30-day TTL index.
 *
 * Time-series schema:
 *   timeField:   "timestamp"
 *   metaField:   "meta"          (contains { sessionId, userId })
 *   granularity: "seconds"
 *   expireAfterSeconds: EVENT_TTL_DAYS * 86400
 */

const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/visual_ai_agent';

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 3000 });
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to ${mongoURI}`);

    // Bootstrap time-series collection after connection is established
    await ensureTimeSeriesCollection();
  } catch (error) {
    console.warn(`[MongoDB] Connection warning (${error.message}). Running in lightweight memory buffer mode.`);
    isConnected = false;
  }
};

/**
 * Creates the `events` collection as a time-series collection with TTL
 * if it doesn't already exist. Safe to call on every startup — MongoDB
 * returns a "NamespaceExists" error for an existing collection which we
 * silently ignore.
 */
async function ensureTimeSeriesCollection() {
  const ttlDays    = parseInt(process.env.EVENT_TTL_DAYS, 10) || 30;
  const ttlSeconds = ttlDays * 86_400;

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections({ name: 'events' }).toArray();

    if (collections.length === 0) {
      await db.createCollection('events', {
        timeseries: {
          timeField:   'timestamp',
          metaField:   'meta',
          granularity: 'seconds',
        },
        expireAfterSeconds: ttlSeconds,
      });
      console.log(`[MongoDB] Time-series collection "events" created (TTL: ${ttlDays} days).`);
    } else {
      const tsOptions = collections[0]?.options?.timeseries;
      if (tsOptions) {
        console.log(`[MongoDB] Time-series collection "events" already exists (timeField: "${tsOptions.timeField}").`);
      } else {
        console.warn('[MongoDB] "events" exists as a plain collection. Time-series features unavailable. Consider migrating to a fresh deployment.');
      }
    }
  } catch (err) {
    console.warn(`[MongoDB] ensureTimeSeriesCollection warning: ${err.message}`);
  }
}

const getDBStatus = () => isConnected;

module.exports = { connectDB, getDBStatus };
