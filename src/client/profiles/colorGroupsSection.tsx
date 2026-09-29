// The Colors tab's similar profiles: groups of saved profiles that differ
// by less than the limit, and merging the ticked ones of a group into a new
// profile.
import type { JSX } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import {
  AVERAGE_LIMIT_FRACTION,
  groupDifferences,
  groupSimilarProfiles,
  mergeColorProfiles,
  mergedColors,
  whiteBalancedColors,
} from './colorProfileReview'
import { NAMES, ORDER, Swatch } from './colorReviewParts'
import type { ColorProfile, ProfileSettings } from './profileSettings'

const DEFAULT_LIMIT = 3

interface Props {
  settings: ProfileSettings
  // The undo button and last message, shown under each section.
  status: JSX.Element
  commit: (next: ProfileSettings, text: string) => void
  setMessage: (text: string) => void
  // The merged profiles' ids and the new profile's, so A and B can follow.
  onMerged: (ids: string[], id: string) => void
  onCompare: (a: string, b: string) => void
}

export function SimilarProfilesSection({
  settings,
  status,
  commit,
  setMessage,
  onMerged,
  onCompare,
}: Props) {
  const saved = settings.colors
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})

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

  const merge = (group: ColorProfile[], name: string) => {
    const ticked = group.filter((p) => !unticked.has(p.id))
    try {
      const { settings: next, profile } = mergeColorProfiles(
        settings,
        ticked.map((p) => p.id),
        name,
        new Date().toISOString(),
      )
      onMerged(
        ticked.map((p) => p.id),
        profile.id,
      )
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
    <section class="card color-review-section" aria-labelledby="review-groups">
      <h2 id="review-groups">Similar profiles</h2>
      <p class="color-review-muted">
        Captures are white balanced, so a profile should describe the stickers,
        not the room light. Each profile is scaled so its own White is neutral;
        profiles form a group when none of Yellow, Orange, Red, Green and Blue
        differs by more than the limit between any two of them, and their
        average difference stays within two thirds of it. Tick the profiles to
        merge and name the new one: the ticked profiles are deleted, and the
        selected or automatically matched profile moves to the new one.
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
                  onClick={() => onCompare(ticked[0].id, ticked[1].id)}
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
  )
}
