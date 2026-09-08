import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'API_PROXY_');
  const target = process.env.API_PROXY_TARGET ?? env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';
  const url = new URL(target);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('API_PROXY_TARGET must be a loopback HTTP(S) origin without credentials or a path.');
  }

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/ai': {
          target: url.origin,
          changeOrigin: true,
          timeout: 60_000,
          proxyTimeout: 60_000,
        },
        '/api': {
          target: url.origin,
          changeOrigin: true,
          timeout: 15_000,
          proxyTimeout: 15_000,
        },
      },
    },
  };
});
