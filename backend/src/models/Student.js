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
    // Registered face samples used by automated attendance: a 128-number SFace embedding computed in
    // the browser, plus a thumbnail. Not selected by default, so student lists carry no biometric data.
    faces: {
      type: [
        {
          descriptor: { type: [Number], required: true },
          image: String,
          // "Photo" samples are derived from the student's ID photo; "Camera" samples are captured live.
          source: { type: String, enum: ['Photo', 'Camera'], default: 'Camera' },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      select: false,
    },
    // How many samples `faces` holds. Kept alongside the samples because `faces` is not selected by
    // default, so a student list could not otherwise say who can be recognised.
    faceCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// `faces` is absent from documents loaded without it, so only recount when it was actually loaded.
studentSchema.pre('save', function syncFaceCount() {
  if (this.isModified('faces')) this.faceCount = this.faces.length;
});

studentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.faces; // never let face signatures ride along on a normal student response
    return ret;
  },
});

module.exports = mongoose.model('Student', studentSchema);
