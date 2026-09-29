// The Colors tab of the profiles page: compare saved sticker color profiles,
// delete them, merge the ones that only differ by room light, and try two
// profiles on the last capture. All grouping and merging logic lives in colorProfileReview.ts.
import { useState } from 'preact/hooks'
import {
  colorDeletionEffects,
  deleteColorProfiles,
  unusedColorProfiles,
  whiteBalancedColors,
  type ReviewFace,
} from './colorProfileReview'
import { DeleteButton, SelectionBar } from './profileDeletion'
import { NAMES, ORDER, Swatch } from './colorReviewParts'
import { TryOnSection } from './colorTryOnSection'
import { SimilarProfilesSection } from './colorGroupsSection'
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

      <SimilarProfilesSection
        settings={settings}
        status={status}
        commit={commit}
        setMessage={setMessage}
        onMerged={(ids, id) => {
          if (ids.includes(a)) setA(id)
          if (ids.includes(b)) setB(id)
        }}
        onCompare={(first, second) => {
          setA(first)
          setB(second)
        }}
      />

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
