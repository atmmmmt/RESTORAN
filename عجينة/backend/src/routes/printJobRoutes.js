'use strict';

const express = require('express');
const mongoose = require('mongoose');
const PrintJob = require('../models/PrintJob');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

const AGENT_KEY = process.env.PRINT_AGENT_KEY || 'CeNqASrsZXBfHLK8IIR2hjWST2K7-fgq4GRAKlieFLI';
const agentStates = new Map();

function validAgent(req, res, next) {
  const key = String(req.headers['x-print-agent-key'] || '');
  if (!key || key !== AGENT_KEY) {
    return res.status(401).json({ success: false, message: 'Print agent key غير صالح' });
  }
  next();
}

/* Browser/admin -> server queue. No localhost access from Chrome at all. */
router.post('/', protect, requireRole('admin', 'supervisor', 'cashier'), async (req, res) => {
  const deviceId = String(req.body.deviceId || 'ajineh-main').trim();
  const payload = req.body.payload;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ success: false, message: 'بيانات الطباعة غير صالحة' });
  }

  const encoded = String(payload.dataBase64 || '');
  if (!encoded || encoded.length > 3_500_000) {
    return res.status(400).json({ success: false, message: 'حجم مهمة الطباعة غير صالح' });
  }

  const job = await PrintJob.create({
    tenant: 'ajeena',
    centerId: req.user?.centerId || null,
    deviceId,
    payload,
  });

  res.status(201).json({ success: true, jobId: job._id, status: job.status });
});

router.get('/status', protect, requireRole('admin', 'supervisor', 'cashier'), async (req, res) => {
  const deviceId = String(req.query.deviceId || 'ajineh-main').trim();
  const state = agentStates.get(deviceId);
  const online = !!state && (Date.now() - state.lastSeen < 20000);
  res.json({
    success: true,
    online,
    deviceId,
    version: state?.version || null,
    printers: state?.printers || [],
    lastSeen: state?.lastSeen ? new Date(state.lastSeen).toISOString() : null,
  });
});

router.post('/agent/heartbeat', validAgent, async (req, res) => {
  const deviceId = String(req.body.deviceId || 'ajineh-main').trim();
  agentStates.set(deviceId, {
    lastSeen: Date.now(),
    version: String(req.body.version || ''),
    printers: Array.isArray(req.body.printers) ? req.body.printers.slice(0, 100) : [],
  });
  res.json({ success: true });
});

router.get('/:id', protect, requireRole('admin', 'supervisor', 'cashier'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'معرّف مهمة الطباعة غير صالح' });
  }
  const job = await PrintJob.findById(req.params.id).select('status resultMessage completedAt deviceId');
  if (!job) return res.status(404).json({ success: false, message: 'مهمة الطباعة غير موجودة' });
  res.json({ success: true, job });
});

/* Local agent -> server. The laptop polls outbound HTTPS, so Chrome policies do not matter. */
router.get('/agent/next', validAgent, async (req, res) => {
  const deviceId = String(req.query.deviceId || 'ajineh-main').trim();
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

  res.json({
    success: true,
    job: {
      id: job._id,
      payload: job.payload,
      createdAt: job.createdAt,
    },
  });
});

router.post('/agent/:id/result', validAgent, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'معرّف مهمة الطباعة غير صالح' });
  }

  const ok = req.body.success === true;
  const message = String(req.body.message || '').slice(0, 500);

  const job = await PrintJob.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        status: ok ? 'done' : 'failed',
        completedAt: new Date(),
        claimExpiresAt: null,
        resultMessage: message,
      },
    },
    { new: true }
  );

  if (!job) return res.status(404).json({ success: false, message: 'مهمة الطباعة غير موجودة' });
  res.json({ success: true });
});

module.exports = router;
