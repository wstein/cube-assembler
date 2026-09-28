export function rotateGrid(
  grid: string[][],
  quarterTurnsClockwise: number,
): string[][] {
  const turns = ((quarterTurnsClockwise % 4) + 4) % 4
  let result = grid
  for (let t = 0; t < turns; t++) {
    const n = result.length
    const next: string[][] = Array.from({ length: n }, () => Array(n).fill(''))
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        next[c][n - 1 - r] = result[r][c]
      }
    }
    result = next
  }
  return result
}
