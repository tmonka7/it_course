const fs = require('fs');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const config = require('./config');
const connectDB = require('./config/db');
const app = require('./app');
const attachMeetings = require('./realtime/meetings');
const Camera = require('./models/Camera');
const mediamtx = require('./services/mediamtx');
const { startCommandReminder } = require('./services/commandReminder');

function createServer() {
  if (config.ssl.key && config.ssl.cert) {
    return https.createServer({ key: fs.readFileSync(config.ssl.key), cert: fs.readFileSync(config.ssl.cert) }, app);
  }
  return http.createServer(app);
}

connectDB()
  .then(() => {
    const server = createServer();
    const io = new Server(server, { cors: { origin: config.corsOrigin } });
    attachMeetings(io);

    server.listen(config.port, () => {
      const scheme = server instanceof https.Server ? 'https' : 'http';
      console.log(`[api] listening on ${scheme}://localhost:${config.port}`);
    });

    mediamtx.syncAll(Camera).catch((err) => console.warn('[mediamtx] initial sync failed:', err.message));
    startCommandReminder(config.commandReminderHour);
  })
  .catch((err) => {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  });
