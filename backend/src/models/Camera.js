const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema(
  {
    cameraId: { type: String, unique: true, trim: true, uppercase: true }, // assigned automatically when empty
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    type: { type: String, enum: ['Indoor', 'Outdoor', 'PTZ'], default: 'Indoor' },
    ipAddress: { type: String, trim: true },
    streamUrl: { type: String, trim: true }, // RTSP source, e.g. rtsp://192.168.10.101:554/stream1
    rtspUser: { type: String, trim: true },
    rtspPassword: String, // never sent to the browser (see toJSON)
    // Browser-playable URL (HLS .m3u8, MJPEG or MP4). When empty, the media gateway's HLS stream is used.
    liveUrl: { type: String, trim: true },
    resolution: { type: String, enum: ['720p', '1080p', '2K', '4K'], default: '1080p' },
    status: { type: String, enum: ['Online', 'Offline', 'Maintenance'], default: 'Online' },
    manufacturer: { type: String, trim: true },
    model: { type: String, trim: true },
    // ONVIF device service, used to steer PTZ cameras during an attendance sweep.
    // Falls back to http://<ipAddress>/onvif/device_service, and to the RTSP credentials, when empty.
    onvifUrl: { type: String, trim: true },
    onvifUser: { type: String, trim: true },
    onvifPassword: String, // never sent to the browser (see toJSON)
    // Area an attendance sweep covers, as normalised ONVIF positions (pan/tilt -1..1, zoom 0..1).
    // The defaults sweep the full pan range slightly below the horizon, which suits a ceiling mount.
    ptz: {
      panSteps: { type: Number, min: 1, max: 12, default: 4 },
      tiltSteps: { type: Number, min: 1, max: 6, default: 2 },
      panMin: { type: Number, min: -1, max: 1, default: -1 },
      panMax: { type: Number, min: -1, max: 1, default: 1 },
      tiltMin: { type: Number, min: -1, max: 1, default: -0.3 },
      tiltMax: { type: Number, min: -1, max: 1, default: 0.2 },
      zoom: { type: Number, min: 0, max: 1, default: 0 },
      // Pause after each move, so auto-focus and exposure settle before the frame is analysed.
      settleMs: { type: Number, min: 0, max: 10000, default: 900 },
    },
    discoveredVia: { type: String, enum: ['Manual', 'ONVIF', 'RTSP scan'], default: 'Manual' },
    installedDate: Date,
    notes: String,
  },
  { timestamps: true }
);

cameraSchema.pre('validate', async function assignCameraId() {
  if (this.cameraId) return;
  const last = await this.constructor.findOne({ cameraId: /^CAM-\d+$/ }).sort({ cameraId: -1 }).select('cameraId');
  const next = last ? parseInt(last.cameraId.slice(4), 10) + 1 : 1;
  this.cameraId = `CAM-${String(next).padStart(3, '0')}`;
});

/** RTSP URL with credentials inserted, for the media gateway only. */
cameraSchema.methods.sourceUrl = function sourceUrl() {
  if (!this.streamUrl) return null;
  if (!this.rtspUser) return this.streamUrl;
  try {
    const url = new URL(this.streamUrl);
    url.username = this.rtspUser;
    url.password = this.rtspPassword || '';
    return url.toString();
  } catch {
    return this.streamUrl;
  }
};

cameraSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.hasPassword = !!ret.rtspPassword;
    ret.hasOnvifPassword = !!ret.onvifPassword;
    delete ret.rtspPassword;
    delete ret.onvifPassword;
    return ret;
  },
});

module.exports = mongoose.model('Camera', cameraSchema);
