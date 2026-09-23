const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');
const errorHandler = require('./middleware/error');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' })); // photos/logos are sent as data URLs
app.use(morgan('dev'));

app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// In production, serve the built frontend from the same origin.
const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
