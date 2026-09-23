const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../utils/constants');

const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    major: { type: String, enum: DEPARTMENTS, required: true },
    level: { type: Number, min: 1, max: 4, default: 1 }, // shown as "Grade" in the UI
    status: { type: String, enum: ['Active', 'Inactive', 'Graduated', 'Suspended'], default: 'Active' },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    birthDate: Date,
    enrollDate: { type: Date, default: Date.now },
    photo: String, // data URL
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
