import { h } from 'preact'
import { describe, expect, it, vi } from 'vitest'
import {
  nextTurnSound,
  TurnSoundButton,
  turnClickGainFor,
  wideCueGainFor,
} from '../src/client/view3d/turnSound'
import { MODE_CUE_GAIN } from '../src/client/view3d/turnFeel'
import { PuzlwerkToolbar } from '../src/client/view3d/puzlwerkToolbar'
import { classOf, expand, findAll, text } from './support/vnodeTree'

const ON = 'cube-assembler-turn-sound=1'
const OFF = 'cube-assembler-turn-sound=0'
const noop = () => {}

describe('turn sound setting', () => {
  it('toggles what the cookie says', () => {
    expect(nextTurnSound(ON)).toBe(false)
    expect(nextTurnSound(OFF)).toBe(true)
  })
  it('is silent when off and softer for the quick turns of a scramble', () => {
    expect(turnClickGainFor(160, OFF)).toBe(0)
    expect(turnClickGainFor(85, OFF)).toBe(0)
    const turn = turnClickGainFor(160, ON)
    const scramble = turnClickGainFor(85, ON)
    expect(turn).toBeGreaterThan(0)
    expect(scramble).toBeGreaterThan(0)
    expect(scramble).toBeLessThan(turn)
  })
  it('sounds the wide cue only when on', () => {
    expect(wideCueGainFor(OFF)).toBe(0)
    expect(wideCueGainFor(ON)).toBe(MODE_CUE_GAIN)
  })
})

describe('Sound button', () => {
  const render = (on: boolean, onToggle = noop) =>
    findAll(
      expand(h(TurnSoundButton, { on, onToggle })),
      (n) => n.tag === 'button',
    )[0]
  it('has the markup of the existing toolbar: label, pressed state, active class', () => {
    const off = render(false)
    expect(text(off).trim()).toBe('Sound')
    expect(off.props['aria-pressed']).toBe(false)
    expect(classOf(off)).toEqual(['cube-3d-btn', ''].filter(Boolean))
    const on = render(true)
    expect(on.props['aria-pressed']).toBe(true)
    expect(classOf(on)).toEqual(['cube-3d-btn', 'cube-3d-btn-active'])
  })
  it('calls the toggle', () => {
    const onToggle = vi.fn()
    ;(render(false, onToggle).props.onClick as () => void)()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('main view toolbar sound toggle', () => {
  const bar = (turnSound: boolean) =>
    expand(
      h(PuzlwerkToolbar, {
        onPreset: noop,
        stickerless: true,
        onToggleStickerless: noop,
        autoRotate: false,
        onToggleAutoRotate: noop,
        layerMoves: false,
        onToggleLayerMoves: noop,
        turnSound,
        onToggleTurnSound: noop,
        cube: {
          isScrambling: false,
          onToggleScramble: noop,
          onRandomState: noop,
          onUndo: noop,
          onReset: noop,
          undoDisabled: false,
          resetDisabled: false,
        },
        moves: [],
        size: 3,
      }),
    )
  it('ends the toggles with Sound, after Move layers', () => {
    const actions = findAll(bar(true), (n) =>
      classOf(n).includes('cube-3d-actions'),
    )[0]
    const labels = findAll([actions], (n) => n.tag === 'button').map((b) =>
      text(b).trim(),
    )
    expect(labels).toEqual([
      'Stickerless',
      'Auto-rotate',
      'Move layers',
      'Sound',
    ])
  })
  it('shows the state it is given', () => {
    const pressed = (on: boolean) =>
      findAll(
        bar(on),
        (n) =>
          n.props['aria-pressed'] !== undefined && text(n).trim() === 'Sound',
      )[0].props['aria-pressed']
    expect(pressed(true)).toBe(true)
    expect(pressed(false)).toBe(false)
  })
})
