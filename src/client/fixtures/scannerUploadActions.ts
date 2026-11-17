import type { CaptureIO, CaptureIOOperation } from '../capture/captureIO'
import { uploadKind } from './photoUpload'
import { isSinglePicture, splitNetPicture } from './netImport'
import { readPhotoUploads } from './readPhotoUploads'
import { readFixtureAssembled } from './fixtureFormat'
import { readFixtureUpload } from './readFixtureUpload'
import { unzipUploadFiles } from './fixtureZip'
import { reviewStartSlot } from '../capture/approvalPhotos'
import { FACE_ORDER } from '../capture/captureSteps'
import { runGlobalWhiteBalance } from '../capture/captureRecalibration'
import { BACKGROUND_WB_METHOD } from '../vision/faceSampling'
import { DEFAULT_SAMPLING } from '../vision/stickerColorGeometry'
import {
  applyFixtureDetection,
  fixtureLoadedMessage,
} from '../capture/captureFixture'
import { capturePalette } from '../profiles/profileSettings'
import type { useCaptureSession } from '../capture/useCaptureSession'
import type { usePhotoUploads } from './usePhotoUploads'
import type { useProfileStore } from '../profiles/useProfileStore'
import type { useCaptureCalibration } from '../capture/useCaptureCalibration'
import type { CaptureMode } from '../capture/capturePhoto'
import type { CaptureContext } from '../capture/useFaceRecovery'
import type { FaceCaptureData } from '../capture/captureTypes'

type Session = ReturnType<typeof useCaptureSession>
type Photos = ReturnType<typeof usePhotoUploads>
type Profiles = ReturnType<typeof useProfileStore>
type Calibration = ReturnType<typeof useCaptureCalibration>

type UploadActions = {
  captureIO: CaptureIO
  setLoading: (value: boolean) => void
  setCaptureMessage: Session['setCaptureMessage']
  setProfileLearningOffer: Profiles['setProfileLearningOffer']
  setUploadedProtocol: Session['setUploadedProtocol']
  onCaptureContext: (context: CaptureContext | null) => void
  applyFixtureCalibration: Calibration['applyFixtureCalibration']
  setPuzzleSize: (size: number) => void
  setCapturedFaces: Session['setCapturedFaces']
  setReviewStep: (step: number) => void
  setShowReviewDialog: (show: boolean) => void
  routeReview: (routing: {
    faces: Record<string, FaceCaptureData>
    glare: string[]
    mixedUp: string[]
    reviewed: boolean
    saved?: Record<string, string[][]> | null
  }) => void
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
    operation: CaptureIOOperation,
  ) => Promise<void>
}

export function createScannerUploadActions({
  captureIO,
  setLoading,
  setCaptureMessage,
  setProfileLearningOffer,
  setUploadedProtocol,
  applyFixtureCalibration,
  onCaptureContext,
  setPuzzleSize,
  setCapturedFaces,
  setReviewStep,
  setShowReviewDialog,
  routeReview,
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
  // kept as the final colors, so the upload goes straight on to how the
  // faces fit together; wherever detection disagrees, the color review
  // (Edit colors) marks the sticker with what was detected (see
  // detectedColors). With saved corrections ignored, the colors are
  // detection's own and the review opens to check them.
  // Faces are restored under whatever slot key they were saved under
  // (meta.json's "u"/"r"/... - the ORIGINAL capture-order slot, not
  // necessarily true physical identity, since capturedFaces itself is never
  // rewritten to reflect solveFaceOrientations' answer - see
  // handleConfirmReview), so reloading a fixture faithfully reproduces what
  // solveFaceOrientations would have seen the first time.
  const handleUploadFixture = async (
    files: File[],
    operation: CaptureIOOperation,
  ) => {
    setLoading(true)
    setCaptureMessage('Loading fixture...')

    try {
      const loaded = await readFixtureUpload(files)
      if (!operation.isCurrent()) return
      if (!loaded.ok) {
        setCaptureMessage(loaded.message)
        return
      }
      const { meta, entries: newEntries } = loaded

      setCaptureMessage('Detecting colors from the fixture photos...')
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
      if (!operation.isCurrent()) return
      const mismatches = applyFixtureDetection(
        newEntries,
        wb.faces,
        ignoreFixtureCorrections,
      )
      setProfileLearningOffer(null)
      setUploadedProtocol(meta.capture?.protocol ?? null)
      onCaptureContext(meta.capture ?? null)
      applyFixtureCalibration(meta.capture, wb, recordedGains)

      setPuzzleSize(meta.gridSize)
      setCapturedFaces(newEntries)
      setCaptureMessage(
        fixtureLoadedMessage(mismatches, ignoreFixtureCorrections),
      )
      if (ignoreFixtureCorrections) {
        setReviewStep(reviewStartSlot(newEntries, FACE_ORDER))
        setShowReviewDialog(true)
      } else {
        routeReview({
          faces: newEntries,
          glare: [],
          mixedUp: [],
          reviewed: true,
          saved: readFixtureAssembled(meta),
        })
      }
    } finally {
      if (operation.isCurrent()) setLoading(false)
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

  // Files from the Upload files button, a paste or a drop: a fixture (ZIP or
  // meta.json with photos), six photos, or one picture of a cube net, which
  // is cut into six face pictures and goes on as six photos.
  const importFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    const operation = captureIO.begin()
    setLoading(true)
    try {
      const files: File[] = []
      for (const file of selected) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const bytes = await file.arrayBuffer()
          if (!operation.isCurrent()) return
          const unpacked = await unzipUploadFiles(new Uint8Array(bytes))
          if (!operation.isCurrent()) return
          files.push(...unpacked)
        } else files.push(file)
      }
      if (!operation.isCurrent()) return
      if (uploadKind(files) === 'fixture')
        await handleUploadFixture(files, operation)
      else if (isSinglePicture(files)) {
        setCaptureMessage('Reading the net picture...')
        const split = await splitNetPicture(files[0])
        if (!operation.isCurrent()) return
        if (split.ok) {
          setPuzzleSize(split.size)
          handleSelectPhotos(split.files)
        } else
          setCaptureMessage(
            `❌ ${split.message} Select six photos, a fixture ZIP, meta.json with its six photos, or one picture of a cube net.`,
          )
      } else handleSelectPhotos(files)
    } catch (err) {
      if (!operation.isCurrent()) return
      setCaptureMessage(
        `❌ Could not open files: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      if (captureIO.finish(operation)) setLoading(false)
    }
  }

  const handleUploadFiles = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''
    await importFiles(files)
  }

  const handleUploadPhotos = async () => {
    if (!photoUpload || loading) return
    const operation = captureIO.begin()
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
      if (!operation.isCurrent()) return
      onCaptureContext(null)
      setCapturedFaces(entries)
      setUploadedProtocol(null)
      setDismissedCaptureWarnings([])
      closePhotoUpload()
      await finalizeAllFacesCaptured(entries, operation)
    } catch (err) {
      if (!operation.isCurrent()) return
      console.error('Photo upload error:', err)
      setCaptureMessage(
        `❌ ${err instanceof Error ? err.message : 'Could not read photos.'}`,
      )
    } finally {
      if (captureIO.finish(operation)) setLoading(false)
    }
  }

  return { handleUploadFiles, importFiles, handleUploadPhotos }
}
