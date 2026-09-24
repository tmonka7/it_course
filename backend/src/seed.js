/* Resets the database and fills it with demo data. Usage: npm run seed */
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { DEPARTMENTS, PROGRAMS, POSITIONS } = require('./utils/constants');

const User = require('./models/User');
const { PRESETS } = require('./utils/permissions');
const Student = require('./models/Student');
const Faculty = require('./models/Faculty');
const Course = require('./models/Course');
const Schedule = require('./models/Schedule');
const Admission = require('./models/Admission');
const Grade = require('./models/Grade');
const Enrollment = require('./models/Enrollment');
const Announcement = require('./models/Announcement');
const Setting = require('./models/Setting');
const Activity = require('./models/Activity');
const DailyReport = require('./models/DailyReport');
const Command = require('./models/Command');
const Camera = require('./models/Camera');
const Email = require('./models/Email');
const Notification = require('./models/Notification');
const CommandLog = require('./models/CommandLog');
const Meeting = require('./models/Meeting');
const MeetingMessage = require('./models/MeetingMessage');
const WorkSchedule = require('./models/WorkSchedule');

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

// Demo staff account: can do day-to-day work but not delete records, and only views cameras.
function staffPermissions() {
  const p = PRESETS.full();
  Object.values(p).forEach((actions) => {
    actions.delete = false;
  });
  p.cameras = { view: true, create: false, edit: false, delete: false };
  return p;
}

/**
 * Replaces every collection with the demo data set.
 * Takes no part in connection handling, so it can run either from the CLI (below) or in-process from
 * the Database Management page (routes/database.js) without disturbing the server's connection.
 */
async function seedDatabase() {
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).deleteMany({})));
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));

  const [adminUser, staffUser] = await User.create([
    { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
    { username: 'staff', password: 'staff123', name: 'Office Staff', role: 'staff', permissions: staffPermissions() },
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

  // Course enrollments: the roster automated attendance is taken against. Each timetabled course gets
  // a class-sized group of active students for the current term, so a scan has someone to expect.
  const autumn = now.getMonth() >= 7;
  const currentYear = `${autumn ? now.getFullYear() : now.getFullYear() - 1}-${autumn ? now.getFullYear() + 1 : now.getFullYear()}`;
  const currentSemester = autumn ? 'Fall' : now.getMonth() >= 4 ? 'Summer' : 'Spring';
  const activeStudents = students.filter((s) => s.status === 'Active');
  const enrollmentDocs = [];
  const enrolled = new Set();
  [...new Set(slots.map(([code]) => code))].forEach((code, index) => {
    // A contiguous slice per course keeps class sizes realistic and the groups mostly distinct.
    const start = (index * 28) % Math.max(1, activeStudents.length - 30);
    activeStudents.slice(start, start + between(24, 30)).forEach((student) => {
      const key = `${student._id}-${byCode[code]._id}`;
      if (enrolled.has(key)) return;
      enrolled.add(key);
      enrollmentDocs.push({
        student: student._id,
        course: byCode[code]._id,
        academicYear: currentYear,
        semester: currentSemester,
        status: 'Enrolled',
      });
    });
  });
  await Enrollment.insertMany(enrollmentDocs);

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

  const inDays = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const events = [
    ['Midterm Examination', 'Midterm exams for all undergraduate courses.', 2, '09:00 - 12:00', 'Building A, Room 101'],
    ['Faculty Meeting', 'Monthly faculty meeting.', 4, '14:00 - 16:00', 'Conference Room'],
    ['New Student Orientation', 'Welcome session for incoming students.', 6, '10:00 - 12:00', 'Main Auditorium'],
    ['Course Registration Deadline', 'Last day to register for next semester courses.', 10, 'All Day', 'Online'],
  ];
  await Announcement.insertMany(
    events.map(([title, content, days, eventTime, location]) => ({
      title,
      type: 'Event',
      content,
      publishDate: now,
      eventDate: inDays(days),
      eventTime,
      location,
      status: 'Published',
      author: 'Administrator',
    }))
  );

  const daysAgo = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  await DailyReport.insertMany([
    {
      date: daysAgo(0),
      reporter: 'Office Staff',
      department: 'Administration',
      workDone: 'Processed 6 admission applications.\nUpdated the class schedule for SE302.',
      issues: 'Projector in Room 204 is not working.',
      planTomorrow: 'Prepare midterm examination room assignments.',
      status: 'Draft',
    },
    {
      date: daysAgo(1),
      reporter: 'Office Staff',
      department: 'Administration',
      workDone: 'Registered 12 new students.\nSent orientation reminders.',
      planTomorrow: 'Process remaining admission applications.',
      status: 'Submitted',
    },
    {
      date: daysAgo(2),
      reporter: 'Administrator',
      department: 'Computer Science',
      workDone: 'Reviewed CS course syllabi for the fall semester.',
      issues: 'Two courses still lack an assigned instructor.',
      status: 'Reviewed',
    },
  ]);

  const commands = await Command.insertMany([
    { title: 'Prepare midterm exam rooms', content: 'Assign rooms and invigilators for all midterm exams.', priority: 'High', assignee: staffUser._id, issuer: adminUser._id, issuedBy: 'Administrator', dueDate: daysAgo(-2), status: 'In Progress' },
    { title: 'Update faculty contact list', content: 'Verify phone numbers and emails for all faculty.', priority: 'Normal', assignee: staffUser._id, issuer: adminUser._id, issuedBy: 'Administrator', dueDate: daysAgo(-7), status: 'Issued' },
    { title: 'Check camera coverage in Building B', content: 'Two cameras reported offline; arrange maintenance.', priority: 'Urgent', assignee: staffUser._id, issuer: adminUser._id, issuedBy: 'Administrator', dueDate: daysAgo(-1), status: 'Issued' },
    { title: 'Archive last semester grade sheets', priority: 'Low', assignee: adminUser._id, issuer: adminUser._id, issuedBy: 'Administrator', dueDate: daysAgo(3), status: 'Completed' },
  ]);

  const at = (daysBack, hour) => {
    const d = daysAgo(daysBack);
    d.setHours(hour, 15);
    return d;
  };
  const logs = [];
  commands.forEach((c, i) => {
    logs.push({ command: c._id, type: 'Created', note: 'Command issued', status: 'Issued', user: adminUser._id, author: 'Administrator', createdAt: at(3, 9) });
    if (i === 0) {
      logs.push(
        { command: c._id, type: 'Update', note: 'Status: Issued → In Progress', status: 'In Progress', user: staffUser._id, author: 'Office Staff', createdAt: at(2, 10) },
        { command: c._id, type: 'Progress', note: 'Collected the exam timetable from all departments.', status: 'In Progress', user: staffUser._id, author: 'Office Staff', createdAt: at(2, 16) },
        { command: c._id, type: 'Progress', note: 'Rooms booked for CS and SE exams; IS still pending.', status: 'In Progress', user: staffUser._id, author: 'Office Staff', createdAt: at(1, 16) },
        { command: c._id, type: 'Progress', note: 'All rooms booked. Assigning invigilators now.', status: 'In Progress', user: staffUser._id, author: 'Office Staff', createdAt: at(0, 11) }
      );
    }
    if (i === 3) {
      logs.push({ command: c._id, type: 'Update', note: 'Status: Issued → Completed', status: 'Completed', user: adminUser._id, author: 'Administrator', createdAt: at(1, 14) });
    }
  });
  // insertMany keeps the explicit createdAt values (timestamps only fill missing ones).
  await CommandLog.insertMany(logs);

  // Work schedules: yesterday (with records), today and the next few days.
  const SHIFTS = [
    ['Front desk duty', 'Duty', '08:30', '12:00', 'Admin Office', staffUser],
    ['Lab equipment inspection', 'Inspection', '13:30', '15:00', 'Building B, Labs', staffUser],
    ['Camera maintenance check', 'Maintenance', '15:30', '17:00', 'Building B', adminUser],
    ['Exam room preparation', 'Teaching Support', '09:00', '11:30', 'Building A', staffUser],
  ];
  const schedules = [];
  [-1, 0, 1, 2, 5].forEach((offset) => {
    SHIFTS.forEach(([title, category, startTime, endTime, location, user], i) => {
      if ((offset + i) % 3 === 2) return; // leave some gaps so days differ
      schedules.push({
        title,
        category,
        startTime,
        endTime,
        location,
        assignee: user._id,
        date: daysAgo(-offset),
        status: offset < 0 ? 'Done' : 'Planned',
        plan: `${title} as scheduled.`,
        record: offset < 0 ? 'Completed without issues.' : undefined,
        createdBy: 'Administrator',
      });
    });
  });
  await WorkSchedule.insertMany(schedules);

  const meetings = await Meeting.create([
    { title: 'Weekly Staff Meeting', description: 'Weekly sync for administrative staff.', scheduledAt: at(-1, 10), host: adminUser._id, hostName: 'Administrator' },
    { title: 'Midterm Exam Planning', description: 'Room and invigilator assignments.', scheduledAt: at(-2, 14), host: staffUser._id, hostName: 'Office Staff' },
  ]);
  await MeetingMessage.create({ meeting: meetings[0]._id, user: adminUser._id, name: 'Administrator', text: 'Agenda: exam rooms, camera maintenance, orientation.' });

  const CAMERAS = [
    ['CAM-001', 'Main Gate', 'Main Entrance', 'Outdoor', '4K', 'Online'],
    ['CAM-002', 'Lobby', 'Building A, Lobby', 'Indoor', '1080p', 'Online'],
    ['CAM-003', 'Parking Lot', 'North Parking', 'PTZ', '2K', 'Online'],
    ['CAM-004', 'Library Hall', 'Library, 1F', 'Indoor', '1080p', 'Online'],
    ['CAM-005', 'Lab Corridor', 'Building B, 2F', 'Indoor', '1080p', 'Offline'],
    ['CAM-006', 'Server Room', 'Building B, B1', 'Indoor', '2K', 'Offline'],
    ['CAM-007', 'Sports Field', 'East Field', 'PTZ', '4K', 'Maintenance'],
    ['CAM-008', 'Auditorium', 'Main Auditorium', 'Indoor', '1080p', 'Online'],
  ];
  await Camera.insertMany(
    CAMERAS.map(([cameraId, name, location, type, resolution, status], i) => ({
      cameraId,
      discoveredVia: 'Manual',
      name,
      location,
      type,
      resolution,
      status,
      ipAddress: `192.168.10.${101 + i}`,
      streamUrl: `rtsp://192.168.10.${101 + i}:554/stream1`,
      installedDate: new Date(now.getFullYear() - 1, i, 10),
    }))
  );

  await Email.insertMany([
    { audience: 'All Students', recipientCount: students.length, subject: 'Midterm Examination Schedule', body: 'Dear students,\n\nThe midterm examination schedule is now available in the portal.', status: 'Sent', sender: adminUser._id, sentBy: adminUser.name, sentAt: daysAgo(1) },
    { audience: 'All Faculty', recipientCount: faculty.length, subject: 'Faculty Meeting Reminder', body: 'The monthly faculty meeting will be held in the Conference Room.', status: 'Sent', sender: adminUser._id, sentBy: adminUser.name, sentAt: daysAgo(2) },
    { audience: 'Custom', recipients: ['it-support@school.edu'], recipientCount: 1, subject: 'Camera maintenance request', body: 'CAM-005 and CAM-006 are offline. Please check.', status: 'Draft', sender: staffUser._id },
  ]);

  await Notification.insertMany([
    { title: 'Welcome to the new notification center', message: 'System notifications now appear here.', type: 'Info', createdBy: 'admin' },
    { title: 'New command: Check camera coverage in Building B', message: 'Urgent priority.', type: 'Warning', recipient: staffUser._id, link: '/commands', createdBy: 'admin' },
    { title: 'Daily report submitted', message: "Office Staff submitted yesterday's report.", type: 'Info', role: 'admin', link: '/daily-reports', createdBy: 'staff' },
    { title: '2 cameras offline', message: 'CAM-005 and CAM-006 are not responding.', type: 'Alert', role: 'admin', link: '/cameras', createdBy: 'system' },
  ]);

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
  return { students: students.length, faculty: faculty.length, courses: courses.length, grades: gradeDocs.length };
}

module.exports = { seedDatabase };

// Run from the command line: npm run seed
if (require.main === module) {
  connectDB()
    .then(seedDatabase)
    .then(() => mongoose.disconnect())
    .catch(async (err) => {
      console.error('[seed] failed:', err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
