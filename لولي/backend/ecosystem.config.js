'use strict';

module.exports = {
  apps: [
    {
      name: 'loliz-backend',
      script: 'src/server.js',
      instances: 1,          // single process — no extra RAM from clustering
      exec_mode: 'fork',

      // ── Memory ceiling ──────────────────────────────────────────────────
      // Restart before the OS starts swapping; keeps neighbours unaffected.
      max_memory_restart: '400M',

      // ── Environment ─────────────────────────────────────────────────────
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
      },

      // ── Logs — capped + rotated by pm2-logrotate ────────────────────────
      // Install once on the server:  pm2 install pm2-logrotate
      // Then:  pm2 set pm2-logrotate:max_size 20M
      //        pm2 set pm2-logrotate:retain 5
      //        pm2 set pm2-logrotate:compress true
      out_file:       'logs/out.log',
      error_file:     'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // ── Crash guard ──────────────────────────────────────────────────────
      // Exponential back-off on crashes so a boot-loop doesn't spin the CPU.
      restart_delay: 3000,
      max_restarts:  10,
      min_uptime:    '10s',

      // ── Graceful shutdown ────────────────────────────────────────────────
      kill_timeout: 10000,   // ms to wait for shutdown() before SIGKILL
      listen_timeout: 8000,  // ms to wait for app to be ready
    },
  ],
};
