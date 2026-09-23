const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const Setting = require('../models/Setting');
const Activity = require('../models/Activity');
const { auth, requireRole } = require('../middleware/auth');

const EDITABLE = ['schoolName', 'logo', 'academicYear', 'timeZone', 'emailNotification', 'smsNotification'];

// Unauthenticated: branding shown on the login page.
const publicRouter = express.Router();
publicRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const s = await Setting.getSingleton();
    res.json({ schoolName: s.schoolName, logo: s.logo });
  })
);

const router = express.Router();
router.use(auth);

router.get(
  '/',
  asyncHandler(async (req, res) => res.json(await Setting.getSingleton()))
);

router.put(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const s = await Setting.getSingleton();
    EDITABLE.forEach((k) => {
      if (k in req.body) s[k] = req.body[k];
    });
    await s.save();
    Activity.log(req.user.username, 'Updated system settings', s.schoolName);
    res.json(s);
  })
);

// Exports every collection (except user passwords) as a single JSON download.
router.get(
  '/backup',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const dump = {};
    await Promise.all(
      mongoose.modelNames().map(async (name) => {
        dump[name] = await mongoose.model(name).find().lean();
      })
    );
    (dump.User || []).forEach((u) => delete u.password);
    Activity.log(req.user.username, 'Downloaded backup', `${Object.keys(dump).length} collections`);
    res.setHeader('Content-Disposition', `attachment; filename="sist-backup-${Date.now()}.json"`);
    res.json({ exportedAt: new Date(), data: dump });
  })
);

module.exports = { publicRouter, router };
