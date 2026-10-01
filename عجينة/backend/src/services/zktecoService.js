'use strict';

/**
 * ZKTeco fingerprint terminal driver.
 *
 * Wraps `zkteco-js` behind a small, forgiving API. Everything here assumes the
 * device may be unplugged, on another subnet, or simply off — every call
 * resolves to a `{ ok, ... }` shape instead of throwing, so a dead device
 * degrades the attendance page rather than 500-ing the whole dashboard.
 *
 * TCP is tried first because writes (creating users, starting enrollment)
 * require it; UDP is only a read-only fallback for older units.
 */

const net = require('net');

let ZKLib = null;
let zkLoadError = null;

/* Raw protocol opcodes we need that zkteco-js has no wrapper for.
   Values match node_modules/zkteco-js/src/helper/command.js. */
const CMD_STARTENROLL      = 61;
const CMD_DELETE_USERTEMP  = 19;
const CMD_REFRESHDATA      = 1013;

/* Lazy require — a missing optional dependency must not crash the server. */
function loadDriver() {
  if (ZKLib || zkLoadError) return ZKLib;
  try {
    ZKLib = require('zkteco-js');
  } catch (err) {
    zkLoadError = err;
    console.warn('⚠️  zkteco-js غير مثبت — ميزات جهاز البصمة معطلة. ثبّت الحزمة: npm i zkteco-js');
  }
  return ZKLib;
}

/* ── Live connection (single device, reused between calls) ── */
let conn = null;              // { device, ip, port, mode }
let realtimeBound = false;
const punchListeners = new Set();

/** Subscribe to live punches. Returns an unsubscribe fn. */
function onPunch(fn) {
  punchListeners.add(fn);
  return () => punchListeners.delete(fn);
}

function emitPunch(payload) {
  for (const fn of punchListeners) {
    try { fn(payload); } catch { /* a broken listener must not stop the rest */ }
  }
}

/* ── Raw TCP port probe — answers "is anything listening?" fast ── */
function testPort(ip, port, timeout = 3000) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error',   () => finish(false));
    socket.connect(port, ip);
  });
}

/**
 * Scan a /24 for devices answering on the given port.
 * `baseIp` may be any address on the subnet — the last octet is replaced.
 */
async function scanNetwork(baseIp = '192.168.1.1', port = 4370, timeout = 700) {
  const prefix = baseIp.split('.').slice(0, 3).join('.');
  const found = [];

  // 254 probes at once would exhaust sockets — walk it in chunks.
  const CHUNK = 32;
  for (let start = 1; start <= 254; start += CHUNK) {
    const batch = [];
    for (let i = start; i < start + CHUNK && i <= 254; i++) {
      const ip = `${prefix}.${i}`;
      batch.push(testPort(ip, port, timeout).then(ok => (ok ? ip : null)));
    }
    const results = await Promise.all(batch);
    found.push(...results.filter(Boolean));
  }
  return found;
}

/* ── Connect ───────────────────────────────────────────────── */

async function tryConnect(ip, port, timeout, inport) {
  const Driver = loadDriver();
  if (!Driver) throw new Error('حزمة zkteco-js غير مثبتة على الخادم');

  const device = new Driver(ip, port, timeout, inport);
  await device.createSocket();
  return device;
}

/**
 * Open (or reuse) a connection to the terminal.
 * Tries TCP first, falls back to UDP — UDP cannot write.
 */
async function connect({ ip, port = 4370, timeout = 10000, force = false } = {}) {
  if (!ip) return { ok: false, message: 'عنوان IP للجهاز مطلوب' };

  if (conn && !force && conn.ip === ip && conn.port === port) {
    return { ok: true, reused: true, mode: conn.mode };
  }

  await disconnect();

  const attempts = [
    { mode: 'tcp', inport: 4000 },
    { mode: 'udp', inport: 5200 },
  ];

  let lastErr = null;
  for (const { mode, inport } of attempts) {
    try {
      const device = await tryConnect(ip, port, timeout, inport);
      conn = { device, ip, port, mode };
      realtimeBound = false;
      return { ok: true, mode };
    } catch (err) {
      lastErr = err;
    }
  }

  return {
    ok: false,
    message: `تعذّر الاتصال بالجهاز على ${ip}:${port} — ${lastErr?.message || 'لا استجابة'}`,
  };
}

async function disconnect() {
  if (!conn) return;
  try { await conn.device.disconnect(); } catch { /* already gone */ }
  conn = null;
  realtimeBound = false;
}

function isConnected() {
  return !!conn;
}

function status() {
  return conn
    ? { connected: true, ip: conn.ip, port: conn.port, mode: conn.mode }
    : { connected: false };
}

/**
 * Run `fn(device)` against the live connection.
 *
 * The handle is cached between calls, which is what makes a sync cheap — but
 * a cached socket can be dead without anyone noticing: the terminal accepts
 * one client at a time and drops the old one the moment something else
 * connects, and a branch switch or a sleep does the same. Reusing that dead
 * handle fails identically forever, so every failure drops the connection
 * and the next call reconnects. Without this the agent goes quiet until
 * someone restarts it by hand.
 */
async function withDevice(fn) {
  if (!conn) return { ok: false, message: 'الجهاز غير متصل' };
  try {
    const data = await fn(conn.device);
    return { ok: true, data };
  } catch (err) {
    await disconnect().catch(() => { /* it is already gone; that is the point */ });
    return { ok: false, message: err?.message || 'فشل تنفيذ الأمر على الجهاز' };
  }
}

/* ── Device info ───────────────────────────────────────────── */

async function getInfo() {
  return withDevice(async device => {
    const out = {};
    // Each getter is optional — older firmware omits some of them.
    const probes = [
      ['name',     () => device.getDeviceName?.()],
      ['serial',   () => device.getSerialNumber?.()],
      ['version',  () => device.getFirmware?.()],
      ['platform', () => device.getPlatform?.()],
      ['os',       () => device.getOS?.()],
      ['time',     () => device.getTime?.()],
    ];
    for (const [key, get] of probes) {
      try { out[key] = await get(); } catch { out[key] = null; }
    }
    try {
      const info = await device.getInfo?.();
      if (info) Object.assign(out, { counts: info });
    } catch { /* optional */ }
    return out;
  });
}

/* ── Users ─────────────────────────────────────────────────── */

async function getUsers() {
  return withDevice(async device => {
    const res = await device.getUsers();
    return res?.data || res || [];
  });
}

/**
 * Push an employee onto the device so they can enrol a finger.
 * `uid` is the internal slot, `pin` the user-facing id — we keep them equal.
 */
async function setUser({ uid, pin, name, password = '', role = 0, cardno = 0 }) {
  return withDevice(async device => {
    await device.setUser(Number(uid), String(pin), String(name), String(password), Number(role), Number(cardno));
    return { uid, pin, name };
  });
}

async function deleteUser(uid) {
  return withDevice(async device => {
    if (typeof device.deleteUser !== 'function') throw new Error('الجهاز لا يدعم حذف المستخدمين عن بعد');
    await device.deleteUser(Number(uid));
    return { uid };
  });
}

/**
 * Put the terminal into fingerprint-enrollment mode for a given user+finger.
 * The staff member then presses the finger three times on the unit itself.
 *
 * Method naming varies a lot across zkteco-js versions, so we probe.
 */
async function startEnroll({ uid, pin, fingerIndex = 0 }) {
  if (conn && conn.mode !== 'tcp') {
    return { ok: false, message: 'تسجيل البصمة يحتاج اتصال TCP — أعد الاتصال بالجهاز' };
  }
  return withDevice(async device => {
    if (typeof device.executeCmd !== 'function') {
      throw new Error('نسخة المكتبة لا تدعم إرسال أوامر مباشرة للجهاز');
    }

    /* Payload: user id as a 24-byte NUL-padded string · finger index · flag.
     *
     * TFT firmware reads the leading bytes as the user-id *string*. This used
     * to send the id as a uint16, so PIN 4 went out as bytes 04 00 and the
     * terminal read the id "\u0004" — found no such user, created a new one
     * under that unreadable id, and filed the finger (and every later punch)
     * there. It is the same layout setUser uses for the id field. */
    const userId = String(pin ?? uid);
    const payload = Buffer.alloc(26);
    payload.write(userId.slice(0, 24), 0, 24, 'ascii');
    payload.writeUInt8(Number(fingerIndex) & 0xFF, 24);
    payload.writeUInt8(1, 25);

    // The unit stops matching while a finger is being registered.
    try { await device.disableDevice?.(); } catch { /* optional */ }
    await device.executeCmd(CMD_STARTENROLL, payload);
    try { await device.enableDevice?.(); } catch { /* optional */ }

    return { uid, pin, fingerIndex };
  });
}

async function clearFingerprints(uid) {
  return withDevice(async device => {
    if (typeof device.executeCmd !== 'function') {
      throw new Error('نسخة المكتبة لا تدعم مسح البصمات عن بعد');
    }

    // Delete every finger slot (0-9) for this user, then ask the unit to reload.
    for (let finger = 0; finger < 10; finger++) {
      const payload = Buffer.alloc(3);
      payload.writeUInt16LE(Number(uid) & 0xFFFF, 0);
      payload.writeUInt8(finger, 2);
      try { await device.executeCmd(CMD_DELETE_USERTEMP, payload); } catch { /* slot may be empty */ }
    }
    try { await device.executeCmd(CMD_REFRESHDATA, ''); } catch { /* optional */ }

    return { uid };
  });
}

/* ── Attendance records ────────────────────────────────────── */

async function getAttendances() {
  return withDevice(async device => {
    const res = await device.getAttendances();
    return res?.data || res || [];
  });
}

async function clearAttendances() {
  return withDevice(async device => {
    if (typeof device.clearAttendanceLog !== 'function') {
      throw new Error('الجهاز لا يدعم مسح السجل عن بعد');
    }
    await device.clearAttendanceLog();
    return true;
  });
}

/* ── Clock ─────────────────────────────────────────────────── */

async function setDeviceTime(date = new Date()) {
  return withDevice(async device => {
    if (typeof device.setTime !== 'function') throw new Error('الجهاز لا يدعم ضبط الوقت عن بعد');
    await device.setTime(date);
    return date;
  });
}

/* ── Realtime ──────────────────────────────────────────────── */

/**
 * Ask the device to stream punches as they happen.
 * Safe to call repeatedly — binds at most once per connection.
 */
async function bindRealtime() {
  if (!conn || realtimeBound) return { ok: realtimeBound };
  const { device } = conn;
  if (typeof device.getRealTimeLogs !== 'function') {
    return { ok: false, message: 'الجهاز لا يدعم البث الفوري' };
  }
  try {
    await device.getRealTimeLogs(data => emitPunch(data));
    realtimeBound = true;
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || 'تعذّر تفعيل البث الفوري' };
  }
}

module.exports = {
  driverAvailable: () => !!loadDriver(),
  testPort,
  scanNetwork,
  connect,
  disconnect,
  isConnected,
  status,
  getInfo,
  getUsers,
  setUser,
  deleteUser,
  startEnroll,
  clearFingerprints,
  getAttendances,
  clearAttendances,
  setDeviceTime,
  bindRealtime,
  onPunch,
  emitPunch,
};
