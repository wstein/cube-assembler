// The Colors tab's comparison of profiles A and B: color by color, the
// pairs a classifier may mix up, and the hue wheel with the raw numbers.
import {
  pairDistance as deltaE,
  pairLevel,
  splitColorLevel,
  wheelOutline,
  wheelPoint,
  WHEEL_CENTER,
  WHEEL_RADIUS,
  CLOSE_DISTANCE as CLOSE,
} from './colorProfileReview'
import { css, hex, NAMES, ORDER, Swatch } from './colorReviewParts'
import { rgbToOKLCH } from '../vision/colorMath'
import { type RGB } from '../vision/stickerColorGeometry'
import type { ColorProfile } from './profileSettings'

type Colors = Record<string, RGB>

// Pairs a classifier is most likely to mix up.
const PAIRS: Array<[string, string]> = [
  ['R', 'O'],
  ['W', 'Y'],
  ['O', 'Y'],
  ['G', 'B'],
]

export function SplitSection({
  colorsA,
  colorsB,
}: {
  colorsA: Colors
  colorsB: Colors
}) {
  return (
    <section class="card color-review-section" aria-labelledby="review-split">
      <h2 id="review-split">A next to B</h2>
      <p class="color-review-muted">
        Left half A, right half B. ΔE is the OKLab distance × 100: under 3 is
        the same, 3–12 is slightly different, and 12 or more is different.
      </p>
      <div class="color-review-splits">
        {ORDER.map((k) => {
          const d = deltaE(colorsA[k], colorsB[k])
          const [level, word] = splitColorLevel(d)
          return (
            <div class="color-review-split" key={k}>
              <div class="color-review-plate">
                <div
                  class="color-review-split-chip"
                  aria-label={`${NAMES[k]}: A ${hex(colorsA[k])}, B ${hex(colorsB[k])}`}
                >
                  <Swatch
                    color={colorsA[k]}
                    letter="A"
                    class="color-review-half"
                  />
                  <Swatch
                    color={colorsB[k]}
                    letter="B"
                    class="color-review-half"
                  />
                </div>
              </div>
              <div class="color-review-split-meta">
                <strong>{NAMES[k]}</strong>
                <span class="mono">ΔE {d.toFixed(1)}</span>
              </div>
              <span class={`color-review-pill ${level}`}>{word}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function PairsSection({
  A,
  B,
  shown,
}: {
  A: ColorProfile
  B: ColorProfile
  shown: (profile: ColorProfile) => Colors
}) {
  const pairColumn = (profile: ColorProfile, tag: 'a' | 'b') => {
    const colors = shown(profile)
    return (
      <div class="color-review-pair-col">
        <p>
          <span class={`color-review-badge ${tag}`}>{tag.toUpperCase()}</span>
          <strong>{profile.name}</strong>
        </p>
        {PAIRS.map(([x, y]) => {
          const d = deltaE(colors[x], colors[y]),
            [level, word] = pairLevel(d)
          return (
            <div class="color-review-pair-row" key={x + y}>
              <span
                class="color-review-plate color-review-pair-dots"
                title={`${NAMES[x]} and ${NAMES[y]}`}
              >
                <Swatch color={colors[x]} class="color-review-dot" />
                <Swatch color={colors[y]} class="color-review-dot" />
              </span>
              <span
                class="color-review-bar"
                role="img"
                aria-label={`${NAMES[x]} to ${NAMES[y]}: ${d.toFixed(1)}, ${word}`}
              >
                <b
                  class={level}
                  style={{ width: `${Math.min(100, (d / 50) * 100)}%` }}
                />
                <i style={{ left: `${(CLOSE / 50) * 100}%` }} />
              </span>
              <span class="color-review-pair-val">
                <span class="mono">{d.toFixed(0)}</span>
                <span class={`color-review-pill ${level}`}>{word}</span>
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <section class="card color-review-section" aria-labelledby="review-pairs">
      <h2 id="review-pairs">Colors that could be mixed up</h2>
      <p class="color-review-muted">
        Distance between each profile's risky pairs. A short bar means stickers
        of these two colors may be read as each other; the tick marks the
        "close" limit of {CLOSE}.
      </p>
      <div class="color-review-pairs">
        {pairColumn(A, 'a')}
        {pairColumn(B, 'b')}
      </div>
    </section>
  )
}

export function AdvancedSection({
  profiles,
  colorsA,
  colorsB,
}: {
  profiles: ColorProfile[]
  colorsA: Colors
  colorsB: Colors
}) {
  const wheel = () => {
    const cx = WHEEL_CENTER,
      cy = WHEEL_CENTER,
      R = WHEEL_RADIUS
    const point = wheelPoint
    const outline = wheelOutline
    return (
      <svg
        viewBox="0 0 320 320"
        role="img"
        aria-label="Hue wheel of profiles A and B"
        class="color-review-wheel"
      >
        {[0.33, 0.66, 1].map((f) => (
          <circle
            key={f}
            cx={cx}
            cy={cy}
            r={R * f}
            fill="none"
            stroke="var(--color-border)"
          />
        ))}
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const t = (deg * Math.PI) / 180
          return (
            <g key={deg}>
              <line
                x1={cx}
                y1={cy}
                x2={cx + R * Math.cos(t)}
                y2={cy - R * Math.sin(t)}
                stroke="var(--color-border)"
              />
              <text
                x={cx + (R + 16) * Math.cos(t)}
                y={cy - (R + 16) * Math.sin(t) + 4}
                text-anchor="middle"
                font-size="10"
                fill="var(--color-text-secondary)"
              >
                {deg}°
              </text>
            </g>
          )
        })}
        <polygon
          points={outline(colorsB)}
          fill="none"
          stroke="#8a4fd1"
          stroke-width="1.6"
          stroke-dasharray="5 4"
        />
        <polygon
          points={outline(colorsA)}
          fill="none"
          stroke="#2450c8"
          stroke-width="1.6"
        />
        {(
          [
            [colorsB, 'B'],
            [colorsA, 'A'],
          ] as const
        ).map(([colors, tag]) =>
          ORDER.map((k) => {
            const [x, y] = point(colors[k])
            return (
              <circle
                key={tag + k}
                cx={x}
                cy={y}
                r={tag === 'A' ? 7 : 5.5}
                fill={css(colors[k])}
                stroke={tag === 'A' ? '#2450c8' : '#8a4fd1'}
                stroke-width="2"
              >
                <title>
                  {tag}: {NAMES[k]}
                </title>
              </circle>
            )
          }),
        )}
      </svg>
    )
  }

  return (
    <section
      class="card color-review-section"
      aria-labelledby="review-advanced"
    >
      <h2 id="review-advanced">Advanced</h2>
      <details>
        <summary>Hue wheel</summary>
        <div class="color-review-wheel-wrap">
          {wheel()}
          <p class="color-review-muted">
            Angle is the hue, distance from the center the color strength (OKLCH
            chroma). A is solid, B dashed. Where two points of one profile
            nearly touch, those colors may be mixed up.
          </p>
        </div>
      </details>
      <details>
        <summary>Numbers (as saved, before balancing)</summary>
        <div class="color-review-scroll">
          <table class="color-review-numbers">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Color</th>
                <th>Hex</th>
                <th>RGB</th>
                <th>L</th>
                <th>C</th>
                <th>h</th>
              </tr>
            </thead>
            <tbody>
              {profiles.flatMap((p) =>
                ORDER.map((k) => {
                  const c = p.colors[k],
                    { l, c: chroma, h } = rgbToOKLCH(c)
                  return (
                    <tr key={p.id + k}>
                      <td>{p.name}</td>
                      <td>{NAMES[k]}</td>
                      <td class="mono">{hex(c)}</td>
                      <td class="mono">
                        {c.r}, {c.g}, {c.b}
                      </td>
                      <td class="mono">{l.toFixed(3)}</td>
                      <td class="mono">{chroma.toFixed(3)}</td>
                      <td class="mono">{h.toFixed(0)}°</td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
