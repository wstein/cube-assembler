import { describe, expect, it } from 'vitest'
import { holdConfirmedFace, LIVE_HOLD_FRAMES, NO_HOLD, type LiveHold } from '../src/client/liveHold'

// Runs frames (name, confirmed) and returns what was shown for each.
function run(frames: Array<[string, boolean]>): string[] {
  let hold: LiveHold<string> = NO_HOLD
  return frames.map(([frame, confirmed]) => {
    const step = holdConfirmedFace(hold, frame, confirmed)
    hold = step.hold
    return step.visible ? step.show : '-'
  })
}

describe('holdConfirmedFace', () => {
  it(`keeps a confirmed face through ${LIVE_HOLD_FRAMES} weak frames, then lets it go`, () => {
    expect(run([['a', true], ['b', false], ['c', false], ['d', false]])).toEqual(['a', 'a', 'a', '-'])
  })

  it('shows each newly confirmed frame and restarts the hold', () => {
    expect(run([['a', true], ['b', false], ['c', true], ['d', false], ['e', false], ['f', false]])).toEqual(['a', 'a', 'c', 'c', 'c', '-'])
  })

  it('never shows a face that was not confirmed first', () => {
    expect(run([['a', false], ['b', false]])).toEqual(['-', '-'])
  })
})
