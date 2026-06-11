// PM2 Ecosystem Configuration
// Install: npm install -g pm2
// Start:   pm2 start ecosystem.config.cjs
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
      node_args: "--experimental-modules",
      instances: "max", // use all CPU cores
      exec_mode: "cluster",
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
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
      // Watch (disabled in production - use pm2 restart instead)
      watch: false,
      ignore_watch: ["node_modules", "logs"],
    },
  ],
};
