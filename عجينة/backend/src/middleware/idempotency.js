'use strict';

const crypto = require('crypto');
const IdempotencyRecord = require('../models/IdempotencyRecord');

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

module.exports = async function idempotency(req, res, next) {
  if (!MUTATIONS.has(req.method)) return next();
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!key) return next();
  if (key.length > 160) return res.status(400).json({ success: false, message: 'مفتاح العملية غير صالح.' });

  const actor = req.get('Authorization') || req.ip || 'anonymous';
  const actorHash = crypto.createHash('sha256').update(actor).digest('hex').slice(0, 20);
  const scope = `${actorHash}:${req.method}:${req.originalUrl}:${key}`;

  try {
    const existing = await IdempotencyRecord.findOne({ scope }).lean();
    if (existing?.state === 'completed') {
      res.set('Idempotency-Replayed', '1');
      return res.status(existing.statusCode).json(existing.responseBody);
    }
    if (existing) {
      return res.status(409).json({ success: false, message: 'العملية نفسها قيد التنفيذ.', idempotencyPending: true });
    }

    await IdempotencyRecord.create({
      scope, key, method: req.method, path: req.originalUrl,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: 'العملية نفسها قيد التنفيذ.', idempotencyPending: true });
    }
    return next(err);
  }

  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    const statusCode = res.statusCode;
    const save = statusCode < 500
      ? IdempotencyRecord.updateOne({ scope }, { state: 'completed', statusCode, responseBody: body })
      : IdempotencyRecord.deleteOne({ scope });
    try {
      // Persist before the client receives the response. Otherwise an immediate
      // offline-queue retry can arrive in the tiny gap and be misreported as
      // "pending" even though the first request already succeeded.
      await save;
    } catch (err) {
      console.error('Idempotency persistence failed:', err.message);
    }
    return originalJson(body);
  };
  next();
};
