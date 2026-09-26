// Delete controls shared by the profiles page tabs: a per-profile Delete
// button and a bar for deleting ticked profiles. Both confirm inline - the
// button turns into "Delete? Yes / No" - and name what the deletion changes.
import { useState } from 'preact/hooks'

function effectText(effects: string[]): string {
  return effects.length ? ` ${effects.join('; ')}.` : ''
}

export function DeleteButton({ name, effects, onDelete }: { name: string; effects: string[]; onDelete: () => void }) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return <button type="button" class="profile-delete" aria-label={`Delete ${name}`} onClick={() => setAsking(true)}>Delete</button>
  }
  return (
    <span class="profile-delete-confirm" role="group" aria-label={`Delete ${name}?`}>
      <span>Delete?{effectText(effects)}</span>
      <button type="button" class="profile-delete danger" onClick={() => { setAsking(false); onDelete() }}>Yes</button>
      <button type="button" class="profile-delete" onClick={() => setAsking(false)}>No</button>
    </span>
  )
}

export interface QuickSelection {
  label: string
  ids: string[]
}

interface BarProps {
  // What a ticked profile is called, singular and plural.
  noun: [string, string]
  selected: string[]
  quick: QuickSelection[]
  effects: string[]
  onSelect: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}

export function SelectionBar({ noun, selected, quick, effects, onSelect, onDelete }: BarProps) {
  const [asking, setAsking] = useState(false)
  const count = selected.length
  const what = `${count} ${count === 1 ? noun[0] : noun[1]}`
  return (
    <div class="profile-selection-bar" role="group" aria-label={`Select ${noun[1]}`}>
      {quick.map(({ label, ids }) => (
        <button type="button" key={label} class="btn btn-secondary btn-sm" disabled={ids.length === 0} onClick={() => { setAsking(false); onSelect(ids) }}>
          {label} ({ids.length})
        </button>
      ))}
      <button type="button" class="btn btn-secondary btn-sm" disabled={count === 0} onClick={() => { setAsking(false); onSelect([]) }}>Clear</button>
      {asking && count > 0 ? (
        <span class="profile-delete-confirm bar" role="group" aria-label={`Delete ${what}?`}>
          <span>Delete {what}?{effectText(effects)}</span>
          <button type="button" class="btn btn-primary btn-sm profile-danger" onClick={() => { setAsking(false); onDelete(selected) }}>Yes, delete</button>
          <button type="button" class="btn btn-secondary btn-sm" onClick={() => setAsking(false)}>No</button>
        </span>
      ) : (
        <button type="button" class="btn btn-primary btn-sm profile-danger" disabled={count === 0} onClick={() => setAsking(true)}>Delete selected ({count})</button>
      )}
    </div>
  )
}
