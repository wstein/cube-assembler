import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import preactPlugin from '@preact/preset-vite'
import pkg from './package.json' with { type: 'json' }

// Which code produced a saved fixture: short commit hash, plus "-dirty"
// when built from uncommitted changes. "unknown" outside a git checkout.
function gitCommit(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() !== ''
    return dirty ? `${hash}-dirty` : hash
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [preactPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
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