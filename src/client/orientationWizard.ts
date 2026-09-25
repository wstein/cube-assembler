import type { FaceKey, GuidedArrangement, OrientedCandidate } from './cubeAssembly'

// The visual guide suggests clockwise side turns, then top before bottom.
// Those moves correspond to a right turn and cap rotations 3/1 in the
// photographed frame. Equally valid cube states can still differ on a
// patterned cube, so this only chooses which one to ask about first.
export function preferredGuidedArrangementIndex(arrangements: GuidedArrangement[]): number {
  const quarterDistance = (a: number, b: number) => Math.min((a - b + 4) % 4, (b - a + 4) % 4)
  const rank = (a: GuidedArrangement) => [
    Number(a.turn !== 'right'),
    Number(a.capsSwapped),
    quarterDistance(a.capRotations[0], 3) + quarterDistance(a.capRotations[1], 1),
    quarterDistance(a.capRotations[0], 3),
  ]
  let best = 0
  for (let i = 1; i < arrangements.length; i++) {
    const next = rank(arrangements[i]), current = rank(arrangements[best])
    for (let j = 0; j < next.length; j++) {
      if (next[j] === current[j]) continue
      if (next[j] < current[j]) best = i
      break
    }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// Orientation wizard: narrows solveFaceOrientations' tied `alternatives`
// down to one, one face at a time, instead of dumping every alternative
// (which can real-world number in the dozens - see cubeAssembly.ts's
// MAX_ALTERNATIVES comment) in a single overwhelming grid. At each step,
// asks about whichever not-yet-agreed-upon face currently has the most
// distinct values among the remaining candidates (the question that
// eliminates the most options), filters to the customer's answer, and
// repeats - faces that happen to already agree across all remaining
// candidates (including ones never directly asked about, resolved purely
// as a side effect of earlier answers) are shown as settled without ever
// being asked about. Terminates when exactly one candidate remains.
// ─────────────────────────────────────────────────────────────────────────────

// U last: for even sizes solveEvenSizeOrientations fixes U as its search
// anchor, so it's already unanimous across every alternative and never
// actually reaches this tiebreak - Up is given, F/R/L/D/B get asked about
// as needed. For odd sizes there's no free anchor (every face's rotation
// is a genuine unknown from its photo alone), so U is only ever actually
// asked about there if it turns out to be tied with another face on
// "most distinct values" - this ordering just makes it lose that tiebreak.
export const WIZARD_FACE_ORDER: FaceKey[] = ['F', 'R', 'D', 'L', 'B', 'U']

export function faceContentKey(colors: string[][]): string {
  return colors.map((row) => row.join('')).join('')
}

// The face (if any) worth asking about next: the one with the most
// distinct remaining values, so the customer's answer narrows things down
// the most. Null once every face already agrees - i.e. `remaining` must
// be down to exactly one candidate (alternatives are deduped by content,
// so >1 distinct candidates can never agree on all 6 faces at once).
export function pickWizardFace(remaining: OrientedCandidate[]): FaceKey | null {
  let best: FaceKey | null = null
  let bestCount = 1
  for (const face of WIZARD_FACE_ORDER) {
    const distinct = new Set(remaining.map((c) => faceContentKey(c.faces[face])))
    if (distinct.size > bestCount) {
      best = face
      bestCount = distinct.size
    }
  }
  return best
}

// Groups the remaining candidates by their value for `face`, one option
// per distinct grid - the choices shown to the customer for this step.
export function groupWizardOptions(
  remaining: OrientedCandidate[], face: FaceKey
): { grid: string[][]; candidates: OrientedCandidate[] }[] {
  const groups = new Map<string, { grid: string[][]; candidates: OrientedCandidate[] }>()
  for (const c of remaining) {
    const key = faceContentKey(c.faces[face])
    if (!groups.has(key)) groups.set(key, { grid: c.faces[face], candidates: [] })
    groups.get(key)!.candidates.push(c)
  }
  return [...groups.values()]
}
