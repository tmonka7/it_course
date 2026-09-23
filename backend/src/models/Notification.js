const mongoose = require('mongoose');

/**
 * In-app notification. Addressed to one user (`recipient`), to everyone with a role (`role`),
 * or to everyone when both are empty. `readBy` records who has read it.
 */
const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: String,
    type: { type: String, enum: ['Info', 'Success', 'Warning', 'Alert'], default: 'Info' },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ['admin', 'staff'], default: null },
    link: String,
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: String,
  },
  { timestamps: true }
);

// Query matching every notification addressed to `user`.
notificationSchema.statics.forUser = function forUser(user) {
  return {
    $or: [{ recipient: user._id }, { recipient: null, role: null }, { recipient: null, role: user.role }],
  };
};

notificationSchema.statics.notify = function notify(data) {
  return this.create(data).catch((err) => console.error('[notification]', err.message));
};

module.exports = mongoose.model('Notification', notificationSchema);
