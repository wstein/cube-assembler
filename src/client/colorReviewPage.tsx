// The Colors tab of the profiles page: compare saved sticker color profiles,
// delete them, merge the ones that only differ by room light, and try two
// profiles on the last capture. All grouping and merging logic lives in colorProfileReview.ts.
import { useMemo, useState } from 'preact/hooks'
import {
  AVERAGE_LIMIT_FRACTION,
  colorDeletionEffects,
  deleteColorProfiles,
  groupDifferences,
  groupSimilarProfiles,
  mergeColorProfiles,
  mergedColors,
  unusedColorProfiles,
  whiteBalancedColors,
  type ReviewFace,
} from './colorProfileReview'
import { DeleteButton, SelectionBar } from './profileDeletion'
import { NAMES, ORDER, Swatch } from './colorReviewParts'
import { TryOnSection } from './colorTryOnSection'
import {
  AdvancedSection,
  PairsSection,
  SplitSection,
} from './colorCompareSections'
import { EditableName } from './profileRename'
import {
  AUTO_COLORS_ID,
  allColorProfiles,
  builtinColorProfiles,
  isBuiltinColorProfile,
  renameColorProfile,
  type ColorProfile,
  type ProfileSettings,
} from './profileSettings'

const DEFAULT_LIMIT = 3

export interface ReviewCapture {
  // Per face in capture order: reviewed colors and measured sticker colors.
  faces: ReviewFace[]
}

interface Props {
  settings: ProfileSettings
  onChange: (settings: ProfileSettings) => void
  capture: ReviewCapture | null
}

const isBuiltin = isBuiltinColorProfile

export function ColorReviewTab({ settings, onChange, capture }: Props) {
  // Automatic isn't a palette of its own; the JSON palettes are references.
  const profiles = allColorProfiles(settings).filter(
    (profile) => profile.id !== AUTO_COLORS_ID,
  )
  const saved = settings.colors
  // A starts on the profile in use, B on the first other saved one.
  const [a, setA] = useState(() =>
    settings.activeColorsId !== AUTO_COLORS_ID
      ? settings.activeColorsId
      : builtinColorProfiles()[0].id,
  )
  const [b, setB] = useState(
    () =>
      saved.find((p) => p.id !== a)?.id ??
      builtinColorProfiles().find((p) => p.id !== a)!.id,
  )
  const [balanced, setBalanced] = useState(true)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})
  const [undo, setUndo] = useState<ProfileSettings[]>([])
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const byId = (id: string) =>
    profiles.find((profile) => profile.id === id) ?? profiles[0]
  const shown = (profile: ColorProfile) =>
    balanced ? whiteBalancedColors(profile.colors) : profile.colors
  const A = byId(a),
    B = byId(b)
  const colorsA = shown(A),
    colorsB = shown(B)

  const groups = useMemo(
    () => groupSimilarProfiles(saved, limit),
    [saved, limit],
  )
  const mergeable = groups.filter((group) => group.length > 1)
  const distinct = groups
    .filter((group) => group.length === 1)
    .map((group) => group[0])
  const groupKey = (group: ColorProfile[]) =>
    group
      .map((p) => p.id)
      .sort()
      .join('+')

  const undoLast = () => {
    const previous = undo[undo.length - 1]
    setUndo(undo.slice(0, -1))
    onChange(previous)
    setMessage('Undone.')
  }
  const status = (
    <div class="color-review-toolbar">
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        disabled={undo.length === 0}
        onClick={undoLast}
      >
        Undo last change
      </button>
      {message && (
        <span
          role="status"
          class={`color-review-message ${message.startsWith('❌') ? 'error' : ''}`}
        >
          {message}
        </span>
      )}
    </div>
  )
  const remove = (ids: string[]) => {
    try {
      const names = ids.map((id) => saved.find((p) => p.id === id)?.name ?? id)
      commit(
        deleteColorProfiles(settings, ids),
        ids.length === 1
          ? `Deleted “${names[0]}”.`
          : `Deleted ${ids.length} color profiles.`,
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
  const merge = (group: ColorProfile[], name: string) => {
    const ticked = group.filter((p) => !unticked.has(p.id))
    try {
      const { settings: next, profile } = mergeColorProfiles(
        settings,
        ticked.map((p) => p.id),
        name,
        new Date().toISOString(),
      )
      if (ticked.some((p) => p.id === a)) setA(profile.id)
      if (ticked.some((p) => p.id === b)) setB(profile.id)
      commit(
        next,
        `Merged ${ticked.length} profiles into “${profile.name}” and deleted them.`,
      )
    } catch (err) {
      setMessage(`❌ ${err instanceof Error ? err.message : 'Merge failed'}`)
    }
  }
  const toggle = (id: string, on: boolean) => {
    const next = new Set(unticked)
    if (on) next.delete(id)
    else next.add(id)
    setUnticked(next)
  }

  return (
    <>
      <div
        class="color-review-picker card"
        role="group"
        aria-label="Profiles to compare"
      >
        <label for="review-a">
          <span>
            <span class="color-review-badge a">A</span>Profile
          </span>
          <select
            id="review-a"
            value={A.id}
            onChange={(e) => setA(e.currentTarget.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label for="review-b">
          <span>
            <span class="color-review-badge b">B</span>Profile
          </span>
          <select
            id="review-b"
            value={B.id}
            onChange={(e) => setB(e.currentTarget.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={() => {
            setA(B.id)
            setB(A.id)
          }}
        >
          Swap A and B
        </button>
        <label class="color-review-check" for="review-balanced">
          <input
            type="checkbox"
            id="review-balanced"
            checked={balanced}
            onChange={(e) => setBalanced(e.currentTarget.checked)}
          />
          White-balanced (lighting removed)
        </label>
      </div>

      <section
        class="card color-review-section"
        aria-labelledby="review-groups"
      >
        <h2 id="review-groups">Similar profiles</h2>
        <p class="color-review-muted">
          Captures are white balanced, so a profile should describe the
          stickers, not the room light. Each profile is scaled so its own White
          is neutral; profiles form a group when none of Yellow, Orange, Red,
          Green and Blue differs by more than the limit between any two of them,
          and their average difference stays within two thirds of it. Tick the
          profiles to merge and name the new one: the ticked profiles are
          deleted, and the selected or automatically matched profile moves to
          the new one.
        </p>
        <div class="color-review-limit">
          <label for="review-limit">Max color difference (ΔE)</label>
          <input
            type="range"
            id="review-limit"
            min="2"
            max="8"
            step="0.5"
            value={limit}
            onInput={(e) => setLimit(Number(e.currentTarget.value))}
          />
          <span class="mono">
            worst color ≤ {limit.toFixed(1)} · average ≤{' '}
            {(limit * AVERAGE_LIMIT_FRACTION).toFixed(1)}
          </span>
          <span class="color-review-muted">
            {saved.length} profiles → {groups.length} if every group is merged
          </span>
        </div>
        {status}
        {saved.length < 2 && (
          <p class="color-review-muted">
            Save at least two color profiles to find similar ones.
          </p>
        )}
        <div class="color-review-groups">
          {mergeable.map((group, n) => {
            const key = groupKey(group)
            const ticked = group.filter((p) => !unticked.has(p.id))
            const differences =
              ticked.length >= 2 ? groupDifferences(ticked) : null
            const name = names[key] ?? `Merged colors ${n + 1}`
            const preview = ticked.length >= 2 ? mergedColors(ticked) : null
            return (
              <div class="color-review-group" key={key}>
                <div class="color-review-group-head">
                  <strong>
                    Group {n + 1} · {group.length} profiles
                  </strong>
                  {differences && (
                    <span
                      class={`color-review-pill ${differences.worst.value <= limit * AVERAGE_LIMIT_FRACTION ? 'ok' : 'warn'}`}
                    >
                      largest: {NAMES[differences.worst.color]}{' '}
                      {differences.worst.value.toFixed(1)}
                    </span>
                  )}
                </div>
                {differences && (
                  <p
                    class="color-review-differences"
                    aria-label="Largest difference per color"
                  >
                    {(['Y', 'O', 'R', 'G', 'B'] as const).map((k) => (
                      <span
                        key={k}
                        class={k === differences.worst.color ? 'worst' : ''}
                        title={`${NAMES[k]}: largest difference ${differences.byColor[k].toFixed(2)}`}
                      >
                        {k} {differences.byColor[k].toFixed(1)}
                      </span>
                    ))}
                    <span class="average">
                      avg {differences.average.toFixed(1)}
                    </span>
                  </p>
                )}
                <div class="color-review-plate color-review-strips">
                  {group.map((p) => {
                    const on = !unticked.has(p.id),
                      colors = whiteBalancedColors(p.colors)
                    return (
                      <div
                        class={`color-review-strip ${on ? '' : 'off'}`}
                        key={p.id}
                      >
                        <label title={p.name}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              toggle(p.id, e.currentTarget.checked)
                            }
                          />
                          <span class="color-review-strip-name">{p.name}</span>
                        </label>
                        {ORDER.map((k) => (
                          <Swatch
                            key={k}
                            color={colors[k]}
                            class="color-review-dot"
                          />
                        ))}
                      </div>
                    )
                  })}
                  <div class="color-review-strip merged">
                    <span class="color-review-strip-name">
                      {preview ? 'New profile' : 'Tick at least two profiles'}
                    </span>
                    {preview &&
                      ORDER.map((k) => (
                        <Swatch
                          key={k}
                          color={whiteBalancedColors(preview)[k]}
                          class="color-review-dot"
                        />
                      ))}
                  </div>
                </div>
                <label class="color-review-field" for={`review-name-${n}`}>
                  New profile name
                </label>
                <input
                  type="text"
                  id={`review-name-${n}`}
                  class="color-review-name"
                  maxLength={60}
                  value={name}
                  onInput={(e) =>
                    setNames({ ...names, [key]: e.currentTarget.value })
                  }
                />
                <div class="color-review-toolbar">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    disabled={ticked.length < 2 || !name.trim()}
                    onClick={() => merge(group, name)}
                  >
                    Merge {ticked.length} into new profile (deletes originals)
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    disabled={ticked.length < 2}
                    onClick={() => {
                      setA(ticked[0].id)
                      setB(ticked[1].id)
                    }}
                  >
                    Compare first two
                  </button>
                </div>
                {ticked.length >= 2 && (
                  <p class="color-review-note">
                    Deletes {ticked.map((p) => p.name).join(', ')}.
                  </p>
                )}
              </div>
            )
          })}
        </div>
        {saved.length >= 2 && mergeable.length === 0 && (
          <p class="color-review-muted">
            No profiles are this close. Raise the limit to see candidates.
          </p>
        )}
        {distinct.length > 0 && mergeable.length > 0 && (
          <p class="color-review-note">
            <strong>Distinct</strong> (no partner within the limit):{' '}
            {distinct.map((p) => p.name).join(', ')}
          </p>
        )}
      </section>

      <section class="card color-review-section" aria-labelledby="review-all">
        <h2 id="review-all">All profiles</h2>
        <p class="color-review-muted">
          Each row is one profile's six reference colors on the same neutral
          grey. Tick saved profiles to delete several at once; built-in colors
          are read-only.
        </p>
        {saved.length > 0 && (
          <SelectionBar
            noun={['color profile', 'color profiles']}
            selected={selected}
            quick={[
              { label: 'Select unused', ids: unusedColorProfiles(settings) },
            ]}
            effects={colorDeletionEffects(settings, selected)}
            onSelect={setSelected}
            onDelete={remove}
          />
        )}
        {status}
        <div class="color-review-scroll">
          <table class="color-review-plate color-review-table">
            <thead>
              <tr>
                <th scope="col">
                  <span class="visually-hidden">Select</span>
                </th>
                <th scope="col">Profile</th>
                {ORDER.map((k) => (
                  <th scope="col" key={k}>
                    {NAMES[k]}
                  </th>
                ))}
                <th scope="col">
                  <span class="visually-hidden">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const colors = shown(p)
                return (
                  <tr
                    key={p.id}
                    class={selected.includes(p.id) ? 'is-selected' : ''}
                  >
                    <td>
                      {!isBuiltin(p.id) && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.name}`}
                          checked={selected.includes(p.id)}
                          onChange={(e) =>
                            setSelected(
                              e.currentTarget.checked
                                ? [...selected, p.id]
                                : selected.filter((id) => id !== p.id),
                            )
                          }
                        />
                      )}
                    </td>
                    <th scope="row">
                      {p.id === A.id && (
                        <span class="color-review-badge a">A</span>
                      )}
                      {p.id === B.id && (
                        <span class="color-review-badge b">B</span>
                      )}
                      {isBuiltin(p.id) ? (
                        p.name
                      ) : (
                        <EditableName
                          name={p.name}
                          onRename={(name) => {
                            try {
                              commit(
                                renameColorProfile(settings, p.id, name),
                                `Renamed “${p.name}” to “${name.trim().slice(0, 60)}”.`,
                              )
                            } catch (err) {
                              setMessage(
                                `❌ ${err instanceof Error ? err.message : 'Rename failed'}`,
                              )
                            }
                          }}
                        />
                      )}
                      <span class="color-review-src">
                        {isBuiltin(p.id)
                          ? 'built in, read-only'
                          : `${p.captures} capture${p.captures === 1 ? '' : 's'}`}
                        {p.id === settings.activeColorsId ? ' · selected' : ''}
                        {p.id === settings.autoMatchedColorsId
                          ? ' · automatic match'
                          : ''}
                      </span>
                    </th>
                    {ORDER.map((k) => (
                      <td key={k}>
                        <Swatch color={colors[k]} letter={k} />
                      </td>
                    ))}
                    <td>
                      {!isBuiltin(p.id) && (
                        <DeleteButton
                          name={p.name}
                          effects={colorDeletionEffects(settings, [p.id])}
                          onDelete={() => remove([p.id])}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <SplitSection colorsA={colorsA} colorsB={colorsB} />

      <PairsSection A={A} B={B} shown={shown} />

      <TryOnSection
        capture={capture}
        balanced={balanced}
        A={A}
        B={B}
        colorsA={colorsA}
        colorsB={colorsB}
      />

      <AdvancedSection
        profiles={profiles}
        colorsA={colorsA}
        colorsB={colorsB}
      />
    </>
  )
}
