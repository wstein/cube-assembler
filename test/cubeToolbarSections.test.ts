import { h } from 'preact'
import { describe, expect, it, vi } from 'vitest'
import {
  CubeActionsSection,
  MoveHistory,
  moveHistoryText,
  resetDisabled,
  undoDisabled,
} from '../src/client/view3d/cubeToolbarSections'
import { classOf, expand, findAll, text } from './support/vnodeTree'

const noop = () => {}
const actions = (over: Record<string, unknown> = {}) =>
  expand(
    h(CubeActionsSection, {
      isScrambling: false,
      onToggleScramble: noop,
      onRandomState: noop,
      onUndo: noop,
      onReset: noop,
      undoDisabled: false,
      resetDisabled: false,
      ...over,
    }),
  )
const buttons = (nodes: ReturnType<typeof expand>) =>
  findAll(nodes, (n) => n.tag === 'button')

describe('CUBE group of the toolbar', () => {
  it('has the label, buttons, titles and classes of the existing toolbar', () => {
    const [section] = actions()
    expect(typeof section).toBe('object')
    const node = section as Exclude<typeof section, string>
    expect(classOf(node)).toEqual(['cube-3d-section'])
    const label = findAll([node], (n) => n.tag === 'span')[0]
    expect(classOf(label)).toEqual(['cube-3d-label'])
    expect(text(label)).toBe('Cube:')
    const list = buttons([node])
    expect(list.map((b) => [text(b), b.props.title])).toEqual([
      ['Scramble', 'Scramble cube'],
      ['Random State', 'Mix the cube at once into a random valid state'],
      ['Undo', 'Undo the last completed layer turn'],
      ['Reset', 'Reset cube to initial assembled state'],
    ])
    for (const b of list) expect(classOf(b)).toContain('cube-3d-btn')
  })

  it('turns Scramble into an active Stop button while scrambling', () => {
    const [scramble] = buttons(actions({ isScrambling: true }))
    expect(text(scramble)).toBe('Stop')
    expect(scramble.props.title).toBe('Stop scramble')
    expect(classOf(scramble)).toContain('cube-3d-btn-active')
  })

  it('disables Scramble and Random State when layers cannot move', () => {
    const list = buttons(actions({ allowLayerMoves: false }))
    expect(list.map((b) => b.props.disabled)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it('wires each button to its handler', () => {
    const fns = {
      onToggleScramble: vi.fn(),
      onRandomState: vi.fn(),
      onUndo: vi.fn(),
      onReset: vi.fn(),
    }
    const list = buttons(actions(fns))
    for (const b of list) (b.props.onClick as () => void)()
    expect(Object.values(fns).map((f) => f.mock.calls.length)).toEqual([
      1, 1, 1, 1,
    ])
    expect(fns.onUndo).toHaveBeenCalledTimes(1)
  })

  it('shows the disabled flags it is given on Undo and Reset', () => {
    const list = buttons(actions({ undoDisabled: true, resetDisabled: true }))
    expect(list.map((b) => b.props.disabled)).toEqual([
      false,
      false,
      true,
      true,
    ])
  })
})

describe('undo and reset availability', () => {
  const turn = { face: 'R', depth: 1, turns: 1 } as const
  it('Undo needs a move and no turn in progress', () => {
    expect(undoDisabled([], false)).toBe(true)
    expect(undoDisabled([turn], true)).toBe(true)
    expect(undoDisabled([turn], false)).toBe(false)
  })
  it('Reset is off only at the initial cube without moves', () => {
    expect(resetDisabled(true, [])).toBe(true)
    expect(resetDisabled(false, [])).toBe(false)
    expect(resetDisabled(true, [turn])).toBe(false)
  })
})

describe('move history', () => {
  const moves = [
    { face: 'R', depth: 1, turns: 1 },
    { face: 'U', depth: 1, turns: -1 },
  ] as const
  it('lists the moves in notation, or None', () => {
    expect(moveHistoryText([...moves], 3)).toBe("R U'")
    expect(moveHistoryText([], 3)).toBe('None')
  })
  it('renders the status line and the CubeLab block of the existing toolbar', () => {
    const nodes = expand(h(MoveHistory, { moves: [...moves], size: 3 }))
    const [line] = findAll(nodes, (n) =>
      classOf(n).includes('cube-3d-move-history'),
    )
    expect(line.props.role).toBe('status')
    expect(line.props['aria-label']).toBe('Move history')
    expect(text(line).replace(/\s+/g, ' ')).toBe("Moves: R U'")
    const [script] = findAll(nodes, (n) => n.tag === 'script')
    expect(script.props.id).toBe('cubelab-moves')
    expect(script.props.type).toBe('application/json')
  })
})
