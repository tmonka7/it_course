const express = require('express');
const crud = require('./crud');
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const settings = require('./settings');
const { auth, requireRole } = require('../middleware/auth');

const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');
const Schedule = require('../models/Schedule');
const Admission = require('../models/Admission');
const Grade = require('../models/Grade');
const Announcement = require('../models/Announcement');
const User = require('../models/User');

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
