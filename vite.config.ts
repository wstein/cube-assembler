import { defineConfig } from 'vite'
import preactPlugin from '@preact/preset-vite'

export default defineConfig({
  plugins: [preactPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  optimizeDeps: {
    include: ['preact', 'preact/hooks', 'preact/compat'],
  },
})