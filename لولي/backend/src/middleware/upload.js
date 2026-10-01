'use strict';

const multer = require('multer');
const sharp = require('sharp');

// Multer: store file in memory buffer (no disk I/O)
const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('الملف يجب أن يكون صورة (JPEG، PNG، WebP، وغيرها)'), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max upload
});

/**
 * Compress and convert image buffer to WebP.
 * Quality is chosen based on original file size:
 *   > 2 MB  → quality 70
 *   > 1 MB  → quality 75
 *   > 500 KB → quality 80
 *   else    → quality 85
 */
async function processImage(buffer, originalSize) {
  let quality = 85;
  if (originalSize > 2 * 1024 * 1024) quality = 70;
  else if (originalSize > 1 * 1024 * 1024) quality = 75;
  else if (originalSize > 500 * 1024) quality = 80;

  return sharp(buffer)
    .rotate()            // auto-fix EXIF orientation
    .webp({ quality })   // convert to WebP
    .toBuffer();
}

module.exports = { upload, processImage };
