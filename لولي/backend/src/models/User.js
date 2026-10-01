'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'الاسم مطلوب'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'البريد الإلكتروني مطلوب'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'صيغة البريد الإلكتروني غير صحيحة'],
    },
    phone: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة'],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['admin', 'supervisor', 'viewer', 'cashier'],
      default: 'supervisor',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (email unique index already created by unique:true in schema definition)

// Virtual: password setter (hashed on save).
// The plaintext is parked in passwordHash as well, because Mongoose runs
// validation before our pre-save hook — leaving the field empty would fail
// the `required` check on a brand-new user before hashing ever happens.
// The pre-save hook below detects the un-hashed value and replaces it.
userSchema.virtual('password').set(function (plainText) {
  this._password = plainText;
  if (plainText) this.passwordHash = plainText;
});

// Pre-save hook: hash password if modified
userSchema.pre('save', async function (next) {
  // If password virtual was set
  if (this._password) {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this._password, salt);
    delete this._password;
  } else if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    // If passwordHash was set directly (plain text)
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  }
  next();
});

// Instance method: compare password
userSchema.methods.comparePassword = async function (plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

// Static method: find by email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Remove sensitive fields from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
