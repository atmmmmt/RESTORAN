'use strict';

/**
 * لوليز — برنامج الطباعة المحلي
 *
 * The live dashboard runs on a cloud server, which can't reach a printer
 * sitting on the shop's own network. This tiny program runs on the cashier
 * laptop instead: the dashboard (open in that laptop's browser) renders each
 * ticket and hands it to http://localhost:9123, and this forwards it to the
 * thermal printer on the LAN. No dependencies — just Node.js.
 */

const http = require('http');
const net = require('net');

const PORT = 9123;
const MAX_BODY = 4 * 1024 * 1024;

function printRaster(ip, port, width, height, bits) {
  const bytesPerRow = Math.ceil(width / 8);
  const chunks = [Buffer.from([0x1b, 0x40])];
  const BAND = 200;
  for (let y = 0; y < height; y += BAND) {
    const h = Math.min(BAND, height - y);
    chunks.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff]));
    chunks.push(bits.subarray(y * bytesPerRow, (y + h) * bytesPerRow));
  }
  chunks.push(Buffer.from([0x1b, 0x64, 0x04]), Buffer.from([0x1d, 0x56, 0x42, 0x00]));
  const payload = Buffer.concat(chunks);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const fail = e => { if (!settled) { settled = true; socket.destroy(); reject(e); } };
    socket.setTimeout(8000);
    socket.once('timeout', () => fail(new Error('انتهت مهلة الاتصال بالطابعة — تأكد إنها شغّالة وعلى نفس الشبكة')));
    socket.once('error', e => fail(new Error(`تعذّر الاتصال بالطابعة ${ip} (${e.code || e.message})`)));
    socket.connect(port, ip, () => { socket.end(payload); socket.once('close', hadErr => { if (!settled) { settled = true; hadErr ? reject(new Error('انقطع الاتصال بالطابعة')) : resolve(); } }); });
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
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

const server = http.createServer((req, res) => {
  // The dashboard is an https site calling localhost — allow it, including
  // Chrome's Private Network Access preflight.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { success: true, agent: 'luliz-print-agent', version: 2 });
  }

  if (req.method === 'POST' && req.url === '/print') {
    let size = 0;
    const parts = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { send(res, 413, { success: false, message: 'الفاتورة كبيرة جداً' }); req.destroy(); }
      else parts.push(c);
    });
    req.on('end', async () => {
      try {
        const { ip, port = 9100, width, height, data } = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (!ip || !/^[\d.]+$/.test(String(ip))) return send(res, 400, { success: false, message: 'عنوان الطابعة غير صالح' });
        const bits = Buffer.from(String(data || ''), 'base64');
        if (!width || !height || width > 832 || height > 12000 || bits.length !== Math.ceil(width / 8) * height) {
          return send(res, 400, { success: false, message: 'بيانات الفاتورة غير صالحة' });
        }
        await printRasterWithRetry(String(ip), Number(port) || 9100, Number(width), Number(height), bits);
        console.log(new Date().toLocaleTimeString(), '✓ طُبعت فاتورة على', ip);
        send(res, 200, { success: true, message: 'تمت الطباعة ✓' });
      } catch (e) {
        console.log(new Date().toLocaleTimeString(), '✗', e.message);
        send(res, 502, { success: false, message: e.message });
      }
    });
    return;
  }

  send(res, 404, { success: false, message: 'غير موجود' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`برنامج طباعة لوليز شغّال على http://localhost:${PORT} — خلّي هالنافذة مفتوحة.`);
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.log('البرنامج شغّال أصلاً بنافذة تانية.');
  else console.error(e);
});
