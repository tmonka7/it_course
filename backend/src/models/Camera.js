const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema(
  {
    cameraId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    type: { type: String, enum: ['Indoor', 'Outdoor', 'PTZ'], default: 'Indoor' },
    ipAddress: { type: String, trim: true },
    streamUrl: { type: String, trim: true },
    resolution: { type: String, enum: ['720p', '1080p', '2K', '4K'], default: '1080p' },
    status: { type: String, enum: ['Online', 'Offline', 'Maintenance'], default: 'Online' },
    installedDate: Date,
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Camera', cameraSchema);
