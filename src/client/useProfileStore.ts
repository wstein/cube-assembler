import { useEffect, useMemo, useState } from 'preact/hooks'
import { FACE_ORDER } from './captureSteps'
import type { FaceCaptureData, PreviewColorProfile } from './captureTypes'
import {
  matchPartialColorProfile,
  updateProfileFromCapture,
  type PaletteEvidence,
} from './colorProfileLearning'
import type { RGB } from './imageProcessing'
import {
  COLOR_PROFILE_COOKIE,
  readSelection,
  selectionCookie,
} from './preferences'
import {
  AUTO_COLORS_ID,
  EMPTY_SETTINGS,
  activeColorProfile,
  activeCube,
  allColorProfiles,
  builtinColorProfiles,
  capturePalette,
  colorPalette,
  copyColorProfile,
  copyCubeSetting,
  mergeSettings,
  saveColorProfile,
  saveCube,
  selectColorProfile,
  setAutoColorMatch,
  type ProfileSettings,
} from './profileSettings'
import {
  loadProfileSettings,
  parseSettingsFile,
  saveProfileSettings,
  settingsFile,
} from './profileStorage'

function loadProfileStore(): ProfileSettings {
  try {
    const settings = loadProfileSettings(localStorage)
    const selectedId = readSelection(document.cookie, COLOR_PROFILE_COOKIE)
    return selectedId &&
      allColorProfiles(settings).some((profile) => profile.id === selectedId)
      ? selectColorProfile(settings, selectedId)
      : settings
  } catch {
    return EMPTY_SETTINGS
  }
}

// False when the browser won't store it (storage blocked or full).
function saveProfileStore(store: ProfileSettings): boolean {
  try {
    return saveProfileSettings(localStorage, store)
  } catch {
    return false
  }
}

// What a reviewed capture may do to the color profiles: create one from
// its learned colors, or update the profile it matched.
export interface ProfileLearningOffer {
  colors: Record<string, RGB>
  evidence: PaletteEvidence
  matchedProfileId: string | null
  updatedProfileName?: string
}

// The saved cube and color profiles, the ones selected for this cube size,
// and the actions that create, update, import and export them.
export function useProfileStore({
  puzzleSize,
  capturedFaces,
  onCubeCreated,
}: {
  puzzleSize: number
  capturedFaces: Record<string, FaceCaptureData>
  onCubeCreated: () => void
}) {
  const [profileStore, setProfileStore] =
    useState<ProfileSettings>(loadProfileStore)
  useEffect(() => {
    document.cookie = selectionCookie(
      COLOR_PROFILE_COOKIE,
      profileStore.activeColorsId,
    )
  }, [profileStore.activeColorsId])
  const automaticColors = profileStore.activeColorsId === AUTO_COLORS_ID
  const profile = activeCube(profileStore, puzzleSize)
  const colorProfile = activeColorProfile(profileStore)
  const sampling = profile.sampling
  const autoColorProfiles = useMemo(
    () => [...builtinColorProfiles(), ...profileStore.colors],
    [profileStore.colors],
  )
  const provisionalColorProfile = useMemo(
    () =>
      matchPartialColorProfile(
        autoColorProfiles,
        FACE_ORDER.flatMap(
          (face) => capturedFaces[face]?.cellColors?.flat() ?? [],
        ),
      ),
    [autoColorProfiles, capturedFaces],
  )
  const palette = useMemo(
    () =>
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? provisionalColorProfile?.colors
        : capturePalette(profileStore),
    [profileStore, provisionalColorProfile],
  )
  // The profile a capture is read with right now (see the palette passed to
  // captureAndProcessCanvas): Automatic's provisional choice, else the live
  // worker's pick for the first face; the selected profile otherwise.
  const previewProfileFor = (
    liveId: string | null,
  ): PreviewColorProfile | undefined => {
    const used =
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? (provisionalColorProfile ??
          autoColorProfiles.find((candidate) => candidate.id === liveId))
        : colorProfile
    return used
      ? { id: used.id, name: used.name, colors: colorPalette(used) }
      : undefined
  }
  const [profileLearningOffer, setProfileLearningOffer] =
    useState<ProfileLearningOffer | null>(null)
  const [newColorName, setNewColorName] = useState<string | null>(null)
  const [samplingFileMessage, setSamplingFileMessage] = useState('')
  const applyProfileStore = (updated: ProfileSettings) => {
    if (!saveProfileStore(updated)) {
      setSamplingFileMessage(
        "❌ This browser won't keep profiles (storage blocked or full) - export them to save a copy",
      )
    }
    setProfileStore(updated)
  }
  const [newCubeName, setNewCubeName] = useState<string | null>(null)
  const [newColorProfileName, setNewColorProfileName] = useState<string | null>(
    null,
  )
  const handleCreateCube = () => {
    if (!newCubeName?.trim()) return
    applyProfileStore(
      saveCube(
        profileStore,
        copyCubeSetting(profileStore, profile, newCubeName),
      ),
    )
    setNewCubeName(null)
    onCubeCreated()
  }
  const handleCreateNamedColors = () => {
    if (!newColorProfileName?.trim()) return
    applyProfileStore(
      saveColorProfile(
        profileStore,
        copyColorProfile(profileStore, colorProfile, newColorProfileName),
      ),
    )
    setNewColorProfileName(null)
  }
  const handleCreateColors = () => {
    if (!profileLearningOffer || !newColorName?.trim()) return
    const id = `colors-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const saved = saveColorProfile(profileStore, {
      id,
      name: newColorName.trim().slice(0, 60),
      colors: profileLearningOffer.colors,
      captures: 1,
      updatedAt: new Date().toISOString(),
    })
    applyProfileStore(
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? setAutoColorMatch(selectColorProfile(saved, AUTO_COLORS_ID), id)
        : saved,
    )
    setProfileLearningOffer(null)
    setNewColorName(null)
  }
  // The saved profile the Update action would change (see profileToUpdate).
  const updatableName =
    profileStore.colors.find(
      (profile) => profile.id === profileLearningOffer?.matchedProfileId,
    )?.name ?? 'detected'
  const handleUpdateColors = () => {
    const offer = profileLearningOffer
    const target = profileStore.colors.find(
      (profile) => profile.id === offer?.matchedProfileId,
    )
    if (!offer || !target) return
    const updated = updateProfileFromCapture(
      target,
      offer.colors,
      offer.evidence,
      new Date().toISOString(),
    )
    if (!updated) return
    // Saving would also select the profile; keep Automatic or the current choice.
    const saved = {
      ...saveColorProfile(profileStore, updated),
      activeColorsId: profileStore.activeColorsId,
    }
    applyProfileStore(
      profileStore.activeColorsId === AUTO_COLORS_ID
        ? setAutoColorMatch(saved, updated.id)
        : saved,
    )
    setProfileLearningOffer({
      ...offer,
      matchedProfileId: null,
      updatedProfileName: updated.name,
    })
  }
  // Profiles file: cubes and colors, so a setup tuned in one browser or
  // on one machine can be carried to another.
  const handleDownloadSampling = () => {
    const blob = new Blob(
      [JSON.stringify(settingsFile(profileStore), null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cube-assembler-profiles.json'
    link.click()
    URL.revokeObjectURL(url)
    setSamplingFileMessage('✓ Profiles downloaded')
  }
  const handleUploadSampling = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      // Files saved before cube profiles held per-size settings instead.
      const uploaded = parseSettingsFile(data)
      if (!uploaded) {
        setSamplingFileMessage(
          `❌ ${file.name} isn't a cube and color profiles file`,
        )
        return
      }
      applyProfileStore(mergeSettings(profileStore, uploaded))
      setSamplingFileMessage(
        `✓ Loaded ${uploaded.cubes.length} cubes and ${uploaded.colors.length} color profiles`,
      )
    } catch {
      setSamplingFileMessage(`❌ ${file.name} isn't valid JSON`)
    }
  }

  return {
    profileStore,
    applyProfileStore,
    automaticColors,
    profile,
    colorProfile,
    sampling,
    autoColorProfiles,
    provisionalColorProfile,
    palette,
    previewProfileFor,
    samplingFileMessage,
    profileLearningOffer,
    setProfileLearningOffer,
    newColorName,
    setNewColorName,
    updatableName,
    newCubeName,
    setNewCubeName,
    newColorProfileName,
    setNewColorProfileName,
    handleCreateCube,
    handleCreateNamedColors,
    handleCreateColors,
    handleUpdateColors,
    handleDownloadSampling,
    handleUploadSampling,
  }
}
