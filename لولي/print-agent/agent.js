'use strict';

const http = require('http');
const net = require('net');
const os = require('os');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = '3.0.3';
const PORT = 9123;
const SERVER_BASE = 'https://loliz-taste.com/api/print-jobs';
const DEVICE_ID = 'luliz-main';
const AGENT_KEY = 'luliz-cloud-print-v1-X7n4Q2m9P6';
const POLL_MS = 500;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function probePort(ip, port = 9100, timeout = 900) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;
    const done = open => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(Number(port) || 9100, String(ip));
  });
}

function localSubnetPrefixes() {
  const found = new Set();
  const interfaces = os.networkInterfaces();

  for (const rows of Object.values(interfaces)) {
    for (const row of rows || []) {
      if (!row || row.internal || row.family !== 'IPv4') continue;
      const parts = String(row.address).split('.');
      if (parts.length === 4) found.add(parts.slice(0, 3).join('.'));
    }
  }

  return [...found];
}

function runPowerShell(command, timeout = 8000) {
  return new Promise((resolve) => {
    const exe = process.env.SystemRoot
      ? process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      : 'powershell.exe';

    execFile(
      exe,
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout, windowsHide: true },
      (error, stdout) => resolve(error ? '' : String(stdout || ''))
    );
  });
}

async function windowsPrinterNames() {
  if (process.platform !== 'win32') return [];

  const out = await runPowerShell(
    "$ErrorActionPreference='SilentlyContinue'; Get-Printer | ForEach-Object { Write-Output ([string]$_.Name) }",
    10000
  );

  return [...new Set(out.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
}

function likelyThermalPrinters(names) {
  const virtual = /(pdf|xps|onenote|fax|microsoft print|document writer)/i;
  const preferred = /(xp[- _]?80|pos|thermal|receipt|80mm|58mm|printer)/i;
  const physical = names.filter(name => !virtual.test(name));

  const strong = physical.filter(name => preferred.test(name));
  if (strong.length === 1) return strong;
  if (strong.length > 1) return strong;
  if (physical.length === 1) return physical;
  return [];
}

async function printViaWindowsSpooler(payload) {
  if (process.platform !== 'win32') {
    throw new Error('Windows spooler fallback غير متاح على هذا النظام');
  }

  const printers = await windowsPrinterNames();
  console.log(new Date().toLocaleTimeString(), 'Windows printers:', printers.join(' | ') || '(none)');

  const candidates = likelyThermalPrinters(printers);
  if (!candidates.length) {
    throw new Error(
      printers.length
        ? `Windows شايف طابعات لكن ما قدرنا نحدد طابعة لوليز تلقائياً: ${printers.join(' | ')}`
        : 'Windows لا يرى أي طابعة مثبتة'
    );
  }

  const printerName = candidates[0];
  const tmp = path.join(os.tmpdir(), `luliz-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(tmp, payload);

  try {
    const script = path.join(__dirname, 'raw-print.ps1');
    if (!fs.existsSync(script)) throw new Error('raw-print.ps1 مفقود من مجلد البرنامج');

    const exe = process.env.SystemRoot
      ? process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      : 'powershell.exe';

    await new Promise((resolve, reject) => {
      execFile(
        exe,
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-PrinterName', printerName, '-FilePath', tmp],
        { timeout: 20000, windowsHide: true, encoding: 'utf8' },
        (error, stdout, stderr) => {
          const out = String(stdout || '').trim();
          if (error || !/^OK\s*$/i.test(out)) {
            reject(new Error(out.replace(/^ERROR:\s*/i, '') || String(stderr || '').trim() || error?.message || 'فشل Windows spooler'));
          } else {
            resolve();
          }
        }
      );
    });

    console.log(new Date().toLocaleTimeString(), `✓ طباعة عبر Windows: ${printerName}`);
    return { printerName };
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function windowsPrinterCandidates(port = 9100) {
  if (process.platform !== 'win32') return [];

  const script = [
    "$ErrorActionPreference='SilentlyContinue';",
    "$ports = Get-PrinterPort | Where-Object { $_.PrinterHostAddress };",
    "$ports | ForEach-Object {",
    "  $addr = [string]$_.PrinterHostAddress;",
    "  $p = if ($_.PortNumber) { [int]$_.PortNumber } else { 9100 };",
    "  Write-Output ($addr + '|' + $p)",
    "}"
  ].join(' ');

  const out = await runPowerShell(script, 10000);
  const rows = out.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  const candidates = [];
  for (const row of rows) {
    const [ip, p] = row.split('|');
    if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) continue;
    const candidatePort = Number(p) || 9100;
    if (candidatePort !== Number(port)) continue;
    candidates.push(ip);
  }

  return [...new Set(candidates)];
}

async function arpCandidates() {
  if (process.platform !== 'win32') return [];

  const out = await runPowerShell(
    "arp -a | Select-String -Pattern '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' | ForEach-Object { " +
    "if ($_.Line -match '((?:\\d{1,3}\\.){3}\\d{1,3})') { $matches[1] } }",
    6000
  );

  return [...new Set(
    out.split(/\r?\n/)
      .map(x => x.trim())
      .filter(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip))
  )];
}

async function firstReachable(candidates, port) {
  for (const ip of [...new Set(candidates)]) {
    if (await probePort(ip, port, 1200)) return ip;
  }
  return null;
}

async function scanForPrinters(port = 9100, extraPrefixes = []) {
  const prefixes = [...new Set([...localSubnetPrefixes(), ...extraPrefixes.filter(Boolean)])];
  const candidates = [];

  for (const prefix of prefixes) {
    const ips = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);

    for (let i = 0; i < ips.length; i += 48) {
      const batch = ips.slice(i, i + 48);
      const results = await Promise.all(
        batch.map(async ip => ({ ip, open: await probePort(ip, port, 350) }))
      );
      candidates.push(...results.filter(x => x.open).map(x => x.ip));
    }
  }

  return [...new Set(candidates)];
}

async function diagnoseTarget(ip, preferredPort = 9100) {
  const localIps = [];
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows || []) {
      if (row && !row.internal && row.family === 'IPv4') localIps.push(row.address);
    }
  }

  console.log(new Date().toLocaleTimeString(), 'Laptop IPv4:', localIps.join(', ') || '(none)');

  let pingOk = false;
  if (process.platform === 'win32') {
    const ping = await runPowerShell(
      `Test-Connection -ComputerName '${ip}' -Count 1 -Quiet -ErrorAction SilentlyContinue`,
      5000
    );
    pingOk = String(ping).trim().toLowerCase() === 'true';
  }
  console.log(new Date().toLocaleTimeString(), `Ping ${ip}: ${pingOk ? 'OK' : 'NO RESPONSE'}`);

  const commonPorts = [...new Set([Number(preferredPort) || 9100, 9100, 9101, 9102, 515, 631, 80])];
  const openPorts = [];
  for (const p of commonPorts) {
    if (await probePort(ip, p, 700)) openPorts.push(p);
  }
  console.log(new Date().toLocaleTimeString(), `Open ports on ${ip}: ${openPorts.length ? openPorts.join(', ') : 'none'}`);

  return { localIps, pingOk, openPorts };
}

const resolvedTargets = new Map();

async function resolvePrinterTarget(ip, port = 9100) {
  const key = `${ip}:${port}`;
  const cached = resolvedTargets.get(key);

  if (cached && await probePort(cached, port, 1000)) {
    return { ip: cached, port, changed: cached !== ip };
  }

  if (await probePort(ip, port, 1200)) {
    return { ip, port, changed: false };
  }

  console.log(new Date().toLocaleTimeString(), `⚠ ${ip}:${port} لا يرد — جاري التشخيص والبحث عن عنوان الطابعة الحقيقي...`);
  const diag = await diagnoseTarget(ip, port);

  if (diag.pingOk && diag.openPorts.length && !diag.openPorts.includes(Number(port))) {
    throw new Error(`الطابعة ${ip} موجودة على الشبكة لكن المنفذ ${port} مغلق. المنافذ المفتوحة: ${diag.openPorts.join(', ')}`);
  }

  const windowsCandidates = await windowsPrinterCandidates(port);
  if (windowsCandidates.length) {
    console.log(new Date().toLocaleTimeString(), 'Windows printer ports:', windowsCandidates.join(', '));
    const found = await firstReachable(windowsCandidates, port);
    if (found) {
      resolvedTargets.set(key, found);
      console.log(new Date().toLocaleTimeString(), `✓ تم العثور على الطابعة من Windows: ${found}:${port}`);
      return { ip: found, port, changed: found !== ip };
    }
  }

  const arp = await arpCandidates();
  if (arp.length) {
    const found = await firstReachable(arp, port);
    if (found) {
      resolvedTargets.set(key, found);
      console.log(new Date().toLocaleTimeString(), `✓ تم العثور على الطابعة من شبكة Windows: ${found}:${port}`);
      return { ip: found, port, changed: found !== ip };
    }
  }

  console.log(new Date().toLocaleTimeString(), 'لم نجدها ضمن منافذ Windows — جاري فحص الشبكة المحلية...');
  const targetPrefix = String(ip).split('.').slice(0, 3).join('.');
  const candidates = await scanForPrinters(port, [targetPrefix]);

  if (candidates.length === 1) {
    resolvedTargets.set(key, candidates[0]);
    console.log(new Date().toLocaleTimeString(), `✓ تم العثور على الطابعة تلقائياً: ${candidates[0]}:${port}`);
    return { ip: candidates[0], port, changed: candidates[0] !== ip };
  }

  if (candidates.length > 1) {
    throw new Error(`العنوان ${ip} لا يرد. وُجد أكثر من جهاز على المنفذ ${port}: ${candidates.join(', ')}`);
  }

  throw new Error(`الطابعة لا ترد على ${ip}:${port}. لم نجد أي طابعة عبر Windows أو ARP أو فحص الشبكة. تأكد أن الطابعة واللابتوب على نفس الراوتر وأن IP الطابعة ثابت.`);
}

async function probePrinter(ip, port = 9100) {
  try {
    const target = await resolvePrinterTarget(ip, port);
    return {
      open: true,
      message: target.changed
        ? `الطابعة متصلة وجاهزة ✓ — تم تصحيح IP تلقائياً إلى ${target.ip}`
        : 'الطابعة متصلة وجاهزة ✓',
      resolvedIp: target.ip,
      resolvedPort: target.port,
    };
  } catch (error) {
    return { open: false, message: error.message };
  }
}

function buildEscPosPayload(width, height, bits) {
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
  return Buffer.concat(chunks);
}

function printRaster(ip, port, width, height, bits) {
  const payload = buildEscPosPayload(width, height, bits);

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

async function printWithRetry(ip, port, width, height, bits, attempts = 2) {
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

  console.log(new Date().toLocaleTimeString(), `→ printer target ${ip}:${port}`);

  try {
    const target = await resolvePrinterTarget(ip, port);
    await printWithRetry(target.ip, target.port, width, height, bits);
    return {
      message: target.changed
        ? `تمت الطباعة ✓ — تم تصحيح IP تلقائياً إلى ${target.ip}:${target.port}`
        : `تمت الطباعة على ${target.ip}:${target.port} ✓`,
      resolvedIp: target.ip,
      resolvedPort: target.port,
    };
  } catch (networkError) {
    console.log(new Date().toLocaleTimeString(), `⚠ فشل مسار الشبكة: ${networkError.message}`);
    console.log(new Date().toLocaleTimeString(), '→ جاري تجربة Windows Print Spooler...');

    const payload = buildEscPosPayload(width, height, bits);
    const spool = await printViaWindowsSpooler(payload);

    return {
      message: `تمت الطباعة عبر Windows ✓ — ${spool.printerName}`,
      windowsPrinterName: spool.printerName,
    };
  }
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
