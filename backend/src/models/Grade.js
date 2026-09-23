const mongoose = require('mongoose');

function letterFor(score) {
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  return 'F';
}

const gradeSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    academicYear: { type: String, required: true, match: /^\d{4}-\d{4}$/ },
    semester: { type: String, enum: ['Fall', 'Spring', 'Summer'], required: true },
    score: { type: Number, min: 0, max: 100, required: true },
    grade: String,
    status: { type: String, enum: ['Passed', 'Failed'] },
  },
  { timestamps: true }
);

gradeSchema.index({ student: 1, course: 1, academicYear: 1, semester: 1 }, { unique: true });

gradeSchema.pre('validate', function derive() {
  if (typeof this.score === 'number') {
    this.grade = letterFor(this.score);
    this.status = this.score >= 60 ? 'Passed' : 'Failed';
  }
});

module.exports = mongoose.model('Grade', gradeSchema);
