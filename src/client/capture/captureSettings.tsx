import {
  allColorProfiles,
  cubeGroupName,
  groupCubesByName,
  type CubeSetting,
  type ProfileSettings,
} from '../profileSettings'

export function CubeSelectOptions({ settings }: { settings: ProfileSettings }) {
  return (
    <>
      {groupCubesByName(settings).map((group) => (
        <optgroup label={group.name} key={group.name}>
          {group.cubes.map((cube) => (
            <option key={cube.id} value={cube.id}>
              {cube.size}×{cube.size}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

interface CaptureSettingsProps {
  profileStore: ProfileSettings
  profile: CubeSetting
  puzzleSize: number
  colorProfileName: string
  automaticColors: boolean
  provisionalProfileName?: string
  liveProfileName?: string
  mirrorPreview: boolean
  noFacesCaptured: boolean
  newCubeName: string | null
  newColorProfileName: string | null
  loading: boolean
  turnCueShowing: boolean
  onCubeChange: (id: string) => boolean
  onColorProfileChange: (id: string) => void
  onNewCubeNameChange: (name: string | null) => void
  onNewColorProfileNameChange: (name: string | null) => void
  onCreateCube: () => void
  onCreateNamedColors: () => void
  onImportImage: (event: Event) => void
}

export function CaptureSettings({
  profileStore,
  profile,
  puzzleSize,
  colorProfileName,
  automaticColors,
  provisionalProfileName,
  liveProfileName,
  mirrorPreview,
  noFacesCaptured,
  newCubeName,
  newColorProfileName,
  loading,
  turnCueShowing,
  onCubeChange,
  onColorProfileChange,
  onNewCubeNameChange,
  onNewColorProfileNameChange,
  onCreateCube,
  onCreateNamedColors,
  onImportImage,
}: CaptureSettingsProps) {
  // Fold settings after capture starts, keeping the live view and shutter in reach.
  return (
    <details
      class="capture-settings"
      open={noFacesCaptured && !window.matchMedia('(max-width: 600px)').matches}
    >
      <summary>
        Cube & camera settings
        <span class="capture-settings-summary">
          {' '}
          {puzzleSize}×{puzzleSize} · {profile.name} · Sticker colors:{' '}
          {automaticColors
            ? `Automatic · preview: ${provisionalProfileName ?? liveProfileName ?? 'camera hues'}`
            : colorProfileName}
          {mirrorPreview ? ' · mirrored' : ''}
        </span>
      </summary>
      <div class="capture-size-row">
        <label class="capture-size-label" for="cube-profile">
          Cube:
        </label>
        <span class="capture-size-label">{cubeGroupName(profile)}</span>
        <select
          id="cube-profile"
          class="cube-profile-select"
          value={profile.id}
          onChange={(e) => {
            if (!onCubeChange(e.currentTarget.value))
              e.currentTarget.value = profile.id
          }}
        >
          <CubeSelectOptions settings={profileStore} />
        </select>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          aria-expanded={newCubeName !== null}
          onClick={() =>
            onNewCubeNameChange(
              newCubeName === null ? `${profile.name} copy` : null,
            )
          }
        >
          ＋ New cube
        </button>
      </div>
      <div class="capture-size-row">
        <label class="capture-size-label" for="color-profile">
          Colors:
        </label>
        <select
          id="color-profile"
          class="cube-profile-select"
          value={profileStore.activeColorsId}
          onChange={(e) => onColorProfileChange(e.currentTarget.value)}
        >
          {allColorProfiles(profileStore).map((colors) => (
            <option key={colors.id} value={colors.id}>
              {colors.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          aria-expanded={newColorProfileName !== null}
          onClick={() =>
            onNewColorProfileNameChange(
              newColorProfileName === null ? '' : null,
            )
          }
        >
          ＋ New colors
        </button>
      </div>
      {newColorProfileName !== null && (
        <div class="capture-size-row new-cube-form">
          <label class="capture-size-label" for="new-color-profile-name">
            Name:
          </label>
          <input
            id="new-color-profile-name"
            class="cube-profile-name"
            maxLength={60}
            placeholder="e.g. Matte"
            value={newColorProfileName}
            onInput={(e) => onNewColorProfileNameChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreateNamedColors()
            }}
          />
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={!newColorProfileName.trim()}
            onClick={onCreateNamedColors}
          >
            Add colors
          </button>
        </div>
      )}
      {newCubeName !== null && (
        <div class="capture-size-row new-cube-form">
          <label class="capture-size-label" for="new-cube-name">
            Name:
          </label>
          <input
            id="new-cube-name"
            class="cube-profile-name"
            maxLength={60}
            value={newCubeName}
            onInput={(e) => onNewCubeNameChange(e.currentTarget.value)}
          />
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={!newCubeName.trim()}
            onClick={onCreateCube}
          >
            Add cube
          </button>
        </div>
      )}
      <label class="capture-import">
        Or use a photo file for this step
        <input
          type="file"
          accept="image/*"
          onChange={onImportImage}
          disabled={loading || turnCueShowing}
        />
      </label>
    </details>
  )
}
