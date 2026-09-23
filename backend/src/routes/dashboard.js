const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');
const Admission = require('../models/Admission');
const Announcement = require('../models/Announcement');
const Activity = require('../models/Activity');

const router = express.Router();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;

// Percentage change from `before` to `after`, rounded to one decimal.
const pctChange = (after, before) => {
  if (!before) return after ? 100 : 0;
  return Math.round(((after - before) / before) * 1000) / 10;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const months = Number(req.query.months) === 12 ? 12 : 6;
    const semesterAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [students, faculty, courses, pending, studentsBefore, facultyBefore, coursesBefore, appsThisWeek, appsLastWeek] =
      await Promise.all([
        Student.countDocuments(),
        Faculty.countDocuments(),
        Course.countDocuments(),
        Admission.countDocuments({ status: 'Pending' }),
        Student.countDocuments({ enrollDate: { $lt: semesterAgo } }),
        Faculty.countDocuments({ createdAt: { $lt: semesterAgo } }),
        Course.countDocuments({ createdAt: { $lt: semesterAgo } }),
        Admission.countDocuments({ appliedDate: { $gte: weekAgo } }),
        Admission.countDocuments({ appliedDate: { $gte: twoWeeksAgo, $lt: weekAgo } }),
      ]);

    // Cumulative total and new enrollments for each of the last `months` months (current month included).
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const [before, monthly] = await Promise.all([
      Student.countDocuments({ enrollDate: { $lt: rangeStart } }),
      Student.aggregate([
        { $match: { enrollDate: { $gte: rangeStart } } },
        { $group: { _id: { y: { $year: '$enrollDate' }, m: { $month: '$enrollDate' } }, count: { $sum: 1 } } },
      ]),
    ]);
    const perMonth = Object.fromEntries(monthly.map((m) => [`${m._id.y}-${m._id.m}`, m.count]));
    let running = before;
    const enrollmentTrend = Array.from({ length: months }, (_, i) => {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
      const added = perMonth[`${d.getFullYear()}-${d.getMonth() + 1}`] || 0;
      running += added;
      return { month: MONTHS[d.getMonth()], total: running, new: added };
    });

    const byMajor = await Student.aggregate([
      { $group: { _id: '$major', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const top = byMajor.slice(0, 3).map((m) => ({ name: m._id, value: m.count }));
    const others = byMajor.slice(3).reduce((sum, m) => sum + m.count, 0);
    if (others) top.push({ name: 'Others', value: others });

    const [recentActivities, upcomingEvents] = await Promise.all([
      Activity.find().sort({ createdAt: -1 }).limit(5),
      Announcement.find({ type: 'Event', status: 'Published', eventDate: { $gte: todayStart } })
        .sort({ eventDate: 1 })
        .limit(4)
        .select('title eventDate eventTime location'),
    ]);

    res.json({
      stats: {
        students: { total: students, change: pctChange(students, studentsBefore) },
        faculty: { total: faculty, change: pctChange(faculty, facultyBefore) },
        courses: { total: courses, change: pctChange(courses, coursesBefore) },
        pendingApplications: { total: pending, change: pctChange(appsThisWeek, appsLastWeek) },
      },
      enrollmentTrend,
      distribution: top,
      upcomingEvents,
      recentActivities,
    });
  })
);

router.get(
  '/activities',
  asyncHandler(async (req, res) => {
    res.json(await Activity.find().sort({ createdAt: -1 }).limit(100));
  })
);

module.exports = router;
