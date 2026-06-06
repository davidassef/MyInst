import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const usaProxyLocal = !env.VITE_MYINST_API_BASE;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: usaProxyLocal
        ? {
            '/api': {
              target: 'http://localhost:3000',
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
