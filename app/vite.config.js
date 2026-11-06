import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/app/',
  // Feedback reports say which build they came from
  define: { __APP_BUILD__: JSON.stringify(`Build ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`) },
  plugins: [react(), tailwindcss()],
  build: { outDir: '../site/app', emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
