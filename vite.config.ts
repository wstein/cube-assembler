import { defineConfig, type Plugin } from 'vite'
import preactPlugin from '@preact/preset-vite'
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

// Which code produced a saved fixture: short commit hash, plus "-dirty"
// for uncommitted changes. The dev server reads it once at startup, so
// commits made while it runs don't show until it restarts.
function gitCommit(): string {
  const git = (args: string) =>
    execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  try {
    const hash = git('rev-parse --short HEAD')
    return git('status --porcelain --untracked-files=no')
      ? `${hash}-dirty`
      : hash
  } catch {
    return 'unknown'
  }
}

// The dev server answers with the current commit on every request, so a
// fixture saved hours after startup records the code that actually ran
// (__APP_COMMIT__ is fixed when the server starts; see currentAppCommit).
function appCommitEndpoint(): Plugin {
  return {
    name: 'app-commit-endpoint',
    configureServer(server) {
      server.middlewares.use('/__app-commit', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ commit: gitCommit() }))
      })
    },
  }
}

export default defineConfig({
  plugins: [preactPlugin(), appCommitEndpoint()],
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..', '../..', '.'],
    },
    proxy: {
      '/fixture-upload': {
        target: 'http://127.0.0.1:7100',
        rewrite: (path) => path.replace(/^\/fixture-upload/, ''),
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
