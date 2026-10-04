'use strict';

const cloudinary = require('../config/cloudinary');
const { processImage } = require('../middleware/upload');


const redact = (value) => {
  let text = String(value || '');
  for (const secret of [
    process.env.CLOUDINARY_API_SECRET,
    process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_CLOUD_NAME,
  ]) {
    if (secret) text = text.split(String(secret)).join('[hidden]');
  }
  return text.replace(/api_secret=[^&\s]+/gi, 'api_secret=[hidden]').slice(0, 220);
};

const safeCloudinaryError = (err) => ({
  message: redact(err?.message || err?.error?.message || err || ''),
  httpCode: Number(err?.http_code || err?.status || 0) || null,
  name: String(err?.name || err?.error?.name || ''),
  code: String(err?.code || ''),
});

const uploadOptions = (folder) => ({
  folder,
  format: 'webp',
  resource_type: 'image',
  transformation: [{ quality: 'auto' }],
});

const uploadViaStream = (buffer, folder) => new Promise((resolve, reject) => {
  const uploadStream = cloudinary.uploader.upload_stream(
    uploadOptions(folder),
    (error, result) => error ? reject(error) : resolve(result)
  );
  uploadStream.on?.('error', reject);
  uploadStream.end(buffer);
});

const uploadViaDataUri = (buffer, folder) => {
  const dataUri = `data:image/webp;base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, uploadOptions(folder));
};


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
    // Re-read runtime credentials for every upload. This avoids false
    // "missing settings" errors on hosts that inject environment variables
    // when the app process starts/restarts.
    if (typeof cloudinary.refreshConfig === 'function') cloudinary.refreshConfig();

    const credentialState = cloudinary.__credentialsState || {};
    if (!credentialState.apiSecret) {
      return res.status(503).json({
        success: false,
        message: 'API Secret موجود في إعدادات Hostinger لكن لم يصل إلى عملية Node. جرّب حفظ المتغير من جديد أو أضف CLOUDINARY_URL.',
        diagnostic: {
          cloudName: Boolean(credentialState.cloudName),
          apiKey: Boolean(credentialState.apiKey),
          apiSecret: false,
          matchedKeys: credentialState.matchedKeys || {},
        },
      });
    }

    // Compress and convert to WebP
    const processedBuffer = await processImage(req.file.buffer, req.file.size);

    const tenant = String(req.get('X-Tenant') || '').toLowerCase();
    const folder = tenant === 'ajeena' ? 'ajeena/products' : 'luliz/products';

    // Primary path: stream upload. If Hostinger/network stream handling fails,
    // retry once using Cloudinary's supported base64 Data URI upload method.
    let result;
    let streamError = null;
    try {
      result = await uploadViaStream(processedBuffer, folder);
    } catch (err) {
      streamError = err;
      console.error('⚠️ Cloudinary stream upload failed, trying Data URI fallback:', safeCloudinaryError(err));

      try {
        result = await uploadViaDataUri(processedBuffer, folder);
        console.log('✅ Cloudinary Data URI fallback succeeded');
      } catch (fallbackError) {
        let pingError = null;
        let pingStatus = null;
        try {
          const ping = await cloudinary.api.ping();
          pingStatus = ping?.status || 'ok';
        } catch (err2) {
          pingError = err2;
        }

        const primary = safeCloudinaryError(streamError);
        const fallback = safeCloudinaryError(fallbackError);
        const ping = pingError ? safeCloudinaryError(pingError) : { message: pingStatus || 'ok' };

        const raw = fallback.message || primary.message || ping.message || '';
        const authError =
          [primary, fallback, ping].some(e =>
            Number(e.httpCode) === 401 ||
            /invalid.*key|unknown api key|authentication|signature/i.test(String(e.message || ''))
          );
        const cloudNameError =
          [primary, fallback, ping].some(e =>
            /cloud.?name|must supply cloud_name|unknown cloud/i.test(String(e.message || ''))
          );
        const networkError =
          [primary, fallback, ping].some(e =>
            /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(
              `${e.code || ''} ${e.message || ''}`
            )
          );

        let message = 'فشل رفع الصورة إلى Cloudinary.';
        if (authError) message = 'Cloudinary رفض بيانات الدخول (API Key / API Secret).';
        else if (cloudNameError) message = 'Cloudinary لم يتعرّف على Cloud Name.';
        else if (networkError) message = 'السيرفر غير قادر على الوصول إلى Cloudinary عبر الشبكة.';
        if (raw) message += ` السبب: ${raw}`;

        return res.status(502).json({
          success: false,
          message,
          diagnostic: {
            stream: primary,
            fallback,
            ping,
            credentials: cloudinary.__credentialsState || null,
          },
        });
      }
    }

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
    console.error('❌ خطأ في معالجة/رفع الصورة:', err);
    const safe = safeCloudinaryError(err);
    const sharpError = /unsupported|heif|heic|input buffer|Input file/i.test(safe.message);

    return res.status(500).json({
      success: false,
      message: sharpError
        ? 'تعذّر معالجة صيغة الصورة. استخدم JPG أو PNG أو WebP.'
        : `تعذّر تجهيز الصورة قبل الرفع${safe.message ? `: ${safe.message}` : ''}`,
      diagnostic: safe,
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

module.exports = { uploadImage, deleteImage };
