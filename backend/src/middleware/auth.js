const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.id);
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ message: 'Account is not active' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action' });
  }
  return next();
};

module.exports = { auth, requireRole };
