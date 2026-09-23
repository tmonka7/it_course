const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');
const User = require('../models/User');

/**
 * GET /lookup/:kind?q=&status=&pageSize= - id + display fields for dropdowns (e.g. choosing an instructor
 * while editing a course). Open to every signed-in user so page permissions don't break related pickers;
 * it only ever returns names and codes, never contact details.
 */
const KINDS = {
  students: { Model: Student, fields: 'studentId name', search: ['studentId', 'name'], sort: { studentId: 1 } },
  faculty: { Model: Faculty, fields: 'facultyId name department', search: ['facultyId', 'name'], sort: { facultyId: 1 } },
  courses: { Model: Course, fields: 'code name department status', search: ['code', 'name'], sort: { code: 1 } },
  users: { Model: User, fields: 'username name', search: ['username', 'name'], sort: { name: 1 }, base: { status: 'Active' } },
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const router = express.Router();

router.get(
  '/:kind',
  asyncHandler(async (req, res) => {
    const kind = KINDS[req.params.kind];
    if (!kind) return res.status(404).json({ message: 'Unknown lookup' });
    const filter = { ...(kind.base || {}) };
    if (typeof req.query.status === 'string' && req.query.status && !kind.base) filter.status = req.query.status;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = kind.search.map((f) => ({ [f]: re }));
    }
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 30, 1), 1000);
    const items = await kind.Model.find(filter).select(kind.fields).sort(kind.sort).limit(pageSize).lean();
    return res.json({ items, total: items.length });
  })
);

module.exports = router;
