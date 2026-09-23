require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sist',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

if (!process.env.JWT_SECRET) {
  console.warn('[config] JWT_SECRET is not set; using an insecure development secret.');
}

module.exports = config;
