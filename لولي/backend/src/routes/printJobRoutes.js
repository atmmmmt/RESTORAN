'use strict';

const router = require('express').Router();
const mongoose = require('mongoose');
const PrintJob = require('../models/PrintJob');
const { protect, requirePOS } = require('../middleware/auth');

const AGENT_KEY = process.env.LULIZ_PRINT_AGENT_KEY || 'luliz-cloud-print-v1-X7n4Q2m9P6';

function validAgent(req, res, next) {
  const key = String(req.headers['x-print-agent-key'] || '');
  if (key !== AGENT_KEY) return res.status(401).json({ success: false, message: 'Print agent key غير صالح' });
  next();
}

router.post('/', protect, requirePOS, async (req, res) => {
  const deviceId = String(req.body.deviceId || 'luliz-main').trim();
  const payload = req.body.payload;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ success: false, message: 'بيانات مهمة الطباعة غير صالحة' });
  }

  const job = await PrintJob.create({ deviceId, payload });
  res.status(201).json({ success: true, jobId: job._id, status: job.status });
});

router.get('/:id', protect, requirePOS, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'معرّف مهمة الطباعة غير صالح' });
  }
  const job = await PrintJob.findById(req.params.id).select('status result completedAt');
  if (!job) return res.status(404).json({ success: false, message: 'مهمة الطباعة غير موجودة' });
  res.json({ success: true, job });
});

router.get('/agent/next/job', validAgent, async (req, res) => {
  const deviceId = String(req.query.deviceId || 'luliz-main').trim();
  const now = new Date();

  const job = await PrintJob.findOneAndUpdate(
    {
      deviceId,
      $or: [
        { status: 'pending' },
        { status: 'claimed', claimExpiresAt: { $lt: now } },
      ],
    },
    {
      $set: {
        status: 'claimed',
        claimedAt: now,
        claimExpiresAt: new Date(Date.now() + 30000),
      },
    },
    { new: true, sort: { createdAt: 1 } }
  ).lean();

  if (!job) return res.status(204).end();
  res.json({ success: true, job: { id: job._id, payload: job.payload } });
});

router.post('/agent/:id/result', validAgent, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'معرّف مهمة الطباعة غير صالح' });
  }

  const ok = req.body.success === true;
  const result = req.body.result && typeof req.body.result === 'object'
    ? req.body.result
    : { message: String(req.body.message || '') };

  const job = await PrintJob.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        status: ok ? 'done' : 'failed',
        result,
        completedAt: new Date(),
        claimExpiresAt: null,
      },
    },
    { new: true }
  );

  if (!job) return res.status(404).json({ success: false, message: 'مهمة الطباعة غير موجودة' });
  res.json({ success: true });
});

module.exports = router;
