import { CaptureLiveView } from './capture/captureLiveView'
import { CaptureDialog } from './capture/captureDialog'
import { CaptureReviewDialog } from './capture/captureReviewDialog'
import { OrientationApprovalDialog } from './capture/orientationApprovalDialog'
import { OrientationWizardDialog } from './capture/orientationWizardDialog'
import { CaptureColorPicker } from './capture/captureColorPicker'
import { CaptureSettings, CubeSelectOptions } from './capture/captureSettings'
import type { ReviewCapture } from './profiles/colorReviewPage'
import { readWithProfile } from './capture/readWithProfile'
import { ColorAnalysisDialog } from './profiles/colorAnalysisDialog'
import { forcedReading } from './capture/forcedStickers'
import { analysisSamples } from './capture/analysisSamples'
import { reviewStartSlot } from './capture/approvalPhotos'
import { withPaletteSuspects } from './capture/paletteSuspects'
import { FixtureDownloadDialog } from './fixtures/fixtureDownloadDialog'
import { PRESETS } from './vision/syntheticFace'
import { FACE_LABELS } from './capture/orientationPresentation'
import { localUploadShown } from './preferences'
import { CubeDisplayCard } from './cubeDisplayCard'
import { NotationCard } from './notationCard'
import { ManualFaceletInput } from './manualFaceletInput'
import { CaptureCard } from './capture/captureCard'
import { ColorProfileControls } from './profiles/colorProfileControls'
import { lazy, Suspense } from 'preact/compat'
import { useEffect, useMemo, useState } from 'preact/hooks'

const ProfilesPage = lazy(() =>
  import('./profiles/profilesPage').then((m) => ({ default: m.ProfilesPage })),
)
const SettingsPage = lazy(() =>
  import('./settingsPage').then((m) => ({ default: m.SettingsPage })),
)
import { PhotoUploadReview } from './fixtures/photoUploadReview'
import { repositoryLink } from './repositoryLink'
import { profilesTab } from './profiles/profilesRoute'
import { AUTO_CAPTURE_COOKIE, MIRROR_COOKIE, SOUND_COOKIE } from './preferences'
import { backdropReference } from './vision/faceSampling'
import { NEUTRAL_GAINS } from './vision/colorMath'
import { STICKER_COLORS } from './vision/stickerColorGeometry'
import {
  createSolvedCube,
  findCaptureSlotForOrientedFace,
  type FaceKey,
} from '../cube/cubeAssembly'
import {
  allColorProfiles,
  cubeGroupName,
  selectColorProfile,
} from './profiles/profileSettings'
import {
  FACE_DISPLAY_LABEL,
  FACE_ORDER,
  FACE_SHORT_LABEL,
  captureInstruction,
} from './capture/captureSteps'
import {
  COLOR_NAME,
  COLOR_ORDER,
  STICKER_HEX,
  confidenceTier,
} from './vision/stickerDisplay'
import { focusModalOnOpen, handleModalKeyDown } from './modalFocus'
import type { ScannerAppModel } from './useScannerAppModel'

declare const __APP_COMMIT__: string

export function ScannerAppView({ model }: { model: ScannerAppModel }) {
  const {
    appliedBackgroundGains,
    applyProfileStore,
    armCaptureAudio,
    autoCapture,
    autoCaptureFrames,
    autoCapturePaused,
    automaticColors,
    cameraInfo,
    captureFlash,
    captureMessage,
    captureMode,
    captureProfile,
    captureSound,
    capturedFaces,
    centerRoutingActive,
    changeCube,
    changePhotoUploadMode,
    changePreference,
    closeFixtureDownload,
    closePhotoUpload,
    colorProfile,
    continueTurnOverlay,
    cube,
    cubeViewMode,
    downloadFixture,
    fixtureDownload,
    fixtureSaveMessage,
    fixtureServerChecked,
    fixtureServerPolling,
    fixtureServerReachable,
    fixtureUploadMessage,
    fixtureUploading,
    forgetLastCapture,
    glareFaces,
    globalWhiteBalanceNote,
    handleApplyFacelets,
    handleApplySolved,
    handleCapturePhoto,
    handleChooseOrientation,
    handleConfirmReview,
    handleCreateColors,
    handleCreateCube,
    handleCreateNamedColors,
    handleDownloadSampling,
    handleFixCellColor,
    handleImportImage,
    handleOpenCapture,
    handleRejectOrientation,
    handleRetakeFace,
    handleSaveFixture,
    handleSyntheticPreset,
    handleUpdateColors,
    handleUploadFiles,
    handleUploadPhotos,
    handleUploadSampling,
    handleWizardPick,
    ignoreFixtureCorrections,
    learnedPalette,
    liveAutoColorProfile,
    liveDetection,
    liveFaceVisible,
    liveMedianWB,
    liveNeedsRecentering,
    loading,
    manualColorInput,
    matchingNetFaces,
    mirrorPreview,
    mixedUpColors,
    movePhotoUpload,
    newColorName,
    newColorProfileName,
    newCubeName,
    notationFormat,
    onSettingsPage,
    orientationApproval,
    orientationWizard,
    page,
    palette,
    parity,
    photoUpload,
    predictedCenter,
    predictedCenters,
    profile,
    profileLearningOffer,
    profileStore,
    provisionalColorProfile,
    puzzleSize,
    reviewEditingCell,
    reviewNotice,
    reviewStep,
    sampling,
    samplingFileMessage,
    selectFace,
    setAutoCapture,
    setCapturedFaces,
    setCaptureMessage,
    setCaptureMode,
    setCaptureSound,
    setCubeViewMode,
    setDismissedCaptureWarnings,
    setIgnoreFixtureCorrections,
    setLiveDetection,
    setLiveFaceVisible,
    setManualColorInput,
    setMirrorPreview,
    setNewColorName,
    setNewColorProfileName,
    setNewCubeName,
    setNotationFormat,
    setOrientationApproval,
    setOrientationWizard,
    setReviewEditingCell,
    setReviewNotice,
    setReviewStep,
    setShowBackdropDialog,
    setShowColorInput,
    setShowReviewDialog,
    setTurnedCube,
    setWebcamFace,
    setWebcamOpen,
    showBackdropDialog,
    showColorInput,
    showReviewDialog,
    stableFrames,
    turnOverlay,
    turnedCube,
    updatableName,
    uploadFixture,
    warning,
    webcamFace,
    webcamOpen,
    webcamRef,
    wizardMorphing,
  } = model
  // The review and the cube check also flag stickers the reference palette
  // reads differently (see withPaletteSuspects).
  // A sticker opened from the net for a direct edit: its place, and the
  // faces as they were, to put back on Cancel. Null in the review wizard.
  const [directEdit, setDirectEdit] = useState<{
    face: string
    row: number
    col: number
    before: typeof capturedFaces
  } | null>(null)
  useEffect(() => {
    if (!showReviewDialog) setDirectEdit(null)
  }, [showReviewDialog])
  const checkedFaces = useMemo(
    () => withPaletteSuspects(capturedFaces, FACE_ORDER),
    [capturedFaces],
  )
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const solvedPreview = useMemo(
    () => createSolvedCube(puzzleSize),
    [puzzleSize],
  )
  const baseCube = cube ?? solvedPreview
  const visibleCube =
    turnedCube?.source === baseCube ? turnedCube.value : baseCube
  if (onSettingsPage) {
    return (
      <Suspense
        fallback={
          <div class="settings-page">
            <p class="settings-muted">Loading settings...</p>
          </div>
        }
      >
        <SettingsPage
          onClose={() => {
            location.hash = ''
          }}
        />
      </Suspense>
    )
  }
  // The color analysis of the last capture, opened from the profiles page.
  // Closing a direct edit puts the faces back as they were; the wizard keeps
  // its corrections.
  const closeReview = () => {
    if (directEdit) setCapturedFaces(directEdit.before)
    setShowReviewDialog(false)
  }
  const analysis = analysisSamples(
    showBackdropDialog ? capturedFaces : {},
    FACE_ORDER,
    puzzleSize,
    (key) => FACE_DISPLAY_LABEL[key],
  )
  const firstGuess = showBackdropDialog
    ? forcedReading(capturedFaces, FACE_ORDER).faces
    : {}
  const analysisDialog = showBackdropDialog && (
    <ColorAnalysisDialog
      backdrop={
        appliedBackgroundGains
          ? FACE_ORDER.filter((f) => capturedFaces[f]?.croppedImage).map(
              (f) => ({
                face: f,
                label: FACE_DISPLAY_LABEL[f],
                photo: capturedFaces[f].croppedImage!,
                gains: appliedBackgroundGains[f] ?? NEUTRAL_GAINS,
                background: capturedFaces[f].backgroundColor ?? null,
                stickers: capturedFaces[f].cellColors,
                colors: capturedFaces[f].colors,
                guess: firstGuess[f]?.guess,
              }),
            )
          : null
      }
      reference={backdropReference(
        Object.fromEntries(
          FACE_ORDER.map((f) => [f, capturedFaces[f]?.backgroundColor ?? null]),
        ),
      )}
      samples={analysis.samples}
      cells={analysis.cells}
      netFaces={analysis.netFaces}
      photos={analysis.photos}
      stickerColors={STICKER_HEX}
      standard={STICKER_COLORS}
      readWith={readWithProfile(capturedFaces, FACE_ORDER)}
      onClose={() => setShowBackdropDialog(false)}
    />
  )
  const profilesPageTab = profilesTab(page)
  if (profilesPageTab) {
    // The last capture's faces that kept their measured sticker colors.
    const reviewCapture: ReviewCapture = {
      faces: FACE_ORDER.flatMap((face) => {
        const data = capturedFaces[face]
        return data?.cellColors && data.cellColors.length === data.colors.length
          ? [
              {
                face,
                label: FACE_DISPLAY_LABEL[face],
                colors: data.colors,
                cellColors: data.cellColors,
              },
            ]
          : []
      }),
    }
    // The first captured face photo shows the Cubes tab's sticker areas.
    const photoFace = FACE_ORDER.find(
      (face) => capturedFaces[face]?.croppedImage,
    )
    const reviewPhoto = photoFace
      ? {
          size: puzzleSize,
          src: capturedFaces[photoFace].croppedImage!,
          label: `${FACE_DISPLAY_LABEL[photoFace]} face`,
        }
      : null
    return (
      <Suspense
        fallback={
          <div class="color-review">
            <p class="color-review-muted">Loading profiles...</p>
          </div>
        }
      >
        <ProfilesPage
          tab={profilesPageTab}
          settings={profileStore}
          onChange={applyProfileStore}
          capture={reviewCapture.faces.length ? reviewCapture : null}
          photo={reviewPhoto}
          onClose={() => {
            location.hash = ''
          }}
          onExport={handleDownloadSampling}
          onImport={handleUploadSampling}
          fileMessage={samplingFileMessage}
          onAnalyze={
            reviewCapture.faces.length
              ? () => setShowBackdropDialog(true)
              : null
          }
          captureColors={
            cube &&
            FACE_ORDER.every((face) => capturedFaces[face]?.croppedImage) && (
              <ColorProfileControls
                offer={profileLearningOffer}
                updatableName={updatableName}
                newName={newColorName}
                onNewNameChange={setNewColorName}
                onCreate={handleCreateColors}
                onUpdate={handleUpdateColors}
              />
            )
          }
        />
        {analysisDialog}
      </Suspense>
    )
  }

  return (
    <div class="app-layout">
      {/* Header: name, cube geometry and color settings */}
      <header class="app-header">
        <div class="header-content">
          <svg
            class="app-logo"
            width="32"
            height="32"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <path
              d="M16 3 28 9.5v13L16 29 4 22.5v-13Z"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path
              d="M4 9.5 16 16l12-6.5M16 16v13"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path d="M16 3 28 9.5 16 16 4 9.5Z" fill="var(--color-accent)" />
          </svg>
          <div class="app-title">
            <h1>CubeAssembler</h1>
            <p>Photograph a cube, get its exact state</p>
          </div>
          <div class="header-spacer" />
          <span class="cube-current-name">{cubeGroupName(profile)}</span>
          <select
            class="header-profile"
            aria-label="Cube"
            value={profile.id}
            onChange={(e) => {
              if (!changeCube(e.currentTarget.value))
                e.currentTarget.value = profile.id
            }}
          >
            <CubeSelectOptions settings={profileStore} />
          </select>
          <select
            class="header-profile"
            aria-label="Colors"
            value={profileStore.activeColorsId}
            onChange={(e) =>
              applyProfileStore(
                selectColorProfile(profileStore, e.currentTarget.value),
              )
            }
          >
            {allColorProfiles(profileStore).map((colors) => (
              <option key={colors.id} value={colors.id}>
                {colors.name}
              </option>
            ))}
          </select>
          <a class="color-review-link" href="#profiles">
            Profiles
          </a>
          <a class="color-review-link" href="#settings">
            Settings
          </a>
        </div>
      </header>

      <main class="app-main">
        <div class="main-column">
          <CubeDisplayCard
            sourceCube={baseCube}
            visibleCube={visibleCube}
            size={puzzleSize}
            parity={parity}
            capturedFaces={capturedFaces}
            faceOrder={FACE_ORDER}
            stickerColors={STICKER_HEX}
            colorNames={COLOR_NAME}
            viewMode={cubeViewMode}
            initialMoves={
              turnedCube?.source === baseCube ? turnedCube.moves : []
            }
            initialFrame={
              turnedCube?.source === baseCube ? turnedCube.frame : undefined
            }
            onViewModeChange={setCubeViewMode}
            onEditSticker={(face, row, col) => {
              setReviewStep(FACE_ORDER.indexOf(face))
              setReviewEditingCell(null)
              setReviewNotice(null)
              setDirectEdit({ face, row, col, before: capturedFaces })
              setShowReviewDialog(true)
            }}
            onTurnStateChange={(value, moves, frame) =>
              setTurnedCube({ source: baseCube, value, moves, frame })
            }
          />

          <NotationCard
            cube={visibleCube}
            canSaveFixture={cube !== null}
            size={puzzleSize}
            format={notationFormat}
            loading={loading}
            fixtureSaveMessage={fixtureSaveMessage}
            onFormatChange={setNotationFormat}
            onSaveFixture={handleSaveFixture}
          />
        </div>

        <div class="side-column">
          <CaptureCard
            capturedFaces={capturedFaces}
            size={puzzleSize}
            stickerColors={STICKER_HEX}
            loading={loading}
            captureProfileName={captureProfile?.name}
            message={webcamOpen ? '' : captureMessage}
            showColorInput={showColorInput}
            ignoreFixtureCorrections={ignoreFixtureCorrections}
            onOpenCapture={handleOpenCapture}
            // The overview first: the photos, the detection and the
            // question whether it is the user's cube.
            onEditColors={() => handleConfirmReview()}
            onUploadFiles={handleUploadFiles}
            onToggleColorInput={() => setShowColorInput(!showColorInput)}
            onApplySolved={handleApplySolved}
            onIgnoreFixtureCorrectionsChange={setIgnoreFixtureCorrections}
            photoUpload={
              photoUpload && (
                <PhotoUploadReview
                  photos={photoUpload}
                  size={puzzleSize}
                  captureMode={captureMode}
                  loading={loading}
                  onChangeMode={changePhotoUploadMode}
                  onMove={movePhotoUpload}
                  onCancel={closePhotoUpload}
                  onRead={handleUploadPhotos}
                />
              )
            }
            manualInput={
              showColorInput && (
                <ManualFaceletInput
                  size={puzzleSize}
                  value={manualColorInput}
                  loading={loading}
                  onValueChange={setManualColorInput}
                  onApply={handleApplyFacelets}
                />
              )
            }
          />
        </div>
      </main>
      <footer class="app-footer">
        <a
          href={repositoryLink(__APP_COMMIT__).href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {repositoryLink(__APP_COMMIT__).label}
        </a>
        {' · '}
        <a href={`${import.meta.env.BASE_URL}licenses/`}>
          Third-party licenses
        </a>
      </footer>

      {/* Webcam Modal */}
      {webcamOpen && (
        <CaptureDialog
          liveView={
            <CaptureLiveView
              webcamRef={webcamRef}
              mirrorPreview={mirrorPreview}
              captureMode={captureMode}
              liveDetection={liveDetection}
              liveFaceVisible={liveFaceVisible}
              liveNeedsRecentering={liveNeedsRecentering}
              liveAutoColorProfileName={liveAutoColorProfile?.name}
              liveMedianWB={liveMedianWB}
              automaticColors={automaticColors}
              autoCapture={autoCapture}
              autoCaptureFrames={autoCaptureFrames}
              stableFrames={stableFrames}
              autoCapturePaused={autoCapturePaused}
              captureFlash={captureFlash}
              captureSound={captureSound}
              turnOverlay={turnOverlay}
              puzzleSize={puzzleSize}
              sampling={sampling}
              stickerColors={STICKER_HEX}
              onContinueTurn={continueTurnOverlay}
              onMirrorChange={(enabled) =>
                changePreference(MIRROR_COOKIE, setMirrorPreview, enabled)
              }
              onAutoCaptureChange={(enabled) =>
                changePreference(AUTO_CAPTURE_COOKIE, setAutoCapture, enabled)
              }
              onSoundChange={(enabled) => {
                changePreference(SOUND_COOKIE, setCaptureSound, enabled)
                armCaptureAudio(enabled)
              }}
            />
          }
          settings={
            <CaptureSettings
              profileStore={profileStore}
              profile={profile}
              puzzleSize={puzzleSize}
              colorProfileName={colorProfile.name}
              automaticColors={automaticColors}
              provisionalProfileName={provisionalColorProfile?.name}
              liveProfileName={liveAutoColorProfile?.name}
              mirrorPreview={mirrorPreview}
              noFacesCaptured={FACE_ORDER.every((f) => !capturedFaces[f])}
              newCubeName={newCubeName}
              newColorProfileName={newColorProfileName}
              loading={loading}
              turnCueShowing={turnOverlay !== null}
              onCubeChange={changeCube}
              onColorProfileChange={(id) =>
                applyProfileStore(selectColorProfile(profileStore, id))
              }
              onNewCubeNameChange={setNewCubeName}
              onNewColorProfileNameChange={setNewColorProfileName}
              onCreateCube={handleCreateCube}
              onCreateNamedColors={handleCreateNamedColors}
              onImportImage={handleImportImage}
            />
          }
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setWebcamOpen(false),
            )
          }
          onClose={() => setWebcamOpen(false)}
          face={webcamFace}
          faceOrder={FACE_ORDER}
          faceLabels={FACE_DISPLAY_LABEL}
          shortLabels={FACE_SHORT_LABEL}
          colorNames={COLOR_NAME}
          stickerColors={STICKER_HEX}
          size={puzzleSize}
          captureMode={captureMode}
          onModeChange={(mode) => {
            setCaptureMode(mode)
            setLiveDetection(null)
            setLiveFaceVisible(false)
          }}
          centerRoutingActive={centerRoutingActive}
          instruction={
            centerRoutingActive
              ? 'Show any uncaptured face. Its center color will place it in the capture net.'
              : captureInstruction(FACE_ORDER.indexOf(webcamFace))
          }
          predictedCenter={predictedCenter}
          predictedCenters={predictedCenters}
          faces={Object.fromEntries(
            FACE_ORDER.map((f) => [f, capturedFaces[f]?.colors]),
          )}
          matchingNetFaces={matchingNetFaces}
          onSelectFace={selectFace}
          cameraBlurOn={cameraInfo?.granted.backgroundBlur === true}
          captureWarning={warning}
          onRetakeWarning={(step) => {
            forgetLastCapture()
            setWebcamFace(FACE_ORDER[step])
            setCaptureMessage('')
          }}
          onIgnoreWarning={(key) =>
            setDismissedCaptureWarnings((keys) => [...keys, key])
          }
          captureMessage={captureMessage}
          loading={loading}
          turnCueShowing={turnOverlay !== null}
          autoCapture={autoCapture}
          onCapture={handleCapturePhoto}
        />
      )}

      {showReviewDialog && (
        <CaptureReviewDialog
          faceOrder={FACE_ORDER}
          faceLabels={FACE_DISPLAY_LABEL}
          colorNames={COLOR_NAME}
          stickerColors={STICKER_HEX}
          colorOrder={COLOR_ORDER}
          faces={checkedFaces}
          size={puzzleSize}
          step={reviewStep}
          captureProfileName={captureProfile?.name}
          globalNote={globalWhiteBalanceNote}
          reviewNotice={reviewNotice}
          glareFaces={glareFaces}
          mixedUpColors={mixedUpColors}
          confidenceTier={confidenceTier}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () => closeReview())
          }
          onClose={closeReview}
          direct={directEdit}
          onOk={() =>
            // Corrections change the cube, so put it together again.
            directEdit && capturedFaces !== directEdit.before
              ? handleConfirmReview()
              : setShowReviewDialog(false)
          }
          onStepChange={setReviewStep}
          onEditCell={(face, row, col) =>
            setReviewEditingCell({ face, row, col })
          }
          onRetake={handleRetakeFace}
          onConfirm={() => handleConfirmReview()}
        />
      )}

      {/* Orientation wizard - see orientationWizard/pickWizardFace/groupWizardOptions */}
      {/* Approval of how the captured faces fit together (see
          handleConfirmReview): one arrangement to confirm, a few to pick
          from, or a closest match that isn't a valid cube. */}
      {orientationApproval && !orientationWizard && (
        <OrientationApprovalDialog
          approval={orientationApproval}
          mirrorPreview={mirrorPreview}
          stickerColors={STICKER_HEX}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setOrientationApproval(null),
            )
          }
          onClose={() => setOrientationApproval(null)}
          onBackToColors={() => {
            setOrientationApproval(null)
            setReviewStep(reviewStartSlot(capturedFaces, FACE_ORDER))
            setShowReviewDialog(true)
          }}
          onCheckFace={(candidate, face) => {
            const slot = findCaptureSlotForOrientedFace(
              FACE_ORDER.map((key) => capturedFaces[key]?.colors),
              candidate.faces[face as FaceKey],
            )
            if (slot === null) return
            setOrientationApproval(null)
            setReviewStep(slot)
            setReviewEditingCell(null)
            setReviewNotice(null)
            setShowReviewDialog(true)
          }}
          onCheckSlot={(slot) => {
            setOrientationApproval(null)
            setReviewStep(slot)
            setReviewEditingCell(null)
            setReviewNotice(null)
            setShowReviewDialog(true)
          }}
          captured={checkedFaces}
          faceOrder={FACE_ORDER}
          puzzleSize={puzzleSize}
          onChoose={handleChooseOrientation}
          onReject={handleRejectOrientation}
          onPageChange={(page) =>
            setOrientationApproval((prev) => prev && { ...prev, page })
          }
        />
      )}

      {orientationWizard && (
        <OrientationWizardDialog
          wizard={orientationWizard}
          stickerColors={STICKER_HEX}
          morphing={wizardMorphing}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setOrientationWizard(null),
            )
          }
          onClose={() => setOrientationWizard(null)}
          onChoose={handleChooseOrientation}
          onPick={handleWizardPick}
        />
      )}

      {reviewEditingCell && (
        <CaptureColorPicker
          editingCell={reviewEditingCell}
          faces={capturedFaces}
          learnedPalette={learnedPalette}
          palette={palette}
          defaultColors={STICKER_COLORS}
          stickerColors={STICKER_HEX}
          colorNames={COLOR_NAME}
          focusDialog={focusModalOnOpen}
          onDialogKeyDown={(event) =>
            handleModalKeyDown(event, event.currentTarget, () =>
              setReviewEditingCell(null),
            )
          }
          onFixColor={handleFixCellColor}
          onClose={() => setReviewEditingCell(null)}
        />
      )}

      {fixtureDownload && (
        <FixtureDownloadDialog
          download={fixtureDownload}
          faceLabels={
            fixtureDownload.synthetic ? FACE_LABELS : FACE_DISPLAY_LABEL
          }
          serverChecked={fixtureServerChecked}
          serverReachable={fixtureServerReachable}
          serverPolling={fixtureServerPolling}
          uploadShown={localUploadShown(document.cookie)}
          syntheticPresets={PRESETS}
          onSyntheticPreset={handleSyntheticPreset}
          uploading={fixtureUploading}
          uploadMessage={fixtureUploadMessage}
          onClose={closeFixtureDownload}
          onUpload={uploadFixture}
          onDownload={downloadFixture}
          focusModalOnOpen={focusModalOnOpen}
          onModalKeyDown={handleModalKeyDown}
        />
      )}
    </div>
  )
}
