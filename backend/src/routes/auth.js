const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password, remember } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await User.findOne({ username: String(username).toLowerCase().trim() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, {
      expiresIn: remember ? '7d' : '12h',
    });
    Activity.log(user.username, 'Signed in', user.name);
    return res.json({ token, user });
  })
);

router.get('/me', auth, (req, res) => res.json(req.user));

router.put(
  '/password',
  auth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword || ''))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    return res.json({ success: true });
  })
);

module.exports = router;
