// Replays every frame saved with "Save missed faces for diagnosis"
// (test/diagnostics/<name>/frame.jpg + meta.json, see POST /api/diagnostics)
// through Detect face's current code, next to what the capture dialog
// reported when it saved it - so a fix can be checked against the exact
// frames that failed live. Run: npm run diagnostics:replay
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { diagnoseFaceDetection, type DetectionReport } from '../src/client/detectionDiagnostics'

const root = join(import.meta.dir, '..', 'test', 'diagnostics')
const names = existsSync(root) ? readdirSync(root).filter((name) => existsSync(join(root, name, 'meta.json'))).sort() : []
if (names.length === 0) {
  console.log('No saved diagnostics - turn on "Save missed faces for diagnosis" in the capture dialog (Detect face).')
  process.exit(0)
}

const describe = (r: Pick<DetectionReport, 'detected' | 'reason' | 'alignment'>) =>
  `${r.detected ? 'found' : r.reason} (seam score ${r.alignment.score.toFixed(1)})`

let nowFound = 0
for (const name of names) {
  const meta = JSON.parse(readFileSync(join(root, name, 'meta.json'), 'utf8')) as { frame: string; report: DetectionReport }
  if (!meta.frame.endsWith('.jpg')) {
    console.log(`${name}  skipped: only JPEG frames are replayed`)
    continue
  }
  const image = jpeg.decode(readFileSync(join(root, name, meta.frame)), { useTArray: true })
  const now = diagnoseFaceDetection(Uint8ClampedArray.from(image.data), image.width, image.height, meta.report.gridSize)
  if (now.detected) nowFound++
  console.log(`${name}  ${meta.report.gridSize}x${meta.report.gridSize}  then: ${describe(meta.report)}  now: ${describe(now)}  colors ${now.colors.map((row) => row.join('')).join('/')}`)
}
console.log(`\n${nowFound} of ${names.length} saved frames are found by the current code.`)
