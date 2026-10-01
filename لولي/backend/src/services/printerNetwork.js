'use strict';

/**
 * Reachability probing for network (Ethernet) receipt printers.
 *
 * This deliberately stops at "is the printer answering on this port" — it
 * does not attempt to send an ESC/POS print job. Actually driving a thermal
 * head correctly (paper width, cut command, and above all shaping Arabic
 * text for the printer's codepage) needs the physical unit in hand to
 * verify against, which this environment doesn't have. Getting that wrong
 * silently would mean garbled receipts on real paper in a live shop, which
 * is worse than not automating it yet.
 *
 * The supported path today is: install the printer as a normal Windows
 * network printer (its IP, port 9100, generic/ESC-POS driver) and let the
 * existing browser print dialog send to it — Windows renders the Arabic
 * text correctly because it rasterizes the page itself.
 *
 * 9100 ("RAW"/JetDirect) is the near-universal raw-print port on network
 * thermal printers, including RONGTA's — it's what this probe checks.
 */

const net = require('net');
const os = require('os');

const DEFAULT_PORT = 9100;

/** Is anything listening on ip:port? Never throws. */
function testPort(ip, port = DEFAULT_PORT, timeout = 3000) {
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
 * Scan a /24 for anything answering on `port`.
 * `baseIp` may be any address on the subnet — the last octet is replaced.
 */
async function scanNetwork(baseIp = '192.168.1.1', port = DEFAULT_PORT, timeout = 500) {
  const prefix = baseIp.split('.').slice(0, 3).join('.');
  const found = [];

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

module.exports = { DEFAULT_PORT, testPort, scanNetwork };

/**
 * Print a pre-rendered 1-bit image on an ESC/POS network printer.
 *
 * The ticket is drawn in the browser (canvas shapes Arabic and draws the logo
 * correctly), packed to 1 bit per pixel, and sent here — so the printer never
 * has to understand Arabic or a codepage; it just prints dots. RONGTA and
 * virtually every 80mm ESC/POS printer support `GS v 0` raster images.
 *
 * `bits` = rows of ceil(width/8) bytes, MSB first, 1 = black.
 */
function printRaster(ip, port, width, height, bits, { cut = true, timeout = 8000 } = {}) {
  const bytesPerRow = Math.ceil(width / 8);
  const chunks = [Buffer.from([0x1b, 0x40])]; // ESC @ — reset

  // Send in bands: some firmwares choke on one very tall raster command.
  const BAND = 200;
  for (let y = 0; y < height; y += BAND) {
    const h = Math.min(BAND, height - y);
    chunks.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff]));
    chunks.push(bits.subarray(y * bytesPerRow, (y + h) * bytesPerRow));
  }
  chunks.push(Buffer.from([0x1b, 0x64, 0x04])); // feed 4 lines
  if (cut) chunks.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])); // partial cut
  const payload = Buffer.concat(chunks);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const fail = err => { if (settled) return; settled = true; socket.destroy(); reject(err); };
    socket.setTimeout(timeout);
    socket.once('timeout', () => fail(new Error('انتهت مهلة الاتصال بالطابعة')));
    socket.once('error', err => fail(new Error(`تعذّر الاتصال بالطابعة (${err.code || err.message})`)));
    socket.connect(port, ip, () => {
      { socket.end(payload); socket.once('close', hadErr => { if (!settled) { settled = true; hadErr ? reject(new Error('انقطع الاتصال بالطابعة')) : resolve(); } }); };
    });
  });
}

/* The printer takes a moment to finish a ticket before it accepts the next
   connection — sending the kitchen ticket right after the receipt used to
   time out. Wait for the socket to fully close, then retry a few times. */
async function printRasterWithRetry(ip, port, width, height, bits, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await printRaster(ip, port, width, height, bits); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw lastErr;
}

module.exports.printRaster = printRasterWithRetry;

/**
 * The /24 subnets this machine is on (private ranges only), plus the default
 * subnets thermal printers commonly ship on — so a scan finds the printer
 * without anyone typing a base address.
 */
function localSubnets() {
  const seen = new Set();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (!/^(192.168.|10.|172.(1[6-9]|2d|3[01]).)/.test(a.address)) continue;
      seen.add(a.address.split('.').slice(0, 3).join('.'));
    }
  }
  for (const d of ['192.168.1', '192.168.0', '192.168.123']) seen.add(d);
  return [...seen];
}

/** Scan all local subnets in parallel; returns [{ ip, subnet }]. */
async function scanAll(port = DEFAULT_PORT, timeout = 600) {
  const subnets = localSubnets();
  const results = await Promise.all(subnets.map(p => scanNetwork(p + '.1', port, timeout)));
  return { subnets, found: results.flatMap((ips, i) => ips.map(ip => ({ ip, subnet: subnets[i] }))) };
}

module.exports.localSubnets = localSubnets;
module.exports.scanAll = scanAll;
