const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    user: String,
    action: String,
    details: String,
  },
  { timestamps: true }
);

activitySchema.statics.log = function log(user, action, details) {
  return this.create({ user, action, details }).catch((err) => console.error('[activity]', err.message));
};

module.exports = mongoose.model('Activity', activitySchema);
