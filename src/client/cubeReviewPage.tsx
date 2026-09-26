// The Cubes tab of the profiles page: saved cube definitions by size (tick
// or delete them), their duplicates (merge or delete in favour of Generic), and each cube's sampled
// sticker area drawn on the last captured face. Logic: cubeProfileReview.ts.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { cubeDeletionEffects, cubesSameAsGeneric, deleteCubes, duplicateCubeGroups, mergeCubes, replaceCubes, unusedCubes } from './cubeProfileReview'
import { DeleteButton, SelectionBar } from './profileDeletion'
import { cellEdges, estimateOuterCellRatio } from './gridAlignment'
import { CUBE_SIZES, activeCube, allCubes, builtinCube, isBuiltinCube, type CubeSetting, type ProfileSettings } from './profileSettings'

export interface ReviewPhoto {
  size: number
  // The aligned face crop of the last capture (a data URL).
  src: string
  label: string
}

interface Props {
  settings: ProfileSettings
  onChange: (settings: ProfileSettings) => void
  photo: ReviewPhoto | null
}

const DEFAULT_TOLERANCE = 0.02
const GENERIC_CORE = builtinCube(3).sampling.stickerCore
const pct = (v: number) => `${Math.round(v * 100)}%`

// The sampled square of every cell: `core` of the cell, centered.
function sampledSquares(size: number, core: number, outer = 1) {
  const edges = cellEdges(size, outer)
  const squares: Array<{ x: number; y: number; w: number; h: number }> = []
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const w = (edges[col + 1] - edges[col]) * core, h = (edges[row + 1] - edges[row]) * core
      squares.push({ x: (edges[col] + edges[col + 1]) / 2 - w / 2, y: (edges[row] + edges[row + 1]) / 2 - h / 2, w, h })
    }
  }
  return squares
}

function MiniGrid({ size, core, class: cls = 'cube-review-mini' }: { size: number; core: number; class?: string }) {
  const inner = cellEdges(size).slice(1, -1)
  return (
    <svg class={cls} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="0.5" y="0.5" width="99" height="99" rx="4" fill="var(--color-bg-primary)" stroke="var(--color-border)" />
      <g stroke="var(--color-border)">
        {inner.map((t) => <g key={t}><line x1={t * 100} y1="0" x2={t * 100} y2="100" /><line x1="0" y1={t * 100} x2="100" y2={t * 100} /></g>)}
      </g>
      <g fill="var(--color-accent)" opacity="0.75">
        {sampledSquares(size, core).map((s, i) => <rect key={i} x={s.x * 100} y={s.y * 100} width={s.w * 100} height={s.h * 100} rx="1" />)}
      </g>
    </svg>
  )
}

// The photo's outer-cell ratio, measured the way the scanner does (5x5 and
// up have wider outer cubies); 1 until the photo has loaded.
function useOuterRatio(photo: ReviewPhoto | null): number {
  const [outer, setOuter] = useState(1)
  useEffect(() => {
    setOuter(1)
    if (!photo) return
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width || !canvas.height) return
      ctx.drawImage(image, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setOuter(estimateOuterCellRatio(data, canvas.width, canvas.height, photo.size))
    }
    image.src = photo.src
    return () => { active = false }
  }, [photo?.src, photo?.size])
  return outer
}

export function CubeReviewTab({ settings, onChange, photo }: Props) {
  const cubes = allCubes(settings)
  const [sizes, setSizes] = useState<number[]>([])
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})
  const [undo, setUndo] = useState<ProfileSettings[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [a, setA] = useState<string | null>(null)
  const [b, setB] = useState<string | null>(null)
  const [trial, setTrial] = useState<number | null>(null)
  const outer = useOuterRatio(photo)

  const groups = useMemo(() => duplicateCubeGroups(settings, tolerance), [settings, tolerance])
  const groupKey = (group: CubeSetting[]) => group.map((cube) => cube.id).sort().join('+')
  const isActive = (cube: CubeSetting) => activeCube(settings, cube.size).id === cube.id

  const status = (
    <div class="color-review-toolbar">
      <button type="button" class="btn btn-secondary btn-sm" disabled={undo.length === 0} onClick={() => {
        onChange(undo[undo.length - 1])
        setUndo(undo.slice(0, -1))
        setMessage('Undone.')
      }}>Undo last change</button>
      {message && <span role="status" class={`color-review-message ${message.startsWith('❌') ? 'error' : ''}`}>{message}</span>}
    </div>
  )
  const remove = (ids: string[]) => {
    try {
      const names = ids.map((id) => settings.cubes.find((cube) => cube.id === id)?.name ?? id)
      commit(deleteCubes(settings, ids), ids.length === 1 ? `Deleted “${names[0]}”.` : `Deleted ${ids.length} cubes.`)
      setSelected(selected.filter((id) => !ids.includes(id)))
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : 'Delete failed'}`)
    }
  }
  const commit = (next: ProfileSettings, text: string) => {
    setUndo([...undo, settings])
    onChange(next)
    setMessage(text)
  }
  const apply = (group: CubeSetting[], name: string) => {
    const generic = group.find((cube) => isBuiltinCube(cube.id))
    const ticked = group.filter((cube) => !isBuiltinCube(cube.id) && !unticked.has(cube.id))
    try {
      if (generic) {
        commit(replaceCubes(settings, ticked.map((cube) => cube.id), generic.id),
          `Deleted ${ticked.length} cube${ticked.length === 1 ? '' : 's'}; ${generic.size}×${generic.size} uses ${generic.name}.`)
      } else {
        const { settings: next, cube } = mergeCubes(settings, ticked.map((c) => c.id), name)
        if (ticked.some((c) => c.id === a)) setA(cube.id)
        if (ticked.some((c) => c.id === b)) setB(cube.id)
        commit(next, `Merged ${ticked.length} cubes into “${cube.name}”.`)
      }
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : 'Change failed'}`)
    }
  }
  const toggle = (id: string, on: boolean) => {
    const next = new Set(unticked)
    if (on) next.delete(id); else next.add(id)
    setUnticked(next)
  }

  // Try on the photo: A and B among the cubes of the photo's size.
  const photoCubes = photo ? cubes.filter((cube) => cube.size === photo.size) : []
  const cubeA = photoCubes.find((cube) => cube.id === a) ?? (photo ? activeCube(settings, photo.size) : null)
  const cubeB = photoCubes.find((cube) => cube.id === b)
    ?? photoCubes.find((cube) => cube.id !== cubeA?.id && cube.sampling.stickerCore !== cubeA?.sampling.stickerCore)
    ?? photoCubes.find((cube) => cube.id !== cubeA?.id) ?? cubeA
  const coreA = trial ?? cubeA?.sampling.stickerCore ?? GENERIC_CORE
  const saveTrial = () => {
    if (!cubeA || trial === null || isBuiltinCube(cubeA.id)) return
    const value = Math.round(trial * 100) / 100
    setTrial(null)
    commit({ ...settings, cubes: settings.cubes.map((cube) => cube.id === cubeA.id ? { ...cube, sampling: { ...cube.sampling, stickerCore: value } } : cube) },
      `${cubeA.name} now samples ${pct(value)} of each sticker.`)
  }

  const overlay = (core: number, color: string) => (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill={color} fill-opacity="0.18" stroke={color} stroke-width="0.7" vector-effect="non-scaling-stroke">
        {sampledSquares(photo!.size, core, outer).map((s, i) => <rect key={i} x={s.x * 100} y={s.y * 100} width={s.w * 100} height={s.h * 100} rx="0.6" />)}
      </g>
    </svg>
  )

  const shownSizes = sizes.length ? sizes : CUBE_SIZES
  return (
    <>
      <section class="card color-review-section" aria-labelledby="cubes-list">
        <h2 id="cubes-list">Cubes by size</h2>
        <p class="color-review-muted">A cube sets how much of each sticker is sampled (the sticker area): the filled squares in its grid are what the scanner reads. Dashed cards are the built-in Generic cubes, which can't be changed or deleted. Tick cubes to delete several at once.</p>
        {settings.cubes.length > 0 && (
          <SelectionBar noun={['cube', 'cubes']} selected={selected}
            quick={[{ label: 'Select same as Generic', ids: cubesSameAsGeneric(settings) }, { label: 'Select unused', ids: unusedCubes(settings) }]}
            effects={cubeDeletionEffects(settings, selected)} onSelect={setSelected} onDelete={remove} />
        )}
        {status}
        <div class="color-review-tabs" role="group" aria-label="Show sizes">
          <button type="button" class="color-review-tab" aria-pressed={sizes.length === 0} onClick={() => setSizes([])}>All sizes</button>
          {CUBE_SIZES.map((size) => (
            <button type="button" key={size} class="color-review-tab" aria-pressed={sizes.includes(size)}
              onClick={() => setSizes(sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size].sort())}>{size}×{size}</button>
          ))}
        </div>
        {shownSizes.map((size) => {
          const ofSize = cubes.filter((cube) => cube.size === size)
          return (
            <div class="cube-review-size" key={size}>
              <h3>{size}×{size} <span class="color-review-muted">{ofSize.filter((cube) => !isBuiltinCube(cube.id)).length} saved</span></h3>
              <div class="cube-review-cards">
                {ofSize.map((cube) => (
                  <div class={`cube-review-card ${isBuiltinCube(cube.id) ? 'builtin' : ''} ${selected.includes(cube.id) ? 'is-selected' : ''}`} key={cube.id}>
                    <MiniGrid size={size} core={cube.sampling.stickerCore} />
                    <div>
                      <div class="cube-review-name">{cube.name}{isBuiltinCube(cube.id) ? ' (built in)' : ''}</div>
                      <div class="cube-review-meta">
                        <span class="mono">sticker area {pct(cube.sampling.stickerCore)}</span>
                        {isActive(cube) && <span class="color-review-pill info">active</span>}
                        {!isBuiltinCube(cube.id) && cube.sampling.stickerCore === GENERIC_CORE && <span class="color-review-pill warn">same as Generic</span>}
                      </div>
                      {!isBuiltinCube(cube.id) && (
                        <div class="cube-review-actions">
                          <label class="cube-review-select">
                            <input type="checkbox" checked={selected.includes(cube.id)}
                              onChange={(e) => setSelected(e.currentTarget.checked ? [...selected, cube.id] : selected.filter((id) => id !== cube.id))} />
                            Select
                          </label>
                          <DeleteButton name={cube.name} effects={cubeDeletionEffects(settings, [cube.id])} onDelete={() => remove([cube.id])} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      <section class="card color-review-section" aria-labelledby="cubes-dupes">
        <h2 id="cubes-dupes">Duplicates</h2>
        <p class="color-review-muted">Cubes of the same size whose sticker areas all lie within the tolerance of each other. Tick the ones to merge: they are deleted, and the size's active cube moves to the result. A group with a built-in Generic cube keeps Generic.</p>
        <div class="color-review-limit">
          <label for="cubes-tolerance">Tolerance</label>
          <input type="range" id="cubes-tolerance" min="0" max="0.06" step="0.005" value={tolerance} onInput={(e) => setTolerance(Number(e.currentTarget.value))} />
          <span class="mono">± {pct(tolerance)}</span>
        </div>
        {status}
        {groups.length === 0 && <p class="color-review-muted">No duplicates at this tolerance.</p>}
        <div class="color-review-groups">
          {groups.map((group, n) => {
            const key = groupKey(group)
            const size = group[0].size
            const generic = group.find((cube) => isBuiltinCube(cube.id))
            const ticked = group.filter((cube) => !isBuiltinCube(cube.id) && !unticked.has(cube.id))
            const cores = group.map((cube) => cube.sampling.stickerCore)
            const spread = Math.max(...cores) - Math.min(...cores)
            const core = generic ? generic.sampling.stickerCore : ticked.reduce((sum, cube) => sum + cube.sampling.stickerCore, 0) / Math.max(1, ticked.length)
            const enough = generic ? ticked.length >= 1 : ticked.length >= 2
            const name = names[key] ?? ticked[0]?.name ?? ''
            return (
              <div class="color-review-group" key={key}>
                <div class="color-review-group-head">
                  <strong>{size}×{size} · {group.length} cubes</strong>
                  <span class={`color-review-pill ${spread < 0.005 ? 'ok' : 'warn'}`}>{spread < 0.005 ? 'identical' : `spread ${pct(spread)}`}</span>
                </div>
                <div class="cube-review-members">
                  {group.map((cube) => {
                    const builtin = isBuiltinCube(cube.id), on = builtin || !unticked.has(cube.id)
                    return (
                      <label class={`cube-review-member ${on ? '' : 'off'}`} key={cube.id}>
                        <input type="checkbox" checked={on} disabled={builtin} onChange={(e) => toggle(cube.id, e.currentTarget.checked)} />
                        <MiniGrid size={size} core={cube.sampling.stickerCore} class="cube-review-mini small" />
                        <span class="cube-review-member-name">{cube.name}{builtin ? ' (built in)' : ''}{isActive(cube) && <span class="color-review-pill info">active</span>}</span>
                        <span class="mono">{pct(cube.sampling.stickerCore)}</span>
                      </label>
                    )
                  })}
                </div>
                <div class="cube-review-result">
                  <MiniGrid size={size} core={core} class="cube-review-mini small" />
                  <span>{generic ? <>Keeps <strong>{generic.name}</strong> ({pct(core)})</> : <>New cube · sticker area <span class="mono">{pct(core)}</span></>}</span>
                </div>
                {!generic && <>
                  <label class="color-review-field" for={`cube-name-${n}`}>New cube name</label>
                  <input type="text" id={`cube-name-${n}`} class="color-review-name" maxLength={60} value={name}
                    onInput={(e) => setNames({ ...names, [key]: e.currentTarget.value })} />
                </>}
                <div class="color-review-toolbar">
                  <button type="button" class="btn btn-primary btn-sm" disabled={!enough || (!generic && !name.trim())} onClick={() => apply(group, name)}>
                    {generic ? `Delete ${ticked.length}, keep Generic` : `Merge ${ticked.length} into one`}
                  </button>
                  {photo?.size === size && (
                    <button type="button" class="btn btn-secondary btn-sm" onClick={() => {
                      const distinct = [...new Map(group.map((cube) => [cube.sampling.stickerCore, cube])).values()]
                      setA(distinct[0].id); setB((distinct[1] ?? group[1]).id); setTrial(null)
                      document.getElementById('cubes-try')?.scrollIntoView({ behavior: 'smooth' })
                    }}>Try on photo</button>
                  )}
                </div>
                <p class="color-review-note">{enough ? `Deletes ${ticked.map((cube) => cube.name).join(', ')}.` : generic ? 'Tick at least one cube.' : 'Tick at least two cubes.'}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section class="card color-review-section" aria-labelledby="cubes-try">
        <h2 id="cubes-try">Try on your last capture</h2>
        {!photo || !cubeA || !cubeB ? (
          <p class="color-review-muted">Capture a face with the camera first; the sticker areas of cubes of that size are drawn on it here.</p>
        ) : (
          <>
            <p class="color-review-muted">Each cube's sampled areas on your last captured {photo.size}×{photo.size} face ({photo.label}). A good sticker area stays well inside every sticker; one that touches the black plastic or a rounded corner reads mixed colors.</p>
            <div class="color-review-picker cube-review-picker" role="group" aria-label="Cubes to compare">
              <label for="cube-a"><span><span class="color-review-badge a">A</span>Cube</span>
                <select id="cube-a" value={cubeA.id} onChange={(e) => { setA(e.currentTarget.value); setTrial(null) }}>
                  {photoCubes.map((cube) => <option key={cube.id} value={cube.id}>{cube.name}{isBuiltinCube(cube.id) ? ' (built in)' : ''} · {pct(cube.sampling.stickerCore)}</option>)}
                </select>
              </label>
              <label for="cube-b"><span><span class="color-review-badge b">B</span>Cube</span>
                <select id="cube-b" value={cubeB.id} onChange={(e) => setB(e.currentTarget.value)}>
                  {photoCubes.map((cube) => <option key={cube.id} value={cube.id}>{cube.name}{isBuiltinCube(cube.id) ? ' (built in)' : ''} · {pct(cube.sampling.stickerCore)}</option>)}
                </select>
              </label>
            </div>
            <div class="cube-review-photos">
              {([[cubeA, coreA, 'a', '#4f7dff'], [cubeB, cubeB.sampling.stickerCore, 'b', '#c08bff']] as const).map(([cube, core, tag, color]) => (
                <div class="cube-review-photo" key={tag}>
                  <div class="cube-review-frame">
                    <img src={photo.src} alt={`Last captured face, ${photo.label}`} />
                    {overlay(core, color)}
                  </div>
                  <div class="cube-review-caption"><span><span class={`color-review-badge ${tag}`}>{tag.toUpperCase()}</span>{cube.name}{isBuiltinCube(cube.id) ? ' (built in)' : ''}</span><span class="mono">{pct(core)}</span></div>
                  {tag === 'a' && (
                    <div class="cube-review-trial">
                      <label for="cube-trial">Try a sticker area for A</label>
                      <div class="color-review-toolbar">
                        <input type="range" id="cube-trial" min="0.3" max="0.9" step="0.01" value={coreA} onInput={(e) => setTrial(Number(e.currentTarget.value))} />
                        <span class="mono">{pct(coreA)}</span>
                      </div>
                      {isBuiltinCube(cube.id)
                        ? <p class="color-review-note">Generic can't be changed; create a new cube in the camera settings to use another value.</p>
                        : <button type="button" class="btn btn-primary btn-sm" disabled={trial === null || trial === cube.sampling.stickerCore} onClick={saveTrial}>Save {pct(coreA)} to {cube.name}</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  )
}
