'use strict';

/**
 * WebAR Product Virtual Try-On — admin + public API.
 *
 * Mounted at /api/products/:productId/virtual-try-on
 * (mergeParams pulls :productId down from the parent router).
 *
 * Reads are public so the storefront can decide whether to show a try-on
 * button without authenticating. Every write is admin-only, rate limited,
 * and recorded in the audit log.
 */

const router = require('express').Router({ mergeParams: true });
const rateLimit = require('express-rate-limit');
const { Readable } = require('stream');
const mongoose = require('mongoose');

const { protect, requireAdmin } = require('../middleware/auth');
const { handleModelUpload } = require('../middleware/modelUpload');
const cloudinary = require('../config/cloudinary');
const Product = require('../models/Product');
const { TRY_ON_TYPES, BODY_TRACKED_TYPES, SPACE_TYPES } = require('../models/schemas/virtualTryOnSchema');
const cacheService = require('../services/cacheService');

const FOLDER = 'luliz/virtual-try-on';

/* Uploading 3D assets is expensive on bandwidth and Cloudinary quota. */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات رفع كثيرة — انتظر قليلاً ثم أعد المحاولة' },
});

/* ── helpers ─────────────────────────────────────────────── */

const isValidId = id => mongoose.isValidObjectId(id);

async function findProduct(req, res) {
  if (!isValidId(req.params.productId)) {
    res.status(400).json({ success: false, message: 'معرّف المنتج غير صحيح' });
    return null;
  }
  const product = await Product.findById(req.params.productId);
  if (!product) {
    res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    return null;
  }
  return product;
}

/** Product edits invalidate the cached public menu payloads. */
function bustProductCaches() {
  cacheService.del('products:public');
  cacheService.del('products:today');
}

/**
 * Admin actions on 3D assets are worth a trail — models are replaced in
 * place and a bad upload is otherwise hard to attribute after the fact.
 */
function audit(req, action, detail) {
  console.log(
    `[VTO-AUDIT] ${new Date().toISOString()} user=${req.user?.email || 'unknown'} `
    + `product=${req.params.productId} action=${action} ${detail || ''}`
  );
}

/** Remove a previously stored asset; never let cleanup failure break a request. */
async function destroyAsset(publicId, resourceType = 'raw') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn(`⚠️  VTO: تعذّر حذف الملف القديم ${publicId}: ${err.message}`);
  }
}

function uploadBuffer(buffer, { folder, publicId, resourceType = 'raw', format }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: resourceType, format, overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

const clamp = (n, lo, hi) => Math.min(Math.max(Number(n), lo), hi);

/** Coerce an admin-supplied vector into finite numbers within sane bounds. */
function sanitizeVec3(input, fallback, limit = 1000) {
  const out = { ...fallback };
  if (!input || typeof input !== 'object') return out;
  for (const axis of ['x', 'y', 'z']) {
    if (input[axis] !== undefined) {
      const v = Number(input[axis]);
      out[axis] = Number.isFinite(v) ? clamp(v, -limit, limit) : fallback[axis];
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════
   GET — public. Returns only what the storefront needs.
   ══════════════════════════════════════════════════════════ */
router.get('/', async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  const vto = product.virtualTryOn || {};
  const viewable = !!(vto.enabled && vto.type !== 'none' && vto.status === 'ready' && vto.model3DUrl);

  res.json({
    success: true,
    productId: product._id,
    productName: product.name,
    virtualTryOn: {
      enabled: !!vto.enabled,
      type: vto.type || 'none',
      status: vto.status || 'draft',
      isViewable: viewable,
      // Tells the client which bundle to lazy-load — body tracking or space AR.
      mode: BODY_TRACKED_TYPES.includes(vto.type) ? 'body'
        : SPACE_TYPES.includes(vto.type) ? 'space' : 'none',
      model3DUrl:      vto.model3DUrl || '',
      iosModelUrl:     vto.iosModelUrl || '',
      previewImageUrl: vto.previewImageUrl || '',
      scale:          vto.scale ?? 1,
      positionOffset: vto.positionOffset || { x: 0, y: 0, z: 0 },
      rotationOffset: vto.rotationOffset || { x: 0, y: 0, z: 0 },
      minimumScale:   vto.minimumScale ?? 0.1,
      maximumScale:   vto.maximumScale ?? 5,
      targetHand:        vto.targetHand || 'both',
      targetSide:        vto.targetSide || 'both',
      trackingSmoothing: vto.trackingSmoothing ?? 0.5,
      showShadow:            vto.showShadow !== false,
      enableOcclusion:       !!vto.enableOcclusion,
      allowManualAdjustment: vto.allowManualAdjustment !== false,
      placement: vto.placement || 'floor',
    },
  });
});

/* Everything below requires an authenticated admin. */
router.use(protect, requireAdmin);

/* ══════════════════════════════════════════════════════════
   PATCH — save calibration
   ══════════════════════════════════════════════════════════ */
router.patch('/', async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  const current = product.virtualTryOn || {};
  const b = req.body || {};

  if (b.type !== undefined && !TRY_ON_TYPES.includes(b.type)) {
    return res.status(400).json({ success: false, message: 'نوع التجربة غير صحيح' });
  }
  for (const [field, allowed] of [['targetHand', ['left', 'right', 'both']],
    ['targetSide', ['left', 'right', 'both']],
    ['placement', ['floor', 'wall']],
    ['status', ['draft', 'processing', 'ready', 'disabled']]]) {
    if (b[field] !== undefined && !allowed.includes(b[field])) {
      return res.status(400).json({ success: false, message: `قيمة ${field} غير صحيحة` });
    }
  }

  const next = {
    enabled: b.enabled !== undefined ? !!b.enabled : !!current.enabled,
    type:    b.type    !== undefined ? b.type : (current.type || 'none'),

    scale: b.scale !== undefined ? clamp(b.scale, 0.01, 100) : (current.scale ?? 1),
    positionOffset: sanitizeVec3(b.positionOffset, current.positionOffset || { x: 0, y: 0, z: 0 }),
    rotationOffset: sanitizeVec3(b.rotationOffset, current.rotationOffset || { x: 0, y: 0, z: 0 }, 360),
    minimumScale: b.minimumScale !== undefined ? clamp(b.minimumScale, 0.01, 100) : (current.minimumScale ?? 0.1),
    maximumScale: b.maximumScale !== undefined ? clamp(b.maximumScale, 0.01, 100) : (current.maximumScale ?? 5),

    targetHand: b.targetHand ?? current.targetHand ?? 'both',
    targetSide: b.targetSide ?? current.targetSide ?? 'both',
    trackingSmoothing: b.trackingSmoothing !== undefined
      ? clamp(b.trackingSmoothing, 0, 0.99) : (current.trackingSmoothing ?? 0.5),

    showShadow:            b.showShadow            !== undefined ? !!b.showShadow            : current.showShadow !== false,
    enableOcclusion:       b.enableOcclusion       !== undefined ? !!b.enableOcclusion       : !!current.enableOcclusion,
    allowManualAdjustment: b.allowManualAdjustment !== undefined ? !!b.allowManualAdjustment : current.allowManualAdjustment !== false,
    placement: b.placement ?? current.placement ?? 'floor',

    // Assets are only changed through the upload routes.
    model3DUrl: current.model3DUrl, model3DPublicId: current.model3DPublicId, model3DBytes: current.model3DBytes,
    iosModelUrl: current.iosModelUrl, iosModelPublicId: current.iosModelPublicId, iosModelBytes: current.iosModelBytes,
    previewImageUrl: current.previewImageUrl, previewImagePublicId: current.previewImagePublicId,

    lastCalibratedAt: new Date(),
    lastCalibratedBy: req.user._id,
  };

  if (next.minimumScale > next.maximumScale) {
    return res.status(400).json({ success: false, message: 'الحد الأدنى للحجم أكبر من الحد الأقصى' });
  }

  // Guard the one state that would ship a broken viewer to customers.
  if (b.status === 'ready' && !next.model3DUrl) {
    return res.status(400).json({ success: false, message: 'ارفع نموذج GLB أولاً قبل التفعيل' });
  }
  next.status = b.status ?? (next.model3DUrl ? (current.status === 'draft' ? 'draft' : current.status) : 'draft');

  product.virtualTryOn = next;
  await product.save();
  bustProductCaches();
  audit(req, 'calibration-updated', `type=${next.type} status=${next.status}`);

  res.json({ success: true, virtualTryOn: product.virtualTryOn, message: 'تم حفظ إعدادات التجربة' });
});

/* ══════════════════════════════════════════════════════════
   POST /model — upload GLB/glTF (?kind=ios for USDZ)
   ══════════════════════════════════════════════════════════ */
router.post(
  '/model',
  uploadLimiter,
  (req, res, next) => handleModelUpload(req.query.kind === 'ios' ? 'iosModel' : 'model')(req, res, next),
  async (req, res) => {
    const product = await findProduct(req, res);
    if (!product) return;

    const isIos = req.modelKind === 'iosModel';
    const vto = product.virtualTryOn || {};
    const publicId = `${product._id}-${isIos ? 'ios' : 'model'}-${Date.now()}`;

    let result;
    try {
      result = await uploadBuffer(req.file.buffer, {
        folder: FOLDER,
        publicId,
        resourceType: 'raw',
      });
    } catch (err) {
      audit(req, 'model-upload-failed', err.message);
      return res.status(502).json({ success: false, message: `فشل رفع الملف: ${err.message}` });
    }

    // Drop the file this one replaces so storage doesn't accumulate orphans.
    await destroyAsset(isIos ? vto.iosModelPublicId : vto.model3DPublicId);

    if (isIos) {
      vto.iosModelUrl = result.secure_url;
      vto.iosModelPublicId = result.public_id;
      vto.iosModelBytes = req.file.size;
    } else {
      vto.model3DUrl = result.secure_url;
      vto.model3DPublicId = result.public_id;
      vto.model3DBytes = req.file.size;
      // First model in — move out of draft, but let the admin flip it live.
      if (vto.status === 'draft') vto.status = 'processing';
    }

    product.virtualTryOn = vto;
    await product.save();
    bustProductCaches();
    audit(req, isIos ? 'usdz-uploaded' : 'model-uploaded', `${Math.round(req.file.size / 1024)}KB format=${req.modelFormat}`);

    res.status(201).json({
      success: true,
      virtualTryOn: product.virtualTryOn,
      sizeKB: Math.round(req.file.size / 1024),
      message: isIos ? 'تم رفع نموذج USDZ' : 'تم رفع النموذج ثلاثي الأبعاد',
    });
  }
);

/* ══════════════════════════════════════════════════════════
   DELETE /model — remove GLB (?kind=ios for USDZ)
   ══════════════════════════════════════════════════════════ */
router.delete('/model', async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  const isIos = req.query.kind === 'ios';
  const vto = product.virtualTryOn || {};

  await destroyAsset(isIos ? vto.iosModelPublicId : vto.model3DPublicId);

  if (isIos) {
    vto.iosModelUrl = ''; vto.iosModelPublicId = ''; vto.iosModelBytes = 0;
  } else {
    vto.model3DUrl = ''; vto.model3DPublicId = ''; vto.model3DBytes = 0;
    // No model means nothing to show — never leave it advertised as ready.
    vto.status = 'draft';
    vto.enabled = false;
  }

  product.virtualTryOn = vto;
  await product.save();
  bustProductCaches();
  audit(req, isIos ? 'usdz-deleted' : 'model-deleted');

  res.json({ success: true, virtualTryOn: product.virtualTryOn, message: 'تم حذف الملف' });
});

/* ══════════════════════════════════════════════════════════
   POST /preview — fallback preview image
   ══════════════════════════════════════════════════════════ */
router.post(
  '/preview',
  uploadLimiter,
  require('multer')({
    storage: require('multer').memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => file.mimetype.startsWith('image/')
      ? cb(null, true)
      : cb(new Error('يجب أن يكون الملف صورة'), false),
  }).single('image'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'لا توجد صورة في الطلب' });

    const product = await findProduct(req, res);
    if (!product) return;

    const vto = product.virtualTryOn || {};
    let result;
    try {
      const { processImage } = require('../middleware/upload');
      const buf = await processImage(req.file.buffer, req.file.size);
      result = await uploadBuffer(buf, {
        folder: FOLDER,
        publicId: `${product._id}-preview-${Date.now()}`,
        resourceType: 'image',
        format: 'webp',
      });
    } catch (err) {
      return res.status(502).json({ success: false, message: `فشل رفع الصورة: ${err.message}` });
    }

    await destroyAsset(vto.previewImagePublicId, 'image');
    vto.previewImageUrl = result.secure_url;
    vto.previewImagePublicId = result.public_id;
    product.virtualTryOn = vto;
    await product.save();
    bustProductCaches();
    audit(req, 'preview-uploaded');

    res.status(201).json({ success: true, virtualTryOn: product.virtualTryOn, message: 'تم رفع صورة المعاينة' });
  }
);

/* ══════════════════════════════════════════════════════════
   POST /copy-from/:sourceId — reuse another product's calibration
   ══════════════════════════════════════════════════════════ */
router.post('/copy-from/:sourceId', async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  if (!isValidId(req.params.sourceId)) {
    return res.status(400).json({ success: false, message: 'معرّف المنتج المصدر غير صحيح' });
  }
  const source = await Product.findById(req.params.sourceId).select('virtualTryOn name');
  if (!source) return res.status(404).json({ success: false, message: 'المنتج المصدر غير موجود' });

  const s = source.virtualTryOn || {};
  const current = product.virtualTryOn || {};

  // Copy the numbers only — assets stay with the product that owns them.
  product.virtualTryOn = {
    ...current,
    type: s.type || 'none',
    scale: s.scale ?? 1,
    positionOffset: s.positionOffset || { x: 0, y: 0, z: 0 },
    rotationOffset: s.rotationOffset || { x: 0, y: 0, z: 0 },
    minimumScale: s.minimumScale ?? 0.1,
    maximumScale: s.maximumScale ?? 5,
    targetHand: s.targetHand || 'both',
    targetSide: s.targetSide || 'both',
    trackingSmoothing: s.trackingSmoothing ?? 0.5,
    showShadow: s.showShadow !== false,
    enableOcclusion: !!s.enableOcclusion,
    allowManualAdjustment: s.allowManualAdjustment !== false,
    placement: s.placement || 'floor',
    lastCalibratedAt: new Date(),
    lastCalibratedBy: req.user._id,
  };

  await product.save();
  bustProductCaches();
  audit(req, 'calibration-copied', `from=${req.params.sourceId}`);

  res.json({
    success: true,
    virtualTryOn: product.virtualTryOn,
    message: `تم نسخ الإعدادات من "${source.name}"`,
  });
});

/* ══════════════════════════════════════════════════════════
   POST /reset — back to defaults, assets untouched
   ══════════════════════════════════════════════════════════ */
router.post('/reset', async (req, res) => {
  const product = await findProduct(req, res);
  if (!product) return;

  const vto = product.virtualTryOn || {};
  product.virtualTryOn = {
    ...vto,
    scale: 1,
    positionOffset: { x: 0, y: 0, z: 0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
    minimumScale: 0.1,
    maximumScale: 5,
    targetHand: 'both',
    targetSide: 'both',
    trackingSmoothing: 0.5,
    showShadow: true,
    enableOcclusion: false,
    allowManualAdjustment: true,
    placement: 'floor',
    lastCalibratedAt: new Date(),
    lastCalibratedBy: req.user._id,
  };

  await product.save();
  bustProductCaches();
  audit(req, 'calibration-reset');

  res.json({ success: true, virtualTryOn: product.virtualTryOn, message: 'تمت إعادة الضبط للقيم الافتراضية' });
});

module.exports = router;
