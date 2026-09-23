const config = require('./config');
const connectDB = require('./config/db');
const app = require('./app');

connectDB()
  .then(() => {
    app.listen(config.port, () => console.log(`[api] listening on http://localhost:${config.port}`));
  })
  .catch((err) => {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  });
