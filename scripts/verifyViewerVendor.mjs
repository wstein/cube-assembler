import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'))
const pin = readJSON('vendor/viewer.json')
const sha = createHash('sha256')
  .update(readFileSync(resolve('vendor', pin.artifact)))
  .digest('hex')
const readme = readFileSync('vendor/README.md', 'utf8')
if (
  !readme.includes(pin.artifact) ||
  !readme.includes(pin.sha256) ||
  !readme.includes(pin.sourceRevision)
)
  throw new Error(
    'vendor/README.md does not match the pin in vendor/viewer.json',
  )
const installed = resolve('node_modules', pin.package)
const manifest = readJSON(resolve(installed, 'package.json'))
if (
  sha !== pin.sha256 ||
  manifest.name !== pin.package ||
  manifest.version !== pin.version ||
  !existsSync(resolve(installed, 'NOTICE')) ||
  !existsSync(resolve(installed, 'dist/bridge/index.mjs'))
)
  throw new Error('Viewer package does not match vendor/viewer.json')
console.log(
  `Viewer ${pin.version}: source ${pin.sourceRevision}, artifact sha256 matches, NOTICE and bridge present`,
)
