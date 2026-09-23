const mongoose = require('mongoose');

// A recurring weekly class slot. `period` indexes the PERIODS list shared with the frontend.
const scheduleSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    day: { type: Number, min: 1, max: 5, required: true }, // 1 = Monday
    period: { type: Number, min: 0, max: 7, required: true },
    room: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// A room can host only one class per time slot.
scheduleSchema.index({ day: 1, period: 1, room: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
