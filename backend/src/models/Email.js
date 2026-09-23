const mongoose = require('mongoose');

// Emails are recorded in the system only; nothing is delivered to a mail server.
const emailSchema = new mongoose.Schema(
  {
    audience: { type: String, enum: ['All Students', 'All Faculty', 'All Users', 'Custom'], default: 'Custom' },
    recipients: [{ type: String, trim: true, lowercase: true }], // used when audience is Custom
    recipientCount: { type: Number, default: 0 },
    subject: { type: String, required: true, trim: true },
    body: String,
    status: { type: String, enum: ['Draft', 'Sent'], default: 'Draft' },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who composed it; set by the server
    sentBy: String, // sender's display name at the time it was sent
    sentAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Email', emailSchema);
