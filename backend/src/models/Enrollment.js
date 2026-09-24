const mongoose = require('mongoose');

/**
 * A student registered for a course in one term. This is the roster attendance is taken against:
 * grades record an outcome, an enrollment records who is expected in the room.
 */
const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    academicYear: { type: String, required: true, match: /^\d{4}-\d{4}$/ },
    semester: { type: String, enum: ['Fall', 'Spring', 'Summer'], required: true },
    status: { type: String, enum: ['Enrolled', 'Withdrawn', 'Completed'], default: 'Enrolled' },
  },
  { timestamps: true }
);

// A student registers for a course once per term.
enrollmentSchema.index({ student: 1, course: 1, academicYear: 1, semester: 1 }, { unique: true });
enrollmentSchema.index({ course: 1, status: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
