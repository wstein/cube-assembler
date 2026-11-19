import { h } from 'preact'
import { describe, expect, it, vi } from 'vitest'
import { PuzlwerkToolbar } from '../src/client/view3d/puzlwerkToolbar'
import { classOf, expand, findAll, text, type Node } from './support/vnodeTree'

const noop = () => {}
const turn = { face: 'R', depth: 1, turns: 1 } as const

const render = (over: Record<string, unknown> = {}) =>
  expand(
    h(PuzlwerkToolbar, {
      onPreset: noop,
      stickerless: true,
      onToggleStickerless: noop,
      autoRotate: false,
      onToggleAutoRotate: noop,
      layerMoves: false,
      onToggleLayerMoves: noop,
      cube: {
        isScrambling: false,
        onToggleScramble: noop,
        onRandomState: noop,
        onUndo: noop,
        onReset: noop,
        undoDisabled: false,
        resetDisabled: false,
      },
      moves: [turn],
      size: 3,
      ...over,
    }),
  )

const toolbar = (nodes: ReturnType<typeof render>) => nodes[0] as Node

describe('main view toolbar groups', () => {
  it('shows FACES and CUBE as labeled sections, then the move history, then the toggles', () => {
    const [root] = render()
    const bar = root as Node
    expect(classOf(bar)).toEqual(['cube-3d-toolbar'])
    const parts = bar.children.filter((c): c is Node => typeof c !== 'string')
    expect(parts.map((p) => classOf(p)[0])).toEqual([
      'cube-3d-section',
      'cube-3d-section',
      'cube-3d-move-history',
      undefined,
      'cube-3d-actions',
    ])
    const labels = findAll([bar], (n) => classOf(n).includes('cube-3d-label'))
    expect(labels.map(text)).toEqual(['Faces:', 'Cube:'])
  })

  it('lists the CUBE buttons in the order of the existing toolbar', () => {
    const [, cube] = toolbar(render()).children.filter(
      (c): c is Node => typeof c !== 'string',
    )
    expect(
      findAll([cube], (n) => n.tag === 'button').map((b) => text(b)),
    ).toEqual(['Scramble', 'Random State', 'Undo', 'Reset'])
  })

  it('shows the move list of the state it is given', () => {
    const history = findAll(render(), (n) =>
      classOf(n).includes('cube-3d-move-history'),
    )[0]
    expect(text(history).replace(/\s+/g, ' ')).toBe('Moves: R')
    const none = findAll(render({ moves: [] }), (n) =>
      classOf(n).includes('cube-3d-move-history'),
    )[0]
    expect(text(none).replace(/\s+/g, ' ')).toBe('Moves: None')
  })

  it('passes the CUBE actions through', () => {
    const onUndo = vi.fn()
    const nodes = render({
      cube: {
        isScrambling: true,
        onToggleScramble: noop,
        onRandomState: noop,
        onUndo,
        onReset: noop,
        undoDisabled: false,
        resetDisabled: true,
      },
    })
    const buttons = findAll(nodes, (n) => n.tag === 'button')
    const byText = (label: string) =>
      buttons.find((b) => text(b).trim() === label) as Node
    expect(byText('Stop')).toBeDefined()
    expect(byText('Reset').props.disabled).toBe(true)
    ;(byText('Undo').props.onClick as () => void)()
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('keeps the FACES presets and the toggles of the view bar', () => {
    const labels = findAll(render(), (n) => n.tag === 'button').map((b) =>
      text(b).trim(),
    )
    expect(labels).toEqual([
      'Up (U)',
      'Right (R)',
      'Front (F)',
      'Down (D)',
      'Left (L)',
      'Back (B)',
      'Isometric',
      'Iso-back',
      'Scramble',
      'Random State',
      'Undo',
      'Reset',
      'Stickerless',
      'Auto-rotate',
      'Move layers',
    ])
  })
})
