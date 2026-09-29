import { uploadKind } from '../photoUpload'
import { readPhotoUploads } from '../readPhotoUploads'
import { readFixtureUpload } from '../readFixtureUpload'
import { unzipUploadFiles } from '../fixtureZip'
import { FACE_ORDER } from '../captureSteps'
import {
  runGlobalWhiteBalance,
  BACKGROUND_WB_METHOD,
  DEFAULT_SAMPLING,
} from '../imageProcessing'
import { applyFixtureDetection, fixtureLoadedMessage } from '../captureFixture'
import { capturePalette } from '../profileSettings'
import type { useCaptureSession } from '../useCaptureSession'
import type { usePhotoUploads } from '../usePhotoUploads'
import type { useProfileStore } from '../useProfileStore'
import type { useCaptureCalibration } from '../useCaptureCalibration'
import type { CaptureMode } from '../capturePhoto'
import type { FaceCaptureData } from '../captureTypes'

type Session = ReturnType<typeof useCaptureSession>
type Photos = ReturnType<typeof usePhotoUploads>
type Profiles = ReturnType<typeof useProfileStore>
type Calibration = ReturnType<typeof useCaptureCalibration>

type UploadActions = {
  setLoading: (value: boolean) => void
  setCaptureMessage: Session['setCaptureMessage']
  setProfileLearningOffer: Profiles['setProfileLearningOffer']
  setUploadedProtocol: Session['setUploadedProtocol']
  applyFixtureCalibration: Calibration['applyFixtureCalibration']
  setPuzzleSize: (size: number) => void
  setCapturedFaces: Session['setCapturedFaces']
  setReviewStep: (step: number) => void
  setShowReviewDialog: (show: boolean) => void
  ignoreFixtureCorrections: boolean
  selectPhotos: Photos['selectPhotos']
  photoUpload: Photos['photoUpload']
  loading: boolean
  puzzleSize: number
  captureMode: CaptureMode
  sampling: Profiles['sampling']
  automaticColors: boolean
  profileStore: Profiles['profileStore']
  setDismissedCaptureWarnings: Session['setDismissedCaptureWarnings']
  closePhotoUpload: Photos['closePhotoUpload']
  finalizeAllFacesCaptured: (
    faces: Record<string, FaceCaptureData>,
  ) => Promise<void>
}

export function createScannerUploadActions({
  setLoading,
  setCaptureMessage,
  setProfileLearningOffer,
  setUploadedProtocol,
  applyFixtureCalibration,
  setPuzzleSize,
  setCapturedFaces,
  setReviewStep,
  setShowReviewDialog,
  ignoreFixtureCorrections,
  selectPhotos,
  photoUpload,
  loading,
  puzzleSize,
  captureMode,
  sampling,
  automaticColors,
  profileStore,
  setDismissedCaptureWarnings,
  closePhotoUpload,
  finalizeAllFacesCaptured,
}: UploadActions) {
  // Restores a fixture saved earlier via handleSaveFixture - the customer
  // selects its zip, or a fixture directory's (test/fixtures/<name>/)
  // meta.json together with its 6 face-*.jpg photos (one multi-file
  // picker covers both). Colors are
  // re-detected from the photos through the same pipeline a live capture
  // uses (runGlobalWhiteBalance), replaying the per-face gains recorded at
  // capture time - so a detection problem reproduces exactly as the
  // customer saw it. meta.json's colors (the human-reviewed answer) are
  // kept as the final colors; wherever detection disagrees, the review
  // wizard marks the sticker with what was detected (see detectedColors).
  // Faces are restored under whatever slot key they were saved under
  // (meta.json's "u"/"r"/... - the ORIGINAL capture-order slot, not
  // necessarily true physical identity, since capturedFaces itself is never
  // rewritten to reflect solveFaceOrientations' answer - see
  // handleConfirmReview), so reloading a fixture faithfully reproduces what
  // solveFaceOrientations would have seen the first time.
  const handleUploadFixture = async (files: File[]) => {
    setLoading(true)
    setCaptureMessage('Loading fixture...')

    try {
      const loaded = await readFixtureUpload(files)
      if (!loaded.ok) {
        setCaptureMessage(loaded.message)
        return
      }
      const { meta, entries: newEntries } = loaded

      setCaptureMessage('Detecting colors from the fixture photos...')
      setProfileLearningOffer(null)
      setUploadedProtocol(meta.capture?.protocol ?? null)
      const images = Object.fromEntries(
        Object.entries(newEntries).map(([f, d]) => [f, d.croppedImage!]),
      )
      // Background gains are replayed only if made the current way (see
      // BACKGROUND_WB_METHOD); older ones swapped red and orange.
      const recordedGains =
        meta.capture?.backgroundWhiteBalanceMethod === BACKGROUND_WB_METHOD
          ? (meta.capture.backgroundWhiteBalance ?? null)
          : null
      const wb = await runGlobalWhiteBalance(
        images,
        meta.gridSize,
        recordedGains ?? undefined,
        meta.capture?.sampling ?? DEFAULT_SAMPLING,
        meta.capture?.colorReference ?? undefined,
      )
      const mismatches = applyFixtureDetection(
        newEntries,
        wb.faces,
        ignoreFixtureCorrections,
      )
      applyFixtureCalibration(meta.capture, wb, recordedGains)

      setPuzzleSize(meta.gridSize)
      setCapturedFaces(newEntries)
      setCaptureMessage(
        fixtureLoadedMessage(mismatches, ignoreFixtureCorrections),
      )
      setReviewStep(0)
      setShowReviewDialog(true)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPhotos = (files: File[]) => {
    try {
      selectPhotos(files)
      setCaptureMessage('')
    } catch (err) {
      setCaptureMessage(
        `❌ ${err instanceof Error ? err.message : 'Could not select photos.'}`,
      )
    }
  }

  const handleUploadFiles = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const selected = Array.from(input.files ?? [])
    if (selected.length === 0) return
    try {
      const files: File[] = []
      for (const file of selected) {
        if (file.name.toLowerCase().endsWith('.zip'))
          files.push(
            ...(await unzipUploadFiles(
              new Uint8Array(await file.arrayBuffer()),
            )),
          )
        else files.push(file)
      }
      if (uploadKind(files) === 'fixture') await handleUploadFixture(files)
      else handleSelectPhotos(files)
    } catch (err) {
      setCaptureMessage(
        `❌ Could not open files: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      input.value = ''
    }
  }

  const handleUploadPhotos = async () => {
    if (!photoUpload || loading) return
    setLoading(true)
    setCaptureMessage('Reading six photos...')
    try {
      const entries = await readPhotoUploads({
        photos: photoUpload,
        size: puzzleSize,
        captureMode,
        sampling,
        palette: automaticColors ? undefined : capturePalette(profileStore),
        faceOrder: FACE_ORDER,
      })
      setCapturedFaces(entries)
      setUploadedProtocol(null)
      setDismissedCaptureWarnings([])
      closePhotoUpload()
      await finalizeAllFacesCaptured(entries)
    } catch (err) {
      console.error('Photo upload error:', err)
      setCaptureMessage(
        `❌ ${err instanceof Error ? err.message : 'Could not read photos.'}`,
      )
    } finally {
      setLoading(false)
    }
  }

  return { handleUploadFiles, handleUploadPhotos }
}
