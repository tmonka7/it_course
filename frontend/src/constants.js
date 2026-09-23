import { t } from './i18n';

export const DEPARTMENTS = [
  'Computer Science',
  'Software Engineering',
  'Information Systems',
  'Data Science',
  'Cyber Security',
];

export const PROGRAMS = [
  "Bachelor's in CS",
  "Bachelor's in SE",
  "Bachelor's in IS",
  "Bachelor's in DS",
  "Master's in CS",
  "Master's in SE",
  "Master's in IS",
  'PhD in CS',
];

export const POSITIONS = ['Professor', 'Associate Prof.', 'Assistant Prof.', 'Lecturer'];

export const SEMESTERS = ['Fall', 'Spring', 'Summer'];

// Class periods; the index is stored as `period` on schedule slots.
export const PERIODS = [
  '08:00 - 09:00',
  '09:10 - 10:10',
  '10:30 - 11:30',
  '11:40 - 12:40',
  '13:40 - 14:40',
  '14:50 - 15:50',
  '16:00 - 17:00',
  '17:10 - 18:10',
];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const academicYears = (count = 5) => {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => `${start - i}-${start - i + 1}`);
};

// Values stay English (they are what the API stores); labels follow the interface language.
export const toOptions = (list) => list.map((v) => ({ label: t(v), value: v }));

export const DEPARTMENT_COLORS = {
  'Computer Science': '#1677ff',
  'Software Engineering': '#13c2c2',
  'Information Systems': '#fa8c16',
  'Data Science': '#722ed1',
  'Cyber Security': '#eb2f96',
  Others: '#bfbfbf',
};
