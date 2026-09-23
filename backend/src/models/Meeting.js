const crypto = require('crypto');
const mongoose = require('mongoose');

const LETTERS = 'abcdefghijkmnopqrstuvwxyz'; // no "l" to avoid confusion with "1"/"I"
const randomCode = () => {
  const pick = (n) => Array.from(crypto.randomBytes(n), (b) => LETTERS[b % LETTERS.length]).join('');
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
};

const meetingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    code: { type: String, unique: true, trim: true, lowercase: true },
    description: String,
    scheduledAt: Date,
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hostName: String,
    status: { type: String, enum: ['Scheduled', 'Live', 'Ended'], default: 'Scheduled' },
    startedAt: Date,
    endedAt: Date,
  },
  { timestamps: true }
);

meetingSchema.pre('validate', async function assignCode() {
  if (this.code) return;
  for (let i = 0; i < 5; i += 1) {
    const code = randomCode();
    // eslint-disable-next-line no-await-in-loop
    if (!(await this.constructor.exists({ code }))) {
      this.code = code;
      return;
    }
  }
  throw new Error('Could not allocate a meeting code');
});

module.exports = mongoose.model('Meeting', meetingSchema);
