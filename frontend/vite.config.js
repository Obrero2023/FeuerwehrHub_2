import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));
const appVersion = process.env.APP_VERSION || version;

export default defineConfig({
  resolve: {
    dedupe: [
      'chart.js',
      'lucide',
      'html5-qrcode',
      'jspdf',
      'jspdf-autotable',
      'pdf-lib',
      'qrcode'
    ]
  },
  plugins: [],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
