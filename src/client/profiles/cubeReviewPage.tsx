// The Cubes tab of the profiles page: saved cube definitions by size (tick
// or delete them), their duplicates (merge or delete in favour of Generic), and each cube's sampled
// sticker area drawn on the last captured face. Logic: cubeProfileReview.ts.
import { useState } from 'preact/hooks'
import {
  cubeDeletionEffects,
  cubesSameAsGeneric,
  deleteCubes,
  mergeCubes,
  replaceCubes,
  unusedCubes,
} from './cubeProfileReview'
import { DeleteButton, SelectionBar } from './profileDeletion'
import { EditableName } from './profileRename'
import { CubeMergeView } from './cubeMergeView'
import { ReviewStatusToolbar } from './reviewStatusToolbar'
import {
  MiniGrid,
  sampledSquares,
  useOuterRatio,
  type ReviewPhoto,
} from './cubeMiniGrid'
export type { ReviewPhoto } from './cubeMiniGrid'
import {
  CUBE_SIZES,
  activeCube,
  allCubes,
  builtinCube,
  isBuiltinCube,
  renameCube,
  type CubeSetting,
  type ProfileSettings,
} from './profileSettings'

interface Props {
  settings: ProfileSettings
  onChange: (settings: ProfileSettings) => void
  photo: ReviewPhoto | null
}

const GENERIC_CORE = builtinCube(3).sampling.stickerCore
const pct = (v: number) => `${Math.round(v * 100)}%`

export function CubeReviewTab({ settings, onChange, photo }: Props) {
  const cubes = allCubes(settings)
  const [sizes, setSizes] = useState<number[]>([])
  const [undo, setUndo] = useState<ProfileSettings[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [a, setA] = useState<string | null>(null)
  const [b, setB] = useState<string | null>(null)
  const [trial, setTrial] = useState<number | null>(null)
  const [editingGapId, setEditingGapId] = useState<string | null>(null)
  const [gapDraft, setGapDraft] = useState(40)
  const outer = useOuterRatio(photo)

  const isActive = (cube: CubeSetting) =>
    activeCube(settings, cube.size).id === cube.id

  const status = (
    <ReviewStatusToolbar
      canUndo={undo.length > 0}
      onUndo={() => {
        onChange(undo[undo.length - 1])
        setUndo(undo.slice(0, -1))
        setMessage('Undone.')
      }}
      message={message}
    />
  )
  const remove = (ids: string[]) => {
    try {
      const names = ids.map(
        (id) => settings.cubes.find((cube) => cube.id === id)?.name ?? id,
      )
      commit(
        deleteCubes(settings, ids),
        ids.length === 1
          ? `Deleted “${names[0]}”.`
          : `Deleted ${ids.length} cubes.`,
      )
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
  const apply = (group: CubeSetting[], name: string, ticked: CubeSetting[]) => {
    const generic = group.find((cube) => isBuiltinCube(cube.id))
    try {
      if (generic) {
        commit(
          replaceCubes(
            settings,
            ticked.map((cube) => cube.id),
            generic.id,
          ),
          `Deleted ${ticked.length} cube${ticked.length === 1 ? '' : 's'}; ${generic.size}×${generic.size} uses ${generic.name}.`,
        )
      } else {
        const { settings: next, cube } = mergeCubes(
          settings,
          ticked.map((c) => c.id),
          name,
        )
        if (ticked.some((c) => c.id === a)) setA(cube.id)
        if (ticked.some((c) => c.id === b)) setB(cube.id)
        commit(next, `Merged ${ticked.length} cubes into “${cube.name}”.`)
      }
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : 'Change failed'}`)
    }
  }
  const tryOn = (group: CubeSetting[]) => {
    const distinct = [
      ...new Map(
        group.map((cube) => [cube.sampling.stickerCore, cube]),
      ).values(),
    ]
    setA(distinct[0].id)
    setB((distinct[1] ?? group[1]).id)
    setTrial(null)
    document.getElementById('cubes-try')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Try on the photo: A and B among the cubes of the photo's size.
  const photoCubes = photo
    ? cubes.filter((cube) => cube.size === photo.size)
    : []
  const cubeA =
    photoCubes.find((cube) => cube.id === a) ??
    (photo ? activeCube(settings, photo.size) : null)
  const cubeB =
    photoCubes.find((cube) => cube.id === b) ??
    photoCubes.find(
      (cube) =>
        cube.id !== cubeA?.id &&
        cube.sampling.stickerCore !== cubeA?.sampling.stickerCore,
    ) ??
    photoCubes.find((cube) => cube.id !== cubeA?.id) ??
    cubeA
  const coreA = trial ?? cubeA?.sampling.stickerCore ?? GENERIC_CORE
  const saveTrial = () => {
    if (!cubeA || trial === null || isBuiltinCube(cubeA.id)) return
    const value = Math.round(trial * 100) / 100
    setTrial(null)
    commit(
      {
        ...settings,
        cubes: settings.cubes.map((cube) =>
          cube.id === cubeA.id
            ? { ...cube, sampling: { ...cube.sampling, stickerCore: value } }
            : cube,
        ),
      },
      `${cubeA.name} now samples ${pct(value)} of each sticker.`,
    )
  }

  const overlay = (core: number, color: string) => (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <g
        fill={color}
        fill-opacity="0.18"
        stroke={color}
        stroke-width="0.7"
        vector-effect="non-scaling-stroke"
      >
        {sampledSquares(photo!.size, core, outer).map((s, i) => (
          <rect
            key={i}
            x={s.x * 100}
            y={s.y * 100}
            width={s.w * 100}
            height={s.h * 100}
            rx="0.6"
          />
        ))}
      </g>
    </svg>
  )

  const shownSizes = sizes.length ? sizes : CUBE_SIZES
  return (
    <>
      <section class="card color-review-section" aria-labelledby="cubes-list">
        <h2 id="cubes-list">Cubes by size</h2>
        <p class="color-review-muted">
          A cube sets how much of each sticker is sampled (the sticker area):
          the filled squares in its grid are what the scanner reads. Dashed
          cards are the built-in Generic cubes, which can't be changed or
          deleted. Tick cubes to delete several at once.
        </p>
        {settings.cubes.length > 0 && (
          <SelectionBar
            noun={['cube', 'cubes']}
            selected={selected}
            quick={[
              {
                label: 'Select same as Generic',
                ids: cubesSameAsGeneric(settings),
              },
              { label: 'Select unused', ids: unusedCubes(settings) },
            ]}
            effects={cubeDeletionEffects(settings, selected)}
            onSelect={setSelected}
            onDelete={remove}
          />
        )}
        {status}
        <div class="color-review-tabs" role="group" aria-label="Show sizes">
          <button
            type="button"
            class="color-review-tab"
            aria-pressed={sizes.length === 0}
            onClick={() => setSizes([])}
          >
            All sizes
          </button>
          {CUBE_SIZES.map((size) => (
            <button
              type="button"
              key={size}
              class="color-review-tab"
              aria-pressed={sizes.includes(size)}
              onClick={() =>
                setSizes(
                  sizes.includes(size)
                    ? sizes.filter((s) => s !== size)
                    : [...sizes, size].sort(),
                )
              }
            >
              {size}×{size}
            </button>
          ))}
        </div>
        {shownSizes.map((size) => {
          const ofSize = cubes.filter((cube) => cube.size === size)
          return (
            <div class="cube-review-size" key={size}>
              <h3>
                {size}×{size}{' '}
                <span class="color-review-muted">
                  {ofSize.filter((cube) => !isBuiltinCube(cube.id)).length}{' '}
                  saved
                </span>
              </h3>
              <div class="cube-review-cards">
                {ofSize.map((cube) => (
                  <div
                    class={`cube-review-card ${isBuiltinCube(cube.id) ? 'builtin' : ''} ${selected.includes(cube.id) ? 'is-selected' : ''}`}
                    key={cube.id}
                  >
                    <MiniGrid size={size} core={cube.sampling.stickerCore} />
                    <div>
                      <div class="cube-review-name">
                        {isBuiltinCube(cube.id) ? (
                          `${cube.name} (built in)`
                        ) : (
                          <EditableName
                            name={cube.name}
                            onRename={(name) => {
                              try {
                                commit(
                                  renameCube(settings, cube.id, name),
                                  `Renamed “${cube.name}” to “${name.trim().slice(0, 60)}”.`,
                                )
                              } catch (err) {
                                setMessage(
                                  `❌ ${err instanceof Error ? err.message : 'Rename failed'}`,
                                )
                              }
                            }}
                          />
                        )}
                      </div>
                      <div class="cube-review-meta">
                        <span class="mono">
                          sticker area {pct(cube.sampling.stickerCore)}
                        </span>
                        {isActive(cube) && (
                          <span class="color-review-pill info">active</span>
                        )}
                        {!isBuiltinCube(cube.id) &&
                          cube.sampling.stickerCore === GENERIC_CORE && (
                            <span class="color-review-pill warn">
                              same as Generic
                            </span>
                          )}
                      </div>
                      {editingGapId === cube.id && (
                        <div class="cube-review-gap-editor">
                          <label for={`cube-gap-${cube.id}`}>
                            Gap around each sticker: {gapDraft}%
                          </label>
                          <input
                            id={`cube-gap-${cube.id}`}
                            type="range"
                            min={10}
                            max={70}
                            step={5}
                            value={gapDraft}
                            onInput={(e) =>
                              setGapDraft(Number(e.currentTarget.value))
                            }
                          />
                          <div class="color-review-toolbar">
                            <button
                              type="button"
                              class="btn btn-primary btn-sm"
                              disabled={
                                gapDraft ===
                                Math.round(
                                  (1 - cube.sampling.stickerCore) * 100,
                                )
                              }
                              onClick={() => {
                                const core = 1 - gapDraft / 100
                                commit(
                                  {
                                    ...settings,
                                    cubes: settings.cubes.map((saved) =>
                                      saved.id === cube.id
                                        ? {
                                            ...saved,
                                            sampling: {
                                              ...saved.sampling,
                                              stickerCore: core,
                                            },
                                          }
                                        : saved,
                                    ),
                                  },
                                  `${cube.name} now samples ${pct(core)} of each sticker.`,
                                )
                                setTrial(null)
                                setEditingGapId(null)
                              }}
                            >
                              Save gap
                            </button>
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              onClick={() => setEditingGapId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {!isBuiltinCube(cube.id) && (
                        <div class="cube-review-actions">
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            aria-expanded={editingGapId === cube.id}
                            onClick={() => {
                              setEditingGapId(
                                editingGapId === cube.id ? null : cube.id,
                              )
                              setGapDraft(
                                Math.round(
                                  (1 - cube.sampling.stickerCore) * 100,
                                ),
                              )
                            }}
                          >
                            Edit gap
                          </button>
                          <label class="cube-review-select">
                            <input
                              type="checkbox"
                              checked={selected.includes(cube.id)}
                              onChange={(e) =>
                                setSelected(
                                  e.currentTarget.checked
                                    ? [...selected, cube.id]
                                    : selected.filter((id) => id !== cube.id),
                                )
                              }
                            />
                            Select
                          </label>
                          <DeleteButton
                            name={cube.name}
                            effects={cubeDeletionEffects(settings, [cube.id])}
                            onDelete={() => remove([cube.id])}
                          />
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

      <CubeMergeView
        settings={settings}
        photoSize={photo?.size ?? null}
        status={status}
        onApply={apply}
        onTry={tryOn}
      />

      <section class="card color-review-section" aria-labelledby="cubes-try">
        <h2 id="cubes-try">Try on your last capture</h2>
        {!photo || !cubeA || !cubeB ? (
          <p class="color-review-muted">
            Capture a face with the camera first; the sticker areas of cubes of
            that size are drawn on it here.
          </p>
        ) : (
          <>
            <p class="color-review-muted">
              Each cube's sampled areas on your last captured {photo.size}×
              {photo.size} face ({photo.label}). A good sticker area stays well
              inside every sticker; one that touches the black plastic or a
              rounded corner reads mixed colors.
            </p>
            <div
              class="color-review-picker cube-review-picker"
              role="group"
              aria-label="Cubes to compare"
            >
              <label for="cube-a">
                <span>
                  <span class="color-review-badge a">A</span>Cube
                </span>
                <select
                  id="cube-a"
                  value={cubeA.id}
                  onChange={(e) => {
                    setA(e.currentTarget.value)
                    setTrial(null)
                  }}
                >
                  {photoCubes.map((cube) => (
                    <option key={cube.id} value={cube.id}>
                      {cube.name}
                      {isBuiltinCube(cube.id) ? ' (built in)' : ''} ·{' '}
                      {pct(cube.sampling.stickerCore)}
                    </option>
                  ))}
                </select>
              </label>
              <label for="cube-b">
                <span>
                  <span class="color-review-badge b">B</span>Cube
                </span>
                <select
                  id="cube-b"
                  value={cubeB.id}
                  onChange={(e) => setB(e.currentTarget.value)}
                >
                  {photoCubes.map((cube) => (
                    <option key={cube.id} value={cube.id}>
                      {cube.name}
                      {isBuiltinCube(cube.id) ? ' (built in)' : ''} ·{' '}
                      {pct(cube.sampling.stickerCore)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div class="cube-review-photos">
              {(
                [
                  [cubeA, coreA, 'a', '#4f7dff'],
                  [cubeB, cubeB.sampling.stickerCore, 'b', '#c08bff'],
                ] as const
              ).map(([cube, core, tag, color]) => (
                <div class="cube-review-photo" key={tag}>
                  <div class="cube-review-frame">
                    <img
                      src={photo.src}
                      alt={`Last captured face, ${photo.label}`}
                    />
                    {overlay(core, color)}
                  </div>
                  <div class="cube-review-caption">
                    <span>
                      <span class={`color-review-badge ${tag}`}>
                        {tag.toUpperCase()}
                      </span>
                      {cube.name}
                      {isBuiltinCube(cube.id) ? ' (built in)' : ''}
                    </span>
                    <span class="mono">{pct(core)}</span>
                  </div>
                  {tag === 'a' && (
                    <div class="cube-review-trial">
                      <label for="cube-trial">Try a sticker area for A</label>
                      <div class="color-review-toolbar">
                        <input
                          type="range"
                          id="cube-trial"
                          min="0.3"
                          max="0.9"
                          step="0.01"
                          value={coreA}
                          onInput={(e) =>
                            setTrial(Number(e.currentTarget.value))
                          }
                        />
                        <span class="mono">{pct(coreA)}</span>
                      </div>
                      {isBuiltinCube(cube.id) ? (
                        <p class="color-review-note">
                          Generic can't be changed; create a new cube in the
                          camera settings to use another value.
                        </p>
                      ) : (
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          disabled={
                            trial === null ||
                            trial === cube.sampling.stickerCore
                          }
                          onClick={saveTrial}
                        >
                          Save {pct(coreA)} to {cube.name}
                        </button>
                      )}
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
