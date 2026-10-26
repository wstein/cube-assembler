// The color analysis of the last capture, in tabs: what the backdrop white
// balance did, where the stickers sit around the hue circle, and how the
// final colors differ from the standard and the learned ones.
import { useState } from 'preact/hooks'
import { HueHistogramChart } from '../capture/hueHistogramChart'
import { meansByLabel, type HueSample } from '../capture/hueHistogram'
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

type Tab = 'backdrop' | 'hues' | 'final'

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
  learned,
}: {
  samples: HueSample[]
  standard: Record<string, RGB>
  learned: Record<string, RGB> | null
}) {
  const final = meansByLabel(samples)
  const counts = samples.reduce<Record<string, number>>((all, sample) => {
    all[sample.label] = (all[sample.label] ?? 0) + 1
    return all
  }, {})
  return (
    <>
      <p class="backdrop-intro">
        Each color as the standard palette expects it, as it was learned from
        this capture, and as the stickers ended up (their mean after the white
        balance and your corrections).
      </p>
      <table class="color-analysis-table">
        <thead>
          <tr>
            <th scope="col">Color</th>
            <th scope="col">Standard</th>
            <th scope="col">Learned</th>
            <th scope="col">Final</th>
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
                <Swatch color={learned?.[label]} label="Learned" />
              </td>
              <td>
                <Swatch color={final[label]} label="Final" />
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
  stickerColors,
  standard,
  learned,
  onClose,
}: {
  // Null when no backdrop adjustment was applied to this capture.
  backdrop: BackdropFace[] | null
  reference: RGB | null
  samples: HueSample[]
  stickerColors: Record<string, string>
  standard: Record<string, RGB>
  learned: Record<string, RGB> | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('hues')
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
            <BackdropPanel faces={backdrop} reference={reference} />
          ) : (
            <p class="backdrop-intro">
              No backdrop adjustment was applied to this capture.
            </p>
          ))}
        {tab === 'hues' && (
          <>
            <p class="backdrop-intro">
              The stickers by hue after the white balance, colored as they ended
              up. The dashed lines mark where the standard palette expects each
              color; a peak off its line is a color the standard palette would
              misread.
            </p>
            <HueHistogramChart
              samples={samples}
              stickerColors={stickerColors}
            />
          </>
        )}
        {tab === 'final' && (
          <FinalColors
            samples={samples}
            standard={standard}
            learned={learned}
          />
        )}
      </div>
    </div>
  )
}
