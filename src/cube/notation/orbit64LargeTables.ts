// Orbit64 6×6/7×7 slot convention, derived from its 4×4/5×5 reference tables.
// https://github.com/wstein/flix-orbit64/blob/00c0a97c7793d22249039743830f305925b23a38/src/Orbit64/Net.flix
import { orbit64Tables as t } from './orbit64Tables'

type Table = readonly (readonly number[])[]

function expandFacelet(n: number, depth: number, index: number): number {
  const base = n % 2 === 0 ? 4 : 5
  const face = Math.floor(index / (base * base))
  const row = Math.floor((index % (base * base)) / base)
  const col = index % base
  const axis =
    base === 4
      ? [0, depth, n - 1 - depth, n - 1]
      : [0, depth, Math.floor(n / 2), n - 1 - depth, n - 1]
  return face * n * n + axis[row] * n + axis[col]
}

function expandTable(n: number, depth: number, table: Table): number[][] {
  return table.map((slot) =>
    slot.map((index) => expandFacelet(n, depth, index)),
  )
}

function centers(n: number): number[][] {
  const tables: number[][] = []
  const last = n - 1
  for (let row = 1; row < last; row++)
    for (let col = 1; col < last; col++) {
      if (n % 2 && row === Math.floor(n / 2) && col === Math.floor(n / 2))
        continue
      const positions = [
        row * n + col,
        col * n + last - row,
        (last - row) * n + last - col,
        (last - col) * n + row,
      ]
      if (row * n + col !== Math.min(...positions)) continue
      const cells = new Set(positions)
      const table: number[] = []
      for (let index = 0; index < 6 * n * n; index++)
        if (cells.has(index % (n * n))) table.push(index)
      tables.push(table)
    }
  return tables
}

export function largeTables(n: 6 | 7): {
  corner: number[][]
  midge: number[][]
  wings: number[][][]
  centres: number[][]
} {
  const even = n === 6
  return {
    corner: expandTable(n, 1, even ? t.cornerFacelet4 : t.cornerFacelet5),
    midge: even ? [] : expandTable(n, 1, t.midgeFacelet5),
    wings: [1, 2].map((depth) =>
      expandTable(n, depth, even ? t.wingFacelet4 : t.wingFacelet5),
    ),
    centres: centers(n),
  }
}
