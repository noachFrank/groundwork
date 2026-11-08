import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';

export default defineConfig({
  plugins: [
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkFrontmatter] }) },
    react({ include: /\.(mdx|tsx|ts)$/ }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4310',
      '/vendor': 'http://127.0.0.1:4310',
      '/js-runner.js': 'http://127.0.0.1:4310',
    },
  },
  worker: { format: 'es' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
