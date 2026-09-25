import { OPPOSITE_COLOR } from './cubeAssembly'

// Mirror mode presents the face on the far side of the cube. A scrambled
// opposite face cannot be reconstructed sticker by sticker from its partner;
// use a captured opposite face, or show only what its colors prove.
export function oppositeFacePreview(
  source: string[][],
  captured: Array<string[][] | undefined>
): string[][] {
  const n = source.length
  const mid = Math.floor(n / 2)
  const flat = source.flat()
  const uniform = flat.length === n * n && flat.every((color) => color === flat[0])
  const sourceColor = n % 2 === 1 ? source[mid]?.[mid] : uniform ? flat[0] : undefined
  const opposite = sourceColor && OPPOSITE_COLOR[sourceColor]
  const unknown = Array.from({ length: n }, () => Array<string>(n).fill(''))
  if (!opposite) return unknown

  const saved = captured.find((face) => face && face !== source && face.length === n && (
    n % 2 === 1
      ? face[mid]?.[mid] === opposite
      : face.flat().every((color) => color === opposite)
  ))
  if (saved) return saved
  if (uniform) return unknown.map((row) => row.map(() => opposite))
  if (n % 2 === 1) unknown[mid][mid] = opposite
  return unknown
}
