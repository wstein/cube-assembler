// The Colors tab's table of every profile: its six colors, renaming and
// deleting saved profiles one at a time or ticked together. Built-in
// profiles are read-only.
import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import {
  colorDeletionEffects,
  deleteColorProfiles,
  unusedColorProfiles,
} from './colorProfileReview'
import { NAMES, ORDER, Swatch } from './colorReviewParts'
import type { RGB } from '../vision/stickerColorGeometry'
import { DeleteButton, SelectionBar } from './profileDeletion'
import { EditableName } from './profileRename'
import {
  isBuiltinColorProfile as isBuiltin,
  renameColorProfile,
  type ColorProfile,
  type ProfileSettings,
} from './profileSettings'

interface Props {
  settings: ProfileSettings
  profiles: ColorProfile[]
  shown: (profile: ColorProfile) => Record<string, RGB>
  aId: string
  bId: string
  // The undo button and last message, shown under each section.
  status: JSX.Element
  commit: (next: ProfileSettings, text: string) => void
  setMessage: (text: string) => void
}

export function ProfilesTableSection({
  settings,
  profiles,
  shown,
  aId,
  bId,
  status,
  commit,
  setMessage,
}: Props) {
  const saved = settings.colors
  const [selected, setSelected] = useState<string[]>([])
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

  return (
    <section class="card color-review-section" aria-labelledby="review-all">
      <h2 id="review-all">All profiles</h2>
      <p class="color-review-muted">
        Each row is one profile's six reference colors on the same neutral grey.
        Tick saved profiles to delete several at once; built-in colors are
        read-only.
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
                    {p.id === aId && (
                      <span class="color-review-badge a">A</span>
                    )}
                    {p.id === bId && (
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
  )
}
