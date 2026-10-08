'use strict';

const http = require('http');
const net = require('net');

const VERSION = '3.0.0';
const PORT = 9123;
const SERVER_BASE = 'https://loliz-taste.com/api/print-jobs';
const DEVICE_ID = 'luliz-main';
const AGENT_KEY = 'luliz-cloud-print-v1-X7n4Q2m9P6';
const POLL_MS = 500;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function probePrinter(ip, port = 9100) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;

    const done = (open, message) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ open, message });
    };

    socket.setTimeout(3000);
    socket.once('connect', () => done(true, 'الطابعة متصلة وجاهزة ✓'));
    socket.once('timeout', () => done(false, 'الطابعة لا ترد على الشبكة'));
    socket.once('error', error => done(false, `تعذّر الوصول إلى الطابعة (${error.code || error.message})`));
    socket.connect(Number(port) || 9100, String(ip));
  });
}

function printRaster(ip, port, width, height, bits) {
  const bytesPerRow = Math.ceil(width / 8);
  const chunks = [Buffer.from([0x1b, 0x40])];
  const BAND = 200;

  for (let y = 0; y < height; y += BAND) {
    const h = Math.min(BAND, height - y);
    chunks.push(Buffer.from([
      0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
      h & 0xff, (h >> 8) & 0xff,
    ]));
    chunks.push(bits.subarray(y * bytesPerRow, (y + h) * bytesPerRow));
  }

  chunks.push(Buffer.from([0x1b, 0x64, 0x04]));
  chunks.push(Buffer.from([0x1d, 0x56, 0x42, 0x00]));

  const payload = Buffer.concat(chunks);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(8000);
    socket.once('timeout', () => fail(new Error('انتهت مهلة الاتصال بالطابعة')));
    socket.once('error', error => fail(new Error(`تعذّر الاتصال بالطابعة ${ip} (${error.code || error.message})`)));

    socket.connect(Number(port) || 9100, String(ip), () => {
      socket.end(payload, () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });
  });
}

async function printWithRetry(ip, port, width, height, bits, attempts = 4) {
  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      await printRaster(ip, port, width, height, bits);
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }

  throw lastError;
}

async function executeJob(payload) {
  const op = String(payload?.op || 'print');
  const ip = String(payload?.ip || '');
  const port = Number(payload?.port) || 9100;

  if (!ip || !/^[\d.]+$/.test(ip)) {
    throw new Error('عنوان الطابعة غير صالح');
  }

  if (op === 'probe') {
    return probePrinter(ip, port);
  }

  if (op !== 'print') {
    throw new Error('نوع مهمة الطباعة غير معروف');
  }

  const width = Number(payload?.width);
  const height = Number(payload?.height);
  const bits = Buffer.from(String(payload?.data || ''), 'base64');

  if (!width || !height || width > 832 || height > 12000) {
    throw new Error('أبعاد الفاتورة غير صالحة');
  }

  if (bits.length !== Math.ceil(width / 8) * height) {
    throw new Error('حجم بيانات الفاتورة غير مطابق');
  }

  await printWithRetry(ip, port, width, height, bits);
  return { message: `تمت الطباعة على ${ip}:${port} ✓` };
}

let polling = false;

async function pollOnce() {
  if (polling) return;
  polling = true;

  try {
    const response = await fetch(
      `${SERVER_BASE}/agent/next/job?deviceId=${encodeURIComponent(DEVICE_ID)}`,
      {
        headers: {
          'X-Print-Agent-Key': AGENT_KEY,
          'X-Tenant': 'luliz',
        },
      }
    );

    if (response.status === 204) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const job = data?.job;

    if (!job?.id || !job?.payload) return;

    console.log(new Date().toLocaleTimeString(), '← job', job.id, job.payload.op || 'print');

    let result;
    try {
      const output = await executeJob(job.payload);
      result = { success: true, result: output || {} };
      console.log(new Date().toLocaleTimeString(), '✓ job done', job.id);
    } catch (error) {
      result = { success: false, result: { message: error.message } };
      console.error(new Date().toLocaleTimeString(), '✗ job failed', job.id, error.message);
    }

    const resultResponse = await fetch(`${SERVER_BASE}/agent/${job.id}/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Print-Agent-Key': AGENT_KEY,
        'X-Tenant': 'luliz',
      },
      body: JSON.stringify(result),
    });

    if (!resultResponse.ok) {
      throw new Error(`result HTTP ${resultResponse.status}`);
    }
  } catch (error) {
    console.error(new Date().toLocaleTimeString(), 'Cloud queue:', error.message);
  } finally {
    polling = false;
  }
}

const diagnosticServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, {
      success: true,
      agent: 'luliz-cloud-print-agent',
      version: VERSION,
      deviceId: DEVICE_ID,
      queue: SERVER_BASE,
    });
  }

  return send(res, 404, { success: false, message: 'غير موجود' });
});

diagnosticServer.listen(PORT, '127.0.0.1', () => {
  console.log('==========================================');
  console.log(` Luliz Cloud Print Agent ${VERSION}`);
  console.log('==========================================');
  console.log(`Device: ${DEVICE_ID}`);
  console.log(`Queue:  ${SERVER_BASE}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log('جاهز لاستقبال مهام الطباعة من السيرفر.');
  console.log('');

  pollOnce();
  setInterval(pollOnce, POLL_MS);
});

diagnosticServer.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error('يوجد برنامج Luliz Print Agent آخر شغال على المنفذ 9123.');
  } else {
    console.error(error);
  }
});
