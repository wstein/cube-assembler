// This preview uses its own class names so the main cube net's styles cannot
// override the orientation picker's layout.
// Single face's grid of stickers, standalone (used both inside the net
// layout below and on its own for the orientation wizard's per-option
// choices, where only one face at a time needs showing). `undecided`
// renders a neutral placeholder instead of real colors - used for faces
// the orientation wizard hasn't pinned down yet, so the customer isn't
// shown a specific guess as if it were settled. `current` frames the face
// the wizard is asking about right now, so it's obvious which slot in the
// net the options below refer to. `auto` dims a face the wizard settled on
// its own (never asked about), so the net shows at a glance which faces the
// customer actually chose versus which were inferred from those choices.
export function FaceGrid({
  colors,
  undecided,
  current,
  auto,
  stickerColors,
}: {
  colors: string[][]
  undecided?: boolean
  current?: boolean
  auto?: boolean
  stickerColors: Record<string, string>
}) {
  // On odd sizes the center sticker never moves when a face is turned, so
  // it's known even while the face's orientation is still undecided.
  const n = colors.length
  const centerIndex = n % 2 === 1 ? (n * n - 1) / 2 : -1
  return (
    <div
      class={`orientation-net-face${undecided ? ' orientation-net-face-undecided' : ''}${current ? ' orientation-net-face-current' : ''}${auto ? ' orientation-net-face-auto' : ''}`}
      style={{ gridTemplateColumns: `repeat(${colors.length}, 1fr)` }}
    >
      {colors.flat().map((color, i) => (
        <div
          key={i}
          class="orientation-net-sticker"
          style={
            (undecided && i !== centerIndex) || !color
              ? undefined
              : { background: stickerColors[color] ?? '#888' }
          }
        />
      ))}
    </div>
  )
}

// Live net in the capture dialog: the 4 sides in the order taken, with Top
// (5) above and Bottom (6) below Side 2 (which way the cube was turned, and which
// of the two is really the top, is only worked out once all 6 are in).
// Each slot shows the colors detected for it, or a placeholder; tapping a
// slot retakes it or jumps to it.
export function CaptureNet({
  faces,
  current,
  matchingFaces,
  liveMatchingFace,
  size,
  predictedCenters,
  mirrored,
  onSelect,
  faceOrder,
  faceLabels,
  shortLabels,
  colorNames,
  stickerColors,
}: {
  faces: Record<string, string[][] | undefined>
  current: string
  matchingFaces: Set<string>
  liveMatchingFace: string | null
  size: number
  predictedCenters: Array<string | null>
  mirrored: boolean
  onSelect: (slot: string) => void
  faceOrder: readonly string[]
  faceLabels: Record<string, string>
  shortLabels: Record<string, string>
  colorNames: Record<string, string>
  stickerColors: Record<string, string>
}) {
  const empty = Array.from({ length: size }, () => Array<string>(size).fill(''))
  const slot = (key: string, gridArea: string) => {
    const colors = faces[key]
    const suggested = !colors ? predictedCenters[faceOrder.indexOf(key)] : null
    const preview = suggested ? empty.map((row) => row.slice()) : empty
    if (suggested)
      preview[Math.floor(size / 2)][Math.floor(size / 2)] = suggested
    const shown = colors ?? preview
    return (
      <button
        type="button"
        key={key}
        class={`capture-net-slot${matchingFaces.has(key) ? ' pattern-match' : ''}`}
        style={{ gridArea }}
        data-slot={key}
        aria-label={`${faceLabels[key]}: ${colors ? (matchingFaces.has(key) ? `captured, pattern looks like ${key === liveMatchingFace ? 'the live face' : 'another captured face'}; tap to retake` : 'captured, tap to retake') : suggested ? `suggested ${colorNames[suggested]} center, not captured yet` : 'not captured yet'}`}
        aria-current={key === current ? 'step' : undefined}
        onClick={() => onSelect(key)}
      >
        <FaceGrid
          colors={shown}
          stickerColors={stickerColors}
          undecided={shown.flat().some((color) => !color)}
          current={key === current}
        />
        <span class="capture-net-label" aria-hidden="true">
          {shortLabels[key]}
        </span>
      </button>
    )
  }
  const [s1, s2, s3, s4, top, bottom] = faceOrder
  return (
    <div
      class={`capture-net ${mirrored ? 'mirrored' : ''}`}
      role="group"
      aria-label="Captured faces"
    >
      {slot(s1, '2 / 1')}
      {slot(s2, '2 / 2')}
      {slot(s3, '2 / 3')}
      {slot(s4, '2 / 4')}
      {slot(top, '1 / 2')}
      {slot(bottom, '3 / 2')}
    </div>
  )
}
