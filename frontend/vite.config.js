import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [
    react({
      // Transform .js files as well (not just .jsx/.tsx) since the project
      // uses HTML template literals that rolldown misidentifies as JSX.
      include: /\.(jsx?|tsx?)$/,
    })
  ],
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