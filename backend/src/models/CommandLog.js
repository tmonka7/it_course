const mongoose = require('mongoose');

/**
 * Timeline entry for a command. "Progress" entries are the daily log written by people;
 * "Created" / "Update" entries are recorded automatically whenever the command changes.
 */
const commandLogSchema = new mongoose.Schema(
  {
    command: { type: mongoose.Schema.Types.ObjectId, ref: 'Command', required: true, index: true },
    type: { type: String, enum: ['Created', 'Update', 'Progress', 'Reminder'], required: true },
    note: { type: String, trim: true },
    status: String, // command status after this entry
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    author: String,
  },
  { timestamps: true }
);

commandLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CommandLog', commandLogSchema);
