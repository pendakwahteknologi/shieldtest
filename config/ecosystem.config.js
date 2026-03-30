module.exports = {
  apps: [
    {
      name: 'shieldtest',
      script: 'packages/backend/dist/server.js',
      cwd: '/opt/shieldtest',
      instances: 1,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/shieldtest/error.log',
      out_file: '/var/log/shieldtest/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
