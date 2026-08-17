// PM2 Ecosystem Configuration
// Install: npm install -g pm2
// Start:   pm2 start ecosystem.config.cjs --env production
// Monitor: pm2 monit
// Logs:    pm2 logs servicedesk-api
// Restart: pm2 restart servicedesk-api
// Stop:    pm2 stop servicedesk-api

module.exports = {
  apps: [
    {
      name: "servicedesk-api",
      script: "src/server.js",
      cwd: "./backend",

      // SINGLE INSTANCE, ON PURPOSE — do not switch to cluster/"max".
      // server.js runs its background jobs with in-process setInterval timers
      // (SLA breach detection, approval auto-timeout, and the 3-day auto-close
      // sweep). Every worker would run its own copy of those timers, so N cores
      // would mean N duplicate breach events, N duplicate notifications to the
      // same requester, and concurrent auto-close sweeps racing each other.
      // If this ever needs to scale horizontally, move the cron work out of the
      // API process (a dedicated worker or a real scheduler) first.
      instances: 1,
      exec_mode: "fork",

      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },

      // Restart policy
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "500M",

      // Logging — paths are relative to `cwd` above, i.e. backend/logs/.
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,

      // Watch is for development only; in production redeploy via pm2 restart.
      watch: false,
      ignore_watch: ["node_modules", "logs"],
    },
  ],
};
