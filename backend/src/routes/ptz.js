const express = require('express');
const Camera = require('../models/Camera');
const onvif = require('../services/onvif');
const asyncHandler = require('../utils/asyncHandler');
const { can } = require('../utils/permissions');

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

/**
 * Steering a camera is something any viewer may do, but storing or deleting a preset changes the
 * camera's own configuration and so needs Camera Management edit rights.
 */
const requireCameraEdit = (req, res, next) =>
  can(req.user, 'cameras', 'edit') ? next() : res.status(403).json({ message: 'You do not have permission to perform this action' });

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

/**
 * GET /cameras/:id/snapshot - one JPEG frame straight from the camera.
 *
 * This is the picture the control pad shows. It goes camera -> API -> browser over the local network
 * with no media gateway, no transcoding and no internet, so PTZ is usable without MediaMTX.
 * Proxying also keeps the camera's credentials on the server and the image on the app's own origin.
 */
router.get(
  '/:id/snapshot',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    // Only the media service is needed, so a camera with no PTZ can still provide a picture.
    const session = await onvif.connectMedia(camera);
    const { body, contentType } = await onvif.fetchSnapshot(session);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', body.length);
    res.setHeader('Cache-Control', 'no-store'); // every poll must reach the camera
    res.end(body);
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

/**
 * POST /cameras/:id/ptz/continuous { pan, tilt, zoom, timeoutSec }
 * Starts moving at a velocity; the control pad holds a button down by re-sending this, and sends
 * /stop on release. Velocities are -1..1 and 0 leaves that axis alone.
 *
 * The camera stops by itself after `timeoutSec` so a lost /stop cannot leave it panning for ever.
 */
router.post(
  '/:id/ptz/continuous',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const { pan = 0, tilt = 0, zoom = 0, timeoutSec = 2 } = req.body || {};
    const velocity = { pan: clamp(pan, -1, 1, 0), tilt: clamp(tilt, -1, 1, 0), zoom: clamp(zoom, -1, 1, 0) };
    if (!velocity.pan && !velocity.tilt && !velocity.zoom) return res.status(400).json({ message: 'Give a pan, tilt or zoom velocity' });
    const session = await onvif.connect(camera);
    await onvif.continuousMove(session, { ...velocity, timeoutSec: clamp(timeoutSec, 1, 60, 2) });
    return res.json({ success: true });
  })
);

/** POST /cameras/:id/ptz/relative { pan, tilt, zoom, speed } - nudge by an offset from the current position. */
router.post(
  '/:id/ptz/relative',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const { pan = 0, tilt = 0, zoom = 0, speed } = req.body || {};
    const session = await onvif.connect(camera);
    await onvif.relativeMove(session, {
      pan: clamp(pan, -1, 1, 0),
      tilt: clamp(tilt, -1, 1, 0),
      zoom: clamp(zoom, -1, 1, 0),
      speed: speed === undefined ? undefined : clamp(speed, 0.1, 1, 0.5),
    });
    const state = await onvif.status(session).catch(() => null);
    return res.json({ success: true, position: state });
  })
);

/** POST /cameras/:id/ptz/home - back to the camera's configured home position. */
router.post(
  '/:id/ptz/home',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const session = await onvif.connect(camera);
    await onvif.goHome(session, req.body?.speed === undefined ? undefined : clamp(req.body.speed, 0.1, 1, 0.5));
    res.json({ success: true });
  })
);

/** GET /cameras/:id/ptz/presets - the positions stored on the camera itself. */
router.get(
  '/:id/ptz/presets',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    try {
      const session = await onvif.connect(camera);
      return res.json({ supported: true, presets: await onvif.presets(session) });
    } catch (err) {
      // Plenty of cameras have no presets at all; that is an answer, not a failure.
      return res.json({ supported: false, presets: [], message: err.message });
    }
  })
);

/** POST /cameras/:id/ptz/presets/:token/goto - recall one preset. */
router.post(
  '/:id/ptz/presets/:token/goto',
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const session = await onvif.connect(camera);
    await onvif.gotoPreset(session, req.params.token, req.body?.speed === undefined ? undefined : clamp(req.body.speed, 0.1, 1, 0.5));
    res.json({ success: true });
  })
);

/**
 * POST /cameras/:id/ptz/presets { name, token? } - store the current position on the camera.
 * Writing to the camera's own configuration needs Camera Management edit rights, not just the right
 * to watch it, so this is checked here rather than at the mount.
 */
router.post(
  '/:id/ptz/presets',
  requireCameraEdit,
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 64) : '';
    if (!name && !req.body?.token) return res.status(400).json({ message: 'A preset name is required' });
    const session = await onvif.connect(camera);
    const token = await onvif.setPreset(session, { name, token: req.body?.token });
    res.status(201).json({ success: true, token, presets: await onvif.presets(session).catch(() => []) });
  })
);

router.delete(
  '/:id/ptz/presets/:token',
  requireCameraEdit,
  asyncHandler(async (req, res) => {
    const camera = await loadCamera(req.params.id);
    const session = await onvif.connect(camera);
    await onvif.removePreset(session, req.params.token);
    res.json({ success: true, presets: await onvif.presets(session).catch(() => []) });
  })
);

module.exports = router;
