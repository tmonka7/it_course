const mongoose = require('mongoose');

/**
 * One automated attendance run: a camera sweeps a room while the browser recognises faces, and each
 * expected student ends up with an AttendanceRecord.
 *
 * The sweep plan is stored so a finished session can be explained afterwards ("12 positions, 3 passes,
 * 2 positions the camera could not reach").
 */
const positionSchema = new mongoose.Schema(
  {
    pan: Number,
    tilt: Number,
    zoom: Number,
    row: Number,
    column: Number,
    // Filled in as the sweep progresses.
    scannedAt: Date,
    faces: { type: Number, default: 0 }, // faces seen at this position
    recognised: { type: Number, default: 0 },
    error: String, // the camera refused this move, or the frame could not be analysed
  },
  { _id: false }
);

const attendanceSessionSchema = new mongoose.Schema(
  {
    camera: { type: mongoose.Schema.Types.ObjectId, ref: 'Camera', required: true },
    // A session usually belongs to a timetabled class; a free-standing sweep may have neither.
    schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    room: { type: String, trim: true },
    academicYear: { type: String, match: /^\d{4}-\d{4}$/ },
    semester: { type: String, enum: ['Fall', 'Spring', 'Summer'] },
    date: { type: Date, default: Date.now },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    status: { type: String, enum: ['Scanning', 'Completed', 'Cancelled', 'Failed'], default: 'Scanning' },
    // How the roster was determined, so a report can say why someone was expected.
    rosterSource: { type: String, enum: ['Enrollment', 'AllActive', 'Manual'], default: 'Enrollment' },
    expectedCount: { type: Number, default: 0 },
    presentCount: { type: Number, default: 0 },
    // Faces detected that matched nobody on the roster - visitors, or students without a registered face.
    unknownFaces: { type: Number, default: 0 },
    passes: { type: Number, default: 1 }, // how many times the grid was swept
    plan: [positionSchema],
    matchThreshold: Number,
    // A student first recognised more than this many minutes after the session started counts as late.
    lateAfterMinutes: { type: Number, min: 0, max: 240, default: 10 },
    error: String,
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedByName: String,
    notes: String,
  },
  { timestamps: true }
);

attendanceSessionSchema.index({ date: -1 });
attendanceSessionSchema.index({ course: 1, date: -1 });

/** Positions the camera actually reached, for the progress readout. */
attendanceSessionSchema.virtual('scannedPositions').get(function scanned() {
  return this.plan.filter((p) => p.scannedAt).length;
});

attendanceSessionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
