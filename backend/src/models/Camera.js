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
    delete ret.rtspPassword;
    return ret;
  },
});

module.exports = mongoose.model('Camera', cameraSchema);
