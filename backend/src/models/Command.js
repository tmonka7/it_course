const mongoose = require('mongoose');

// An official directive issued to a staff member.
const commandSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: String,
    priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    issuer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    issuedBy: { type: String, trim: true }, // issuer's display name
    dueDate: Date,
    status: { type: String, enum: ['Issued', 'In Progress', 'Completed', 'Cancelled'], default: 'Issued' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Command', commandSchema);
