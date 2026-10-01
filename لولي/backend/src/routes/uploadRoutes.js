'use strict';

const express = require('express');
const router = express.Router();
const { protect, blockCashier } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { uploadImage, deleteImage } = require('../controllers/uploadController');

// POST /api/upload  — upload one image (admin/supervisor only)
router.post('/', protect, blockCashier, upload.single('image'), uploadImage);

// DELETE /api/upload  — delete image from Cloudinary (admin/supervisor only)
router.delete('/', protect, blockCashier, deleteImage);

module.exports = router;
