// ecosystem.config.js — PM2 Process Manager Config
// MyLocalBazaar.store Backend
// Usage: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name:          'mlb-backend',
      script:        'src/server.js',
      instances:     'max',          // use all CPU cores
      exec_mode:     'cluster',      // Node.js cluster mode
      autorestart:   true,
      watch:         false,          // never watch in production
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
        PORT:     5000,
      },

      env_production: {
        NODE_ENV: 'production',
        PORT:     5000,
      },

      // Log config
      log_date_format:   'YYYY-MM-DD HH:mm:ss Z',
      error_file:        './logs/pm2-error.log',
      out_file:          './logs/pm2-out.log',
      merge_logs:        true,

      // Restart policy
      min_uptime:        '10s',
      max_restarts:      10,
      restart_delay:     4000,

      // Graceful shutdown
      kill_timeout:      10000,
      listen_timeout:    5000,
      shutdown_with_message: true,
    },
  ],
};
