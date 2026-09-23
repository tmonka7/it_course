const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../utils/constants');

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, enum: DEPARTMENTS, required: true },
    credits: { type: Number, min: 0, max: 10, default: 3 },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    description: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Course', courseSchema);
