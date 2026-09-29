// Try-on: the last capture's stickers read with A and with B. Balanced
// readings use the capture's own reviewed White stickers.
import { useMemo, useState } from 'preact/hooks'
import { tryOnProfiles } from './colorProfileReview'
import { css, hex, NAMES } from './colorReviewParts'
import type { ReviewCapture } from './colorReviewPage'
import type { RGB } from '../imageProcessing'
import type { ColorProfile } from './profileSettings'

interface Props {
  capture: ReviewCapture | null
  balanced: boolean
  A: ColorProfile
  B: ColorProfile
  colorsA: Record<string, RGB>
  colorsB: Record<string, RGB>
}

export function TryOnSection({
  capture,
  balanced,
  A,
  B,
  colorsA,
  colorsB,
}: Props) {
  const [face, setFace] = useState(0)
  const tryOn = useMemo(
    () =>
      capture ? tryOnProfiles(capture.faces, balanced, colorsA, colorsB) : null,
    [capture, balanced, colorsA, colorsB],
  )

  const faceData = tryOn?.faces[Math.min(face, tryOn.faces.length - 1)]
  const changeList = tryOn
    ? Object.entries(tryOn.changes).sort((x, y) => y[1] - x[1])
    : []

  return (
    <section class="card color-review-section" aria-labelledby="review-try">
      <h2 id="review-try">Try on your last capture</h2>
      {!tryOn || !faceData ? (
        <p class="color-review-muted">
          Capture a cube with the camera first; its faces show up here.
        </p>
      ) : (
        <>
          <p class="color-review-muted">
            Every sticker shows its measured color and what A and B read it as
            {balanced ? ', balanced on the capture’s own White stickers' : ''}.
            Letters in red disagree with the reviewed colors.
          </p>
          <div class="color-review-tabs" role="tablist" aria-label="Face">
            {capture!.faces.map((f, i) => (
              <button
                type="button"
                role="tab"
                key={f.face}
                aria-selected={i === face}
                class="color-review-tab"
                onClick={() => setFace(i)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div class="color-review-tryon">
            <div class="color-review-plate">
              <div
                class="color-review-face"
                style={{
                  gridTemplateColumns: `repeat(${faceData.length}, 1fr)`,
                }}
                role="tabpanel"
              >
                {faceData.flat().map((s, i) => (
                  <div
                    key={i}
                    class={`color-review-sticker ${s.readA !== s.readB ? 'changed' : ''}`}
                    style={{ background: css(s.measured) }}
                    title={`Reviewed ${NAMES[s.truth]} · A reads ${NAMES[s.readA]} · B reads ${NAMES[s.readB]} · measured ${hex(s.measured)}`}
                  >
                    <span class={s.readA !== s.truth ? 'wrong' : ''}>
                      A:{s.readA}
                    </span>
                    <span class={s.readB !== s.truth ? 'wrong' : ''}>
                      B:{s.readB}
                    </span>
                  </div>
                ))}
              </div>
              <p class="color-review-legend">
                <span>
                  <i class="changed" />A and B disagree
                </span>
                <span>
                  <i class="wrong" />
                  differs from review
                </span>
              </p>
            </div>
            <div class="color-review-scores">
              {(
                [
                  [A, 'a', tryOn.wrongA],
                  [B, 'b', tryOn.wrongB],
                ] as const
              ).map(([p, tag, wrong]) => (
                <div class="color-review-score" key={tag}>
                  <span class={`color-review-badge ${tag}`}>
                    {tag.toUpperCase()}
                  </span>
                  <span>
                    {p.name}
                    <br />
                    <span class="color-review-muted">
                      {wrong === 0
                        ? 'reads every sticker as reviewed'
                        : `misreads ${wrong} of ${tryOn.total} stickers`}
                    </span>
                  </span>
                  <span
                    class={`color-review-num ${wrong === 0 ? 'ok' : wrong > 8 ? 'bad' : 'warn'}`}
                  >
                    {tryOn.total - wrong}/{tryOn.total}
                  </span>
                </div>
              ))}
              <p>
                {changeList.length === 0
                  ? 'A and B read every sticker the same.'
                  : `A and B disagree on ${changeList.reduce((s, [, n]) => s + n, 0)} stickers: ${changeList
                      .map(([k, n]) => {
                        const [x, y] = k.split('→')
                        return `${n} × ${NAMES[x]} (A) vs ${NAMES[y]} (B)`
                      })
                      .join(', ')}.`}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
