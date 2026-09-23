const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const Command = require('../models/Command');
const CommandLog = require('../models/CommandLog');
const Activity = require('../models/Activity');
const { notifyParticipants } = require('../services/commandEvents');

const router = express.Router();
const OPEN = ['Issued', 'In Progress'];

// Day bounds from ?dateFrom=&dateTo= (the client's local day, preferred), else ?date=YYYY-MM-DD (server-local day).
function dayRange(value, query = {}) {
  const from = new Date(typeof query.dateFrom === 'string' ? query.dateFrom : NaN);
  const to = new Date(typeof query.dateTo === 'string' ? query.dateTo : NaN);
  if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) return { start: from, end: to };
  const m = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  const start = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
}

/**
 * GET /command-logs?date=YYYY-MM-DD[&type=Progress]
 * Every log entry of that day, plus the open commands that have no progress entry yet.
 */
router.get(
  '/command-logs',
  asyncHandler(async (req, res) => {
    const { start, end } = dayRange(req.query.date, req.query);
    const filter = { createdAt: { $gte: start, $lt: end } };
    if (typeof req.query.type === 'string' && req.query.type) filter.type = req.query.type;
    const items = await CommandLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate({ path: 'command', select: 'title status priority assignee', populate: { path: 'assignee', select: 'name' } });

    const logged = await CommandLog.distinct('command', { type: 'Progress', createdAt: { $gte: start, $lt: end } });
    const missing = await Command.find({ status: { $in: OPEN }, createdAt: { $lt: end }, _id: { $nin: logged } })
      .select('title priority status assignee dueDate')
      .populate('assignee', 'name');

    res.json({ items, loggedCommandIds: logged, missing });
  })
);

router.get(
  '/commands/:id/logs',
  asyncHandler(async (req, res) => {
    res.json(await CommandLog.find({ command: req.params.id }).sort({ createdAt: -1 }).limit(500));
  })
);

/** POST /commands/:id/logs { note, status? } - adds a daily progress entry, optionally changing the status. */
router.post(
  '/commands/:id/logs',
  asyncHandler(async (req, res) => {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!note) return res.status(400).json({ message: 'A progress note is required' });

    const command = await Command.findById(req.params.id);
    if (!command) return res.status(404).json({ message: 'Command not found' });

    const { status } = req.body;
    const statusChanged = typeof status === 'string' && status && status !== command.status;
    const previous = command.status;
    if (statusChanged) {
      command.status = status;
      await command.save();
    }

    const log = await CommandLog.create({
      command: command._id,
      type: 'Progress',
      note: statusChanged ? `${note}\n(Status: ${previous} → ${command.status})` : note,
      status: command.status,
      user: req.user._id,
      author: req.user.name,
    });
    Activity.log(req.user.username, 'Logged command progress', command.title);
    notifyParticipants(command, req.user, {
      title: `Progress on: ${command.title}`,
      message: `${req.user.name}: ${note}${statusChanged ? ` (now ${command.status})` : ''}`,
      type: command.status === 'Completed' ? 'Success' : 'Info',
    });
    res.status(201).json(log);
  })
);

module.exports = router;
