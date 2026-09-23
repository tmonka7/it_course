const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['General', 'Event', 'Notice'], default: 'General' },
    content: String,
    publishDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Published', 'Draft'], default: 'Published' },
    author: String,
    // Only used for type "Event": shown under Upcoming Events on the dashboard.
    eventDate: Date,
    eventTime: { type: String, trim: true },
    location: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
