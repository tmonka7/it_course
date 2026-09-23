const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Course = require('../models/Course');
const Admission = require('../models/Admission');
const Activity = require('../models/Activity');

const router = express.Router();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const year = now.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const monthStart = new Date(year, now.getMonth(), 1);

    const [students, faculty, courses, pending, newStudents, newFaculty, newCourses, newApplications] =
      await Promise.all([
        Student.countDocuments(),
        Faculty.countDocuments(),
        Course.countDocuments(),
        Admission.countDocuments({ status: 'Pending' }),
        Student.countDocuments({ createdAt: { $gte: monthStart } }),
        Faculty.countDocuments({ createdAt: { $gte: monthStart } }),
        Course.countDocuments({ createdAt: { $gte: monthStart } }),
        Admission.countDocuments({ createdAt: { $gte: monthStart } }),
      ]);

    // Cumulative enrolled students at the end of each month of the current year.
    const [before, monthly] = await Promise.all([
      Student.countDocuments({ enrollDate: { $lt: yearStart } }),
      Student.aggregate([
        { $match: { enrollDate: { $gte: yearStart, $lt: new Date(year + 1, 0, 1) } } },
        { $group: { _id: { $month: '$enrollDate' }, count: { $sum: 1 } } },
      ]),
    ]);
    const perMonth = Object.fromEntries(monthly.map((m) => [m._id, m.count]));
    let running = before;
    const enrollmentTrend = MONTHS.map((month, i) => {
      running += perMonth[i + 1] || 0;
      return { month, students: i <= now.getMonth() ? running : null };
    });

    const byMajor = await Student.aggregate([
      { $group: { _id: '$major', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const top = byMajor.slice(0, 3).map((m) => ({ name: m._id, value: m.count }));
    const others = byMajor.slice(3).reduce((sum, m) => sum + m.count, 0);
    if (others) top.push({ name: 'Others', value: others });

    const recentActivities = await Activity.find().sort({ createdAt: -1 }).limit(6);

    res.json({
      stats: {
        students: { total: students, thisMonth: newStudents },
        faculty: { total: faculty, thisMonth: newFaculty },
        courses: { total: courses, thisMonth: newCourses },
        pendingApplications: { total: pending, thisMonth: newApplications },
      },
      enrollmentTrend,
      distribution: top,
      recentActivities,
    });
  })
);

module.exports = router;
