const mongoose = require('mongoose');
const { DEPARTMENTS, POSITIONS } = require('../utils/constants');

const facultySchema = new mongoose.Schema(
  {
    facultyId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, enum: DEPARTMENTS, required: true },
    position: { type: String, enum: POSITIONS, required: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    status: { type: String, enum: ['Active', 'On Leave', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Faculty', facultySchema);
