'use strict';

/**
 * Upload guard for 3D assets used by WebAR Virtual Try-On.
 *
 * Browsers happily report whatever MIME type they like for .glb/.usdz, and
 * an attacker controls it outright — so the extension and the client MIME are
 * treated as hints only. The real gate is the magic bytes at the head of the
 * buffer, checked after multer has the file in memory.
 */

const multer = require('multer');

/* Keep models small enough to load over mobile data. A try-on asset that
   takes 30s to arrive is a try-on asset nobody waits for. */
const LIMITS = {
  glb:  15 * 1024 * 1024,   // 15 MB
  usdz: 25 * 1024 * 1024,   // 25 MB — USDZ is an uncompressed zip container
};

const ALLOWED_EXT = {
  model:    ['.glb', '.gltf'],
  iosModel: ['.usdz'],
};

const extOf = name => {
  const i = String(name || '').lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};

/**
 * Verify the bytes actually match the claimed format.
 *   GLB  — "glTF" magic, little-endian version 2
 *   glTF — JSON document, must parse and declare an asset version
 *   USDZ — zip container ("PK\x03\x04"), the format Quick Look expects
 */
function verifySignature(buffer, kind) {
  if (!buffer || buffer.length < 8) {
    return { ok: false, message: 'الملف فارغ أو تالف' };
  }

  if (kind === 'iosModel') {
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b
      && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
    return isZip
      ? { ok: true, detected: 'usdz' }
      : { ok: false, message: 'ملف USDZ غير صالح — يجب أن يكون حاوية USDZ حقيقية' };
  }

  // GLB: 12-byte header — magic 'glTF', uint32 version, uint32 length
  if (buffer.slice(0, 4).toString('ascii') === 'glTF') {
    const version = buffer.readUInt32LE(4);
    if (version !== 2) {
      return { ok: false, message: `إصدار GLB غير مدعوم (${version}) — استخدم glTF 2.0` };
    }
    const declared = buffer.readUInt32LE(8);
    // A mismatch means a truncated or doctored upload.
    if (declared !== buffer.length) {
      return { ok: false, message: 'ملف GLB تالف — الحجم المعلن لا يطابق الملف' };
    }
    return { ok: true, detected: 'glb' };
  }

  // .gltf — plain JSON. Parse it rather than trusting the extension.
  const head = buffer.slice(0, 4096).toString('utf8').trimStart();
  if (head.startsWith('{')) {
    try {
      const json = JSON.parse(buffer.toString('utf8'));
      if (!json.asset || !json.asset.version) {
        return { ok: false, message: 'ملف glTF غير صالح — لا يحتوي على asset.version' };
      }
      if (!String(json.asset.version).startsWith('2')) {
        return { ok: false, message: `إصدار glTF غير مدعوم (${json.asset.version}) — استخدم 2.0` };
      }
      // A .gltf referencing external .bin/textures would 404 in the browser.
      const externalBuffers = (json.buffers || []).filter(b => b.uri && !b.uri.startsWith('data:'));
      if (externalBuffers.length) {
        return {
          ok: false,
          message: 'ملف glTF يعتمد على ملفات خارجية — صدّره كـ GLB مدمج بدل ذلك',
        };
      }
      return { ok: true, detected: 'gltf' };
    } catch {
      return { ok: false, message: 'ملف glTF غير صالح — تعذّر قراءة محتواه' };
    }
  }

  return { ok: false, message: 'صيغة الملف غير مدعومة — ارفع GLB أو glTF 2.0' };
}

/** multer instance for a given asset kind. */
function modelUploader(kind) {
  const allowed = ALLOWED_EXT[kind] || [];
  const maxSize = kind === 'iosModel' ? LIMITS.usdz : LIMITS.glb;

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: 1 },
    fileFilter: (req, file, cb) => {
      const ext = extOf(file.originalname);
      if (!allowed.includes(ext)) {
        return cb(new Error(`الامتداد غير مدعوم — المسموح: ${allowed.join('، ')}`), false);
      }
      cb(null, true);
    },
  }).single('model');
}

/**
 * Wrap the multer handler so size/format failures come back as clean Arabic
 * JSON instead of an unhandled error bubbling to the generic 500 handler.
 */
function handleModelUpload(kind) {
  const uploader = modelUploader(kind);
  const maxSize = kind === 'iosModel' ? LIMITS.usdz : LIMITS.glb;

  return (req, res, next) => {
    uploader(req, res, err => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? `حجم الملف كبير — الحد الأقصى ${Math.round(maxSize / 1024 / 1024)} ميغابايت`
          : err.message || 'فشل رفع الملف';
        return res.status(400).json({ success: false, message });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'لا يوجد ملف في الطلب' });
      }

      const check = verifySignature(req.file.buffer, kind);
      if (!check.ok) {
        return res.status(400).json({ success: false, message: check.message });
      }

      req.modelKind = kind;
      req.modelFormat = check.detected;
      next();
    });
  };
}

module.exports = { handleModelUpload, verifySignature, LIMITS, ALLOWED_EXT };
