import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        formcheck: resolve(__dirname, 'formcheck.html'),
        setup: resolve(__dirname, 'setup.html'),
        session: resolve(__dirname, 'session.html'),
        summary: resolve(__dirname, 'summary.html')
      }
    }
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true
  },
  preview: {
    host: 'localhost',
    port: 5173,
    strictPort: true
  }
});
