import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: process.env.TAURI_DEV_HOST || '127.0.0.1', port: 5173, strictPort: true } });
