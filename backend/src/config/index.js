require('dotenv').config();
const path = require('path');

function parseIceServers(raw) {
  if (!raw) return [{ urls: 'stun:stun.l.google.com:19302' }];
  try {
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list;
  } catch {
    /* fall through */
  }
  console.warn('[config] ICE_SERVERS is not a JSON array; using the default STUN server.');
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sist',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // Where uploaded attachments are stored (created on first upload).
  uploadDir: path.resolve(__dirname, '../..', process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB, 10) || 20,
  // Largest backup file the Database Management page may restore (one JSON request body).
  maxRestoreMb: parseInt(process.env.MAX_RESTORE_MB, 10) || 64,
  // Optional HTTPS for the API server itself (camera/microphone access in browsers needs HTTPS off localhost).
  ssl: { key: process.env.SSL_KEY_FILE, cert: process.env.SSL_CERT_FILE },
  // Optional MediaMTX gateway that turns camera RTSP streams into browser-playable HLS.
  mediamtx: {
    apiUrl: (process.env.MEDIAMTX_API_URL || '').replace(/\/$/, ''),
    hlsUrl: (process.env.MEDIAMTX_HLS_URL || '').replace(/\/$/, ''),
  },
  // WebRTC ICE servers for meetings, as JSON. Add a TURN server for users behind strict NAT.
  iceServers: parseIceServers(process.env.ICE_SERVERS),
  // Hour of day (0-23) after which assignees of open commands without a progress log are reminded; -1 disables.
  commandReminderHour: process.env.COMMAND_REMINDER_HOUR === undefined ? 17 : parseInt(process.env.COMMAND_REMINDER_HOUR, 10),
};

if (!process.env.JWT_SECRET) {
  console.warn('[config] JWT_SECRET is not set; using an insecure development secret.');
}

module.exports = config;
