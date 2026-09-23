const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { PRESETS } = require('../utils/permissions');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 6, select: false },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    // Page permissions for staff (see utils/permissions.js). Ignored for admins.
    permissions: { type: mongoose.Schema.Types.Mixed },
    language: { type: String, enum: ['en', 'zh', 'ja'], default: 'en' },
    // Profile details the user maintains on the My Profile page.
    phone: { type: String, trim: true },
    title: { type: String, trim: true }, // job title
    department: { type: String, trim: true },
    bio: { type: String, trim: true },
    avatar: String, // small image as a data URL
    // Registered face samples: a 128-number SFace embedding (computed in the browser) plus a thumbnail.
    // Not selected by default, so user lists and /auth/me never carry biometric data.
    faces: {
      type: [
        {
          descriptor: { type: [Number], required: true },
          image: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      select: false,
    },
  },
  { timestamps: true }
);

// New staff accounts start read-only; an administrator grants more in User Management.
userSchema.pre('save', function defaultPermissions() {
  if (this.isNew && this.role === 'staff' && !this.permissions) this.permissions = PRESETS.readOnly();
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.faces;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
