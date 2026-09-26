// The #colors page: compare saved sticker color profiles, find the ones that
// only differ by room light, merge them, and try two profiles on the last
// capture. All grouping and merging logic lives in colorProfileReview.ts.
import { useMemo, useState } from 'preact/hooks'
import {
  groupSimilarProfiles, groupSpread, mergeColorProfiles, mergedColors, whiteBalancedColors,
} from './colorProfileReview'
import { classifySticker, rgbToOklab, rgbToOKLCH, type RGB } from './imageProcessing'
import { AUTO_COLORS_ID, GENERIC_COLORS_ID, allColorProfiles, type ColorProfile, type ProfileSettings } from './profileSettings'

const ORDER = ['W', 'Y', 'R', 'O', 'G', 'B']
const NAMES: Record<string, string> = { W: 'White', Y: 'Yellow', R: 'Red', O: 'Orange', G: 'Green', B: 'Blue' }
// Pairs a classifier is most likely to mix up.
const PAIRS: Array<[string, string]> = [['R', 'O'], ['W', 'Y'], ['O', 'Y'], ['G', 'B']]
// OKLab distance x 100 below which two colors are "close" / "may be mixed up".
const CLOSE = 15
const MIXED = 8
const DEFAULT_LIMIT = 4

export interface ReviewCapture {
  // Per face in capture order: reviewed colors and measured sticker colors.
  faces: Array<{ face: string; label: string; colors: string[][]; cellColors: RGB[][] }>
}

interface Props {
  settings: ProfileSettings
  onChange: (settings: ProfileSettings) => void
  capture: ReviewCapture | null
  onClose: () => void
}

const css = (c: RGB) => `rgb(${c.r} ${c.g} ${c.b})`
const hex = (c: RGB) => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')
const ink = (c: RGB) => rgbToOklab(c).l > 0.68 ? '#17171b' : '#ffffff'
const deltaE = (a: RGB, b: RGB) => {
  const x = rgbToOklab(a), y = rgbToOklab(b)
  return 100 * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}
const pairLevel = (d: number): ['bad' | 'warn' | 'ok', string] => d < MIXED ? ['bad', 'may be mixed up'] : d < CLOSE ? ['warn', 'close'] : ['ok', 'clear']
const isBuiltin = (id: string) => id === GENERIC_COLORS_ID || id === AUTO_COLORS_ID

function Swatch({ color, letter, class: cls = 'color-review-chip' }: { color: RGB; letter?: string; class?: string }) {
  return <span class={cls} style={{ background: css(color), color: ink(color) }} title={hex(color)}>{letter}</span>
}

export function ColorReviewPage({ settings, onChange, capture, onClose }: Props) {
  // Automatic isn't a palette of its own; Generic stays as the reference.
  const profiles = allColorProfiles(settings).filter((profile) => profile.id !== AUTO_COLORS_ID)
  const saved = settings.colors
  // A starts on the profile in use, B on the first other saved one.
  const [a, setA] = useState(() => settings.activeColorsId !== AUTO_COLORS_ID ? settings.activeColorsId : GENERIC_COLORS_ID)
  const [b, setB] = useState(() => saved.find((p) => p.id !== a)?.id ?? GENERIC_COLORS_ID)
  const [balanced, setBalanced] = useState(true)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})
  const [undo, setUndo] = useState<ProfileSettings[]>([])
  const [message, setMessage] = useState('')
  const [face, setFace] = useState(0)

  const byId = (id: string) => profiles.find((profile) => profile.id === id) ?? profiles[0]
  const shown = (profile: ColorProfile) => balanced ? whiteBalancedColors(profile.colors) : profile.colors
  const A = byId(a), B = byId(b)
  const colorsA = shown(A), colorsB = shown(B)

  const groups = useMemo(() => groupSimilarProfiles(saved, limit), [saved, limit])
  const mergeable = groups.filter((group) => group.length > 1)
  const distinct = groups.filter((group) => group.length === 1).map((group) => group[0])
  const groupKey = (group: ColorProfile[]) => group.map((p) => p.id).sort().join('+')

  const commit = (next: ProfileSettings, text: string) => {
    setUndo([...undo, settings])
    onChange(next)
    setMessage(text)
  }
  const merge = (group: ColorProfile[], name: string) => {
    const ticked = group.filter((p) => !unticked.has(p.id))
    try {
      const { settings: next, profile } = mergeColorProfiles(settings, ticked.map((p) => p.id), name, new Date().toISOString())
      if (ticked.some((p) => p.id === a)) setA(profile.id)
      if (ticked.some((p) => p.id === b)) setB(profile.id)
      commit(next, `Merged ${ticked.length} profiles into “${profile.name}” and deleted them.`)
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : 'Merge failed'}`)
    }
  }
  const toggle = (id: string, on: boolean) => {
    const next = new Set(unticked)
    if (on) next.delete(id); else next.add(id)
    setUnticked(next)
  }

  // Try-on: the last capture's stickers read with A and with B. Balanced
  // readings use the capture's own reviewed White stickers.
  const tryOn = useMemo(() => {
    if (!capture || capture.faces.length === 0) return null
    const whites = capture.faces.flatMap((f) => f.cellColors.flatMap((row, r) => row.filter((_, c) => f.colors[r]?.[c] === 'W')))
    const white = whites.length ? {
      r: whites.reduce((s, c) => s + c.r, 0) / whites.length,
      g: whites.reduce((s, c) => s + c.g, 0) / whites.length,
      b: whites.reduce((s, c) => s + c.b, 0) / whites.length,
    } : null
    const reading = (c: RGB) => balanced && white ? whiteBalancedColors({ W: white, X: c }).X : c
    let wrongA = 0, wrongB = 0, total = 0
    const changes: Record<string, number> = {}
    const faces = capture.faces.map((f) => f.cellColors.map((row, r) => row.map((c, col) => {
      const measured = reading(c), truth = f.colors[r][col]
      const readA = classifySticker(measured, colorsA).color, readB = classifySticker(measured, colorsB).color
      total++
      if (readA !== truth) wrongA++
      if (readB !== truth) wrongB++
      if (readA !== readB) changes[`${readA}→${readB}`] = (changes[`${readA}→${readB}`] ?? 0) + 1
      return { measured, truth, readA, readB }
    })))
    return { faces, wrongA, wrongB, total, changes }
  }, [capture, balanced, colorsA, colorsB])

  const pairColumn = (profile: ColorProfile, tag: 'a' | 'b') => {
    const colors = shown(profile)
    return (
      <div class="color-review-pair-col">
        <p><span class={`color-review-badge ${tag}`}>{tag.toUpperCase()}</span><strong>{profile.name}</strong></p>
        {PAIRS.map(([x, y]) => {
          const d = deltaE(colors[x], colors[y]), [level, word] = pairLevel(d)
          return (
            <div class="color-review-pair-row" key={x + y}>
              <span class="color-review-plate color-review-pair-dots" title={`${NAMES[x]} and ${NAMES[y]}`}>
                <Swatch color={colors[x]} class="color-review-dot" /><Swatch color={colors[y]} class="color-review-dot" />
              </span>
              <span class="color-review-bar" role="img" aria-label={`${NAMES[x]} to ${NAMES[y]}: ${d.toFixed(1)}, ${word}`}>
                <b class={level} style={{ width: `${Math.min(100, d / 50 * 100)}%` }} />
                <i style={{ left: `${CLOSE / 50 * 100}%` }} />
              </span>
              <span class="color-review-pair-val"><span class="mono">{d.toFixed(0)}</span><span class={`color-review-pill ${level}`}>{word}</span></span>
            </div>
          )
        })}
      </div>
    )
  }

  const wheel = () => {
    const cx = 160, cy = 160, R = 120, maxC = 0.33
    const point = (c: RGB) => {
      const { c: chroma, h } = rgbToOKLCH(c), r = Math.min(1, chroma / maxC) * R, t = h * Math.PI / 180
      return [cx + r * Math.cos(t), cy - r * Math.sin(t)]
    }
    const ring = ['R', 'O', 'Y', 'G', 'B']
    const outline = (colors: Record<string, RGB>) => ring.map((k) => point(colors[k]).map((v) => v.toFixed(1)).join(',')).join(' ')
    return (
      <svg viewBox="0 0 320 320" role="img" aria-label="Hue wheel of profiles A and B" class="color-review-wheel">
        {[0.33, 0.66, 1].map((f) => <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke="var(--color-border)" />)}
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const t = deg * Math.PI / 180
          return <g key={deg}>
            <line x1={cx} y1={cy} x2={cx + R * Math.cos(t)} y2={cy - R * Math.sin(t)} stroke="var(--color-border)" />
            <text x={cx + (R + 16) * Math.cos(t)} y={cy - (R + 16) * Math.sin(t) + 4} text-anchor="middle" font-size="10" fill="var(--color-text-secondary)">{deg}°</text>
          </g>
        })}
        <polygon points={outline(colorsB)} fill="none" stroke="#8a4fd1" stroke-width="1.6" stroke-dasharray="5 4" />
        <polygon points={outline(colorsA)} fill="none" stroke="#2450c8" stroke-width="1.6" />
        {([[colorsB, 'B'], [colorsA, 'A']] as const).map(([colors, tag]) => ORDER.map((k) => {
          const [x, y] = point(colors[k])
          return <circle key={tag + k} cx={x} cy={y} r={tag === 'A' ? 7 : 5.5} fill={css(colors[k])} stroke={tag === 'A' ? '#2450c8' : '#8a4fd1'} stroke-width="2"><title>{tag}: {NAMES[k]}</title></circle>
        }))}
      </svg>
    )
  }

  const faceData = tryOn?.faces[Math.min(face, tryOn.faces.length - 1)]
  const changeList = tryOn ? Object.entries(tryOn.changes).sort((x, y) => y[1] - x[1]) : []

  return (
    <div class="color-review">
      <header class="color-review-header">
        <button type="button" class="btn btn-secondary btn-sm" onClick={onClose}>← Back to the scanner</button>
        <h1>Sticker colors</h1>
        <p class="color-review-muted">Compare saved color profiles, merge the ones that only differ by room light, and try two profiles on your last capture.</p>
      </header>

      <div class="color-review-picker card" role="group" aria-label="Profiles to compare">
        <label for="review-a"><span><span class="color-review-badge a">A</span>Profile</span>
          <select id="review-a" value={A.id} onChange={(e) => setA(e.currentTarget.value)}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label for="review-b"><span><span class="color-review-badge b">B</span>Profile</span>
          <select id="review-b" value={B.id} onChange={(e) => setB(e.currentTarget.value)}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button type="button" class="btn btn-secondary btn-sm" onClick={() => { setA(B.id); setB(A.id) }}>Swap A and B</button>
        <label class="color-review-check" for="review-balanced">
          <input type="checkbox" id="review-balanced" checked={balanced} onChange={(e) => setBalanced(e.currentTarget.checked)} />
          White-balanced (lighting removed)
        </label>
      </div>

      <section class="card color-review-section" aria-labelledby="review-groups">
        <h2 id="review-groups">Similar profiles</h2>
        <p class="color-review-muted">Captures are white balanced, so a profile should describe the stickers, not the room light. Each profile is scaled so its own White is neutral; profiles whose Yellow, Red, Orange, Green and Blue all stay within the limit of each other form a group. Tick the profiles to merge and name the new one: the ticked profiles are deleted, and the selected or automatically matched profile moves to the new one.</p>
        <div class="color-review-limit">
          <label for="review-limit">Merge limit</label>
          <input type="range" id="review-limit" min="2" max="8" step="0.5" value={limit} onInput={(e) => setLimit(Number(e.currentTarget.value))} />
          <span class="mono">ΔE {limit.toFixed(1)}</span>
          <span class="color-review-muted">{saved.length} profiles → {groups.length} if every group is merged</span>
        </div>
        <div class="color-review-toolbar">
          <button type="button" class="btn btn-secondary btn-sm" disabled={undo.length === 0} onClick={() => {
            const previous = undo[undo.length - 1]
            setUndo(undo.slice(0, -1))
            onChange(previous)
            setMessage('Undone.')
          }}>Undo last change</button>
          {message && <span role="status" class={`color-review-message ${message.startsWith('❌') ? 'error' : ''}`}>{message}</span>}
        </div>
        {saved.length < 2 && <p class="color-review-muted">Save at least two color profiles to find similar ones.</p>}
        <div class="color-review-groups">
          {mergeable.map((group, n) => {
            const key = groupKey(group)
            const ticked = group.filter((p) => !unticked.has(p.id))
            const spread = ticked.length >= 2 ? groupSpread(ticked) : 0
            const name = names[key] ?? `Merged colors ${n + 1}`
            const preview = ticked.length >= 2 ? mergedColors(ticked) : null
            return (
              <div class="color-review-group" key={key}>
                <div class="color-review-group-head">
                  <strong>Group {n + 1} · {group.length} profiles</strong>
                  <span class={`color-review-pill ${spread < 3 ? 'ok' : 'warn'}`}>spread ΔE {spread.toFixed(1)}</span>
                </div>
                <div class="color-review-plate color-review-strips">
                  {group.map((p) => {
                    const on = !unticked.has(p.id), colors = whiteBalancedColors(p.colors)
                    return (
                      <div class={`color-review-strip ${on ? '' : 'off'}`} key={p.id}>
                        <label title={p.name}>
                          <input type="checkbox" checked={on} onChange={(e) => toggle(p.id, e.currentTarget.checked)} />
                          <span class="color-review-strip-name">{p.name}</span>
                        </label>
                        {ORDER.map((k) => <Swatch key={k} color={colors[k]} class="color-review-dot" />)}
                      </div>
                    )
                  })}
                  <div class="color-review-strip merged">
                    <span class="color-review-strip-name">{preview ? 'New profile' : 'Tick at least two profiles'}</span>
                    {preview && ORDER.map((k) => <Swatch key={k} color={whiteBalancedColors(preview)[k]} class="color-review-dot" />)}
                  </div>
                </div>
                <label class="color-review-field" for={`review-name-${n}`}>New profile name</label>
                <input type="text" id={`review-name-${n}`} class="color-review-name" maxLength={60} value={name}
                  onInput={(e) => setNames({ ...names, [key]: e.currentTarget.value })} />
                <div class="color-review-toolbar">
                  <button type="button" class="btn btn-primary btn-sm" disabled={ticked.length < 2 || !name.trim()} onClick={() => merge(group, name)}>
                    Merge {ticked.length} and delete them
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" disabled={ticked.length < 2} onClick={() => { setA(ticked[0].id); setB(ticked[1].id) }}>
                    Compare first two
                  </button>
                </div>
                {ticked.length >= 2 && <p class="color-review-note">Deletes {ticked.map((p) => p.name).join(', ')}.</p>}
              </div>
            )
          })}
        </div>
        {saved.length >= 2 && mergeable.length === 0 && <p class="color-review-muted">No profiles are this close. Raise the limit to see candidates.</p>}
        {distinct.length > 0 && mergeable.length > 0 && (
          <p class="color-review-note"><strong>Distinct</strong> (no partner within the limit): {distinct.map((p) => p.name).join(', ')}</p>
        )}
      </section>

      <section class="card color-review-section" aria-labelledby="review-all">
        <h2 id="review-all">All profiles</h2>
        <p class="color-review-muted">Each row is one profile's six reference colors on the same neutral grey.</p>
        <div class="color-review-scroll">
          <table class="color-review-plate color-review-table">
            <thead><tr><th scope="col">Profile</th>{ORDER.map((k) => <th scope="col" key={k}>{NAMES[k]}</th>)}</tr></thead>
            <tbody>
              {profiles.map((p) => {
                const colors = shown(p)
                return (
                  <tr key={p.id}>
                    <th scope="row">
                      {p.id === A.id && <span class="color-review-badge a">A</span>}
                      {p.id === B.id && <span class="color-review-badge b">B</span>}
                      {p.name}
                      <span class="color-review-src">{isBuiltin(p.id) ? 'built in, read-only' : `${p.captures} capture${p.captures === 1 ? '' : 's'}`}{p.id === settings.activeColorsId ? ' · selected' : ''}{p.id === settings.autoMatchedColorsId ? ' · automatic match' : ''}</span>
                    </th>
                    {ORDER.map((k) => <td key={k}><Swatch color={colors[k]} letter={k} /></td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card color-review-section" aria-labelledby="review-split">
        <h2 id="review-split">A next to B</h2>
        <p class="color-review-muted">Left half A, right half B. ΔE is the OKLab distance × 100: under 5 is hard to tell apart, over 12 is a clearly different color.</p>
        <div class="color-review-splits">
          {ORDER.map((k) => {
            const d = deltaE(colorsA[k], colorsB[k])
            const [level, word] = d < 5 ? ['ok', 'same'] : d < 12 ? ['warn', 'slightly different'] : ['bad', 'different']
            return (
              <div class="color-review-split" key={k}>
                <div class="color-review-plate">
                  <div class="color-review-split-chip" aria-label={`${NAMES[k]}: A ${hex(colorsA[k])}, B ${hex(colorsB[k])}`}>
                    <Swatch color={colorsA[k]} letter="A" class="color-review-half" /><Swatch color={colorsB[k]} letter="B" class="color-review-half" />
                  </div>
                </div>
                <div class="color-review-split-meta"><strong>{NAMES[k]}</strong><span class="mono">ΔE {d.toFixed(1)}</span></div>
                <span class={`color-review-pill ${level}`}>{word}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section class="card color-review-section" aria-labelledby="review-pairs">
        <h2 id="review-pairs">Colors that could be mixed up</h2>
        <p class="color-review-muted">Distance between each profile's risky pairs. A short bar means stickers of these two colors may be read as each other; the tick marks the "close" limit of {CLOSE}.</p>
        <div class="color-review-pairs">{pairColumn(A, 'a')}{pairColumn(B, 'b')}</div>
      </section>

      <section class="card color-review-section" aria-labelledby="review-try">
        <h2 id="review-try">Try on your last capture</h2>
        {!tryOn || !faceData ? (
          <p class="color-review-muted">Capture a cube with the camera first; its faces show up here.</p>
        ) : (
          <>
            <p class="color-review-muted">Every sticker shows its measured color and what A and B read it as{balanced ? ', balanced on the capture’s own White stickers' : ''}. Letters in red disagree with the reviewed colors.</p>
            <div class="color-review-tabs" role="tablist" aria-label="Face">
              {capture!.faces.map((f, i) => (
                <button type="button" role="tab" key={f.face} aria-selected={i === face} class="color-review-tab" onClick={() => setFace(i)}>{f.label}</button>
              ))}
            </div>
            <div class="color-review-tryon">
              <div class="color-review-plate">
                <div class="color-review-face" style={{ gridTemplateColumns: `repeat(${faceData.length}, 1fr)` }} role="tabpanel">
                  {faceData.flat().map((s, i) => (
                    <div key={i} class={`color-review-sticker ${s.readA !== s.readB ? 'changed' : ''}`} style={{ background: css(s.measured) }}
                      title={`Reviewed ${NAMES[s.truth]} · A reads ${NAMES[s.readA]} · B reads ${NAMES[s.readB]} · measured ${hex(s.measured)}`}>
                      <span class={s.readA !== s.truth ? 'wrong' : ''}>A:{s.readA}</span>
                      <span class={s.readB !== s.truth ? 'wrong' : ''}>B:{s.readB}</span>
                    </div>
                  ))}
                </div>
                <p class="color-review-legend"><span><i class="changed" />A and B disagree</span><span><i class="wrong" />differs from review</span></p>
              </div>
              <div class="color-review-scores">
                {([[A, 'a', tryOn.wrongA], [B, 'b', tryOn.wrongB]] as const).map(([p, tag, wrong]) => (
                  <div class="color-review-score" key={tag}>
                    <span class={`color-review-badge ${tag}`}>{tag.toUpperCase()}</span>
                    <span>{p.name}<br /><span class="color-review-muted">{wrong === 0 ? 'reads every sticker as reviewed' : `misreads ${wrong} of ${tryOn.total} stickers`}</span></span>
                    <span class={`color-review-num ${wrong === 0 ? 'ok' : wrong > 8 ? 'bad' : 'warn'}`}>{tryOn.total - wrong}/{tryOn.total}</span>
                  </div>
                ))}
                <p>{changeList.length === 0 ? 'A and B read every sticker the same.'
                  : `A and B disagree on ${changeList.reduce((s, [, n]) => s + n, 0)} stickers: ${changeList.map(([k, n]) => { const [x, y] = k.split('→'); return `${n} × ${NAMES[x]} (A) vs ${NAMES[y]} (B)` }).join(', ')}.`}</p>
              </div>
            </div>
          </>
        )}
      </section>

      <section class="card color-review-section" aria-labelledby="review-advanced">
        <h2 id="review-advanced">Advanced</h2>
        <details>
          <summary>Hue wheel</summary>
          <div class="color-review-wheel-wrap">
            {wheel()}
            <p class="color-review-muted">Angle is the hue, distance from the center the color strength (OKLCH chroma). A is solid, B dashed. Where two points of one profile nearly touch, those colors may be mixed up.</p>
          </div>
        </details>
        <details>
          <summary>Numbers (as saved, before balancing)</summary>
          <div class="color-review-scroll">
            <table class="color-review-numbers">
              <thead><tr><th>Profile</th><th>Color</th><th>Hex</th><th>RGB</th><th>L</th><th>C</th><th>h</th></tr></thead>
              <tbody>
                {profiles.flatMap((p) => ORDER.map((k) => {
                  const c = p.colors[k], { l, c: chroma, h } = rgbToOKLCH(c)
                  return <tr key={p.id + k}><td>{p.name}</td><td>{NAMES[k]}</td><td class="mono">{hex(c)}</td><td class="mono">{c.r}, {c.g}, {c.b}</td>
                    <td class="mono">{l.toFixed(3)}</td><td class="mono">{chroma.toFixed(3)}</td><td class="mono">{h.toFixed(0)}°</td></tr>
                }))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  )
}
