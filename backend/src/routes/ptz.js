const express = require('express');
const Camera = require('../models/Camera');
const onvif = require('../services/onvif');
const asyncHandler = require('../utils/asyncHandler');

/**
 * /cameras/:id/ptz - ONVIF pan/tilt/zoom control.
 *
 * The attendance scanner drives the sweep from the browser: it asks for the plan once, then moves the
 * camera one position at a time so it can analyse a frame between moves. Keeping the loop in the
 * browser (rather than sweeping server-side) is what lets recognition and movement stay in step.
 */
const router = express.Router();

const notFound = () => Object.assign(new Error('Record not found'), { status: 404 });

/** Loads a camera with its ONVIF password, which is stripped from normal responses. */
async function loadCamera(id) {
  const camera = await Camera.findById(id).select('+onvifPassword +rtspPassword');
  if (!camera) throw notFound();
  return camera;
}

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

/** GET /cameras/:id/ptz - whether this camera can be steered, and where it is pointing now. */
router.get(
  '/:id/ptz',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    try {
      const session = await onvif.connect(camera);
      const state = await onvif.status(session);
      return res.json({ supported: true, position: state, ranges: { panTilt: session.panTilt, zoom: session.zoom } });
    } catch (err) {
      // Not being a PTZ camera is a normal answer here, not an error.
      return res.json({ supported: false, message: err.message });
    }
  })
);

/** GET /cameras/:id/ptz/plan - the sweep positions for this camera, for the scanner's progress map. */
router.get(
  '/:id/ptz/plan',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const ptz = camera.ptz || {};
    const plan = onvif.sweepGrid({
      panSteps: ptz.panSteps,
      tiltSteps: ptz.tiltSteps,
      panRange: [ptz.panMin, ptz.panMax],
      tiltRange: [ptz.tiltMin, ptz.tiltMax],
      zoom: ptz.zoom,
    });
    res.json({ plan, settleMs: ptz.settleMs ?? 900 });
  })
);

/**
 * POST /cameras/:id/ptz/move { pan, tilt, zoom?, settle? }
 * Points the camera at one normalised position. With `settle` the request only returns once the
 * camera reports it has stopped, so the caller knows the next frame is worth analysing.
 */
router.post(
  '/:id/ptz/move',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const { pan, tilt, zoom, settle = true } = req.body || {};
    if (!Number.isFinite(Number(pan)) || !Number.isFinite(Number(tilt))) {
      return res.status(400).json({ message: 'pan and tilt are required' });
    }
    const position = {
      pan: clamp(pan, -1, 1, 0),
      tilt: clamp(tilt, -1, 1, 0),
      zoom: zoom === undefined ? undefined : clamp(zoom, 0, 1, 0),
    };
    const session = await onvif.connect(camera);
    if (settle) await onvif.moveAndSettle(session, position, { settleMs: camera.ptz?.settleMs ?? 900 });
    else await onvif.absoluteMove(session, position);
    const state = await onvif.status(session).catch(() => null);
    return res.json({ success: true, position: state || position });
  })
);

/** POST /cameras/:id/ptz/stop - abandon whatever move is in progress. */
router.post(
  '/:id/ptz/stop',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const session = await onvif.connect(camera);
    await onvif.stop(session);
    res.json({ success: true });
  })
);

module.exports = router;
