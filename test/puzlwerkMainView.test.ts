import { describe, expect, it } from 'vitest'
import {
  frameHexes,
  mainViewerKind,
  puzlwerkMainViewProps,
} from '../src/client/view3d/puzlwerkMainView'
import type { CubeState } from '../src/cube/cubeAssembly'

const solved = (color: string, n: number) => Array<string>(n * n).fill(color)
const cubeOf = (n: number, colors: string[]): CubeState => ({
  u: solved(colors[0], n),
  r: solved(colors[1], n),
  f: solved(colors[2], n),
  d: solved(colors[3], n),
  l: solved(colors[4], n),
  b: solved(colors[5], n),
})

describe('mainViewerKind', () => {
  it('keeps the existing view unless the flag names the PuzlWerk viewer', () => {
    expect(mainViewerKind('')).toBe('classic')
    expect(mainViewerKind('?viewer=classic')).toBe('classic')
    expect(mainViewerKind('?viewer=PuzlWerk')).toBe('classic')
    expect(mainViewerKind('?other=puzlwerk')).toBe('classic')
    expect(mainViewerKind('?puzlwerk')).toBe('classic')
    expect(mainViewerKind('?x=1&viewer=puzlwerk')).toBe('puzlwerk')
  })
})

describe('puzlwerkMainViewProps', () => {
  const names = ['white', 'red', 'green', 'yellow', 'orange', 'blue']
  const hex = {
    white: '#ffffff',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffff00',
    orange: '#ff8800',
    blue: '#0000ff',
  }
  it('starts at the visible state and keeps the source state for Reset', () => {
    const source = cubeOf(2, names)
    const visible = cubeOf(2, [...names].reverse())
    const moves = [{ face: 'R', depth: 1, turns: 1 }] as const
    const shown = puzlwerkMainViewProps({
      cube: source,
      initialCube: visible,
      initialMoves: [...moves],
      puzzleSize: 2,
      palette: hex,
    })
    expect(shown.cube).toBe(source)
    expect(shown.initialCube).toBe(visible)
    expect(shown.initialMoves).toEqual(moves)
    expect(shown.puzzleSize).toBe(2)
    const bare = puzlwerkMainViewProps({
      cube: source,
      puzzleSize: 2,
      palette: hex,
    })
    expect(bare.cube).toBe(source)
    expect(bare.initialCube).toBe(source)
    expect(bare.initialMoves).toEqual([])
  })
  it('carries the color frame as hex colors in U R F D L B order', () => {
    const frame = {
      u: 'white',
      r: 'red',
      f: 'green',
      d: 'yellow',
      l: 'orange',
      b: 'blue',
    }
    expect(frameHexes(frame, hex)).toEqual([
      '#ffffff',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#ff8800',
      '#0000ff',
    ])
    expect(frameHexes({ ...frame, r: 'pink' }, hex)).toBeUndefined()
    expect(frameHexes(undefined, hex)).toBeUndefined()
  })
})
