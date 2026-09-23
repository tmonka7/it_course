/**
 * Per-user page permissions. Administrators always have full access; staff users have a matrix of
 * page -> { view, create, edit, delete }. The same page keys are used by the frontend (src/permissions.js).
 */
const CRUD = ['view', 'create', 'edit', 'delete'];

const PAGES = {
  dashboard: ['view'],
  students: CRUD,
  faculty: CRUD,
  courses: CRUD,
  schedule: CRUD,
  admissions: CRUD,
  grades: CRUD,
  announcements: CRUD,
  dailyReports: CRUD,
  commands: CRUD,
  workSchedule: CRUD,
  cameras: CRUD,
  cameraView: ['view'],
  detection: ['view'],
  meetings: CRUD,
  emails: CRUD,
};

const preset = (fn) =>
  Object.fromEntries(Object.entries(PAGES).map(([page, actions]) => [page, Object.fromEntries(CRUD.map((a) => [a, actions.includes(a) && fn(a)]))]));

const PRESETS = {
  full: () => preset(() => true),
  readOnly: () => preset((a) => a === 'view'),
  none: () => preset(() => false),
};

/** Keeps only known pages/actions as booleans; any granted action implies view. */
function normalizePermissions(input) {
  const out = PRESETS.none();
  if (!input || typeof input !== 'object') return out;
  Object.entries(PAGES).forEach(([page, actions]) => {
    const given = input[page] || {};
    actions.forEach((a) => {
      out[page][a] = given[a] === true;
    });
    if (actions.some((a) => a !== 'view' && out[page][a])) out[page].view = true;
  });
  return out;
}

/** Whether `user` may perform `action` on `page`. Accounts created before permissions existed keep full access. */
function can(user, page, action = 'view') {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.permissions) return true;
  return user.permissions[page]?.[action] === true;
}

const METHOD_ACTION = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };

const forbidden = (res) => res.status(403).json({ message: 'You do not have permission to perform this action' });

/**
 * Express middleware: checks the page permission for the request's HTTP method.
 * `overrides` remaps methods, e.g. { POST: 'edit' } for adding a log entry to an existing record.
 */
const permit = (page, overrides = {}) => (req, res, next) => {
  const action = overrides[req.method] || METHOD_ACTION[req.method] || 'view';
  return can(req.user, page, action) ? next() : forbidden(res);
};

/** Passes when the user can view any of the given pages. */
const permitAny = (pages) => (req, res, next) => (pages.some((p) => can(req.user, p, 'view')) ? next() : forbidden(res));

module.exports = { PAGES, PRESETS, normalizePermissions, can, permit, permitAny };
