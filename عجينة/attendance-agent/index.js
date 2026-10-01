'use strict';

/**
 * Branch attendance agent.
 *
 * Runs on a machine inside the branch, on the same LAN as the fingerprint
 * terminal, and is the only thing that ever talks to that terminal. The
 * server is in a data centre and cannot reach a 192.168.x.x address — and
 * every branch numbers its LAN the same way, so those addresses are not even
 * unique. Inverting the direction removes the whole problem: this process
 * dials out, the way a browser does, so no port forwarding, no VPN and no
 * router configuration are involved.
 *
 * Two loops:
 *   • sync  — read punches off the terminal and post them (default 60s)
 *   • poll  — collect queued jobs from the server and run them (default 5s)
 *
 * Both are deliberately forgiving. A branch loses its internet, the terminal
 * gets unplugged, the server restarts — every one of those is a normal
 * Tuesday, so failures log and retry rather than exiting. Punches are never
 * lost: they stay on the terminal until a sync succeeds, and the server
 * de-duplicates replays.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const device = require('./device');
const { createOutbox } = require('./outbox');

const AGENT_VERSION = require('./package.json').version;

/* ── Config ─────────────────────────────────────────────── */

const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('✖ لم يُعثر على config.json — انسخ config.example.json وعدّله أولاً');
  process.exit(1);
}

/* Notepad and PowerShell both write UTF-8 with a byte-order mark, which
   JSON.parse rejects outright — and this file is edited by hand at every
   branch, so stripping it is not optional. */
const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));

const SERVER  = String(config.serverUrl || '').replace(/\/$/, '');
const KEY     = String(config.agentKey || '');
const SYNC_MS = Math.max(Number(config.syncSeconds) || 15, 10) * 1000;
const POLL_MS = Math.max(Number(config.pollSeconds) || 5, 2) * 1000;

/* Every punch read from the terminal lands here before any upload, so an
   outage of any length costs nothing even if the terminal's own log is
   cleared or fills up in the meantime. See outbox.js. */
const outbox = createOutbox(path.join(__dirname, 'outbox.json'));

if (!SERVER || !KEY || KEY.startsWith('ضع')) {
  console.error('✖ serverUrl و agentKey مطلوبان في config.json');
  process.exit(1);
}

/* The terminal's address can be overridden centrally: /hello returns what the
   dashboard has on file, so a branch that re-addresses its unit is fixed from
   the dashboard rather than by editing a file on site. */
let deviceTarget = {
  ip:      String(config.deviceIp || '192.168.1.201'),
  port:    Number(config.devicePort) || 4370,
  timeout: Number(config.deviceTimeout) || 10000,
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

/**
 * The IPv4 networks this machine is actually attached to.
 *
 * A branch PC is rarely on one network: Wi-Fi for the internet, sometimes a
 * cable straight to the terminal, plus whatever VPN clients are installed.
 * Scanning the address from config.json would miss the terminal whenever the
 * branch renumbered; scanning every interface finds it wherever it landed.
 *
 * Link-local (169.254.x) is kept — that is exactly what a direct cable to the
 * terminal looks like when nothing hands out addresses.
 */
function localSubnets() {
  const bases = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const base = a.address.split('.').slice(0, 3).join('.') + '.1';
      if (!bases.includes(base)) bases.push(base);
    }
  }
  return bases;
}

/**
 * Sweep every attached network for terminals listening on the device port.
 *
 * A VPN client is the trap here. Several of them answer a TCP connect on any
 * address and any port, so a naive sweep of their subnet 'finds' all 254
 * hosts — pure noise that buries the one real answer. A LAN never has dozens
 * of fingerprint terminals on it, so a subnet that reports more than a
 * handful is lying and gets thrown away wholesale.
 */
const MAX_PLAUSIBLE_HITS = 6;

async function scanForTerminals(port) {
  const found = [];
  const skipped = [];

  for (const base of localSubnets()) {
    let hits = [];
    try {
      hits = await device.scanNetwork(base, port, 700);
    } catch { continue; }

    if (hits.length > MAX_PLAUSIBLE_HITS) {
      skipped.push(base);
      continue;
    }
    for (const ip of hits) if (!found.includes(ip)) found.push(ip);
  }

  if (skipped.length) {
    log('· تُجوهلت شبكات ترد على كل العناوين (غالباً VPN):', skipped.join('، '));
  }
  return found;
}

/* ── Server calls ───────────────────────────────────────── */

async function api(pathname, body) {
  const res = await fetch(`${SERVER}/api/attendance-agent${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'X-Agent-Key': KEY,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }

  if (!res.ok) {
    throw new Error(json?.message || `HTTP ${res.status}`);
  }
  return json;
}

/* ── Terminal ───────────────────────────────────────────── */

/**
 * One job at a time on the terminal.
 *
 * The driver holds a single socket to the unit, but two timers drive it: the
 * sync loop every minute and the command poll every few seconds. Let them
 * overlap and a command's request lands in the middle of the sync's reply —
 * the reads come back malformed and the sync fails for no visible reason.
 * Chaining every access through one promise keeps the wire strictly
 * sequential without either loop having to know about the other.
 */
let chain = Promise.resolve();

function withLock(fn) {
  const run = chain.then(fn, fn);
  // Keep the chain alive after a rejection, and don't let it hold results.
  chain = run.then(() => {}, () => {});
  return run;
}

async function withDevice(fn) {
  /* Force a fresh socket for every command.
   *
   * Reads are happy to share the long-lived connection the sync loop keeps,
   * but writes — creating a user, starting an enrolment — fail on it: after a
   * batch read the terminal's reply sequence is out of step, and the write is
   * rejected with no useful error. Reconnecting costs a few hundred
   * milliseconds and makes every command behave like the first one. */
  const conn = await device.connect({ ...deviceTarget, force: true });
  if (!conn.ok) throw new Error(conn.message || 'تعذّر الاتصال بجهاز البصمة');
  return fn();
}

/* ── Sync loop ──────────────────────────────────────────── */

let syncing = false;
let lastLogCount = 0;   // punches seen on the terminal at the last good read

async function syncOnce() {
  if (syncing) return;
  syncing = true;

  let reachable = false;
  let deviceError = '';
  let info = null;
  let discovered = null;
  let users = [];

  try {
    /* Read everything under the lock, then release it before the upload —
       posting to the server can take seconds and the terminal has no reason
       to sit idle behind it. */
    const read = await withLock(async () => {
      /* Connect, read, and let go — every time.
       *
       * The agent used to hold one socket open indefinitely. While a PC
       * session is open a ZKTeco terminal considers itself "in communication"
       * and is slow to expose new punches to that session: a finger at 14:28
       * was reported as missing for five straight polls and only appeared
       * when something else happened to recycle the connection. It also
       * occasionally answered with an empty log. A fresh session per poll
       * sees the log as it is, and releasing it leaves the terminal free. */
      const conn = await device.connect({ ...deviceTarget, force: true });
      if (!conn.ok) throw new Error(conn.message || 'تعذّر الاتصال بجهاز البصمة');

      try {
        const infoRes  = await device.getInfo();
        const usersRes = await device.getUsers();
        const attRes   = await device.getAttendances();
        return { infoRes, usersRes, attRes };
      } finally {
        await device.disconnect().catch(() => { /* already closed */ });
      }
    });

    reachable = true;
    const { infoRes, usersRes, attRes } = read;
    if (infoRes.ok) info = infoRes.data;

    if (!attRes.ok) throw new Error(attRes.message || 'تعذّرت قراءة الحركات');
    if (!(attRes.data || []).length && lastLogCount > 0) {
      throw new Error('قراءة فارغة من الجهاز — ستُعاد المحاولة');
    }
    lastLogCount = (attRes.data || []).length;

    /* Persist first. Only after this line is a punch safe from the terminal
       being wiped — the upload below may fail for hours. */
    users = usersRes.ok ? (usersRes.data || []) : [];
    const added = outbox.add(attRes.data || []);
    if (added) log(`· حُفظت ${added} بصمة جديدة على اللابتوب`);
  } catch (err) {
    deviceError = err.message;
    log('✖ فشل المزامنة:', err.message);

    /* Cannot reach the configured address — sweep the LAN so the dashboard
       can show what IS out there instead of an empty field and a shrug. */
    try {
      discovered = await scanForTerminals(deviceTarget.port);
      log(discovered.length
        ? '· أجهزة موجودة على الشبكة: ' + discovered.join('، ')
        : '· لم يُعثر على أي جهاز بصمة على الشبكة');
    } catch { /* a failed sweep must not mask the original error */ }
  }

  /* Send whatever is waiting — including punches saved during earlier
     outages, and even when the terminal itself is unreachable right now. */
  try {
    const pending = outbox.pending();
    const CHUNK = 500;
    let inserted = 0;

    if (!pending.length) {
      if (users.length) await api('/sync', { users, punches: [] });
    } else {
      for (let i = 0; i < pending.length; i += CHUNK) {
        const batch = pending.slice(i, i + CHUNK);
        const r = await api('/sync', {
          users: i === 0 ? users : [],
          punches: batch.map(({ user_id, record_time }) => ({ user_id, record_time })),
        });
        /* Marked only after the server said yes — a dropped connection mid-way
           leaves the rest pending, and replays are de-duplicated server-side. */
        outbox.markSent(batch.map(b => b.key));
        inserted += r?.inserted || 0;
      }
    }

    log(pending.length
      ? `✓ مزامنة — أُرسلت ${pending.length} بصمة، منها ${inserted} جديدة`
      : `✓ مزامنة — ${lastLogCount} حركة على الجهاز، لا شيء بانتظار الإرسال`);
  } catch (err) {
    log(`✖ لا اتصال بالسيرفر (${err.message}) — ${outbox.pendingCount()} بصمة محفوظة على اللابتوب بانتظار الإرسال`);
  } finally {
    syncing = false;
  }

  /* Report health regardless — a branch that cannot reach its terminal is
     exactly what the dashboard needs to show, and staying silent would look
     identical to the agent being dead. */
  try {
    const hello = await api('/hello', {
      agentVersion:  AGENT_VERSION,
      deviceReachable: reachable,
      deviceSerial:  info?.serial ?? '',
      deviceVersion: info?.version ?? '',
      error:         deviceError,
      pendingPunches: outbox.pendingCount(),
      ...(discovered ? { discovered } : {}),
    });
    if (hello?.device?.deviceIp) {
      deviceTarget = {
        ip:      hello.device.deviceIp,
        port:    hello.device.devicePort || 4370,
        timeout: hello.device.timeout || 10000,
      };
    }
  } catch (err) {
    log('✖ تعذّر الوصول للسيرفر:', err.message);
  }
}

/* ── Command loop ───────────────────────────────────────── */

/**
 * The terminal slot (uid) that belongs to a PIN.
 *
 * Slots and PINs are different numbers. The agent used to write employee PIN
 * N straight into slot N — and when slot 5 was already taken by a user left
 * behind by an older enrolment, pushing a new PIN 5 overwrote that user in
 * place, fingerprints and all, handing someone else's thumb to the new hire.
 * So: reuse the slot this PIN already has; otherwise take a free one; never
 * write into a slot owned by a different PIN.
 */
async function resolveUid(pin, { allocate = false } = {}) {
  const res = await device.getUsers();
  if (!res.ok) throw new Error(res.message || 'تعذّرت قراءة مستخدمي الجهاز');
  const users = res.data || [];

  const mine = users.find(u => String(u.userId ?? '').trim() === pin);
  if (mine) return Number(mine.uid);
  if (!allocate) return null;

  const used = new Set(users.map(u => Number(u.uid)).filter(Number.isFinite));
  let uid = 1;
  while (used.has(uid)) uid++;
  return uid;
}

/* Commands name the employee by PIN; older queued jobs only carried a uid. */
const pinOf = p => String(p.pin ?? p.uid ?? '').trim();

async function runCommand(cmd) {
  const p = cmd.payload || {};

  switch (cmd.type) {
    case 'push-user':
      return withDevice(async () => {
        const pin = pinOf(p);
        const uid = await resolveUid(pin, { allocate: true });
        return device.setUser({ uid, pin, name: String(p.name || '') });
      });

    case 'delete-user':
      return withDevice(async () => {
        const uid = await resolveUid(pinOf(p));
        return uid ? device.deleteUser(uid) : { ok: true, message: 'غير موجود على الجهاز' };
      });

    case 'clear-fingerprints':
      return withDevice(async () => {
        const uid = await resolveUid(pinOf(p));
        return uid ? device.clearFingerprints(uid) : { ok: true, message: 'غير موجود على الجهاز' };
      });

    case 'start-enroll':
      return withDevice(async () => {
        const pin = pinOf(p);
        const uid = await resolveUid(pin);
        /* Enrolling a PIN the terminal does not know makes it invent a user
           for the finger — exactly how thumbs ended up on the wrong slot. */
        if (!uid) return { ok: false, message: 'الموظف غير موجود على الجهاز — أرسله للجهاز أولاً' };
        return device.startEnroll({ uid, pin, fingerIndex: Number(p.fingerIndex) || 0 });
      });

    case 'sync-time':
      return withDevice(() => device.setDeviceTime(new Date()));

    case 'get-info':
      return withDevice(() => device.getInfo());

    case 'scan-network': {
      /* Sweep whichever subnet this machine is actually on, not the one in
         the config: a branch that re-addressed its network would otherwise
         have the agent scanning a range it no longer belongs to. */
      const found = await scanForTerminals(deviceTarget.port);
      return { ok: true, data: { found } };
    }

    case 'get-users':
      /* Not just a read: the point is to get the terminal's roster into the
         dashboard, which happens through the normal sync path. That path
         takes the terminal lock — and this command is already running
         inside it — so awaiting it here waits on itself forever and freezes
         the whole agent. Queue it to run once this command lets go. */
      setImmediate(syncOnce);
      return { ok: true };

    default:
      return { ok: false, message: `نوع مهمة غير معروف: ${cmd.type}` };
  }
}

let polling = false;

async function pollOnce() {
  if (polling) return;
  polling = true;

  try {
    const res = await api('/commands');
    for (const cmd of res?.commands || []) {
      log(`→ تنفيذ مهمة: ${cmd.type}`);
      let outcome;
      try {
        outcome = await withLock(() => runCommand(cmd));
      } catch (err) {
        outcome = { ok: false, message: err.message };
      }

      try {
        await api(`/commands/${cmd.id}`, {
          ok:      !!outcome?.ok,
          result:  outcome?.data ?? null,
          message: outcome?.message || '',
        });
      } catch (err) {
        // The job ran; only the receipt failed. The server expires the row.
        log('✖ تعذّر إرسال نتيجة المهمة:', err.message);
      }

      log(outcome?.ok ? `  ✓ ${cmd.type}` : `  ✖ ${cmd.type}: ${outcome?.message}`);
    }
  } catch (err) {
    log('✖ فشل جلب المهام:', err.message);
  } finally {
    polling = false;
  }
}

/* ── Boot ───────────────────────────────────────────────── */

log('▶ وكيل البصمة يعمل');
log(`  السيرفر : ${SERVER}`);
log(`  الجهاز  : ${deviceTarget.ip}:${deviceTarget.port}`);
log(`  مزامنة كل ${SYNC_MS / 1000}s — مهام كل ${POLL_MS / 1000}s`);

if (!device.driverAvailable()) {
  console.error('✖ حزمة zkteco-js غير مثبتة — شغّل: npm install');
  process.exit(1);
}

syncOnce();
setInterval(syncOnce, SYNC_MS);
setInterval(pollOnce, POLL_MS);

/* A crash here would take attendance offline until someone noticed, so log
   and carry on: the next tick usually succeeds. */
process.on('unhandledRejection', err => log('✖ خطأ غير متوقع:', err?.message || err));
process.on('uncaughtException',  err => log('✖ خطأ غير متوقع:', err?.message || err));
