import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'))
const sha = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const pin = readJSON('vendor/capture-core.json')
const installed = resolve('node_modules', pin.package)
const provenance = readJSON(resolve(installed, 'provenance.json'))
const manifest = readJSON(resolve(installed, 'package.json'))
if (
  sha(resolve('vendor', pin.artifact)) !== pin.sha256 ||
  provenance.sourceRevision !== pin.sourceRevision ||
  provenance.dirty !== false ||
  manifest.name !== pin.package ||
  manifest.version !== pin.version
)
  throw new Error('Capture Core package does not match the reviewed source pin')
for (const [name, expected] of Object.entries(provenance.sourceHashes)) {
  if (sha(resolve(installed, 'source', name)) !== expected)
    throw new Error(`Capture Core source integrity mismatch: ${name}`)
}
for (const [name, expected] of Object.entries(provenance.runtimeHashes)) {
  if (sha(resolve(installed, 'lib', name)) !== expected)
    throw new Error(`Capture Core runtime integrity mismatch: ${name}`)
}
console.log(
  `Capture Core ${pin.version}: source ${pin.sourceRevision}, artifact and source/runtime hashes match`,
)
