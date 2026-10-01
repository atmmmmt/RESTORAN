'use strict';

/**
 * Background poller that keeps local attendance in step with the terminal.
 *
 * Realtime punches arrive over SSE when the device supports it, but a poll is
 * still needed to catch anything that happened while the server was down or
 * the network was flaky. Interval and on/off come from AttendanceSettings and
 * are re-read on every tick, so changing them in the UI takes effect without
 * a restart.
 */

const AttendanceSettings = require('../models/AttendanceSettings');
const attendanceService  = require('./attendanceService');
const zk                 = require('./zktecoService');

let timer = null;
let running = false;      // guards against overlapping ticks on a slow device
let lastResult = null;

async function tick() {
  if (running) return;
  running = true;

  try {
    const settings = await AttendanceSettings.getSingleton();
    if (!settings.autoSyncEnabled || !settings.deviceIp) {
      lastResult = { at: new Date(), skipped: 'auto-sync معطّل' };
      return;
    }

    const result = await attendanceService.syncFromDevice();
    lastResult = { at: new Date(), ...result };

    // Keep the live stream bound — it drops when the device reboots.
    if (result.ok && zk.isConnected()) await zk.bindRealtime();

    if (result.ok && result.inserted > 0) {
      console.log(`🔄 مزامنة البصمة: ${result.inserted} حركة جديدة`);
    }
  } catch (err) {
    lastResult = { at: new Date(), ok: false, message: err.message };
    console.error('❌ خطأ في مزامنة البصمة:', err.message);
  } finally {
    running = false;
  }
}

/** Reschedule from the stored interval. Safe to call repeatedly. */
async function reschedule() {
  if (timer) clearInterval(timer);
  timer = null;

  let seconds = 60;
  try {
    const settings = await AttendanceSettings.getSingleton();
    if (!settings.autoSyncEnabled) return;
    seconds = Math.min(Math.max(settings.autoSyncSeconds || 60, 5), 3600);
  } catch {
    return;   // DB not ready yet — start() will be retried by the caller
  }

  timer = setInterval(tick, seconds * 1000);
  if (timer.unref) timer.unref();   // never hold the process open
  console.log(`⏱️  مزامنة البصمة التلقائية كل ${seconds} ثانية`);
}

function start() {
  // Re-read settings periodically so UI changes are picked up without restart.
  reschedule();
  const watcher = setInterval(reschedule, 5 * 60 * 1000);
  if (watcher.unref) watcher.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, reschedule, tick, getLastResult: () => lastResult };
