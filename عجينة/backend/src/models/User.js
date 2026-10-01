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
      enum: ['admin', 'supervisor', 'cashier', 'kitchen', 'viewer', 'americans_manager'],
      default: 'supervisor',
    },
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
      default: null,
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

userSchema.virtual('password').set(function (plainText) {
  this._password = plainText;
  if (plainText) this.passwordHash = plainText;
});

userSchema.pre('save', async function (next) {
  if (this._password) {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this._password, salt);
    delete this._password;
  } else if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  }
  next();
});

userSchema.methods.comparePassword = async function (plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
