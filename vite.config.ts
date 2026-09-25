import { defineConfig } from 'vite'
import preactPlugin from '@preact/preset-vite'
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

// Which code produced a saved fixture: short commit hash, plus "-dirty"
// for uncommitted changes. The dev server reads it once at startup, so
// commits made while it runs don't show until it restarts.
function gitCommit(): string {
  const git = (args: string) => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  try {
    const hash = git('rev-parse --short HEAD')
    return git('status --porcelain --untracked-files=no') ? `${hash}-dirty` : hash
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [preactPlugin()],
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
  },
  server: {
    port: 5173,
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
