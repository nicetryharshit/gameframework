import { defineConfig } from 'vite';
import editorApi from './scripts/editor-api.mjs';

export default defineConfig({
  base: './',
  plugins: [editorApi()],
  server: { host: process.env.TAURI_DEV_HOST || '127.0.0.1', port: 5173, strictPort: true }
});
