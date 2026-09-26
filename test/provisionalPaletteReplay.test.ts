/**
 * test/provisionalPaletteReplay.test.ts
 * Replays Automatic's provisional palette choice over the saved real
 * captures (gitignored, like test/fixtures.test.ts). After each captured
 * face, in the order the faces were taken, matchPartialColorProfile picks a
 * profile from the faces so far - the palette the live preview then uses for
 * the next face. This measures, per capture:
 *   - how often that choice switches, and after how many faces it settles
 *     on the six-face choice;
 *   - whether it agrees with the profile the capture recorded as resolved
 *     (capture.colorProfile, newer fixtures only);
 *   - how many stickers of the next face the choice reads as reviewed,
 *     against camera hues alone (no palette) before the first face.
 * It asserts only that the replay runs. The numbers are written as JSON to
 * $REPLAY_REPORT when set; $REPLAY_PROFILES may name a saved settings or
 * profiles file whose color profiles join the candidates. A profile learned
 * from the replayed capture itself (id fixture-<capture time>) is left out
 * of that capture's candidates, or the replay would grade itself.
 *
 * Run: REPLAY_REPORT=report.json npx vitest run test/provisionalPaletteReplay.test.ts
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { matchPartialColorProfile } from '../src/client/colorProfileLearning'
import { readFixtureColors } from '../src/client/fixtureFormat'
import { classifySticker, type RGB } from '../src/client/imageProcessing'
import { genericColorProfile, type ColorProfile } from '../src/client/profileSettings'
import { parseSettingsFile } from '../src/client/profileStorage'

const root = join(__dirname, 'fixtures')
const captures = existsSync(root)
  ? readdirSync(root).filter((name) => name.startsWith('capture-') && existsSync(join(root, name, 'meta.json'))).sort()
  : []

interface Face { slot: string; readings: RGB[]; truth: string[] }
interface Capture { name: string; size: number; faces: Face[]; recorded: { id: string; name: string } | null }

type Meta = {
  gridSize: number
  faces: Record<string, { readings?: number[][]; capturedAt?: string }>
  capture?: { colorProfile?: { id: string; name: string; colors?: Record<string, RGB> } }
}

// Faces in the order they were taken, with their per-sticker readings and
// reviewed colors; null when a face lacks readings.
function loadCapture(name: string): { capture: Capture; recordedProfile: ColorProfile | null } | null {
  const meta = JSON.parse(readFileSync(join(root, name, 'meta.json'), 'utf8')) as Meta
  const colors = readFixtureColors(meta as Parameters<typeof readFixtureColors>[0])?.colors
  if (!colors) return null
  const slots = Object.keys(meta.faces).sort((a, b) => (meta.faces[a].capturedAt ?? '').localeCompare(meta.faces[b].capturedAt ?? ''))
  const faces: Face[] = []
  for (const slot of slots) {
    const readings = meta.faces[slot].readings
    const truth = colors[slot.toUpperCase()]?.flat()
    if (!readings || !truth || readings.length !== truth.length) return null
    faces.push({ slot, readings: readings.map(([r, g, b]) => ({ r, g, b })), truth })
  }
  const recorded = meta.capture?.colorProfile ?? null
  const recordedProfile = recorded?.colors ? { id: recorded.id, name: recorded.name, colors: recorded.colors, captures: 1 } : null
  return { capture: { name, size: meta.gridSize, faces, recorded: recorded && { id: recorded.id, name: recorded.name } }, recordedProfile }
}

function extraProfiles(): ColorProfile[] {
  const path = process.env.REPLAY_PROFILES
  if (!path) return []
  return parseSettingsFile(JSON.parse(readFileSync(path, 'utf8')))?.colors ?? []
}

const correct = (face: Face, palette?: Record<string, RGB>) =>
  face.readings.filter((rgb, i) => classifySticker(rgb, palette).color === face.truth[i]).length

describe('provisional palette replay on real captures', () => {
  if (captures.length === 0) {
    it.skip('requires saved real captures', () => {})
    return
  }

  it('replays every capture face by face', () => {
    const loaded = captures.map(loadCapture).filter((entry) => entry !== null)
    // Candidates: Generic, every profile a capture recorded, and any supplied.
    const candidates = new Map<string, ColorProfile>([[genericColorProfile().id, genericColorProfile()]])
    for (const { recordedProfile } of loaded) if (recordedProfile) candidates.set(recordedProfile.id, recordedProfile)
    for (const profile of extraProfiles()) candidates.set(profile.id, profile)
    const profiles = [...candidates.values()]

    const rows = loaded.map(({ capture }) => {
      const own = `fixture-${capture.name.slice('capture-'.length)}`.toLowerCase()
      const fair = profiles.filter((profile) => profile.id.toLowerCase() !== own)
      const choices: string[] = []
      for (let k = 1; k <= capture.faces.length; k++) {
        const samples = capture.faces.slice(0, k).flatMap((face) => face.readings)
        choices.push(matchPartialColorProfile(fair, samples)!.id)
      }
      const final = choices[choices.length - 1]
      const switches = choices.slice(1).filter((id, i) => id !== choices[i]).length
      const settledAfter = choices.findIndex((_, i) => choices.slice(i).every((id) => id === final)) + 1
      // The next face read with the palette chosen so far (none before the
      // first face), with the six-face choice, and with camera hues only.
      let preview = 0, withFinal = 0, cameraHues = 0, stickers = 0
      capture.faces.forEach((face, i) => {
        const chosen = i === 0 ? undefined : candidates.get(choices[i - 1])!.colors
        preview += correct(face, chosen)
        withFinal += correct(face, candidates.get(final)!.colors)
        cameraHues += correct(face, undefined)
        stickers += face.readings.length
      })
      return {
        capture: capture.name, size: capture.size,
        choices: choices.map((id) => candidates.get(id)!.name),
        switches, settledAfter,
        recorded: capture.recorded?.name ?? null,
        // Null when the recorded profile isn't among the candidates.
        agreesWithRecorded: capture.recorded && candidates.has(capture.recorded.id) ? final === capture.recorded.id : null,
        stickers, preview, withFinal, cameraHues,
      }
    })

    const total = (key: 'stickers' | 'preview' | 'withFinal' | 'cameraHues') => rows.reduce((sum, row) => sum + row[key], 0)
    const report = {
      candidates: profiles.map((p) => p.name),
      captures: rows.length,
      withSwitches: rows.filter((row) => row.switches > 0).length,
      settledAfterMean: rows.reduce((sum, row) => sum + row.settledAfter, 0) / rows.length,
      recordedChecked: rows.filter((row) => row.agreesWithRecorded !== null).length,
      recordedAgreed: rows.filter((row) => row.agreesWithRecorded === true).length,
      stickerAccuracy: {
        preview: total('preview') / total('stickers'),
        finalChoice: total('withFinal') / total('stickers'),
        cameraHues: total('cameraHues') / total('stickers'),
      },
      rows,
    }
    if (process.env.REPLAY_REPORT) writeFileSync(process.env.REPLAY_REPORT, JSON.stringify(report, null, 2))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.choices.length === 6)).toBe(true)
  })
})
