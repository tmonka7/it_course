// Page permission keys; must match backend/src/utils/permissions.js.
export const ACTIONS = ['view', 'create', 'edit', 'delete'];
const CRUD = ACTIONS;

/** Pages in the permission editor, grouped as in the sidebar. */
export const PERMISSION_PAGES = [
  { key: 'dashboard', label: 'Home', group: 'General', actions: ['view'] },
  { key: 'students', label: 'Student Management', group: 'Academic', actions: CRUD },
  { key: 'faculty', label: 'Faculty Management', group: 'Academic', actions: CRUD },
  { key: 'courses', label: 'Course Management', group: 'Academic', actions: CRUD },
  { key: 'schedule', label: 'Class Schedule', group: 'Academic', actions: CRUD },
  { key: 'admissions', label: 'Admissions', group: 'Academic', actions: CRUD },
  { key: 'grades', label: 'Grades & Records', group: 'Academic', actions: CRUD },
  { key: 'announcements', label: 'Announcements', group: 'Academic', actions: CRUD },
  { key: 'dailyReports', label: 'Daily Reports', group: 'Operations', actions: CRUD },
  { key: 'commands', label: 'Commands', group: 'Operations', actions: CRUD },
  { key: 'workSchedule', label: 'Work Schedule', group: 'Operations', actions: CRUD },
  { key: 'cameras', label: 'Camera Management', group: 'Security', actions: CRUD },
  { key: 'cameraView', label: 'Camera View', group: 'Security', actions: ['view'] },
  { key: 'detection', label: 'AI Detection', group: 'Security', actions: ['view'] },
  { key: 'meetings', label: 'Video Meetings', group: 'Communication', actions: CRUD },
  { key: 'emails', label: 'Email', group: 'Communication', actions: CRUD },
];

/** API resource -> permission page, used by CrudPage to show or hide Add/Edit/Delete. */
export const RESOURCE_PAGE = {
  students: 'students',
  faculty: 'faculty',
  courses: 'courses',
  schedules: 'schedule',
  admissions: 'admissions',
  grades: 'grades',
  announcements: 'announcements',
  'daily-reports': 'dailyReports',
  commands: 'commands',
  'work-schedules': 'workSchedule',
  cameras: 'cameras',
  meetings: 'meetings',
  emails: 'emails',
};

const build = (fn) => Object.fromEntries(PERMISSION_PAGES.map((p) => [p.key, Object.fromEntries(ACTIONS.map((a) => [a, p.actions.includes(a) && fn(a, p)]))]));

export const PRESETS = {
  full: () => build(() => true),
  readOnly: () => build((a) => a === 'view'),
  none: () => build(() => false),
};

/** Same rule as the server: admins can do everything; accounts without a permission set keep full access. */
export function hasPermission(user, page, action = 'view') {
  if (!user) return false;
  if (user.role === 'admin' || !page) return true;
  if (!user.permissions) return true;
  return user.permissions[page]?.[action] === true;
}
