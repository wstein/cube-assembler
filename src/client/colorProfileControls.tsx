interface ColorProfileControlsProps {
  // What a reviewed capture may do to the color profiles, if anything.
  offer: { matchedProfileId: string | null; updatedProfileName?: string } | null
  updatableName: string
  // The name being typed for a new profile, or null while not naming one.
  newName: string | null
  onNewNameChange: (name: string | null) => void
  onCreate: () => void
  onUpdate: () => void
}

// Saves a reviewed capture's learned sticker colors as a new color profile
// or into the profile it matched.
export function ColorProfileControls({
  offer,
  updatableName,
  newName,
  onNewNameChange,
  onCreate,
  onUpdate,
}: ColorProfileControlsProps) {
  return (
    <div class="profile-suggestion">
      {newName === null ? (
        <>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            disabled={!offer}
            title={
              offer
                ? 'Save this capture’s learned sticker colors under a new name'
                : 'Requires a valid, confident reviewed camera capture'
            }
            onClick={() => onNewNameChange('')}
          >
            ＋ Create sticker color profile
          </button>
          {offer?.matchedProfileId && (
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onClick={onUpdate}
              title={`Update the ${updatableName} profile from this reviewed capture`}
            >
              Update {updatableName} profile
            </button>
          )}
          {offer?.updatedProfileName && (
            <span role="status">✓ {offer.updatedProfileName} updated</span>
          )}
        </>
      ) : (
        <>
          <input
            aria-label="New sticker color profile name"
            maxLength={60}
            placeholder="e.g. Matte"
            value={newName}
            onInput={(e) => onNewNameChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate()
            }}
          />
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={!newName.trim()}
            onClick={onCreate}
          >
            Save profile
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={() => onNewNameChange(null)}
          >
            Cancel
          </button>
        </>
      )}
    </div>
  )
}
