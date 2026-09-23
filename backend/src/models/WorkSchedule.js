const mongoose = require('mongoose');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A planned piece of staff work on a given day, and the record of what was actually done. */
const workScheduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    startTime: { type: String, match: [TIME, 'Start time must be HH:mm'] },
    endTime: { type: String, match: [TIME, 'End time must be HH:mm'] },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: ['Duty', 'Meeting', 'Inspection', 'Maintenance', 'Teaching Support', 'Other'], default: 'Duty' },
    location: { type: String, trim: true },
    status: { type: String, enum: ['Planned', 'In Progress', 'Done', 'Cancelled'], default: 'Planned' },
    plan: String, // what should be done
    record: String, // what was actually done (work record)
    createdBy: String,
  },
  { timestamps: true }
);

workScheduleSchema.pre('validate', function checkTimes() {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'End time must be after the start time');
  }
});

module.exports = mongoose.model('WorkSchedule', workScheduleSchema);
