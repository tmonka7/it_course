const express = require('express');
const http = require('http');
const https = require('https');
const config = require('../config');
const mediamtx = require('../services/mediamtx');

const router = express.Router();

router.get('/', (req, res) => res.json({ enabled: mediamtx.enabled() }));

/**
 * GET /live/<cameraId>/<file> - streams HLS playlists and segments from the media gateway.
 * Proxying keeps playback on the app's origin (no mixed content on HTTPS) and behind login.
 */
router.get(/^\/([\w-]+)\/([\w.\-/]+)$/, (req, res) => {
  if (!mediamtx.enabled()) return res.status(503).json({ message: 'Media gateway is not configured' });
  const [cameraId, file] = [req.params[0], req.params[1]];
  if (file.includes('..')) return res.status(400).end();

  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = new URL(`${config.mediamtx.hlsUrl}/${cameraId}/${file}${query}`);
  const client = target.protocol === 'https:' ? https : http;

  const upstream = client.get(target, { timeout: 15000 }, (up) => {
    res.status(up.statusCode || 502);
    ['content-type', 'content-length', 'cache-control'].forEach((h) => up.headers[h] && res.setHeader(h, up.headers[h]));
    up.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ message: 'Stream unavailable' });
    else res.end();
  });
  res.on('close', () => upstream.destroy()); // viewer went away
});

module.exports = router;
