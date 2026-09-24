const express = require('express');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Camera = require('../models/Camera');
const Schedule = require('../models/Schedule');
const Enrollment = require('../models/Enrollment');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const onvif = require('../services/onvif');

/**
 * /attendance - automated attendance sessions.
 *
 * How a run works:
 *   1. POST /sessions          builds the roster from enrollments, creates an Absent record per student,
 *                              and returns the PTZ sweep plan.
 *   2. GET  /sessions/:id/registry  hands the browser the face signatures of the roster only.
 *   3. The browser sweeps: move the camera (see routes/ptz.js), analyse a frame, recognise faces.
 *   4. POST /sessions/:id/sightings  reports who was seen at each position (called once per position).
 *   5. POST /sessions/:id/complete   closes the session and decides Present / Late / Absent.
 *
 * Recognition runs in the browser, so the server never receives a frame - only which student matched
 * and how strongly.
 */
const router = express.Router();

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const notFound = () => Object.assign(new Error('Record not found'), { status: 404 });

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** The students a session should expect, and where that roster came from. */
async function buildRoster({ rosterSource, course, academicYear, semester }) {
  if (rosterSource === 'AllActive' || !course) {
    const students = await Student.find({ status: 'Active' }).select('_id').lean();
    return { students: students.map((s) => s._id), source: 'AllActive' };
  }
  const filter = { course, status: 'Enrolled' };
  if (academicYear) filter.academicYear = academicYear;
  if (semester) filter.semester = semester;
  const enrollments = await Enrollment.find(filter).select('student').lean();
  return { students: enrollments.map((e) => e.student), source: 'Enrollment' };
}

/**
 * POST /attendance/sessions
 * { camera, schedule?, course?, room?, academicYear?, semester?, rosterSource?, passes?, lateAfterMinutes?, matchThreshold? }
 */
router.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!isId(body.camera)) throw badRequest('A camera is required');
    const camera = await Camera.findById(body.camera);
    if (!camera) throw badRequest('That camera does not exist');

    // A timetabled slot fills in the course and room, so the caller only has to name the slot.
    let schedule = null;
    if (body.schedule) {
      if (!isId(body.schedule)) throw badRequest('Invalid class schedule');
      schedule = await Schedule.findById(body.schedule).populate('course', 'code name');
      if (!schedule) throw badRequest('That class schedule does not exist');
    }
    const courseId = schedule?.course?._id || (isId(body.course) ? body.course : undefined);
    if (courseId && !(await Course.exists({ _id: courseId }))) throw badRequest('That course does not exist');

    const rosterSource = body.rosterSource === 'AllActive' ? 'AllActive' : 'Enrollment';
    const academicYear = typeof body.academicYear === 'string' && /^\d{4}-\d{4}$/.test(body.academicYear) ? body.academicYear : undefined;
    const semester = ['Fall', 'Spring', 'Summer'].includes(body.semester) ? body.semester : undefined;

    const roster = await buildRoster({ rosterSource, course: courseId, academicYear, semester });
    if (!roster.students.length) {
      throw badRequest(
        roster.source === 'Enrollment'
          ? 'No students are enrolled in this course for the selected term. Add enrollments, or scan against all active students.'
          : 'There are no active students to take attendance for.'
      );
    }

    const ptz = camera.ptz || {};
    const plan = onvif.sweepGrid({
      panSteps: ptz.panSteps,
      tiltSteps: ptz.tiltSteps,
      panRange: [ptz.panMin, ptz.panMax],
      tiltRange: [ptz.tiltMin, ptz.tiltMax],
      zoom: ptz.zoom,
    });

    const session = await AttendanceSession.create({
      camera: camera._id,
      schedule: schedule?._id,
      course: courseId,
      room: (typeof body.room === 'string' && body.room.trim()) || schedule?.room || camera.location,
      academicYear,
      semester,
      date: new Date(),
      rosterSource: roster.source,
      expectedCount: roster.students.length,
      passes: clamp(body.passes, 1, 10, 1),
      lateAfterMinutes: clamp(body.lateAfterMinutes, 0, 240, 10),
      matchThreshold: clamp(body.matchThreshold, 0.2, 0.95, undefined),
      plan,
      startedBy: req.user._id,
      startedByName: req.user.name,
    });

    // Everyone starts absent; the sweep promotes the students it recognises.
    await AttendanceRecord.insertMany(
      roster.students.map((student) => ({ session: session._id, student, course: courseId, date: session.date, status: 'Absent' })),
      { ordered: false }
    );

    Activity.log(req.user.username, 'Started attendance scan', `${session.room || camera.name} - ${roster.students.length} student(s)`);
    res.status(201).json(await populateSession(session._id));
  })
);

const populateSession = (id) =>
  AttendanceSession.findById(id)
    .populate('camera', 'cameraId name location type status streamUrl liveUrl ptz')
    .populate('course', 'code name')
    .populate('schedule', 'day period room');

/**
 * GET /attendance/sessions/:id/registry
 * Face signatures for this session's roster only - a smaller payload than the whole school, and it
 * stops a student from another class being matched into this room.
 */
router.get(
  '/sessions/:id/registry',
  asyncHandler(async (req, res) => {
    const session = await AttendanceSession.findById(req.params.id);
    if (!session) throw notFound();
    const studentIds = await AttendanceRecord.find({ session: session._id }).distinct('student');
    const students = await Student.find({ _id: { $in: studentIds }, 'faces.0': { $exists: true } })
      .select('studentId name photo +faces')
      .sort({ name: 1 })
      .lean();
    res.json(
      students.map((s) => ({
        _id: s._id,
        studentId: s.studentId,
        name: s.name,
        photo: s.photo,
        descriptors: s.faces.map((f) => f.descriptor),
      }))
    );
  })
);

/**
 * POST /attendance/sessions/:id/sightings
 * { positionIndex?, faces: [{ student, similarity, thumbnail? }], unknown?, faceCount?, error? }
 *
 * Reports one scanned position. Idempotent per student: repeated sightings only extend the time range
 * and keep the strongest match, so a student seen from several positions is not counted twice.
 */
router.post(
  '/sessions/:id/sightings',
  asyncHandler(async (req, res) => {
    const session = await AttendanceSession.findById(req.params.id);
    if (!session) throw notFound();
    if (session.status !== 'Scanning') throw badRequest('This attendance session is already closed');

    const body = req.body || {};
    const seen = Array.isArray(body.faces) ? body.faces.slice(0, 200) : [];
    const now = new Date();

    // Note what the camera found at this position, for the coverage map.
    const index = Number(body.positionIndex);
    const position = Number.isInteger(index) && index >= 0 && index < session.plan.length ? session.plan[index] : null;
    if (position) {
      position.scannedAt = now;
      position.faces = clamp(body.faceCount, 0, 1000, seen.length);
      position.recognised = seen.length;
      if (typeof body.error === 'string' && body.error) position.error = body.error.slice(0, 500);
    }
    session.unknownFaces += clamp(body.unknown, 0, 1000, 0);

    // Only students on this session's roster can be marked.
    const ids = seen.map((f) => f.student).filter(isId);
    const records = ids.length ? await AttendanceRecord.find({ session: session._id, student: { $in: ids } }) : [];
    const byStudent = new Map(records.map((r) => [String(r.student), r]));

    const writes = [];
    seen.forEach((face) => {
      const record = byStudent.get(String(face.student));
      if (!record) return; // recognised someone who is not expected here; ignored on purpose
      const similarity = clamp(face.similarity, 0, 1, 0);
      const set = { lastSeenAt: now, status: record.status === 'Absent' ? 'Present' : record.status };
      if (!record.firstSeenAt) set.firstSeenAt = now;
      // Keep the clearest sighting as the evidence thumbnail.
      if (!record.bestSimilarity || similarity > record.bestSimilarity) {
        set.bestSimilarity = similarity;
        if (typeof face.thumbnail === 'string' && face.thumbnail.startsWith('data:image/') && face.thumbnail.length <= 60 * 1024) {
          set.thumbnail = face.thumbnail;
        }
        if (position) set.seenAtPosition = { pan: position.pan, tilt: position.tilt, row: position.row, column: position.column };
      }
      writes.push({ updateOne: { filter: { _id: record._id }, update: { $set: set, $inc: { sightings: 1 } } } });
    });
    if (writes.length) await AttendanceRecord.bulkWrite(writes);

    session.presentCount = await AttendanceRecord.countDocuments({ session: session._id, status: { $in: ['Present', 'Late'] } });
    await session.save();

    res.json({
      presentCount: session.presentCount,
      expectedCount: session.expectedCount,
      unknownFaces: session.unknownFaces,
      scannedPositions: session.plan.filter((p) => p.scannedAt).length,
      recognised: writes.length,
    });
  })
);

/** POST /attendance/sessions/:id/complete { status?: 'Completed' | 'Cancelled' | 'Failed', error?, notes? } */
router.post(
  '/sessions/:id/complete',
  asyncHandler(async (req, res) => {
    const session = await AttendanceSession.findById(req.params.id);
    if (!session) throw notFound();
    if (session.status !== 'Scanning') return res.json(await populateSession(session._id));

    const status = ['Completed', 'Cancelled', 'Failed'].includes(req.body?.status) ? req.body.status : 'Completed';

    // Anyone first seen after the grace period is late rather than simply present.
    if (session.lateAfterMinutes > 0) {
      const cutoff = new Date(session.startedAt.getTime() + session.lateAfterMinutes * 60000);
      await AttendanceRecord.updateMany(
        { session: session._id, status: 'Present', firstSeenAt: { $gt: cutoff } },
        { $set: { status: 'Late' } }
      );
    }

    session.status = status;
    session.endedAt = new Date();
    session.presentCount = await AttendanceRecord.countDocuments({ session: session._id, status: { $in: ['Present', 'Late'] } });
    if (typeof req.body?.error === 'string') session.error = req.body.error.slice(0, 500);
    if (typeof req.body?.notes === 'string') session.notes = req.body.notes.slice(0, 2000);
    await session.save();

    Activity.log(
      req.user.username,
      `Attendance scan ${status.toLowerCase()}`,
      `${session.room || 'Session'} - ${session.presentCount}/${session.expectedCount} present`
    );
    res.json(await populateSession(session._id));
  })
);

/** GET /attendance/sessions/:id - the session with every student's result. */
router.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const session = await populateSession(req.params.id);
    if (!session) throw notFound();
    // Absent first (that is the list a teacher acts on), then by name. Sorting here rather than in
    // the query, because Mongoose cannot sort by a populated field.
    const order = { Absent: 0, Late: 1, Present: 2, Excused: 3 };
    const records = await AttendanceRecord.find({ session: session._id })
      .populate('student', 'studentId name major level photo')
      .lean();
    records.sort((a, b) => (order[a.status] - order[b.status]) || (a.student?.name || '').localeCompare(b.student?.name || ''));
    res.json({ session, records });
  })
);

/** PUT /attendance/records/:id { status, overrideReason? } - a person corrects one result. */
router.put(
  '/records/:id',
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (!['Present', 'Late', 'Absent', 'Excused'].includes(status)) throw badRequest('Invalid attendance status');
    const record = await AttendanceRecord.findById(req.params.id);
    if (!record) throw notFound();

    record.status = status;
    record.overriddenBy = req.user._id;
    record.overriddenByName = req.user.name;
    if (typeof req.body?.overrideReason === 'string') record.overrideReason = req.body.overrideReason.slice(0, 500);
    await record.save();

    // Keep the session's headline count in step with the correction.
    const session = await AttendanceSession.findById(record.session);
    if (session) {
      session.presentCount = await AttendanceRecord.countDocuments({ session: session._id, status: { $in: ['Present', 'Late'] } });
      await session.save();
    }
    res.json(await record.populate('student', 'studentId name'));
  })
);

/**
 * GET /attendance/summary?course=&from=&to=&student=
 * Attendance rate per student across sessions, for the reports tab.
 */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const match = {};
    if (isId(req.query.course)) match.course = new mongoose.Types.ObjectId(req.query.course);
    if (isId(req.query.student)) match.student = new mongoose.Types.ObjectId(req.query.student);
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) match.date = { $gte: from, $lt: to };

    const rows = await AttendanceRecord.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$student',
          sessions: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
          excused: { $sum: { $cond: [{ $eq: ['$status', 'Excused'] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
      {
        $project: {
          _id: 0,
          student: { _id: '$student._id', studentId: '$student.studentId', name: '$student.name' },
          sessions: 1,
          present: 1,
          late: 1,
          absent: 1,
          excused: 1,
          rate: { $cond: [{ $gt: ['$sessions', 0] }, { $divide: ['$present', '$sessions'] }, 0] },
        },
      },
      { $sort: { rate: 1 } },
      { $limit: 500 },
    ]);
    res.json(rows);
  })
);

module.exports = router;
