const mongoose = require('mongoose');
const { PROGRAMS } = require('../utils/constants');

const admissionSchema = new mongoose.Schema(
  {
    applicationId: { type: String, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    program: { type: String, enum: PROGRAMS, required: true },
    appliedDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Pending', 'Accepted', 'Rejected'], default: 'Pending' },
    notes: String,
  },
  { timestamps: true }
);

admissionSchema.pre('validate', function assignId() {
  if (!this.applicationId) {
    const year = new Date().getFullYear();
    this.applicationId = `A${year}${Date.now().toString().slice(-5)}`;
  }
});

module.exports = mongoose.model('Admission', admissionSchema);
