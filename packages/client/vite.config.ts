import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/trpc': 'http://localhost:3001',
    },
    fs: {
      allow: ['..'],
    },
  },
});
