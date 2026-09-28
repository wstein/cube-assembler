import { spawn } from 'node:child_process'

// npm and bun keep node_modules/.bin on PATH. Build once before this script
// runs so Vite can resolve generated imports immediately; watch subsequent
// .res edits. Vite only strips types, so tsc checks them alongside - without
// clearing the screen, which would hide Vite's URL - and keeps running when
// it finds errors.
const children = [
  spawn('rescript', ['watch', '--warn-error', '+a'], { stdio: 'inherit' }),
  spawn('tsc', ['--noEmit', '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
  }),
  spawn('vite', process.argv.slice(2), { stdio: 'inherit' }),
]

let stopping = false
function stop(signal) {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal))
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(error)
    stop('SIGTERM')
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    if (stopping) return
    stop('SIGTERM')
    process.exitCode = code ?? (signal ? 1 : 0)
  })
}
