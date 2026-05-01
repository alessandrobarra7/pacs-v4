module.exports = {
  apps: [
    {
      name: 'pacs-portal',
      script: 'dist/index.js',
      cwd: '/var/www/pacs-portal',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'America/Sao_Paulo',  // BUG-1 FIX: evita dia errado entre 21h-00h (VM roda em UTC)
      },
      error_file: '/root/.pm2/logs/pacs-portal-error.log',
      out_file: '/root/.pm2/logs/pacs-portal-out.log',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
