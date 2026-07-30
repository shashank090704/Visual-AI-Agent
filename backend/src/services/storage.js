/**
 * MinIO / S3-Compatible Object Storage Service
 * Handles uploading screenshots from base64 → MinIO and serving them safely.
 */

require('dotenv').config();
const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  HeadBucketCommand, 
  CreateBucketCommand,
  PutBucketPolicyCommand 
} = require('@aws-sdk/client-s3');

const BUCKET = process.env.MINIO_BUCKET || 'visual-ai-screenshots';
const PORT = process.env.PORT || 5000;
const GATEWAY_URL = `http://localhost:${PORT}/api/v1/screenshots`;

let s3Client = null;
let storageReady = false;

function buildClient() {
  const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
  const accessKeyId = process.env.MINIO_ACCESS_KEY || 'minioadmin';
  const secretAccessKey = process.env.MINIO_SECRET_KEY || 'minioadmin123';

  return new S3Client({
    endpoint,
    region: 'us-east-1',           // required but arbitrary for MinIO
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,           // MinIO requires path-style URLs
  });
}

/**
 * Initialise MinIO connection, ensure bucket exists, and set public read policy.
 */
async function initStorage() {
  try {
    s3Client = buildClient();

    // Check or create bucket
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
        console.log(`[MinIO] Created bucket "${BUCKET}"`);
      } else {
        throw err;
      }
    }

    // Set public read policy for anonymous image access
    try {
      const publicPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${BUCKET}/*`]
          }
        ]
      };
      await s3Client.send(new PutBucketPolicyCommand({
        Bucket: BUCKET,
        Policy: JSON.stringify(publicPolicy)
      }));
    } catch (policyErr) {
      // Policy warning non-fatal
    }

    storageReady = true;
    console.log(`[MinIO] Connected — bucket: "${BUCKET}" at ${process.env.MINIO_ENDPOINT}`);
  } catch (err) {
    storageReady = false;
    console.warn(`[MinIO] Storage unavailable (${err.message}). Screenshots will be skipped.`);
  }
}

/**
 * Upload a base64-encoded screenshot to MinIO.
 * @param {string} base64Data  - raw base64 string (with or without data URI prefix)
 * @param {string} key         - object key e.g. "agentId/sessionId/timestamp.jpg"
 * @returns {{ s3Key: string, s3Url: string } | null}
 */
async function uploadScreenshot(base64Data, key) {
  if (!storageReady || !s3Client) return null;

  try {
    const clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
      ContentLength: buffer.length,
    }));

    // Gateway proxy URL ensures the browser can always render the screenshot
    const s3Url = `${GATEWAY_URL}/${key}`;
    return { s3Key: key, s3Url };
  } catch (err) {
    console.warn(`[MinIO] Upload failed for key "${key}": ${err.message}`);
    return null;
  }
}

/**
 * Fetch an object stream from MinIO by key.
 */
async function getScreenshotObject(key) {
  if (!storageReady || !s3Client || !key) return null;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const response = await s3Client.send(command);
    return response;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch an object from MinIO by key and return as base64 string.
 */
async function getScreenshotBase64(key) {
  const obj = await getScreenshotObject(key);
  if (!obj || !obj.Body) return null;
  try {
    const bytes = await obj.Body.transformToByteArray();
    return Buffer.from(bytes).toString('base64');
  } catch (err) {
    return null;
  }
}

function getStorageStatus() {
  return storageReady;
}

module.exports = { 
  initStorage, 
  uploadScreenshot, 
  getScreenshotObject, 
  getScreenshotBase64, 
  getStorageStatus 
};
