import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      'react-dom/client': 'preact/compat',
    },
  },
  ssr: {
    noExternal: ['zustand'],
  },
  test: {
    environment: 'jsdom',
  },
});
