const Command = require('../models/Command');
const CommandLog = require('../models/CommandLog');
const Notification = require('../models/Notification');

const REMINDER_TITLE = 'Daily command log missing';

/**
 * Once a day, after `hour` (server time), reminds each assignee of an open command
 * that has no progress entry for today. Safe to run repeatedly: a command is reminded at most once a day.
 */
async function sendReminders() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const logged = await CommandLog.distinct('command', { type: { $in: ['Progress', 'Reminder'] }, createdAt: { $gte: start } });
  const open = await Command.find({ status: { $in: ['Issued', 'In Progress'] }, assignee: { $ne: null }, _id: { $nin: logged } });

  for (const command of open) {
    await CommandLog.create({ command: command._id, type: 'Reminder', note: 'No progress logged today; assignee reminded.', status: command.status, author: 'system' });
    await Notification.notify({
      title: REMINDER_TITLE,
      message: `Please log today's progress for "${command.title}".`,
      type: 'Warning',
      recipient: command.assignee,
      link: `/commands?open=${command._id}`,
      createdBy: 'system',
    });
  }
  return open.length;
}

function startCommandReminder(hour) {
  if (!(hour >= 0 && hour <= 23)) return;
  const tick = () => {
    if (new Date().getHours() < hour) return;
    sendReminders()
      .then((n) => n && console.log(`[commands] sent ${n} daily log reminder(s)`))
      .catch((err) => console.error('[commands] reminder failed:', err.message));
  };
  setInterval(tick, 10 * 60 * 1000).unref();
  tick();
}

module.exports = { startCommandReminder, sendReminders };
