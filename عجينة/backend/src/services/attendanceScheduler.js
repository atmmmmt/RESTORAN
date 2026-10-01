'use strict';

/**
 * Attendance housekeeping.
 *
 * This used to poll the fingerprint terminal. It can't any more — the
 * terminals live on branch LANs and each branch's agent now pushes to us, so
 * there is nothing here to dial. What remains is the tidying that only the
 * server can do: retiring commands no agent ever collected, and clearing the
 * reachability flag for branches that have gone quiet, so the dashboard shows
 * "offline" instead of a stale green light.
 */

const AttendanceDevice = require('../models/AttendanceDevice');
const DeviceCommand    = require('../models/DeviceCommand');

const TICK_MS       = 60 * 1000;
const AGENT_STALE_MS = 3 * 60 * 1000;

let timer = null;
let running = false;
let lastResult = null;

async function tick() {
  if (running) return;
  running = true;

  try {
    const now = new Date();

    /* A command nobody claimed before its expiry is never going to run —
       leaving it 'pending' would have the agent execute a stale instruction
       hours later, long after the manager moved on. */
    const expired = await DeviceCommand.updateMany(
      { status: { $in: ['pending', 'running'] }, expiresAt: { $lt: now } },
      { $set: { status: 'expired', message: 'انتهت صلاحية المهمة قبل تنفيذها', finishedAt: now } }
    );

    /* Mark quiet branches unreachable. lastSeenAt is left untouched so the
       dashboard can still say how long it has been. */
    const stale = await AttendanceDevice.updateMany(
      { deviceReachable: true, lastSeenAt: { $lt: new Date(now - AGENT_STALE_MS) } },
      { $set: { deviceReachable: false } }
    );

    /* Finished commands are only useful while someone is watching the page. */
    await DeviceCommand.deleteMany({
      status: { $in: ['done', 'failed', 'expired'] },
      finishedAt: { $lt: new Date(now - 24 * 60 * 60 * 1000) },
    });

    lastResult = {
      at: now,
      expiredCommands: expired.modifiedCount || 0,
      wentOffline: stale.modifiedCount || 0,
    };
  } catch (err) {
    lastResult = { at: new Date(), error: err.message };
    console.error('attendance housekeeping failed:', err.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  tick();
  console.log('🕒 صيانة الحضور تعمل — كل دقيقة');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function status() {
  return { running: !!timer, lastResult };
}

module.exports = { start, stop, status, tick };
