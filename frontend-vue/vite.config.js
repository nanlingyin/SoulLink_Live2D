import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const backendOrigin = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:3000';
const backendUrl = new URL(backendOrigin);
const wsProtocol = backendUrl.protocol === 'https:' ? 'wss:' : 'ws:';
const wsTarget = `${wsProtocol}//${backendUrl.host}`;

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true
      },
      '/ws': {
        target: wsTarget,
        ws: true,
        changeOrigin: true
      },
      '/static': {
        target: backendOrigin,
        changeOrigin: true
      },
      '/l2d': {
        target: backendOrigin,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173
  }
});
