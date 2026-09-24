const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const Camera = require('../models/Camera');
const Activity = require('../models/Activity');
const { discover, defaultSubnets } = require('../services/discovery');
const mediamtx = require('../services/mediamtx');

const router = express.Router();

router.get('/', (req, res) => res.json({ subnets: defaultSubnets() }));

/** POST /camera-discovery/scan { subnet?, onvif?, rtsp? } */
router.post(
  '/scan',
  asyncHandler(async (req, res) => {
    const { subnet, onvif = true, rtsp = true } = req.body || {};
    const started = Date.now();
    const result = await discover({ subnet: typeof subnet === 'string' && subnet.trim() ? subnet.trim() : undefined, onvif: !!onvif, rtsp: !!rtsp });
    const known = await Camera.find({ ipAddress: { $in: result.devices.map((d) => d.ip) } }).select('ipAddress cameraId');
    const byIp = Object.fromEntries(known.map((c) => [c.ipAddress, c.cameraId]));
    res.json({
      ...result,
      durationMs: Date.now() - started,
      devices: result.devices.map((d) => ({ ...d, existingCameraId: byIp[d.ip] })),
    });
  })
);

const ALLOWED = ['name', 'location', 'type', 'ipAddress', 'streamUrl', 'rtspUser', 'rtspPassword', 'manufacturer', 'model', 'discoveredVia', 'resolution', 'onvifUrl', 'onvifUser', 'onvifPassword'];

/** POST /camera-discovery/add { cameras: [...] } - adds the selected devices, assigning camera IDs. */
router.post(
  '/add',
  asyncHandler(async (req, res) => {
    const input = Array.isArray(req.body?.cameras) ? req.body.cameras.slice(0, 256) : [];
    if (!input.length) return res.status(400).json({ message: 'No cameras selected' });

    const created = [];
    const errors = [];
    // Sequential so each camera gets the next free ID.
    for (const raw of input) {
      const data = Object.fromEntries(ALLOWED.filter((k) => raw[k] !== undefined && raw[k] !== '').map((k) => [k, raw[k]]));
      try {
        const camera = await Camera.create({ status: 'Online', ...data });
        created.push(camera);
        mediamtx.safely(mediamtx.syncCamera(camera), camera.cameraId);
      } catch (err) {
        errors.push({ ipAddress: data.ipAddress, message: err.message });
      }
    }
    if (created.length) Activity.log(req.user.username, 'Added discovered cameras', created.map((c) => c.cameraId).join(', '));
    res.status(created.length ? 201 : 400).json({ created, errors });
  })
);

module.exports = router;
