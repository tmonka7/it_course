// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join('; ') });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  }
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || err.keyPattern || {}).join(', ');
    return res.status(409).json({ message: `A record with the same ${fields} already exists` });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({ message: status >= 500 ? 'Internal server error' : err.message });
};
