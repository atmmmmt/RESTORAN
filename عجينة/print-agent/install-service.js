'use strict';

/**
 * Register the print agent as a Windows service.
 *
 * The .bat works, but it ties every receipt to a console window somebody has
 * to remember to open — and the first thing a cashier does with a black window
 * in the way is close it. As a service the agent is up before anyone logs in,
 * comes back after a power cut, and nobody has to think about it again.
 *
 *   node install-service.js              install + start
 *   node install-service.js --uninstall  remove
 */

const path = require('path');

let Service;
try {
  ({ Service } = require('node-windows'));
} catch {
  console.error('✖ حزمة node-windows غير مثبتة.');
  console.error('  شغّل: npm install');
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.error('✖ هذا المثبّت لويندوز فقط.');
  process.exit(1);
}

const svc = new Service({
  name: 'Ajineh Print Agent',
  description: 'وكيل الطابعة الحرارية — يمرّر فواتير ESC/POS من الداشبورد إلى طابعة الشبكة',
  script: path.join(__dirname, 'index.js'),
  /* Restart quickly but back off — this machine is also running the POS. */
  wait: 2,
  grow: 0.5,
  maxRestarts: 40,
});

const uninstalling = process.argv.includes('--uninstall');

if (uninstalling) {
  svc.on('uninstall', () => console.log('✓ تم حذف الخدمة'));
  svc.uninstall();
} else {
  svc.on('install', () => {
    console.log('✓ تم تثبيت الخدمة — جاري التشغيل');
    svc.start();
  });
  svc.on('alreadyinstalled', () => console.log('الخدمة مثبتة مسبقاً'));
  svc.on('start', () => {
    console.log('✓ الخدمة تعمل. ستبدأ تلقائياً مع كل إقلاع للجهاز.');
    console.log('  السجلات: Event Viewer → Windows Logs → Application');
  });
  svc.install();
}
