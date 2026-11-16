// Browser layout coordinates, independent of cube state or photo transforms.
export interface InspectorCell {
  column: number
  row: number
}
const faces: Record<string, InspectorCell> = {
  u: { column: 1, row: 0 },
  l: { column: 0, row: 1 },
  f: { column: 1, row: 1 },
  r: { column: 2, row: 1 },
  b: { column: 3, row: 1 },
  d: { column: 1, row: 2 },
}
const free: InspectorCell[] = [
  { column: 0, row: 0 },
  { column: 2, row: 0 },
  { column: 3, row: 0 },
  { column: 0, row: 2 },
  { column: 2, row: 2 },
  { column: 3, row: 2 },
]
export function nearestInspectorCell(
  face: string,
  previous?: InspectorCell,
): InspectorCell {
  const origin = faces[face] ?? faces.f
  const distance = (cell: InspectorCell) =>
    (cell.column - origin.column) ** 2 + (cell.row - origin.row) ** 2
  const minimum = Math.min(...free.map(distance))
  const tied = free.filter((cell) => distance(cell) === minimum)
  return (
    tied.find(
      (cell) => cell.column === previous?.column && cell.row === previous.row,
    ) ?? tied[0]
  )
}
