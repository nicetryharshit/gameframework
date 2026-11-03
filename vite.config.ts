import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({ base: './', server: { host: process.env.TAURI_DEV_HOST || '127.0.0.1', port: 5173, strictPort: true }, build: { rollupOptions: { input: {
  index: resolve(import.meta.dirname, 'index.html'),
  '2d': resolve(import.meta.dirname, '2d.html'),
  '3d': resolve(import.meta.dirname, '3d.html')
} } } });
