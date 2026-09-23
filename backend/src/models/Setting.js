const mongoose = require('mongoose');

// Singleton document holding system-wide settings.
const settingSchema = new mongoose.Schema(
  {
    schoolName: { type: String, default: 'School of Information Science and Technology' },
    logo: String, // data URL
    academicYear: { type: String, default: '2025-2026' },
    timeZone: { type: String, default: '(UTC+09:00) Tokyo' },
    emailNotification: { type: Boolean, default: true },
    smsNotification: { type: Boolean, default: false },
  },
  { timestamps: true }
);

settingSchema.statics.getSingleton = async function getSingleton() {
  return (await this.findOne()) || this.create({});
};

module.exports = mongoose.model('Setting', settingSchema);
