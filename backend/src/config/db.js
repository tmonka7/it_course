const mongoose = require('mongoose');
const config = require('./index');

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri);
  console.log(`[db] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
}

module.exports = connectDB;
