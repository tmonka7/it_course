const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const Command = require('../models/Command');
const CommandLog = require('../models/CommandLog');
const Activity = require('../models/Activity');
const { notifyParticipants } = require('../services/commandEvents');

const MAX_FILES_PER_REQUEST = 10;
const MAX_ATTACHMENTS = 30;

fs.mkdirSync(config.uploadDir, { recursive: true });

// Files get random names on disk; the original name is kept in the database and restored on download.
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).slice(0, 12)}`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
});

// Browsers send UTF-8 names but multipart parsing reads them as latin1.
const originalName = (file) => Buffer.from(file.originalname, 'latin1').toString('utf8');

const removeFiles = (names) => names.forEach((n) => fs.unlink(path.join(config.uploadDir, n), () => {}));

const router = express.Router();

async function findCommand(id) {
  const command = await Command.findById(id);
  if (!command) throw Object.assign(new Error('Work order not found'), { status: 404 });
  return command;
}

/** POST /commands/:id/attachments (multipart, field "files") */
router.post(
  '/commands/:id/attachments',
  (req, res, next) =>
    upload.array('files', MAX_FILES_PER_REQUEST)(req, res, (err) => {
      if (!err) return next();
      const message = err.code === 'LIMIT_FILE_SIZE' ? `Each file must be ${config.maxUploadMb} MB or smaller` : err.message;
      return res.status(400).json({ message });
    }),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    let command;
    try {
      command = await findCommand(req.params.id);
    } catch (err) {
      removeFiles(files.map((f) => f.filename));
      throw err;
    }
    if (!files.length) return res.status(400).json({ message: 'No files received' });
    if (command.attachments.length + files.length > MAX_ATTACHMENTS) {
      removeFiles(files.map((f) => f.filename));
      return res.status(400).json({ message: `A work order can have at most ${MAX_ATTACHMENTS} attachments` });
    }

    const added = files.map((f) => ({ name: originalName(f), file: f.filename, size: f.size, type: f.mimetype, uploadedBy: req.user.name }));
    command.attachments.push(...added);
    await command.save();

    const names = added.map((a) => a.name).join(', ');
    await CommandLog.create({ command: command._id, type: 'Update', note: `Attached: ${names}`, status: command.status, user: req.user._id, author: req.user.name });
    Activity.log(req.user.username, 'Attached files to work order', `${command.title}: ${names}`);
    notifyParticipants(command, req.user, { title: `New attachment: ${command.title}`, message: `${req.user.name} attached ${names}.` });

    return res.status(201).json(command.attachments);
  })
);

/** GET /commands/:id/attachments/:attachmentId - downloads with the original file name. */
router.get(
  '/commands/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const command = await findCommand(req.params.id);
    const att = command.attachments.id(req.params.attachmentId);
    if (!att) return res.status(404).json({ message: 'Attachment not found' });
    const file = path.join(config.uploadDir, path.basename(att.file));
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'The file is missing on the server' });
    return res.download(file, att.name);
  })
);

router.delete(
  '/commands/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const command = await findCommand(req.params.id);
    const att = command.attachments.id(req.params.attachmentId);
    if (!att) return res.status(404).json({ message: 'Attachment not found' });
    att.deleteOne();
    await command.save();
    removeFiles([path.basename(att.file)]);
    await CommandLog.create({ command: command._id, type: 'Update', note: `Removed attachment: ${att.name}`, status: command.status, user: req.user._id, author: req.user.name });
    return res.json(command.attachments);
  })
);

module.exports = { router, removeFiles };
