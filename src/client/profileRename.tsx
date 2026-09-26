// A saved profile's name with a Rename action, shared by the profiles page
// tabs: the name turns into a field; Enter or Save renames, Escape or Cancel
// keeps the old name.
import { useState } from 'preact/hooks'

export function EditableName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <span class="profile-name">
        <span>{name}</span>
        <button type="button" class="profile-delete" aria-label={`Rename ${name}`} onClick={() => setDraft(name)}>Rename</button>
      </span>
    )
  }
  const save = () => {
    if (draft.trim() && draft.trim() !== name) onRename(draft)
    setDraft(null)
  }
  return (
    <span class="profile-name editing" role="group" aria-label={`Rename ${name}`}>
      <input type="text" class="profile-name-input" value={draft} maxLength={60} aria-label="New name" ref={(el) => el?.focus()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) } }} />
      <button type="button" class="profile-delete" disabled={!draft.trim()} onClick={save}>Save</button>
      <button type="button" class="profile-delete" onClick={() => setDraft(null)}>Cancel</button>
    </span>
  )
}
