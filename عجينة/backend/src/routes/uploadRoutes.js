'use strict';

const express = require('express');
const router = express.Router();
const { protect, requireStaff } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { uploadImage, deleteImage } = require('../controllers/uploadController');

const receiveImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'حجم الصورة أكبر من 10 ميغابايت' });
    }
    return res.status(400).json({
      success: false,
      message: err.message || 'تعذّر قراءة ملف الصورة',
    });
  });
};

// POST /api/upload  — upload one image (admin only)
router.post('/', protect, requireStaff, receiveImage, uploadImage);

// DELETE /api/upload  — delete image from Cloudinary (admin only)
router.delete('/', protect, requireStaff, deleteImage);

module.exports = router;
