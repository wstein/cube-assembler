// Shows what the backdrop white balance did to each face: the photo as
// captured next to the same photo adjusted by that face's gains, with the
// gains and the face's backdrop against the median backdrop every face is
// brought to. The adjusted photo only illustrates the adjustment: the
// classifier picks each sticker's pixels on the original photo and adjusts
// their average, so the exact colors it used are shown as sticker grids.
import { useEffect, useState } from 'preact/hooks'
import { applyGainsToPixels, removeGains, type RGB } from '../imageProcessing'
import { loadPhotoPixels } from '../photoPixels'

export interface BackdropFace {
  face: string
  label: string
  // The aligned face crop as captured (a data URL).
  photo: string
  gains: RGB
  background: RGB | null
  // The sticker colors the classifier used (after the adjustment), row by row.
  stickers?: RGB[][]
}

interface Props {
  faces: BackdropFace[]
  reference: RGB | null
  onClose: () => void
}

// A gain this far from 1 either way is flagged: it shifts a sticker's color
// a lot, and on saved captures such shifts came from the backdrop (a hand,
// another wall), not from the light on the cube.
const STRONG_GAIN = 0.25

const css = (c: RGB) =>
  `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`

// The photo adjusted by `gains`, as a data URL; null until it is ready.
function useAdjustedPhoto(photo: string, gains: RGB): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    return loadPhotoPixels(photo, (pixels, canvas, ctx) => {
      pixels.data.set(applyGainsToPixels(pixels.data, gains))
      ctx.putImageData(pixels, 0, 0)
      setUrl(canvas.toDataURL('image/jpeg', 0.92))
    })
  }, [photo, gains.r, gains.g, gains.b])
  return url
}

function StickerGrid({ colors, label }: { colors: RGB[][]; label: string }) {
  return (
    <figure class="backdrop-stickers">
      <div
        class="backdrop-sticker-grid"
        style={{ gridTemplateColumns: `repeat(${colors.length}, 1fr)` }}
        role="img"
        aria-label={label}
      >
        {colors.flat().map((color, i) => (
          <span key={i} style={{ background: css(color) }} title={css(color)} />
        ))}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

function FaceRow({
  face,
  reference,
}: {
  face: BackdropFace
  reference: RGB | null
}) {
  const adjusted = useAdjustedPhoto(face.photo, face.gains)
  const channels = [
    ['R', face.gains.r],
    ['G', face.gains.g],
    ['B', face.gains.b],
  ] as const
  const strong = channels.some(([, gain]) => Math.abs(gain - 1) >= STRONG_GAIN)
  return (
    <div class="backdrop-row">
      <h3>{face.label}</h3>
      <figure>
        <img src={face.photo} alt={`${face.label} as captured`} />
        <figcaption>Original</figcaption>
      </figure>
      <figure>
        {adjusted ? (
          <img
            src={adjusted}
            alt={`${face.label} after the backdrop adjustment`}
          />
        ) : (
          <div class="backdrop-pending" />
        )}
        <figcaption>Backdrop adjusted</figcaption>
      </figure>
      {face.stickers && (
        <div class="backdrop-sticker-pair">
          <StickerGrid
            colors={face.stickers.map((row) =>
              row.map((color) => removeGains(color, face.gains)),
            )}
            label="Stickers before"
          />
          <StickerGrid colors={face.stickers} label="Stickers used" />
        </div>
      )}
      <div class="backdrop-details">
        <p class={strong ? 'backdrop-strong' : ''}>
          {channels.map(([name, gain]) => (
            <span
              key={name}
              class={Math.abs(gain - 1) >= STRONG_GAIN ? 'strong' : ''}
            >
              {name} ×{gain.toFixed(2)}
            </span>
          ))}
        </p>
        <p class="backdrop-swatches">
          <span
            class="backdrop-swatch"
            style={{
              background: face.background
                ? css(face.background)
                : 'transparent',
            }}
            title={
              face.background
                ? `Backdrop ${css(face.background)}`
                : 'No backdrop reading'
            }
          />
          <span>→</span>
          <span
            class="backdrop-swatch"
            style={{ background: reference ? css(reference) : 'transparent' }}
            title={
              reference
                ? `Median backdrop ${css(reference)}`
                : 'No median backdrop'
            }
          />
          <span class="backdrop-note">
            {face.background
              ? 'this face’s backdrop → median of all faces'
              : 'no backdrop reading'}
          </span>
        </p>
        {strong && (
          <p class="backdrop-warning">
            Strong adjustment: check that the backdrop around this face really
            differs in light, not in what is behind the cube.
          </p>
        )}
      </div>
    </div>
  )
}

export function BackdropDialog({ faces, reference, onClose }: Props) {
  return (
    <div class="modal open">
      <div
        class="modal-content backdrop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backdrop-title"
        tabIndex={-1}
        ref={(el) => {
          if (el && !el.contains(document.activeElement)) el.focus()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div class="modal-header">
          <h2 id="backdrop-title">Backdrop adjustment</h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p class="backdrop-intro">
          Before the six faces are classified together, each face is scaled so
          the backdrop around it matches the median backdrop of all faces. The
          adjusted photo illustrates that scaling. The sticker grids show the
          exact colors the classifier used, before and after it: it picks each
          sticker's pixels on the original photo and scales their average, which
          can differ from the photo by a few shades.
        </p>
        <div class="backdrop-rows">
          {faces.map((face) => (
            <FaceRow key={face.face} face={face} reference={reference} />
          ))}
        </div>
      </div>
    </div>
  )
}
