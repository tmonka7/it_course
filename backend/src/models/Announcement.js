const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['General', 'Event', 'Notice'], default: 'General' },
    content: String,
    publishDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Published', 'Draft'], default: 'Published' },
    author: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
