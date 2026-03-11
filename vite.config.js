import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

export default defineConfig({
  plugins: [
    {
      name: 'copy-legacy-scripts',
      writeBundle(options) {
        const outDir = options.dir || 'dist';
        mkdirSync(outDir, { recursive: true });
        [
          'formcheck-state.js',
          'formcheck-select.js',
          'formcheck-setup.js',
          'formcheck.js',
          'formcheck-summary.js'
        ].forEach((file) => {
          copyFileSync(resolve(__dirname, file), resolve(__dirname, outDir, file));
        });
      }
    }
  ],
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
