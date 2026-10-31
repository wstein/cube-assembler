// Writes test/cube/notation/orbit64V2Vectors.json from the Orbit64 V2
// reference repository (flix-orbit64, Apache-2.0).
//
//   node scripts/orbit64V2Fixture.mjs <path to flix-orbit64>
//
// It copies the 54-row registry table of FORMAT-V2.md and the 195 reference
// vectors of test/TestV2VectorData.flix, which tools/format-v2/vectors.jl
// generates there. Nothing is computed here.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.argv[2]
if (!root) {
  console.error('usage: node scripts/orbit64V2Fixture.mjs <flix-orbit64 dir>')
  process.exit(2)
}

const read = (path) => readFileSync(join(root, path), 'utf8')
const revision = execFileSync('git', [
  '-C',
  root,
  'rev-parse',
  '--short',
  'HEAD',
])
  .toString()
  .trim()

// | 10 | 5x5x5 color canonical | 2.829e+74 | 247.32 | 42 | 0 |
// | 11 | 5x5x5 color framed | 6.789e+75 | 251.91 | 42 | `N_10` |
const registry = read('FORMAT-V2.md')
  .split('\n')
  .map((line) =>
    /^\| (\d+) \| (\d+x\d+x\d+ [a-z ]+) \| (\S+) \| (\S+) \| (\d+) \| (.+) \|$/.exec(
      line,
    ),
  )
  .filter((match) => match !== null)
  .map(([, id, type, states, bits, length, offset]) => ({
    id: Number(id),
    type,
    states,
    bits,
    length: Number(length),
    // "0", or the ID whose state count it is ("`N_10`").
    offset: offset === '0' ? 0 : Number(/^`N_(\d+)`$/.exec(offset)[1]),
  }))

// (0, "cp=0,1,...;ct=0,...", "AAAA"),
const vectors = read('test/TestV2VectorData.flix')
  .split('\n')
  .map((line) => /^\s*\((\d+), "([^"]*)", "([^"]*)"\),?\s*$/.exec(line))
  .filter((match) => match !== null)
  .map(([, id, state, token]) => ({ id: Number(id), state, token }))

if (registry.length !== 54) throw new Error(`registry rows: ${registry.length}`)
if (vectors.length !== 195) throw new Error(`vector rows: ${vectors.length}`)

const out = {
  source: `flix-orbit64@${revision}: FORMAT-V2.md (initial registry table) and test/TestV2VectorData.flix (generated there by tools/format-v2/vectors.jl)`,
  generatedBy: 'scripts/orbit64V2Fixture.mjs. Do not edit.',
  stateText:
    'key=v,v,...;key=... with keys cp ct mp mf w1.. z1.. fr fm, see the header of tools/format-v2/vectors.jl',
  registry,
  vectors,
}
const target = fileURLToPath(
  new URL('../test/cube/notation/orbit64V2Vectors.json', import.meta.url),
)
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`)
console.log(
  `wrote ${registry.length} registry rows and ${vectors.length} vectors`,
)
