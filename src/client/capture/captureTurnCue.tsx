import { oppositeFacePreview } from './capturePresentation'

// Small drawing next to a capture step's instruction. The arrow is painted
// on the front face in the same direction as the larger capture cue.
export function TurnHint({
  step,
  mirrored,
}: {
  step: number
  mirrored: boolean
}) {
  if (step === 0) return null
  const kind = step < 4 ? 'turn' : step === 4 ? 'tip-top' : 'tip-bottom'
  const arrowAngle =
    kind === 'turn'
      ? 270
      : kind === 'tip-top'
        ? mirrored
          ? 0
          : 180
        : mirrored
          ? 180
          : 0
  return (
    <svg
      class={`turn-hint ${mirrored ? 'mirrored' : ''}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <polygon
        points="16,24 42,24 52,14 26,14"
        class="turn-hint-face turn-hint-top"
      />
      <polygon
        points="42,24 52,14 52,40 42,50"
        class="turn-hint-face turn-hint-side"
      />
      <rect x="16" y="24" width="26" height="26" class="turn-hint-face" />
      <g transform="translate(16 24) scale(.26)">
        <path
          class="turn-hint-painted-arrow"
          transform={`rotate(${arrowAngle} 50 50)`}
          d="M40 80 V43 H21 Q18 43 20 39 L45 10 Q50 5 55 10 L80 39 Q82 43 79 43 H60 V80 Q60 83 57 83 H43 Q40 83 40 80 Z"
        />
      </g>
    </svg>
  )
}

// A visual cue between successful captures. The turn shown is only an
// example: the guided solver determines the real face orientation afterward.
export function CaptureTurnOverlay({
  step,
  startColors,
  viaColors,
  capturedColors,
  mirrored,
  onContinue,
  stickerColors,
}: {
  step: number
  startColors: string[][]
  viaColors?: string[][]
  capturedColors: Array<string[][] | undefined>
  mirrored: boolean
  onContinue: () => void
  stickerColors: Record<string, string>
}) {
  const kind = step < 4 ? 'side' : step === 4 ? 'top' : 'bottom'
  const title =
    kind === 'side'
      ? 'Turn to another side'
      : kind === 'top'
        ? 'Show a remaining face'
        : 'Show the last face'
  const detail =
    kind === 'side'
      ? mirrored
        ? 'Counterclockwise in the mirrored view is suggested; either direction works.'
        : 'Clockwise is suggested; either direction works.'
      : kind === 'top'
        ? mirrored
          ? 'Tip to the top; the mirror shows the bottom.'
          : 'Tip the cube up or down.'
        : mirrored
          ? 'Move through Side 4; the mirror shows the top.'
          : 'Move through Side 4 to the opposite face.'
  const nextFace =
    kind === 'side'
      ? 'right'
      : kind === 'top'
        ? mirrored
          ? 'down'
          : 'up'
        : 'back'
  const viaFace = mirrored ? 'up' : 'down'
  const size = startColors.length
  const startStickers = (
    mirrored ? oppositeFacePreview(startColors, capturedColors) : startColors
  ).flat()
  const viaStickers =
    viaColors &&
    (mirrored
      ? oppositeFacePreview(viaColors, capturedColors)
      : viaColors
    ).flat()
  const directionArrow = () => (
    <svg
      class={`capture-turn-direction capture-turn-direction-${kind}`}
      viewBox="0 -10 100 100"
      aria-hidden="true"
    >
      <path
        class="capture-turn-arrow-body"
        d="M41 70 V41 H24 C20 41 18 37 21 34 L45 7 C48 3 52 3 55 7 L79 34 C82 37 80 41 76 41 H59 V70 Q59 74 55 74 H45 Q41 74 41 70 Z"
      />
    </svg>
  )
  const face = (name: string) => (
    <div class={`capture-turn-face capture-turn-${name}`}>
      <div
        class="capture-turn-stickers"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: size * size }, (_, i) => (
          <span
            key={i}
            class={`capture-turn-sticker${name === nextFace || (name === 'front' && !startStickers[i]) ? ' capture-turn-sticker-next' : ''}`}
            style={
              name === 'front'
                ? startStickers[i]
                  ? {
                      backgroundColor:
                        stickerColors[startStickers[i]] ?? '#888',
                    }
                  : undefined
                : kind === 'bottom' &&
                    name === viaFace &&
                    viaStickers &&
                    viaStickers[i]
                  ? { backgroundColor: stickerColors[viaStickers[i]] ?? '#888' }
                  : undefined
            }
          />
        ))}
      </div>
      {(name === 'front' ||
        name === nextFace ||
        (kind === 'bottom' && name === viaFace)) &&
        directionArrow()}
    </div>
  )
  return (
    <div
      class={`capture-turn-overlay capture-turn-${kind} ${mirrored ? 'mirrored' : ''}`}
      role="status"
      aria-label={`${title}. ${detail}`}
    >
      <div
        class={`capture-turn-scene ${mirrored ? 'mirrored' : ''}`}
        aria-hidden="true"
      >
        <div class="capture-turn-cube">
          {face('front')}
          {face('back')}
          {face('right')}
          {face('left')}
          {face('up')}
          {face('down')}
        </div>
      </div>
      <div class="capture-turn-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" class="capture-turn-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  )
}
