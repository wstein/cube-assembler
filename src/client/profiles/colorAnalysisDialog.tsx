// The color analysis of the last capture, in tabs: what the backdrop white
// balance did, where the stickers sit around the hue circle, and how the
// final colors differ from the standard and the learned ones.
import { sampleIndexAt } from '../capture/analysisSamples'
import { useState } from 'preact/hooks'
import type { NetCell } from '../capture/approvalPhotos'
import { HueScatterChart } from '../capture/hueScatterChart'
import { OrientationNetPreview } from '../capture/orientationPresentation'
import {
  colorDelta,
  meansByLabel,
  type LocatedSample,
} from '../capture/hueScatter'
import { type RGB } from '../vision/stickerColorGeometry'
import { BackdropPanel, type BackdropFace } from './backdropDialog'

const COLORS = ['W', 'Y', 'O', 'R', 'G', 'B']
const COLOR_NAME: Record<string, string> = {
  W: 'White',
  Y: 'Yellow',
  O: 'Orange',
  R: 'Red',
  G: 'Green',
  B: 'Blue',
}

export type Tab = 'backdrop' | 'hues' | 'final'

const css = (c: RGB) =>
  `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`

function Swatch({ color, label }: { color: RGB | undefined; label: string }) {
  return color ? (
    <span
      class="backdrop-swatch"
      style={{ background: css(color) }}
      title={`${label} ${css(color)}`}
    />
  ) : (
    <span class="color-review-muted">-</span>
  )
}

function FinalColors({
  samples,
  standard,
  readWith,
}: {
  samples: LocatedSample[]
  standard: Record<string, RGB>
  // The profile that read the faces live; null when none did.
  readWith: { name: string; colors: Record<string, RGB> } | null
}) {
  const final = meansByLabel(samples)
  const counts = samples.reduce<Record<string, number>>((all, sample) => {
    all[sample.label] = (all[sample.label] ?? 0) + 1
    return all
  }, {})
  return (
    <>
      <p class="backdrop-intro">
        Each color as the standard palette expects it, as the faces were read
        live{readWith ? ` (${readWith.name})` : ''}, and as the stickers ended
        up (their mean after the white balance and your corrections). Delta is
        how far the live palette was from the final color: a point or two is a
        shade, tens are another color.
      </p>
      <table class="color-analysis-table">
        <thead>
          <tr>
            <th scope="col">Color</th>
            <th scope="col">Standard</th>
            <th scope="col">Read with</th>
            <th scope="col">Final</th>
            <th scope="col">Delta</th>
            <th scope="col">Stickers</th>
          </tr>
        </thead>
        <tbody>
          {COLORS.map((label) => (
            <tr key={label}>
              <th scope="row">{COLOR_NAME[label]}</th>
              <td>
                <Swatch color={standard[label]} label="Standard" />
              </td>
              <td>
                <Swatch color={readWith?.colors[label]} label="Read with" />
              </td>
              <td>
                <Swatch color={final[label]} label="Final" />
              </td>
              <td>
                {readWith?.colors[label] && final[label]
                  ? colorDelta(readWith.colors[label], final[label]).toFixed(1)
                  : '-'}
              </td>
              <td>{counts[label] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function ColorAnalysisDialog({
  backdrop,
  reference,
  samples,
  cells,
  netFaces,
  photos,
  stickerColors,
  standard,
  readWith,
  initialTab,
  onClose,
}: {
  // Null when no backdrop adjustment was applied to this capture.
  backdrop: BackdropFace[] | null
  reference: RGB | null
  samples: LocatedSample[]
  // The net cell of each sample, and the net's faces (null without a net).
  cells: Array<NetCell | undefined>
  netFaces: Record<string, string[][]> | null
  // The photo behind each net face, shown while a sticker of it is pointed at.
  photos?: Record<string, { image?: string; turns: number }>
  stickerColors: Record<string, string>
  standard: Record<string, RGB>
  readWith: { name: string; colors: Record<string, RGB> } | null
  initialTab?: Tab
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'hues')
  // The sticker pointed at, in the scatter or in the net.
  const [hovered, setHovered] = useState<number | null>(null)
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'backdrop', label: 'Backdrop' },
    { id: 'hues', label: 'Hues' },
    { id: 'final', label: 'Final colors' },
  ]
  return (
    <div class="modal open">
      <div
        class="modal-content backdrop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-title"
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
          <h2 id="analysis-title">Color analysis</h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <nav class="profiles-tabs" aria-label="Analysis">
          {tabs.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              class="color-analysis-tab"
              aria-current={id === tab ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'backdrop' &&
          (backdrop ? (
            <BackdropPanel
              faces={backdrop}
              reference={reference}
              stickerColors={stickerColors}
            />
          ) : (
            <p class="backdrop-intro">
              No backdrop adjustment was applied to this capture.
            </p>
          ))}
        {tab === 'hues' && (
          <>
            <p class="backdrop-intro">
              Every sticker by hue (across) and lightness (up) after the white
              balance, in its own measured color. Point at a dot or at a sticker
              in the net to find the other. Red and orange share hues, but
              orange is lighter: two clouds, not one.
            </p>
            <HueScatterChart
              samples={samples}
              hovered={hovered}
              onHover={setHovered}
            />
            {netFaces && (
              <div class="analysis-net">
                <OrientationNetPreview
                  faces={netFaces}
                  photos={photos}
                  stickerColors={stickerColors}
                  hoveredSticker={
                    hovered === null ? null : (cells[hovered] ?? null)
                  }
                  onStickerHover={(cell) =>
                    setHovered(sampleIndexAt(cells, cell))
                  }
                />
              </div>
            )}
          </>
        )}
        {tab === 'final' && (
          <FinalColors
            samples={samples}
            standard={standard}
            readWith={readWith}
          />
        )}
      </div>
    </div>
  )
}
