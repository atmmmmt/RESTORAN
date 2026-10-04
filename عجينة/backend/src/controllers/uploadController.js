'use strict';

const cloudinary = require('../config/cloudinary');
const { processImage } = require('../middleware/upload');
const { Readable } = require('stream');

/**
 * Upload a single image to Cloudinary.
 * POST /api/upload
 * Multipart: field name = "image"
 *
 * Flow:
 *   1. Receive file buffer from multer
 *   2. Compress + convert to WebP if large (via sharp)
 *   3. Upload buffer to Cloudinary via upload_stream
 *   4. Return { url, publicId }
 */
const uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'لا توجد صورة في الطلب' });
  }

  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({
        success: false,
        message: 'إعدادات رفع الصور غير مكتملة على السيرفر (Cloudinary)',
      });
    }

    // Compress and convert to WebP
    const processedBuffer = await processImage(req.file.buffer, req.file.size);

    // Upload to Cloudinary via stream
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'luliz/products',
          format: 'webp',
          resource_type: 'image',
          // Cloudinary-side optimisation as a fallback
          transformation: [{ quality: 'auto' }],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      // Pipe the processed buffer into the stream
      const readable = new Readable();
      readable.push(processedBuffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });

    const originalKB = Math.round(req.file.size / 1024);
    const processedKB = Math.round(processedBuffer.length / 1024);

    console.log(
      `📸 رُفعت صورة: ${req.file.originalname} | ` +
      `${originalKB} KB → ${processedKB} KB (WebP) | publicId: ${result.public_id}`
    );

    return res.status(200).json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      sizeKB: processedKB,
    });
  } catch (err) {
    console.error('❌ خطأ في رفع الصورة:', err);
    const sharpError = /unsupported|heif|heic|input buffer/i.test(String(err?.message || ''));
    return res.status(500).json({
      success: false,
      message: sharpError
        ? 'تعذّر معالجة صيغة الصورة. استخدم JPG أو PNG أو WebP.'
        : 'فشل رفع الصورة إلى التخزين. تحقق من إعدادات Cloudinary أو الاتصال وحاول مجدداً.',
    });
  }
};

/**
 * Delete an image from Cloudinary.
 * DELETE /api/upload
 * Body: { publicId: "luliz/products/abc123" }
 */
const deleteImage = async (req, res) => {
  const { publicId } = req.body;

  if (!publicId) {
    return res.status(400).json({ success: false, message: 'publicId مطلوب' });
  }

  // Skip deletion for emoji/non-cloudinary values
  if (!publicId.startsWith('luliz/')) {
    return res.status(200).json({ success: true, message: 'تم التخطي (ليست صورة Cloudinary)' });
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });

    if (result.result === 'ok' || result.result === 'not found') {
      console.log(`🗑️  صورة محذوفة من Cloudinary: ${publicId}`);
      return res.status(200).json({ success: true, message: 'تم حذف الصورة' });
    }

    throw new Error(`Cloudinary responded: ${result.result}`);
  } catch (err) {
    console.error('❌ خطأ في حذف الصورة:', err);
    return res.status(500).json({ success: false, message: 'فشل حذف الصورة' });
  }
};

/**
 * Remove one image, for callers that are not an HTTP handler.
 *
 * Deleting a category or replacing its picture has to clean up Cloudinary
 * too, and those paths have no res to write to — so the destroy lives here,
 * next to the upload that created the file, rather than being duplicated.
 *
 * Resolves either way: an image that cannot be deleted is litter on the
 * Cloudinary account, not a reason to fail the user's save.
 */
const destroy = async (publicId) => {
  // Emoji and seeded local paths are not Cloudinary assets.
  if (!publicId || !String(publicId).startsWith('luliz/')) return false;

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    return result.result === 'ok' || result.result === 'not found';
  } catch (err) {
    console.error('❌ تعذّر حذف الصورة:', publicId, err.message);
    return false;
  }
};

module.exports = { uploadImage, deleteImage, destroy };
