/**
 * ONVIF PTZ control over SOAP, hand-rolled in the same style as services/discovery.js (no ONVIF
 * dependency). Used by the attendance sweep and by the manual control pad.
 *
 *   GetCapabilities  - where the Media and PTZ services live on this camera
 *   GetProfiles      - the media profile token every PTZ call is addressed to
 *   GetNodes         - the pan/tilt/zoom ranges the camera accepts
 *   AbsoluteMove     - point the camera at one normalised (x, y, zoom) position (the sweep)
 *   RelativeMove     - nudge by an offset from where it is now (a click on the pad)
 *   ContinuousMove   - move at a velocity until stopped (press and hold on the pad)
 *   GetStatus        - where the camera is now, and whether it is still moving
 *   Stop             - abandon a move
 *   Presets          - list, recall, store and delete the camera's own saved positions
 *   GotoHomePosition - return to the configured home position
 *   GetSnapshotUri   - a JPEG still, which is how the control pad shows a picture with no media gateway
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

/**
 * Turns XML entities back into characters. Needed because extracted text is used as-is: a snapshot
 * URI arrives as "?profile=1&amp;q=80" and would otherwise be requested with a parameter literally
 * named "amp;q", and a preset named "A &amp; B" would display wrongly.
 * &amp; is decoded last so "&amp;lt;" does not collapse into "<".
 */
const unescapeXml = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

const stripNs = (tag) => `(?:[\\w-]+:)?${tag}`;
const tagText = (xml, tag) => {
  const raw = xml.match(new RegExp(`<${stripNs(tag)}[^>]*>([^<]*)</${stripNs(tag)}>`))?.[1];
  return raw === undefined ? undefined : unescapeXml(raw).trim();
};
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
 * Service addresses and the media profile token, without requiring PTZ.
 * A snapshot only needs this much, so a fixed camera can still supply a picture.
 */
async function connectMedia(camera) {
  const { media, ptz } = await capabilities(camera);
  const token = await profileToken(media, camera);
  return { camera, mediaUrl: media, ptzUrl: ptz, token };
}

/**
 * Everything a sweep needs about a camera, fetched once and reused for every move:
 * service URLs, the profile token, and the pan/tilt/zoom ranges.
 */
async function connect(camera) {
  const { mediaUrl, ptzUrl, token } = await connectMedia(camera);
  if (!ptzUrl) throw fail('This camera does not report an ONVIF PTZ service', 400);
  const xml = await soap(ptzUrl, '<tptz:GetNodes/>', creds(camera));
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
    ptzUrl,
    mediaUrl,
    token,
    panTilt: space('PanTiltLimits') || space('AbsolutePanTiltPositionSpace'),
    zoom: space('ZoomLimits'),
  };
}

// Trims the floating-point dust that mapping between ranges leaves behind, so a position read back
// from a camera comes out as 0.4 rather than 0.3999999999999999.
const tidy = (n) => (Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : n);

/** Whether a reported range is already the -1..1 space callers use, making conversion a no-op. */
const isUnitRange = (range) => !!range && range.min === -1 && range.max === 1;

/** Maps a -1..1 request onto whatever range the camera reports (most cameras already use -1..1). */
const toDevice = (value, range) => {
  const clamped = Math.max(-1, Math.min(1, value));
  if (!range || range.min === undefined || range.max === undefined) return value;
  if (isUnitRange(range)) return clamped;
  return tidy(range.min + ((clamped + 1) / 2) * (range.max - range.min));
};

const toNormal = (value, range) => {
  if (value === undefined) return undefined;
  if (!range || range.min === undefined || range.max === undefined || range.max === range.min) return value;
  if (isUnitRange(range)) return value;
  return tidy(((value - range.min) / (range.max - range.min)) * 2 - 1);
};

/**
 * Zoom *position* is 0..1 for callers, matching ONVIF's ZoomGenericSpace, and is converted separately
 * from pan/tilt because those run -1..1. A camera that reports no zoom range gets the generic space
 * value as-is; sending it through the pan/tilt conversion would ask for -1 when 0 was meant.
 * (Zoom *velocity* and *translation* are -1..1 and are not converted here.)
 */
const toDeviceZoom = (zoom, range) => {
  const clamped = Math.max(0, Math.min(1, Number(zoom) || 0));
  if (!range || range.min === undefined || range.max === undefined) return clamped;
  return tidy(range.min + clamped * (range.max - range.min));
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
    (zoom === undefined ? '' : `<tt:Zoom x="${toDeviceZoom(zoom, session.zoom?.x)}"/>`) +
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

/**
 * Starts moving at a velocity and keeps going until Stop, or until `timeoutSec` elapses.
 * This is what a press-and-hold arrow on the control pad uses. The timeout matters: if the browser's
 * Stop never arrives (tab closed, network dropped), the camera halts by itself instead of panning on
 * forever, so the caller re-sends this while the button stays held.
 *
 * pan/tilt/zoom are velocities in -1..1, where 0 means "do not move this axis".
 */
async function continuousMove(session, { pan = 0, tilt = 0, zoom = 0, timeoutSec = 2 }) {
  const panTilt = pan || tilt ? `<tt:PanTilt x="${pan}" y="${tilt}"/>` : '';
  const zoomXml = zoom ? `<tt:Zoom x="${zoom}"/>` : '';
  // ONVIF wants an xs:duration; whole seconds are enough for a hold.
  const timeout = `<tptz:Timeout>PT${Math.max(1, Math.min(60, Math.round(timeoutSec)))}S</tptz:Timeout>`;
  await soap(
    session.ptzUrl,
    `<tptz:ContinuousMove><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken>` +
      `<tptz:Velocity>${panTilt}${zoomXml}</tptz:Velocity>${timeout}</tptz:ContinuousMove>`,
    creds(session.camera)
  );
}

/** Nudges the camera by an offset from where it is now, for a single click on the control pad. */
async function relativeMove(session, { pan = 0, tilt = 0, zoom = 0, speed }) {
  const panTilt = pan || tilt ? `<tt:PanTilt x="${pan}" y="${tilt}"/>` : '';
  const zoomXml = zoom ? `<tt:Zoom x="${zoom}"/>` : '';
  const speedXml = speed === undefined ? '' : `<tptz:Speed><tt:PanTilt x="${speed}" y="${speed}"/></tptz:Speed>`;
  await soap(
    session.ptzUrl,
    `<tptz:RelativeMove><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken>` +
      `<tptz:Translation>${panTilt}${zoomXml}</tptz:Translation>${speedXml}</tptz:RelativeMove>`,
    creds(session.camera)
  );
}

/** The camera's stored preset positions, as [{ token, name }]. */
async function presets(session) {
  const xml = await soap(
    session.ptzUrl,
    `<tptz:GetPresets><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken></tptz:GetPresets>`,
    creds(session.camera)
  );
  // Matched as whole elements rather than tag/body pairs, because a preset with no name arrives as a
  // self-closing <Preset token="..."/> and would otherwise shift every following name by one.
  const element = new RegExp(`<${stripNs('Preset')}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${stripNs('Preset')}>)`, 'g');
  return [...xml.matchAll(element)]
    .map((m) => ({ token: attr(m[1] || '', 'token'), name: (m[2] && tagText(m[2], 'Name')) || '' }))
    .filter((p) => p.token)
    .map((p, i) => ({ ...p, name: p.name || `Preset ${i + 1}` }));
}

async function gotoPreset(session, token, speed) {
  const speedXml = speed === undefined ? '' : `<tptz:Speed><tt:PanTilt x="${speed}" y="${speed}"/></tptz:Speed>`;
  await soap(
    session.ptzUrl,
    `<tptz:GotoPreset><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken>` +
      `<tptz:PresetToken>${escapeXml(token)}</tptz:PresetToken>${speedXml}</tptz:GotoPreset>`,
    creds(session.camera)
  );
}

/** Stores the current position. Passing an existing `token` overwrites that preset instead of adding one. */
async function setPreset(session, { name, token }) {
  const xml = await soap(
    session.ptzUrl,
    `<tptz:SetPreset><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken>` +
      (name ? `<tptz:PresetName>${escapeXml(name)}</tptz:PresetName>` : '') +
      (token ? `<tptz:PresetToken>${escapeXml(token)}</tptz:PresetToken>` : '') +
      `</tptz:SetPreset>`,
    creds(session.camera)
  );
  return tagText(xml, 'PresetToken') || token || null;
}

async function removePreset(session, token) {
  await soap(
    session.ptzUrl,
    `<tptz:RemovePreset><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken>` +
      `<tptz:PresetToken>${escapeXml(token)}</tptz:PresetToken></tptz:RemovePreset>`,
    creds(session.camera)
  );
}

/**
 * The camera's JPEG snapshot URL, from the Media service.
 *
 * This is how a picture reaches the browser without a media gateway: no transcoding, no Docker, and
 * nothing beyond the local network. The host is rewritten to the one we actually reached, because
 * cameras often report an address only they can see.
 */
async function snapshotUri(session) {
  const xml = await soap(
    session.mediaUrl,
    `<trt:GetSnapshotUri><trt:ProfileToken>${escapeXml(session.token)}</trt:ProfileToken></trt:GetSnapshotUri>`,
    creds(session.camera)
  );
  const uri = tagText(xml, 'Uri');
  if (!uri) throw fail('The camera did not report a snapshot address');
  return sameHostAs(session.mediaUrl, uri) || uri;
}

/** Authorization header value for HTTP Basic. */
const basicHeader = (user, password) => `Basic ${Buffer.from(`${user}:${password || ''}`).toString('base64')}`;

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

/** Parses the comma-separated fields of a WWW-Authenticate challenge. */
function parseChallenge(header) {
  const out = {};
  // Values may be quoted and may themselves contain commas (qop="auth,auth-int").
  for (const m of String(header).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

/**
 * Answers an HTTP Digest challenge (RFC 2617), which is what most cameras use on the snapshot URL.
 * Supports the plain MD5 and MD5-sess algorithms with or without qop.
 */
function digestHeader({ user, password, method, uri, challenge, nc = 1 }) {
  const { realm = '', nonce = '', opaque, qop, algorithm = 'MD5' } = challenge;
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ncValue = String(nc).padStart(8, '0');
  let ha1 = md5(`${user}:${realm}:${password || ''}`);
  if (/MD5-sess/i.test(algorithm)) ha1 = md5(`${ha1}:${nonce}:${cnonce}`);
  const ha2 = md5(`${method}:${uri}`);
  // qop may arrive as a list; "auth" is the only variant that applies to a plain GET.
  const useQop = qop ? String(qop).split(',').map((q) => q.trim()).find((q) => q === 'auth') : undefined;
  const response = useQop
    ? md5(`${ha1}:${nonce}:${ncValue}:${cnonce}:${useQop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${user}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (useQop) parts.push(`qop=${useQop}`, `nc=${ncValue}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  if (algorithm) parts.push(`algorithm=${algorithm}`);
  return `Digest ${parts.join(', ')}`;
}

/**
 * Fetches one JPEG frame from the camera, answering a Basic or Digest challenge if it comes back.
 * Returns { body, contentType }.
 */
async function fetchSnapshot(session, { timeoutMs = 8000, maxBytes = 8 * 1024 * 1024 } = {}) {
  const url = await snapshotUri(session);
  const { user, password } = creds(session.camera);
  const target = new URL(url);
  // Credentials embedded in the reported URL are moved into a header instead.
  const finalUser = user || (target.username ? decodeURIComponent(target.username) : '');
  const finalPass = password || (target.password ? decodeURIComponent(target.password) : '');
  target.username = '';
  target.password = '';
  const path = `${target.pathname}${target.search}`;

  const get = (headers) => fetch(target, { headers, signal: AbortSignal.timeout(timeoutMs) });

  let res;
  try {
    res = await get({});
    if (res.status === 401 && finalUser) {
      const challenge = res.headers.get('www-authenticate') || '';
      const auth = /^\s*digest/i.test(challenge)
        ? digestHeader({ user: finalUser, password: finalPass, method: 'GET', uri: path, challenge: parseChallenge(challenge) })
        : basicHeader(finalUser, finalPass);
      res = await get({ Authorization: auth });
    }
  } catch (err) {
    throw fail(err.name === 'TimeoutError' ? 'The camera did not send a snapshot in time' : `Could not reach the camera: ${err.message}`);
  }

  if (res.status === 401) throw fail('The camera rejected the snapshot credentials');
  if (!res.ok) throw fail(`The camera could not provide a snapshot (HTTP ${res.status})`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) throw fail('The snapshot is unexpectedly large');
  if (!buffer.length) throw fail('The camera returned an empty snapshot');
  return { body: buffer, contentType: res.headers.get('content-type') || 'image/jpeg' };
}

/** Sends the camera to its configured home position. */
async function goHome(session, speed) {
  const speedXml = speed === undefined ? '' : `<tptz:Speed><tt:PanTilt x="${speed}" y="${speed}"/></tptz:Speed>`;
  await soap(
    session.ptzUrl,
    `<tptz:GotoHomePosition><tptz:ProfileToken>${escapeXml(session.token)}</tptz:ProfileToken>${speedXml}</tptz:GotoHomePosition>`,
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

module.exports = {
  connect,
  connectMedia,
  absoluteMove,
  relativeMove,
  continuousMove,
  status,
  stop,
  moveAndSettle,
  sweepGrid,
  capabilities,
  presets,
  snapshotUri,
  fetchSnapshot,
  gotoPreset,
  setPreset,
  removePreset,
  goHome,
};
