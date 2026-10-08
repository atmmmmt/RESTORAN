'use strict';

const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const AGENT_VERSION = '1.2.0';

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const listenHost = config.listenHost || '127.0.0.1';
const listenPort = Number(config.listenPort) || 18181;
const allowedOrigins = new Set(config.allowedOrigins || []);

function isPrivateHost(host) {
  return /^(127\.0\.0\.1|localhost|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(String(host));
}

function reply(res, status, body, origin) {
  if (origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.writeHead(status); res.end(JSON.stringify(body));
}

function sendToPrinter(host, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => socket.end(buffer));
    socket.on('close', hadError => { if (!hadError) resolve(); });
    socket.on('timeout', () => socket.destroy(new Error('انتهت مهلة اتصال الطابعة')));
    socket.on('error', reject);
  });
}

/* ── USB printers ─────────────────────────────────────────────────────
   A USB receipt printer has no address to connect to; it is reached by
   name through the Windows spooler, and only the RAW data type gets the
   ESC/POS bytes to the device without a driver rewriting them into a
   page. raw-print.ps1 holds that call — see the note at its head. */

const powershell = () => path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
);

function runPowerShell(args, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile(powershell(), args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (!error) return resolve(String(stdout));
      /* raw-print.ps1 marks its own failures with an ERROR: line; anything
         else is PowerShell talking, and its first line is the useful part. */
      const text = `${stderr || ''}\n${stdout || ''}`;
      const tagged = /^ERROR:\s*(.+)$/m.exec(text);
      const message = tagged ? tagged[1] : (text.trim().split('\n')[0] || error.message);
      reject(new Error(message.trim()));
    });
  });
}

/** Printer names Windows knows about, for the dropdown in the settings page. */
async function listPrinters() {
  if (process.platform !== 'win32') return [];
  const out = await runPowerShell([
    '-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; ' +
    'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name',
  ], 15000);
  return out.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

async function sendToUsbPrinter(printerName, buffer) {
  if (process.platform !== 'win32') throw new Error('طباعة USB مدعومة على ويندوز فقط');
  /* The spooler reads a file, so the ticket lands in temp for the length of
     one print and is removed straight after — a receipt carries a customer's
     order and has no business outliving the job. */
  const file = path.join(os.tmpdir(), `ajineh-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(file, buffer);
  try {
    await runPowerShell([
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'raw-print.ps1'),
      '-PrinterName', printerName,
      '-FilePath', file,
    ]);
  } finally {
    try { fs.unlinkSync(file); } catch { /* temp sweep will get it */ }
  }
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || '';
  if (origin && !allowedOrigins.has(origin)) {
    /* Printed, because this rejection is invisible from the browser: the
       preflight is refused before any CORS header goes out, so the page sees
       a bare network failure and blames the agent for not running. The one
       place the real reason can surface is this window. */
    console.error(`✖ رُفض طلب من ${origin} — أضفه إلى allowedOrigins في config.json`);
    return reply(res, 403, { success: false, message: 'Origin غير مسموح' });
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    /* Private Network Access. The dashboard is a public https site reaching
       into 127.0.0.1, which Chrome guards: it preflights even a plain GET and
       drops the request unless the local server answers that it consented.
       Without this line every call fails as a bare network error — the page
       cannot tell it apart from an agent that isn't running, which is exactly
       what it used to report. The agent already binds to loopback only and
       prints solely to LAN or local devices; this header grants nothing
       beyond what the allow-list above has admitted. */
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204); return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') {
    /* The version is here so a machine can be asked what it is actually
       running. "I copied the file" and "the new file is running" are not the
       same claim, and telling them apart by symptom costs an afternoon. */
    return reply(res, 200, {
      success: true, service: 'loliz-print-agent', version: AGENT_VERSION,
      usb: process.platform === 'win32',
      privateNetwork: true,
      rawPrint: fs.existsSync(path.join(__dirname, 'raw-print.ps1')),
      allowedOrigins: [...allowedOrigins],
    }, origin);
  }
  if (req.method === 'GET' && req.url === '/printers') {
    return listPrinters()
      .then(printers => reply(res, 200, { success: true, printers }, origin))
      .catch(error => reply(res, 500, { success: false, message: error.message }, origin));
  }
  if (req.method !== 'POST' || req.url !== '/print') return reply(res, 404, { success: false, message: 'Not found' }, origin);

  let raw = '';
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 4_000_000) req.destroy(new Error('الطلب كبير جداً'));
  });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw || '{}');
      const data = Buffer.from(String(body.dataBase64 || ''), 'base64');
      if (!data.length || data.length > 2_500_000) throw new Error('بيانات الطباعة غير صالحة');
      const copies = Math.max(1, Math.min(5, Number(body.copies) || 1));

      /* Either a LAN printer at an address, or a USB one by name. The caller
         says which; a printerName with no host is taken as USB so an older
         dashboard build keeps working unchanged. */
      const usb = body.connection === 'usb' || (!body.host && body.printerName);
      let label;

      if (usb) {
        const printerName = String(body.printerName || '').trim();
        if (!printerName || printerName.length > 200) throw new Error('اسم طابعة USB غير صالح');
        for (let i = 0; i < copies; i++) await sendToUsbPrinter(printerName, data);
        label = printerName;
      } else {
        const host = String(body.host || '');
        const port = Number(body.port || 9100);
        if (!isPrivateHost(host) || port < 1 || port > 65535) throw new Error('عنوان طابعة LAN غير صالح');
        for (let i = 0; i < copies; i++) await sendToPrinter(host, port, data);
        label = `${host}:${port}`;
      }

      reply(res, 200, { success: true, copies, printer: label }, origin);
    } catch (error) {
      reply(res, 502, { success: false, message: error.message }, origin);
    }
  });
});

server.listen(listenPort, listenHost, () => {
  /* Copying one file out of three and restarting looks exactly like a
     successful update from the outside. Say plainly, at startup, what this
     copy actually has — the window is open anyway. */
  console.log(`Print Agent ${AGENT_VERSION}: http://${listenHost}:${listenPort}`);
  console.log(`  العناوين المسموحة: ${[...allowedOrigins].join(' , ') || '(لا يوجد)'}`);
  if (!fs.existsSync(path.join(__dirname, 'raw-print.ps1'))) {
    console.error('  ✖ raw-print.ps1 مفقود — طباعة USB لن تعمل. انسخ المجلد كاملاً.');
  }
});
