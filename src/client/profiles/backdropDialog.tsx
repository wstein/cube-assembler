// The Backdrop tab of the color analysis: what the backdrop white balance did to each face: the photo as
// captured next to the same photo adjusted by that face's gains, with the
// gains and the face's backdrop against the median backdrop every face is
// brought to. The adjusted photo only illustrates the adjustment: the
// classifier picks each sticker's pixels on the original photo and adjusts
// their average, so the exact colors it used are shown as sticker grids.
import { useEffect, useState } from 'preact/hooks'
import { applyGainsToPixels, removeGains } from '../vision/colorMath'
import { type RGB } from '../vision/stickerColorGeometry'
import { loadPhotoPixels } from '../fixtures/photoPixels'

export interface BackdropFace {
  face: string
  label: string
  // The aligned face crop as captured (a data URL).
  photo: string
  gains: RGB
  background: RGB | null
  // The sticker colors the classifier used (after the adjustment), row by row.
  stickers?: RGB[][]
  // The final color of each sticker and its first guess (the nearest color
  // before the equal color share), as color letters, row by row.
  colors?: string[][]
  guess?: string[][]
}

interface Props {
  faces: BackdropFace[]
  reference: RGB | null
  // The display color of each color letter.
  stickerColors: Record<string, string>
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

// The first guess of every sticker: each sticker shows its final color in the
// upper left half and, where the equal color share moved it, its first guess
// in the lower right half.
function GuessGrid({
  colors,
  guess,
  palette,
}: {
  colors: string[][]
  guess: string[][]
  palette: Record<string, string>
}) {
  const hex = (color: string) => palette[color] ?? '#888'
  return (
    <figure class="backdrop-stickers">
      <div
        class="backdrop-sticker-grid"
        style={{ gridTemplateColumns: `repeat(${colors.length}, 1fr)` }}
        role="img"
        aria-label="First guess"
      >
        {colors.flat().map((color, i) => {
          const first = guess.flat()[i]
          const moved = first !== color
          return (
            <span
              key={i}
              class={moved ? 'backdrop-moved' : ''}
              style={{
                background: moved
                  ? `linear-gradient(135deg, ${hex(color)} 50%, ${hex(first)} 50%)`
                  : hex(color),
              }}
              title={moved ? `${first} → ${color}` : color}
            />
          )
        })}
      </div>
      <figcaption>First guess</figcaption>
    </figure>
  )
}

function FaceRow({
  face,
  reference,
  stickerColors,
}: {
  face: BackdropFace
  reference: RGB | null
  stickerColors: Record<string, string>
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
        <div class="backdrop-sticker-set">
          <StickerGrid
            colors={face.stickers.map((row) =>
              row.map((color) => removeGains(color, face.gains)),
            )}
            label="Stickers before"
          />
          <StickerGrid colors={face.stickers} label="Stickers used" />
          {face.colors && face.guess && (
            <GuessGrid
              colors={face.colors}
              guess={face.guess}
              palette={stickerColors}
            />
          )}
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

export function BackdropPanel({ faces, reference, stickerColors }: Props) {
  return (
    <>
      <p class="backdrop-intro">
        Before the six faces are classified together, each face is scaled so the
        backdrop around it matches the median backdrop of all faces. The
        adjusted photo illustrates that scaling. The sticker grids show the
        exact colors the classifier used, before and after it: it picks each
        sticker's pixels on the original photo and scales their average, which
        can differ from the photo by a few shades. In the first guess grid a
        sticker split along the diagonal was moved by the equal color share: its
        final color is the upper left half, what it read as on its own the lower
        right half.
      </p>
      <div class="backdrop-rows">
        {faces.map((face) => (
          <FaceRow
            key={face.face}
            face={face}
            reference={reference}
            stickerColors={stickerColors}
          />
        ))}
      </div>
    </>
  )
}
