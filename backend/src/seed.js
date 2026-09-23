/* Resets the database and fills it with demo data. Usage: npm run seed */
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { DEPARTMENTS, PROGRAMS, POSITIONS } = require('./utils/constants');

const User = require('./models/User');
const Student = require('./models/Student');
const Faculty = require('./models/Faculty');
const Course = require('./models/Course');
const Schedule = require('./models/Schedule');
const Admission = require('./models/Admission');
const Grade = require('./models/Grade');
const Announcement = require('./models/Announcement');
const Setting = require('./models/Setting');
const Activity = require('./models/Activity');

const SURNAMES = ['Zhang', 'Li', 'Wang', 'Chen', 'Liu', 'Zhao', 'Sun', 'Huang', 'Zhou', 'Wu', 'Xu', 'Ma', 'Hu', 'Guo', 'Lin', 'He'];
const GIVEN_M = ['Wei', 'Lei', 'Tao', 'Hao', 'Yang', 'Jie', 'Ming', 'Qiang', 'Jun', 'Bo', 'Peng', 'Rui', 'Kai', 'Chao'];
const GIVEN_F = ['Na', 'Fang', 'Mei', 'Jing', 'Yu', 'Xin', 'Ying', 'Li', 'Qian', 'Hui', 'Yan', 'Ling', 'Ting', 'Xue'];

let seed = 42;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const randomDate = (from, to) => new Date(from.getTime() + rand() * (to.getTime() - from.getTime()));

const personName = (gender) => `${pick(SURNAMES)} ${pick(gender === 'Male' ? GIVEN_M : GIVEN_F)}`;
const emailFor = (name, i) => `${name.split(' ').reverse().join('.').toLowerCase()}${i}@school.edu`;

const COURSES = [
  ['CS101', 'Introduction to Programming', 'Computer Science'],
  ['CS102', 'Discrete Mathematics', 'Computer Science'],
  ['CS202', 'Data Structures', 'Computer Science'],
  ['CS203', 'Algorithms', 'Computer Science'],
  ['CS204', 'Computer Networks', 'Computer Science'],
  ['CS302', 'Cloud Computing', 'Computer Science'],
  ['SE301', 'Database Systems', 'Software Engineering'],
  ['SE302', 'Web Development', 'Software Engineering'],
  ['SE303', 'Software Architecture', 'Software Engineering'],
  ['IS101', 'Information Systems', 'Information Systems'],
  ['IS201', 'Enterprise Systems', 'Information Systems'],
  ['DS201', 'Machine Learning', 'Data Science'],
  ['DS202', 'Data Visualization', 'Data Science'],
  ['CY301', 'Network Security', 'Cyber Security'],
  ['CY302', 'Cryptography', 'Cyber Security'],
];

async function run() {
  await connectDB();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).deleteMany({})));
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));

  await User.create([
    { username: 'admin', password: 'admin123', name: 'Administrator', email: 'admin@school.edu', role: 'admin' },
    { username: 'staff', password: 'staff123', name: 'Office Staff', email: 'staff@school.edu', role: 'staff' },
  ]);

  await Setting.create({});

  const faculty = await Faculty.insertMany(
    Array.from({ length: 42 }, (_, i) => {
      const gender = rand() > 0.5 ? 'Male' : 'Female';
      const name = personName(gender);
      return {
        facultyId: `F${String(i + 1).padStart(3, '0')}`,
        name,
        department: DEPARTMENTS[i % DEPARTMENTS.length],
        position: pick(POSITIONS),
        email: emailFor(name, i + 1),
        phone: `138${between(10000000, 99999999)}`,
        status: rand() > 0.9 ? 'On Leave' : 'Active',
      };
    })
  );

  const courses = await Course.insertMany(
    COURSES.map(([code, name, department]) => ({
      code,
      name,
      department,
      credits: pick([2, 3, 3, 4]),
      instructor: pick(faculty.filter((f) => f.department === department))._id,
      description: `${name} offered by the ${department} department.`,
    }))
  );

  const now = new Date();
  const threeYearsAgo = new Date(now.getFullYear() - 3, 8, 1);
  const students = await Student.insertMany(
    Array.from({ length: 360 }, (_, i) => {
      const gender = rand() > 0.5 ? 'Male' : 'Female';
      const name = personName(gender);
      const enrollDate = randomDate(threeYearsAgo, now);
      const yearsIn = now.getFullYear() - enrollDate.getFullYear();
      return {
        studentId: `CS${enrollDate.getFullYear()}${String(i + 1).padStart(4, '0')}`,
        name,
        gender,
        major: pick([...DEPARTMENTS, 'Computer Science', 'Software Engineering']),
        level: Math.min(4, Math.max(1, yearsIn + 1)),
        status: rand() > 0.93 ? 'Inactive' : 'Active',
        email: emailFor(name, i + 1),
        phone: `139${between(10000000, 99999999)}`,
        birthDate: randomDate(new Date(2000, 0, 1), new Date(2006, 11, 31)),
        enrollDate,
      };
    })
  );

  // Weekly timetable: [courseCode, day, period, room]
  const slots = [
    ['CS101', 1, 0, 'Room 101'], ['CS202', 3, 0, 'Room 102'], ['IS101', 5, 0, 'Room 201'],
    ['CS202', 1, 2, 'Room 303'], ['SE301', 3, 2, 'Room 302'], ['SE301', 4, 2, 'Room 104'],
    ['CS101', 2, 4, 'Room 101'], ['IS101', 4, 5, 'Room 201'], ['CS302', 5, 6, 'Room 203'],
    ['DS201', 2, 1, 'Lab 1'], ['CY301', 4, 0, 'Lab 2'], ['SE302', 1, 5, 'Lab 1'],
    ['CS204', 3, 4, 'Room 105'], ['DS202', 5, 3, 'Lab 3'],
  ];
  const byCode = Object.fromEntries(courses.map((c) => [c.code, c]));
  await Schedule.insertMany(slots.map(([code, day, period, room]) => ({ course: byCode[code]._id, day, period, room })));

  const statuses = ['Pending', 'Pending', 'Accepted', 'Accepted', 'Rejected'];
  await Admission.insertMany(
    Array.from({ length: 64 }, (_, i) => {
      const gender = rand() > 0.5 ? 'Male' : 'Female';
      const name = personName(gender);
      return {
        applicationId: `A${now.getFullYear()}${String(i + 1).padStart(3, '0')}`,
        name,
        email: emailFor(name, 900 + i),
        program: pick(PROGRAMS),
        appliedDate: randomDate(new Date(now.getFullYear(), 0, 1), now),
        status: pick(statuses),
      };
    })
  );

  // create() rather than insertMany() so the pre('validate') hook derives letter grade and status.
  const gradeDocs = [];
  const years = [`${now.getFullYear() - 1}-${now.getFullYear()}`, `${now.getFullYear() - 2}-${now.getFullYear() - 1}`];
  students.slice(0, 140).forEach((s) => {
    const taken = new Set();
    for (let k = 0; k < 3; k += 1) {
      const course = pick(courses);
      if (taken.has(course.code)) continue;
      taken.add(course.code);
      gradeDocs.push({
        student: s._id,
        course: course._id,
        academicYear: pick(years),
        semester: pick(['Fall', 'Spring']),
        score: between(48, 100),
      });
    }
  });
  await Grade.create(gradeDocs);

  const announcements = [
    ['Fall Semester Registration Open', 'General', 'Registration for the fall semester is now open in the student portal.'],
    ['IT Career Fair', 'Event', 'Meet top tech employers in the main hall. Bring your resume!'],
    ['System Maintenance Notice', 'Notice', 'The portal will be unavailable Saturday 22:00-02:00 for maintenance.'],
    ['New Research Opportunities', 'Notice', 'Undergraduate research positions are available in the AI lab.'],
    ['Holiday Schedule', 'General', 'Campus offices will be closed during the national holiday.'],
    ['Scholarship Application', 'Notice', 'Merit scholarship applications are due at the end of the month.'],
    ['AI Seminar', 'Event', 'Guest lecture on large language models in Auditorium B.'],
    ['Library New Update', 'Notice', 'The library has extended opening hours during exam weeks.'],
  ];
  await Announcement.insertMany(
    announcements.map(([title, type, content], i) => ({
      title,
      type,
      content,
      publishDate: new Date(now.getTime() - i * 9 * 86400000),
      status: i === 7 ? 'Draft' : 'Published',
      author: 'Administrator',
    }))
  );

  await Activity.insertMany([
    { user: 'admin', action: 'Added new student', details: `${students[0].name} (${students[0].studentId})` },
    { user: 'staff', action: 'Updated course', details: 'SE301 Database Systems' },
    { user: 'staff', action: 'Updated application', details: 'Graduate Program' },
    { user: 'admin', action: 'Added new announcement', details: 'Fall Semester Registration Open' },
  ]);

  console.log(
    `[seed] done: ${students.length} students, ${faculty.length} faculty, ${courses.length} courses, ${gradeDocs.length} grades`
  );
  console.log('[seed] login with admin / admin123 or staff / staff123');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[seed] failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
