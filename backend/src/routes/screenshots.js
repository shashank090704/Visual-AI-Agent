/**
 * Screenshots Proxy Route
 * GET /api/v1/screenshots/*
 * Serves stored screenshots from MinIO to the React dashboard cleanly without CORS or 403 issues.
 */

const express = require('express');
const router = express.Router();
const { getScreenshotObject } = require('../services/storage');

router.get('/*', async (req, res) => {
  const key = req.params[0];
  if (!key) return res.status(400).send('Image key required');

  try {
    const obj = await getScreenshotObject(key);
    if (!obj || !obj.Body) {
      return res.status(404).send('Image not found');
    }

    res.set('Content-Type', obj.ContentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    
    // Stream response
    obj.Body.pipe(res);
  } catch (err) {
    res.status(500).send('Error streaming screenshot');
  }
});

module.exports = router;
