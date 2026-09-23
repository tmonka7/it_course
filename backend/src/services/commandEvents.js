const CommandLog = require('../models/CommandLog');
const Notification = require('../models/Notification');
const User = require('../models/User');

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'none');

// Fields whose changes are written to the command log, with how to display a value.
const TRACKED = {
  title: { label: 'Title', show: (v) => v || '-' },
  status: { label: 'Status', show: (v) => v || '-' },
  priority: { label: 'Priority', show: (v) => v || '-' },
  dueDate: { label: 'Due date', show: day },
  content: { label: 'Details', show: () => 'edited' },
};

async function userName(id) {
  if (!id) return 'nobody';
  const u = await User.findById(id).select('name');
  return u?.name || 'unknown user';
}

/** Human-readable list of what changed between two versions of a command. */
async function describeChanges(before, doc) {
  const changes = [];
  Object.entries(TRACKED).forEach(([field, { label, show }]) => {
    const a = before[field] instanceof Date ? before[field].getTime() : before[field];
    const b = doc[field] instanceof Date ? doc[field].getTime() : doc[field];
    if (String(a ?? '') !== String(b ?? '')) {
      changes.push(field === 'content' ? 'Details edited' : `${label}: ${show(before[field])} → ${show(doc[field])}`);
    }
  });
  const assigneeBefore = before.assignee && String(before.assignee);
  const assigneeAfter = doc.assignee && String(doc.assignee._id || doc.assignee);
  if (assigneeBefore !== assigneeAfter) {
    changes.push(`Assignee: ${await userName(assigneeBefore)} → ${await userName(assigneeAfter)}`);
  }
  return changes;
}

/** Notifies the assignee and the issuer of a command, except the person who made the change. */
function notifyParticipants(doc, actor, { title, message, type = 'Info' }) {
  const recipients = new Set([doc.assignee, doc.issuer].filter(Boolean).map((id) => String(id._id || id)));
  recipients.delete(String(actor._id));
  recipients.forEach((recipient) =>
    Notification.notify({ title, message, type, recipient, link: `/commands?open=${doc._id}`, createdBy: actor.username })
  );
}

/** crud afterSave hook for commands: writes the log entry and sends notifications. */
async function onCommandSaved(doc, req, before) {
  const urgent = doc.priority === 'Urgent' || doc.priority === 'High';
  if (!before) {
    await CommandLog.create({ command: doc._id, type: 'Created', note: 'Command issued', status: doc.status, user: req.user._id, author: req.user.name });
    notifyParticipants(doc, req.user, {
      title: `New command: ${doc.title}`,
      message: `${doc.priority} priority${doc.dueDate ? `, due ${day(doc.dueDate)}` : ''}. Issued by ${req.user.name}.`,
      type: urgent ? 'Warning' : 'Info',
    });
    return;
  }
  const changes = await describeChanges(before, doc);
  if (!changes.length) return;
  const note = changes.join('; ');
  await CommandLog.create({ command: doc._id, type: 'Update', note, status: doc.status, user: req.user._id, author: req.user.name });
  notifyParticipants(doc, req.user, {
    title: `Command updated: ${doc.title}`,
    message: `${req.user.name}: ${note}`,
    type: doc.status === 'Completed' ? 'Success' : urgent ? 'Warning' : 'Info',
  });
}

module.exports = { onCommandSaved, notifyParticipants };
