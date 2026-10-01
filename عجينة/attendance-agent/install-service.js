'use strict';

/**
 * Register the agent as a Windows service.
 *
 * A branch machine gets rebooted, logged out of, and left at a lock screen.
 * Anything started from a shortcut or a console window dies with the session,
 * and attendance would silently stop — so the agent has to run as a service,
 * which starts before login and restarts itself on failure.
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
  console.error('  شغّل: npm install node-windows');
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.error('✖ هذا المثبّت لويندوز فقط. على لينكس استخدم systemd.');
  process.exit(1);
}

const svc = new Service({
  name: 'Ajineh Attendance Agent',
  description: 'وكيل جهاز البصمة — يربط جهاز ZKTeco المحلي بسيرفر عجينة وطحينة',
  script: path.join(__dirname, 'index.js'),
  /* Restart quickly but back off, so a misconfigured agent doesn't spin the
     CPU of the machine it shares with the POS. */
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
