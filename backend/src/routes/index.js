const express = require('express');
const crud = require('./crud');
const asyncHandler = require('../utils/asyncHandler');
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const settings = require('./settings');
const notificationRoutes = require('./notifications');
const commandLogRoutes = require('./commandLogs');
const attachments = require('./attachments');
const liveRoutes = require('./live');
const cameraDiscoveryRoutes = require('./cameraDiscovery');
const mediamtx = require('../services/mediamtx');
const { onCommandSaved } = require('../services/commandEvents');
const { auth, requireRole } = require('../middleware/auth');

const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');
const Schedule = require('../models/Schedule');
const Admission = require('../models/Admission');
const Grade = require('../models/Grade');
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const DailyReport = require('../models/DailyReport');
const Command = require('../models/Command');
const CommandLog = require('../models/CommandLog');
const Camera = require('../models/Camera');
const WorkSchedule = require('../models/WorkSchedule');
const Email = require('../models/Email');
const Notification = require('../models/Notification');
const Meeting = require('../models/Meeting');
const MeetingMessage = require('../models/MeetingMessage');
const { liveCounts } = require('../realtime/meetings');

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// beforeDelete guard: refuses to delete a record that other collections still point to.
const blockIfReferenced = (what, refs) => async (doc) => {
  const counts = await Promise.all(refs.map(([Model, field]) => Model.countDocuments({ [field]: doc._id })));
  const used = refs.map(([, , label], i) => counts[i] && `${counts[i]} ${label}`).filter(Boolean);
  if (used.length) throw badRequest(`This ${what} is still referenced by ${used.join(' and ')}. Remove or reassign them first.`);
};

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));
router.use('/auth', authRoutes);
router.use('/settings/public', settings.publicRouter);
router.use('/settings', settings.router);

router.use(auth);

router.use('/dashboard', dashboardRoutes);

router.use(
  '/students',
  crud(Student, {
    searchFields: ['studentId', 'name', 'major', 'email'],
    filterFields: ['major', 'status', 'gender', 'level'],
    sort: { studentId: 1 },
    label: 'student',
    describe: (d) => `${d.name} (${d.studentId})`,
    beforeDelete: blockIfReferenced('student', [[Grade, 'student', 'grade record(s)']]),
  })
);

router.use(
  '/faculty',
  crud(Faculty, {
    searchFields: ['facultyId', 'name', 'department', 'email'],
    filterFields: ['department', 'position', 'status'],
    sort: { facultyId: 1 },
    label: 'faculty member',
    describe: (d) => `${d.name} (${d.facultyId})`,
    beforeDelete: blockIfReferenced('faculty member', [[Course, 'instructor', 'course(s) as instructor']]),
  })
);

router.use(
  '/courses',
  crud(Course, {
    searchFields: ['code', 'name'],
    filterFields: ['department', 'status'],
    populate: { path: 'instructor', select: 'name facultyId' },
    sort: { code: 1 },
    label: 'course',
    describe: (d) => `${d.code} ${d.name}`,
    beforeDelete: blockIfReferenced('course', [
      [Schedule, 'course', 'class schedule slot(s)'],
      [Grade, 'course', 'grade record(s)'],
    ]),
  })
);

router.use(
  '/schedules',
  crud(Schedule, {
    searchFields: ['room'],
    filterFields: ['day', 'course', 'room'],
    populate: { path: 'course', select: 'code name department instructor', populate: { path: 'instructor', select: 'name' } },
    sort: { day: 1, period: 1 },
    label: 'class schedule',
    describe: (d) => `Day ${d.day}, period ${d.period + 1}, ${d.room}`,
  })
);

router.use(
  '/admissions',
  crud(Admission, {
    searchFields: ['applicationId', 'name', 'email'],
    filterFields: ['program', 'status'],
    sort: { appliedDate: -1 },
    label: 'application',
    describe: (d) => `${d.name} (${d.applicationId}) - ${d.status}`,
  })
);

router.use(
  '/grades',
  crud(Grade, {
    filterFields: ['academicYear', 'semester', 'course', 'student', 'status'],
    buildSearch: async (re) => {
      const ids = await Student.find({ $or: [{ name: re }, { studentId: re }] }).distinct('_id');
      return [{ student: { $in: ids } }];
    },
    populate: [
      { path: 'student', select: 'studentId name' },
      { path: 'course', select: 'code name' },
    ],
    sort: { academicYear: -1, createdAt: -1 },
    label: 'grade record',
    describe: (d) => `${d.academicYear} ${d.semester}: ${d.grade}`,
  })
);

router.use(
  '/announcements',
  crud(Announcement, {
    searchFields: ['title', 'content'],
    filterFields: ['type', 'status'],
    sort: { publishDate: -1 },
    label: 'announcement',
    sanitize: (body, req) => ({ ...body, author: body.author || req.user.name }),
  })
);

router.use(
  '/daily-reports',
  crud(DailyReport, {
    searchFields: ['reporter', 'workDone', 'issues'],
    filterFields: ['status', 'department'],
    sort: { date: -1, createdAt: -1 },
    dateField: 'date',
    label: 'daily report',
    describe: (d) => `${d.reporter || 'Report'} - ${d.date.toISOString().slice(0, 10)}`,
    sanitize: (body, req) => ({ ...body, reporter: body.reporter || req.user.name }),
    afterSave: (doc, req, before) => {
      if (doc.status === 'Submitted' && before?.status !== 'Submitted') {
        Notification.notify({
          title: 'Daily report submitted',
          message: `${doc.reporter} submitted the report for ${doc.date.toISOString().slice(0, 10)}.`,
          role: 'admin',
          link: '/daily-reports',
          createdBy: req.user.username,
        });
      }
    },
  })
);

router.use(
  '/work-schedules',
  crud(WorkSchedule, {
    searchFields: ['title', 'location', 'plan', 'record'],
    filterFields: ['status', 'category', 'assignee'],
    populate: { path: 'assignee', select: 'name username' },
    sort: { date: 1, startTime: 1 },
    dateField: 'date',
    label: 'work schedule',
    describe: (d) => `${d.title} (${d.date.toISOString().slice(0, 10)})`,
    sanitize: ({ createdBy, ...body }, req) => (req.params.id ? body : { ...body, createdBy: req.user.name }),
    // Tell people when someone else puts work on their schedule.
    afterSave: (doc, req, before) => {
      const assignee = String(doc.assignee?._id || doc.assignee);
      if (assignee === String(req.user._id) || assignee === String(before?.assignee)) return;
      const when = `${doc.date.toISOString().slice(0, 10)}${doc.startTime ? ` ${doc.startTime}` : ''}`;
      Notification.notify({
        title: `Scheduled: ${doc.title}`,
        message: `${req.user.name} scheduled you for ${when}${doc.location ? ` at ${doc.location}` : ''}.`,
        recipient: assignee,
        link: '/work-schedule',
        createdBy: req.user.username,
      });
    },
  })
);

router.use(commandLogRoutes);
router.use(attachments.router);
router.use(
  '/commands',
  crud(Command, {
    searchFields: ['title', 'content', 'issuedBy'],
    filterFields: ['status', 'priority', 'assignee'],
    populate: { path: 'assignee', select: 'name username' },
    sort: { createdAt: -1 },
    label: 'command',
    describe: (d) => `${d.title} (${d.status})`,
    // A work order belongs to a day when it was issued, is due, or had log activity that day
    // (automatic reminders don't count).
    dateFilter: async (from, to) => {
      const range = { $gte: from, $lt: to };
      const logged = await CommandLog.distinct('command', { createdAt: range, type: { $ne: 'Reminder' } });
      return { $or: [{ createdAt: range }, { dueDate: range }, { _id: { $in: logged } }] };
    },
    // The issuer is whoever creates the command; it never changes afterwards.
    // Attachments are managed only through /commands/:id/attachments.
    sanitize: ({ issuer, issuedBy, attachments: _attachments, ...body }, req) =>
      req.params.id ? body : { ...body, issuer: req.user._id, issuedBy: req.user.name },
    afterSave: onCommandSaved,
    beforeDelete: async (doc) => {
      await CommandLog.deleteMany({ command: doc._id });
      attachments.removeFiles(doc.attachments.map((a) => a.file));
    },
  })
);

router.use('/live', liveRoutes);
router.use('/camera-discovery', requireRole('admin'), cameraDiscoveryRoutes);
router.use(
  '/cameras',
  crud(Camera, {
    searchFields: ['cameraId', 'name', 'location', 'ipAddress'],
    filterFields: ['status', 'type'],
    sort: { cameraId: 1 },
    label: 'camera',
    describe: (d) => `${d.name} (${d.cameraId})`,
    // A blank password on edit keeps the stored one (the browser never receives it).
    sanitize: ({ hasPassword, ...body }) => {
      if (!body.rtspPassword) delete body.rtspPassword;
      return body;
    },
    // Gateway sync runs in the background so a gateway outage never blocks saving.
    afterSave: (doc, req, before) => {
      mediamtx.safely(mediamtx.syncCamera(doc, before?.cameraId), doc.cameraId);
    },
    beforeDelete: (doc) => {
      mediamtx.safely(mediamtx.removeCamera(doc.cameraId), doc.cameraId);
    },
  })
);

const AUDIENCE_COUNT = {
  'All Students': () => Student.countDocuments({ status: 'Active' }),
  'All Faculty': () => Faculty.countDocuments(),
  'All Users': () => User.countDocuments({ status: 'Active' }),
};

router.use(
  '/emails',
  crud(Email, {
    searchFields: ['subject', 'body', 'recipients'],
    filterFields: ['status', 'audience'],
    sort: { createdAt: -1 },
    label: 'email',
    describe: (d) => d.subject,
    afterSave: async (doc, req) => {
      const count = AUDIENCE_COUNT[doc.audience] ? await AUDIENCE_COUNT[doc.audience]() : doc.recipients.length;
      doc.recipientCount = count;
      if (doc.status === 'Sent' && !doc.sentAt) {
        doc.sentAt = new Date();
        doc.sentBy = req.user.name;
      }
      await doc.save();
    },
  })
);

// Meetings: join-by-code lookup and live participant counts sit beside the CRUD routes.
router.get('/meetings/live', (req, res) => res.json(liveCounts()));
router.get(
  '/meetings/by-code/:code',
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findOne({ code: String(req.params.code).toLowerCase().trim() });
    if (!meeting) return res.status(404).json({ message: 'No meeting with that code' });
    return res.json(meeting);
  })
);
router.use(
  '/meetings',
  crud(Meeting, {
    searchFields: ['title', 'code', 'hostName'],
    filterFields: ['status'],
    sort: { createdAt: -1 },
    label: 'meeting',
    describe: (d) => `${d.title} (${d.code})`,
    // Code, host and live status are managed by the server.
    sanitize: ({ code, host, hostName, status, startedAt, endedAt, ...body }, req) =>
      req.params.id ? body : { ...body, host: req.user._id, hostName: req.user.name },
    beforeDelete: async (doc, req) => {
      if (String(doc.host) !== String(req.user._id) && req.user.role !== 'admin') {
        throw badRequest('Only the host or an admin can delete this meeting');
      }
      await MeetingMessage.deleteMany({ meeting: doc._id });
    },
  })
);

router.use('/notifications', notificationRoutes);
router.use(
  '/notifications',
  requireRole('admin'),
  crud(Notification, {
    searchFields: ['title', 'message'],
    filterFields: ['type', 'role'],
    populate: { path: 'recipient', select: 'name username' },
    sort: { createdAt: -1 },
    label: 'notification',
    // readBy is managed by the feed routes; createdBy is stamped once on create.
    sanitize: ({ readBy, createdBy, ...body }, req) => (req.params.id ? body : { ...body, createdBy: req.user.username }),
  })
);

router.use(
  '/users',
  requireRole('admin'),
  crud(User, {
    searchFields: ['username', 'name', 'email'],
    filterFields: ['role', 'status'],
    sort: { username: 1 },
    label: 'user',
    describe: (d) => d.username,
    sanitize: (body, req) => {
      const data = { ...body };
      if (!data.password) delete data.password; // keep existing password when left blank
      // Stop admins from locking themselves out.
      if (req.params.id && req.user._id.equals(req.params.id)) {
        if (data.role && data.role !== req.user.role) throw badRequest('You cannot change your own role');
        if (data.status && data.status !== 'Active') throw badRequest('You cannot deactivate your own account');
      }
      return data;
    },
    beforeDelete: async (doc, req) => {
      if (doc._id.equals(req.user._id)) throw badRequest('You cannot delete your own account');
    },
  })
);

module.exports = router;
