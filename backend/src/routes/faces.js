const express = require('express');
const User = require('../models/User');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const { requireRole } = require('../middleware/auth');

/**
 * /faces - the registry the AI Detection page matches faces against (mounted behind the "detection" permission).
 * Recognition itself runs in the viewer's browser; this only hands out the stored embeddings.
 */
const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await User.find({ status: 'Active', 'faces.0': { $exists: true } })
      .select('name username avatar faces')
      .sort({ name: 1 })
      .lean();
    return res.json(
      users.map((u) => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        descriptors: u.faces.map((f) => f.descriptor),
      }))
    );
  })
);

/** DELETE /faces/:userId - an administrator clears someone's face registration. */
router.delete(
  '/:userId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.userId, { $set: { faces: [] } });
    if (!user) return res.status(404).json({ message: 'Record not found' });
    Activity.log(req.user.username, 'Removed face registration', user.name);
    return res.json({ success: true });
  })
);

module.exports = router;
