import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browsers only allow camera/microphone (video meetings) on HTTPS or localhost, so serve HTTPS
// when the repo's certificate pair exists. Delete or rename them to fall back to plain HTTP.
const certDir = path.resolve(__dirname, '..');
const key = path.join(certDir, 'server.key');
const cert = path.join(certDir, 'server.crt');
const https = fs.existsSync(key) && fs.existsSync(cert) ? { key: fs.readFileSync(key), cert: fs.readFileSync(cert) } : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 7173,
    https,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true },
    },
  },
});
