/**
 * Optional MediaMTX media gateway (https://github.com/bluenviron/mediamtx).
 * Browsers cannot play RTSP, so each camera is registered as a MediaMTX path whose source is the
 * camera's RTSP URL; MediaMTX re-publishes it as HLS, which the frontend plays through /api/live.
 */
const config = require('../config');

const enabled = () => !!(config.mediamtx.apiUrl && config.mediamtx.hlsUrl);

async function call(method, path, body) {
  const res = await fetch(`${config.mediamtx.apiUrl}/v3/config/paths/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`MediaMTX ${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res;
}

/** Creates or updates the gateway path for a camera (or removes it when the camera has no RTSP URL). */
async function syncCamera(camera, previousId) {
  if (!enabled()) return;
  if (previousId && previousId !== camera.cameraId) await removeCamera(previousId);
  const source = camera.sourceUrl();
  if (!source) return removeCamera(camera.cameraId);
  const conf = { source, sourceOnDemand: true };
  const res = await call('POST', `replace/${encodeURIComponent(camera.cameraId)}`, conf);
  if (res.status === 404) await call('POST', `add/${encodeURIComponent(camera.cameraId)}`, conf);
}

async function removeCamera(cameraId) {
  if (!enabled()) return;
  await call('DELETE', `delete/${encodeURIComponent(cameraId)}`);
}

/** Registers every camera at startup (the gateway keeps its dynamic paths only in memory). */
async function syncAll(Camera) {
  if (!enabled()) return;
  const cameras = await Camera.find({ streamUrl: { $nin: [null, ''] } });
  let ok = 0;
  for (const camera of cameras) {
    try {
      await syncCamera(camera);
      ok += 1;
    } catch (err) {
      console.warn(`[mediamtx] ${camera.cameraId}: ${err.message}`);
    }
  }
  console.log(`[mediamtx] registered ${ok}/${cameras.length} camera stream(s)`);
}

// Fire-and-forget wrapper used from request handlers: a gateway outage must not block saving a camera.
const safely = (promise, what) => promise.catch((err) => console.warn(`[mediamtx] ${what}: ${err.message}`));

module.exports = { enabled, syncCamera, removeCamera, syncAll, safely };
