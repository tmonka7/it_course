const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../utils/constants');

const dailyReportSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    reporter: { type: String, trim: true },
    department: { type: String, enum: [...DEPARTMENTS, 'Administration'] },
    workDone: { type: String, required: true },
    issues: String,
    planTomorrow: String,
    status: { type: String, enum: ['Draft', 'Submitted', 'Reviewed'], default: 'Draft' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyReport', dailyReportSchema);
