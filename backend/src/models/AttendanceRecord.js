const mongoose = require('mongoose');

/**
 * One student's attendance for one session. A record exists for every expected student, so an
 * absence is a stored fact rather than the absence of a row.
 *
 * "Late" is decided when the session is closed: present, but first seen after the grace period.
 */
const attendanceRecordSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    date: { type: Date, required: true },
    status: { type: String, enum: ['Present', 'Late', 'Absent', 'Excused'], default: 'Absent' },
    firstSeenAt: Date,
    lastSeenAt: Date,
    sightings: { type: Number, default: 0 }, // how many frames this student was recognised in
    bestSimilarity: Number, // strongest face match, 0..1
    // Where in the sweep the student was found, which doubles as a rough seat location.
    seenAtPosition: { pan: Number, tilt: Number, row: Number, column: Number },
    thumbnail: String, // small JPEG data URL of the recognised face, as evidence
    // Set when a person corrects the automatic result.
    overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    overriddenByName: String,
    overrideReason: String,
  },
  { timestamps: true }
);

// One row per student per session, and the lookups the reports need.
attendanceRecordSchema.index({ session: 1, student: 1 }, { unique: true });
attendanceRecordSchema.index({ student: 1, date: -1 });
attendanceRecordSchema.index({ course: 1, date: -1 });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
