'use strict';

const express = require('express');
const router = express.Router();
const { protect, requireStaff } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { uploadImage, deleteImage } = require('../controllers/uploadController');

// POST /api/upload  — upload one image (admin only)
router.post('/', protect, requireStaff, upload.single('image'), uploadImage);

// DELETE /api/upload  — delete image from Cloudinary (admin only)
router.delete('/', protect, requireStaff, deleteImage);

module.exports = router;
