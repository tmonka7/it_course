/**
 * ONVIF PTZ control over SOAP, used by the attendance scanner to sweep a room.
 *
 * Only the handful of operations a sweep needs is implemented, in the same hand-rolled style as
 * services/discovery.js (no ONVIF dependency):
 *
 *   GetCapabilities  - where the Media and PTZ services live on this camera
 *   GetProfiles      - the media profile token every PTZ call is addressed to
 *   GetNodes         - the pan/tilt/zoom ranges the camera accepts
 *   AbsoluteMove     - point the camera at one normalised (x, y, zoom) position
 *   GetStatus        - where the camera is now, and whether it is still moving
 *   Stop             - abandon a move
 *
 * Positions use the ONVIF "PositionGenericSpace" convention: pan and tilt in -1..1, zoom in 0..1.
 * Cameras that report a different range are normalised in and out, so callers always work in -1..1.
 */
const crypto = require('crypto');

const TIMEOUT_MS = 8000;
const NS = [
  'xmlns:s="http://www.w3.org/2003/05/soap-envelope"',
  'xmlns:tds="http://www.onvif.org/ver10/device/wsdl"',
  'xmlns:trt="http://www.onvif.org/ver10/media/wsdl"',
  'xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"',
  'xmlns:tt="http://www.onvif.org/ver10/schema"',
].join(' ');

const WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const WSU = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const PASSWORD_DIGEST = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest';
const BASE64_TYPE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

const fail = (message, status = 502) => Object.assign(new Error(message), { status });

/**
 * WS-Security UsernameToken with a password digest: Base64(SHA1(nonce + created + password)).
 * ONVIF cameras reject anything else on PTZ calls once a user is configured.
 */
function securityHeader(user, password) {
  if (!user) return '';
  const nonce = crypto.randomBytes(16);
  const created = new Date().toISOString();
  const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created, 'utf8'), Buffer.from(password || '', 'utf8')])).digest('base64');
  return `<s:Header><Security s:mustUnderstand="1" xmlns="${WSSE}"><UsernameToken><Username>${escapeXml(user)}</Username>` +
    `<Password Type="${PASSWORD_DIGEST}">${digest}</Password>` +
    `<Nonce EncodingType="${BASE64_TYPE}">${nonce.toString('base64')}</Nonce>` +
    `<Created xmlns="${WSU}">${created}</Created></UsernameToken></Security></s:Header>`;
}

/** Posts one SOAP body to a service URL and returns the response XML. */
async function soap(url, body, { user, password } = {}) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><s:Envelope ${NS}>${securityHeader(user, password)}<s:Body>${body}</s:Body></s:Envelope>`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: envelope,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // A camera that is off, unreachable or slow must not surface as a 500.
    throw fail(err.name === 'TimeoutError' ? 'The camera did not answer in time' : `Could not reach the camera: ${err.message}`);
  }
  const xml = await res.text();
  if (!res.ok) {
    // SOAP faults carry the useful part in the fault text; auth problems are worth naming precisely.
    const reason = tagText(xml, 'Text') || tagText(xml, 'faultstring') || `HTTP ${res.status}`;
    throw fail(/not authorized|unauthorized|authentication/i.test(reason) ? 'The camera rejected the ONVIF username or password' : `Camera error: ${reason}`);
  }
  return xml;
}

const stripNs = (tag) => `(?:[\\w-]+:)?${tag}`;
const tagText = (xml, tag) => xml.match(new RegExp(`<${stripNs(tag)}[^>]*>([^<]*)</${stripNs(tag)}>`))?.[1]?.trim();
/** Inner XML of every occurrence of a tag (non-greedy, so nested same-name tags are not merged). */
const blocks = (xml, tag) => [...xml.matchAll(new RegExp(`<${stripNs(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${stripNs(tag)}>`, 'g'))].map((m) => m[1]);
const attr = (xml, name) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Pan/tilt/zoom values off an element like <tt:PanTilt x="0.5" y="-0.2"/>. */
function vector(xml, tag) {
  const el = xml.match(new RegExp(`<${stripNs(tag)}[^>]*/?>`))?.[0];
  if (!el) return undefined;
  return { x: num(attr(el, 'x')), y: num(attr(el, 'y')) };
}

/** The device service URL for a camera: its stored ONVIF URL, or the standard path on its IP. */
function deviceUrl(camera) {
  if (camera.onvifUrl) return camera.onvifUrl;
  if (camera.ipAddress) return `http://${camera.ipAddress}/onvif/device_service`;
  throw fail('This camera has no ONVIF address or IP address', 400);
}

const creds = (camera) => ({ user: camera.onvifUser || camera.rtspUser, password: camera.onvifPassword || camera.rtspPassword });

/**
 * Some cameras report service addresses with an unroutable host (a container IP, or the address the
 * camera believes it has). Keep the path but talk to the host we actually reached.
 */
function sameHostAs(reference, reported) {
  if (!reported) return undefined;
  try {
    const base = new URL(reference);
    const url = new URL(reported);
    url.protocol = base.protocol;
    url.host = base.host;
    return url.toString();
  } catch {
    return reported;
  }
}

/** Media and PTZ service URLs. */
async function capabilities(camera) {
  const url = deviceUrl(camera);
  const xml = await soap(url, '<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>', creds(camera));
  const media = blocks(xml, 'Media')[0];
  const ptz = blocks(xml, 'PTZ')[0];
  return {
    media: sameHostAs(url, media && tagText(media, 'XAddr')) || sameHostAs(url, '/onvif/media_service'),
    ptz: sameHostAs(url, ptz && tagText(ptz, 'XAddr')),
  };
}

/** First media profile token, which PTZ operations are addressed to. */
async function profileToken(mediaUrl, camera) {
  const xml = await soap(mediaUrl, '<trt:GetProfiles/>', creds(camera));
  const openTags = xml.match(new RegExp(`<${stripNs('Profiles')}(?:\\s[^>]*)?>`, 'g')) || [];
  const token = openTags.map((tag) => attr(tag, 'token')).find(Boolean);
  if (!token) throw fail('The camera reported no media profiles');
  return token;
}

/**
 * Everything a sweep needs about a camera, fetched once and reused for every move:
 * service URLs, the profile token, and the pan/tilt/zoom ranges.
 */
async function connect(camera) {
  const { media, ptz } = await capabilities(camera);
  if (!ptz) throw fail('This camera does not report an ONVIF PTZ service', 400);
  const token = await profileToken(media, camera);
  const xml = await soap(ptz, '<tptz:GetNodes/>', creds(camera));
  const node = blocks(xml, 'PTZNode')[0] || xml;
  const space = (tag) => {
    const range = blocks(node, tag)[0];
    if (!range) return undefined;
    const x = blocks(range, 'XRange')[0];
    const y = blocks(range, 'YRange')[0];
    return {
      x: x && { min: num(tagText(x, 'Min')), max: num(tagText(x, 'Max')) },
      y: y && { min: num(tagText(y, 'Min')), max: num(tagText(y, 'Max')) },
    };
  };
  return {
    camera,
    ptzUrl: ptz,
    mediaUrl: media,
    token,
    panTilt: space('PanTiltLimits') || space('AbsolutePanTiltPositionSpace'),
    zoom: space('ZoomLimits'),
  };
}

/** Maps a -1..1 request onto whatever range the camera reports (most cameras already use -1..1). */
const toDevice = (value, range) => {
  if (!range || range.min === undefined || range.max === undefined) return value;
  const clamped = Math.max(-1, Math.min(1, value));
  return range.min + ((clamped + 1) / 2) * (range.max - range.min);
};

const toNormal = (value, range) => {
  if (value === undefined) return undefined;
  if (!range || range.min === undefined || range.max === undefined || range.max === range.min) return value;
  return ((value - range.min) / (range.max - range.min)) * 2 - 1;
};

/**
 * Points the camera at a normalised position. `pan` and `tilt` are -1..1, `zoom` 0..1.
 * `speed` (0..1) is sent when the camera accepts it; omitting it uses the camera's default.
 */
async function absoluteMove(session, { pan, tilt, zoom, speed }) {
  const pt = session.panTilt;
  const position =
    `<tptz:Position>` +
    `<tt:PanTilt x="${toDevice(pan, pt?.x)}" y="${toDevice(tilt, pt?.y)}"/>` +
    (zoom === undefined ? '' : `<tt:Zoom x="${toDevice(zoom * 2 - 1, session.zoom?.x)}"/>`) +
    `</tptz:Position>`;
  const speedXml = speed === undefined ? '' : `<tptz:Speed><tt:PanTilt x="${speed}" y="${speed}"/></tptz:Speed>`;
  await soap(
    session.ptzUrl,
    `<tptz:AbsoluteMove><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken>${position}${speedXml}</tptz:AbsoluteMove>`,
    creds(session.camera)
  );
}

/** Current position (normalised) and whether the camera is still moving. */
async function status(session) {
  const xml = await soap(
    session.ptzUrl,
    `<tptz:GetStatus><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken></tptz:GetStatus>`,
    creds(session.camera)
  );
  const position = blocks(xml, 'Position')[0] || '';
  const moveStatus = blocks(xml, 'MoveStatus')[0] || '';
  const pt = vector(position, 'PanTilt');
  const zoom = vector(position, 'Zoom');
  return {
    pan: toNormal(pt?.x, session.panTilt?.x),
    tilt: toNormal(pt?.y, session.panTilt?.y),
    zoom: zoom?.x,
    // IDLE means the camera has settled; cameras that omit MoveStatus are treated as settled.
    moving: /MOVING/i.test(moveStatus),
  };
}

async function stop(session) {
  await soap(
    session.ptzUrl,
    `<tptz:Stop><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken><tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>`,
    creds(session.camera)
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Moves and waits until the camera reports it has settled, so the frame analysed afterwards is sharp.
 * Falls back to a fixed wait on cameras that do not report MoveStatus.
 */
async function moveAndSettle(session, position, { settleMs = 900, timeoutMs = 8000 } = {}) {
  await absoluteMove(session, position);
  const deadline = Date.now() + timeoutMs;
  let sawMoving = false;
  while (Date.now() < deadline) {
    await sleep(200);
    let state;
    try {
      state = await status(session);
    } catch {
      break; // GetStatus is optional; fall back to the fixed settle wait
    }
    if (state.moving) sawMoving = true;
    else if (sawMoving) break; // it moved and has now stopped
  }
  await sleep(settleMs); // let auto-focus and exposure catch up
}

/**
 * The pan/tilt positions covering a room, as a boustrophedon ("snake") grid: each tilt row is
 * scanned in the opposite direction to the last, so the camera never makes a long pan back.
 *
 * Ranges are normalised -1..1 and clamped; a single column or row is placed at the centre of its range.
 */
function sweepGrid({ panSteps = 4, tiltSteps = 2, panRange = [-1, 1], tiltRange = [-0.3, 0.2], zoom = 0 } = {}) {
  const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
  const [panMin, panMax] = [clamp(panRange[0]), clamp(panRange[1])];
  const [tiltMin, tiltMax] = [clamp(tiltRange[0]), clamp(tiltRange[1])];
  const columns = Math.max(1, Math.min(12, Math.round(panSteps)));
  const rows = Math.max(1, Math.min(6, Math.round(tiltSteps)));
  const at = (i, count, min, max) => (count === 1 ? (min + max) / 2 : min + (i * (max - min)) / (count - 1));

  const positions = [];
  for (let row = 0; row < rows; row += 1) {
    const tilt = at(row, rows, tiltMin, tiltMax);
    for (let col = 0; col < columns; col += 1) {
      // Reverse every other row so the sweep snakes instead of returning to the start.
      const index = row % 2 === 0 ? col : columns - 1 - col;
      positions.push({ pan: at(index, columns, panMin, panMax), tilt, zoom: Math.max(0, Math.min(1, Number(zoom) || 0)), row, column: index });
    }
  }
  return positions;
}

module.exports = { connect, absoluteMove, status, stop, moveAndSettle, sweepGrid, capabilities };
