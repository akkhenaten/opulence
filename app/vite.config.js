import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Orb Security's API (this app began as a copy of it); a build pointing there breaks every sign-in
const ORB_API = 'hopedp5cvxdkhhpb47hfxszhwq0aqtnw';

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && (loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE || '').includes(ORB_API)) {
    throw new Error('VITE_API_BASE points at Orb Security\'s API, not Opulence\'s. Fix it before building.');
  }
  return {
    base: '/app/',
    // Feedback reports say which build they came from
    define: { __APP_BUILD__: JSON.stringify(`Build ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`) },
    plugins: [react(), tailwindcss()],
    build: { outDir: '../site/app', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  };
});
