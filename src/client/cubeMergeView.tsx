// Duplicate cube groups: tolerance, selection, and merge controls.
import type { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { duplicateCubeGroups } from './cubeProfileReview'
import { MiniGrid } from './cubeMiniGrid'
import {
  activeCube,
  isBuiltinCube,
  type CubeSetting,
  type ProfileSettings,
} from './profileSettings'

interface Props {
  settings: ProfileSettings
  photoSize: number | null
  status: ComponentChildren
  onApply: (group: CubeSetting[], name: string, ticked: CubeSetting[]) => void
  onTry: (group: CubeSetting[]) => void
}

const DEFAULT_TOLERANCE = 0.02
const pct = (value: number) => `${Math.round(value * 100)}%`

export function CubeMergeView({
  settings,
  photoSize,
  status,
  onApply,
  onTry,
}: Props) {
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})
  const groups = useMemo(
    () => duplicateCubeGroups(settings, tolerance),
    [settings, tolerance],
  )
  const groupKey = (group: CubeSetting[]) =>
    group
      .map((cube) => cube.id)
      .sort()
      .join('+')
  const isActive = (cube: CubeSetting) =>
    activeCube(settings, cube.size).id === cube.id
  const toggle = (id: string, on: boolean) => {
    const next = new Set(unticked)
    if (on) next.delete(id)
    else next.add(id)
    setUnticked(next)
  }

  return (
    <section class="card color-review-section" aria-labelledby="cubes-dupes">
      <h2 id="cubes-dupes">Duplicates</h2>
      <p class="color-review-muted">
        Cubes of the same size whose sticker areas all lie within the tolerance
        of each other. Tick the ones to merge: they are deleted, and the size's
        active cube moves to the result. A group with a built-in Generic cube
        keeps Generic.
      </p>
      <div class="color-review-limit">
        <label for="cubes-tolerance">Tolerance</label>
        <input
          type="range"
          id="cubes-tolerance"
          min="0"
          max="0.06"
          step="0.005"
          value={tolerance}
          onInput={(e) => setTolerance(Number(e.currentTarget.value))}
        />
        <span class="mono">± {pct(tolerance)}</span>
      </div>
      {status}
      {groups.length === 0 && (
        <p class="color-review-muted">No duplicates at this tolerance.</p>
      )}
      <div class="color-review-groups">
        {groups.map((group, n) => {
          const key = groupKey(group)
          const size = group[0].size
          const generic = group.find((cube) => isBuiltinCube(cube.id))
          const ticked = group.filter(
            (cube) => !isBuiltinCube(cube.id) && !unticked.has(cube.id),
          )
          const cores = group.map((cube) => cube.sampling.stickerCore)
          const spread = Math.max(...cores) - Math.min(...cores)
          const core = generic
            ? generic.sampling.stickerCore
            : ticked.reduce((sum, cube) => sum + cube.sampling.stickerCore, 0) /
              Math.max(1, ticked.length)
          const enough = generic ? ticked.length >= 1 : ticked.length >= 2
          const name = names[key] ?? ticked[0]?.name ?? ''
          return (
            <div class="color-review-group" key={key}>
              <div class="color-review-group-head">
                <strong>
                  {size}×{size} · {group.length} cubes
                </strong>
                <span
                  class={`color-review-pill ${spread < 0.005 ? 'ok' : 'warn'}`}
                >
                  {spread < 0.005 ? 'identical' : `spread ${pct(spread)}`}
                </span>
              </div>
              <div class="cube-review-members">
                {group.map((cube) => {
                  const builtin = isBuiltinCube(cube.id),
                    on = builtin || !unticked.has(cube.id)
                  return (
                    <label
                      class={`cube-review-member ${on ? '' : 'off'}`}
                      key={cube.id}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={builtin}
                        onChange={(e) =>
                          toggle(cube.id, e.currentTarget.checked)
                        }
                      />
                      <MiniGrid
                        size={size}
                        core={cube.sampling.stickerCore}
                        class="cube-review-mini small"
                      />
                      <span class="cube-review-member-name">
                        {cube.name}
                        {builtin ? ' (built in)' : ''}
                        {isActive(cube) && (
                          <span class="color-review-pill info">active</span>
                        )}
                      </span>
                      <span class="mono">{pct(cube.sampling.stickerCore)}</span>
                    </label>
                  )
                })}
              </div>
              <div class="cube-review-result">
                <MiniGrid
                  size={size}
                  core={core}
                  class="cube-review-mini small"
                />
                <span>
                  {generic ? (
                    <>
                      Keeps <strong>{generic.name}</strong> ({pct(core)})
                    </>
                  ) : (
                    <>
                      New cube · sticker area{' '}
                      <span class="mono">{pct(core)}</span>
                    </>
                  )}
                </span>
              </div>
              {!generic && (
                <>
                  <label class="color-review-field" for={`cube-name-${n}`}>
                    New cube name
                  </label>
                  <input
                    type="text"
                    id={`cube-name-${n}`}
                    class="color-review-name"
                    maxLength={60}
                    value={name}
                    onInput={(e) =>
                      setNames({ ...names, [key]: e.currentTarget.value })
                    }
                  />
                </>
              )}
              <div class="color-review-toolbar">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  disabled={!enough || (!generic && !name.trim())}
                  onClick={() => onApply(group, name, ticked)}
                >
                  {generic
                    ? `Delete ${ticked.length}, keep Generic`
                    : `Merge ${ticked.length} into one`}
                </button>
                {photoSize === size && (
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    onClick={() => onTry(group)}
                  >
                    Try on photo
                  </button>
                )}
              </div>
              <p class="color-review-note">
                {enough
                  ? `Deletes ${ticked.map((cube) => cube.name).join(', ')}.`
                  : generic
                    ? 'Tick at least one cube.'
                    : 'Tick at least two cubes.'}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
