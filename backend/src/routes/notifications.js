const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/Notification');

// Per-user notification feed. Admin management (send / list / delete) is mounted separately via crud.
const router = express.Router();

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const filter = Notification.forUser(req.user);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const [items, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ ...filter, readBy: { $ne: req.user._id } }),
    ]);
    const me = String(req.user._id);
    res.json({
      unread,
      items: items.map(({ readBy, ...n }) => ({ ...n, read: readBy.some((id) => String(id) === me) })),
    });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany(Notification.forUser(req.user), { $addToSet: { readBy: req.user._id } });
    res.json({ success: true });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await Notification.updateOne(
      { _id: req.params.id, ...Notification.forUser(req.user) },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ success: true });
  })
);

module.exports = router;
