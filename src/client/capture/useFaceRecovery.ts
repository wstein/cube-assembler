import { useMemo, useState } from 'preact/hooks'
import {
  assembleCubeFromFaces,
  type OrientedCandidate,
  type FaceKey,
} from '../../cube/cubeAssembly'
import {
  captureFrame,
  initializeMapping,
  validateMapping,
  type FaceMapping,
  type CaptureFrame,
} from './captureFaceMapping'
import {
  readRecovery,
  restoredCandidate,
  mergeGuideObservations,
  type CaptureRecovery,
} from './captureRecovery'
import {
  sourcePhotoNamesForCapture,
  sourcePresentationProtocol,
} from './captureFlow'
import { sameCubeState } from './recoveryPresentation'
import { readFixtureAssembled } from '../fixtures/fixtureFormat'
import type { FaceCaptureData } from './captureTypes'
import {
  captureProtocol,
  reviewProtocol,
  legacyProtocol,
} from './guidedCaptureProtocol'
import {
  generateForProtocol,
  knownAlternatives,
  remaining,
  nextTarget,
  retainsMapping,
  proposeTarget,
  presentTargetChoices,
  type SpatialDecision as Decision,
  type SpatialChoice as Choice,
} from './spatialOrientationWizard'

export interface RecoveryDraft {
  mapping: FaceMapping
  frontSlot: string
  upSlot: string
  confirmed: boolean
  view: 'capture' | 'canonical'
  turnDirection: string
  capOrder: string
}
export interface CaptureContext {
  mirrored?: boolean
  protocol?: string | null
  faceRecovery?: unknown
  assembledURFDLB?: string | null
}

type Faces = Record<string, FaceCaptureData>
interface Snapshot {
  draft: RecoveryDraft | null
  faces: Faces | null
  decisions: Decision[]
  cursor: FaceKey | null
  warning: string | null
  savedSelection: boolean
  protocolSelection: boolean
}
const emptySnapshot = (): Snapshot => ({
  draft: null,
  faces: null,
  decisions: [],
  cursor: null,
  warning: null,
  savedSelection: false,
  protocolSelection: false,
})

// One browser transaction owns the complete editable session. ReScript owns
// mapping, candidate decisions, validation and frame transforms.
export function useFaceRecovery({
  capturedFaces,
  size,
  mirrored,
  guided,
  onChoose,
  onCommitFaces,
  onCancel,
}: {
  capturedFaces: Faces
  size: number
  mirrored: boolean
  guided: boolean
  onCancel: () => void
  onCommitFaces: (faces: Faces) => void
  onChoose: (candidate: OrientedCandidate, recovery?: CaptureRecovery) => void
}) {
  const [open, setOpen] = useState(false)
  const [transaction, setTransaction] = useState<{
    current: Snapshot
    initial: Snapshot | null
    history: Snapshot[]
  }>({ current: emptySnapshot(), initial: null, history: [] })
  const current = transaction.current
  const draft = current.draft
  const workingFaces = current.faces ?? capturedFaces
  const [approved, setApproved] = useState<CaptureRecovery | null>(null)
  const [recordPresent, setRecordPresent] = useState(false)
  const [context, setContext] = useState<CaptureContext | null>(null)
  const [importWarning, setImportWarning] = useState<string | null>(null)
  const committedGrids = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(capturedFaces).map(([slot, face]) => [
          slot,
          face.colors,
        ]),
      ),
    [capturedFaces],
  )
  const grids = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(workingFaces).map(([slot, face]) => [slot, face.colors]),
      ),
    [workingFaces],
  )
  const committedProtocol = reviewProtocol(
    capturedFaces,
    context?.protocol ?? null,
    guided,
  )
  const draftProtocol = reviewProtocol(
    workingFaces,
    context?.protocol ?? null,
    guided,
  )
  const committedPackage = useMemo(
    () =>
      Object.keys(capturedFaces).length === 6
        ? generateForProtocol(committedGrids, size, committedProtocol)
        : null,
    [capturedFaces, committedGrids, size, committedProtocol],
  )
  const workingPackage = useMemo(
    () =>
      workingFaces === capturedFaces
        ? committedPackage
        : Object.keys(workingFaces).length === 6
          ? generateForProtocol(grids, size, draftProtocol)
          : null,
    [workingFaces, capturedFaces, committedPackage, grids, size, draftProtocol],
  )
  const session = workingPackage?.session ?? null
  const committedSaved = useMemo(
    () =>
      approved
        ? restoredCandidate(
            approved,
            committedGrids,
            size,
            readFixtureAssembled({ gridSize: size, capture: context }),
          )
        : null,
    [approved, committedGrids, size, context],
  )
  const decisions = current.decisions
  const remainingCandidates = session ? remaining(session, decisions) : []
  const activeTarget =
    current.cursor ?? (session ? nextTarget(session, decisions) : null)
  const presentedChoices =
    draft && session && activeTarget
      ? presentTargetChoices(
          grids,
          session,
          decisions,
          activeTarget,
          draft.mapping,
        )
      : []
  const choices = presentedChoices.map((presented) => presented.choice)
  const selectedChoice =
    presentedChoices.find(
      (presented) =>
        presented.isCurrent &&
        (current.savedSelection ||
          current.protocolSelection ||
          decisions.some(
            (decision) =>
              decision.slot === presented.choice.slot &&
              decision.target === presented.choice.target &&
              decision.quarterTurns === presented.choice.quarterTurns,
          )),
    )?.choice ?? null
  const update = (change: (previous: Snapshot) => Snapshot, remember = true) =>
    setTransaction((previous) => ({
      ...previous,
      current: change(previous.current),
      history: remember
        ? [...previous.history, previous.current]
        : previous.history,
    }))
  const loadContext = (value: CaptureContext | null) => {
    const recovered = readRecovery(value?.faceRecovery)
    setContext(
      value
        ? {
            ...value,
            mirrored:
              typeof value.mirrored === 'boolean' ? value.mirrored : undefined,
            protocol:
              typeof value.protocol === 'string' ? value.protocol : null,
          }
        : null,
    )
    setRecordPresent(value?.faceRecovery != null)
    setApproved(recovered)
    setTransaction({ current: emptySnapshot(), initial: null, history: [] })
    setOpen(false)
    setImportWarning(
      value?.faceRecovery != null && !recovered
        ? 'The saved mapping or pose is unsupported. Review the photos before confirming.'
        : null,
    )
  }
  const initialDraft = (
    mapping: FaceMapping,
    saved: CaptureRecovery | null,
  ): RecoveryDraft => {
    const frontSlot =
      saved?.captureFrame.frontSlot ??
      (committedProtocol === 'left-front-right-back-up-down/v3'
        ? 'R'
        : committedProtocol === 'right-back-left-front-up-down/v3'
          ? 'D'
          : 'U')
    const front = mapping.find((entry) => entry.slot === frontSlot)?.target
    return {
      mapping,
      frontSlot,
      upSlot:
        saved?.captureFrame.upSlot ??
        (committedPackage?.baselineStatus === 'checked'
          ? committedProtocol?.endsWith('/v3')
            ? 'L'
            : 'B'
          : null) ??
        mapping.find(
          (entry) =>
            entry.target === (front === 'U' || front === 'D' ? 'F' : 'U'),
        )?.slot ??
        'L',
      confirmed: saved?.captureFrame.confirmed ?? false,
      view: 'canonical',
      turnDirection: saved?.captureFrame.turnDirection ?? 'unknown',
      capOrder: saved?.captureFrame.capOrder ?? 'unknown',
    }
  }
  const begin = (candidate: OrientedCandidate | null) => {
    {
      const first: Snapshot = {
        ...emptySnapshot(),
        draft: initialDraft(
          approved?.mapping ??
            committedPackage?.baseline?.mapping ??
            (candidate
              ? initializeMapping(committedGrids, candidate)
              : (committedPackage?.session.candidates[0]?.mapping ??
                initializeMapping(committedGrids, null))),
          approved,
        ),
        faces: capturedFaces,
        savedSelection: !!committedSaved,
        protocolSelection:
          !approved && committedPackage?.baselineStatus === 'checked',
      }
      setTransaction({ current: first, initial: first, history: [] })
    }
    setOpen(true)
  }
  const edit = (patch: Partial<RecoveryDraft>) =>
    update((previous) =>
      previous.draft
        ? { ...previous, draft: { ...previous.draft, ...patch } }
        : previous,
    )
  const cancel = () => {
    setTransaction({ current: emptySnapshot(), initial: null, history: [] })
    setOpen(false)
    onCancel()
  }
  const chooseOption = (choice: Choice) => {
    if (!draft || !session) return
    const proposal = proposeTarget(
      grids,
      session,
      decisions,
      choice,
      draft.mapping,
    )
    if (!proposal) return
    update((previous) => ({
      ...previous,
      draft: { ...draft, mapping: proposal.mapping },
      decisions: proposal.decisions,
      savedSelection: false,
      protocolSelection: false,
      cursor: nextTarget(session, proposal.decisions),
      warning: proposal.conflicts.length
        ? `${proposal.conflicts.length} later answers need review.`
        : null,
    }))
  }
  const back = () => {
    const index = current.cursor
      ? decisions.findIndex((decision) => decision.target === current.cursor)
      : decisions.length
    const previous = decisions[Math.max(0, index - 1)]
    if (previous)
      update((snapshot) => ({ ...snapshot, cursor: previous.target }), false)
  }
  const validation = draft ? validateMapping(grids, draft.mapping, size) : null
  const directFrame = draft
    ? captureFrame(grids, draft.mapping, draft.frontSlot, draft.upSlot)
    : null
  const recordDraft =
    draft && !directFrame ? initialDraft(draft.mapping, null) : draft
  const frame =
    directFrame ??
    (recordDraft
      ? captureFrame(
          grids,
          recordDraft.mapping,
          recordDraft.frontSlot,
          recordDraft.upSlot,
        )
      : null)
  const savedCandidate =
    current.savedSelection && approved
      ? restoredCandidate(
          approved,
          grids,
          size,
          readFixtureAssembled({ gridSize: size, capture: context }),
        )
      : null
  const selectionBlocked =
    !!draft &&
    !savedCandidate &&
    (!session || !retainsMapping(session, draft.mapping))
  const confirmBlockedReason = !validation?.valid
    ? (validation?.issues[0] ?? 'Correct the captured input.')
    : selectionBlocked
      ? 'No retained arrangement matches the capture constraints.'
      : !frame
        ? 'Source transformation could not be verified.'
        : null
  const recordFor = (
    draft: RecoveryDraft,
    workingFaces: Faces,
    frame: CaptureFrame,
  ): CaptureRecovery => {
    return {
      stateRelation: 'capture',
      version: 1,
      transformConvention: 'cube-geometry-orientations/v1',
      mapping: draft.mapping.map((p) => ({ ...p })),
      view: 'canonical',
      captureFrame: {
        guideObservations: mergeGuideObservations(
          approved?.captureFrame.guideObservations ?? [],
          workingFaces,
        ),
        frontSlot: draft.frontSlot,
        upSlot: draft.upSlot,
        confirmed: draft.confirmed,
        displayTransform: frame.displayTransform,
        canonicalTransform: frame.canonicalTransform,
        photoTransforms: frame.mapping,
        protocol:
          captureProtocol(workingFaces, context?.protocol ?? null) ??
          (guided ? legacyProtocol : null),
        mirrored: context?.mirrored ?? mirrored,
        turnDirection: draft.turnDirection,
        capOrder: draft.capOrder,
        displayedArrows: approved?.captureFrame.displayedArrows ?? [],
      },
    }
  }
  const confirm = () => {
    if (
      !draft ||
      !validation?.valid ||
      !validation.candidate ||
      !frame ||
      selectionBlocked
    )
      return
    const record = recordFor(recordDraft ?? draft, workingFaces, frame)
    setApproved(record)
    setRecordPresent(true)
    setOpen(false)
    setTransaction((previous) => ({
      ...previous,
      initial: previous.current,
      history: [],
    }))
    onCommitFaces(workingFaces)
    onChoose(validation.candidate, record)
  }
  const sameLogical = (a: OrientedCandidate, b: OrientedCandidate) =>
    sameCubeState(
      assembleCubeFromFaces(a.faces, size),
      assembleCubeFromFaces(b.faces, size),
    )
  const mappingForDisplayed = (candidate: OrientedCandidate) =>
    committedSaved && approved && sameLogical(committedSaved, candidate)
      ? approved.mapping
      : committedPackage?.baseline &&
          sameCubeState(
            assembleCubeFromFaces(committedPackage.baseline.faces, size),
            assembleCubeFromFaces(candidate.faces, size),
          )
        ? committedPackage.baseline.mapping
        : initializeMapping(committedGrids, candidate)
  const displayedBlocked = (candidate: OrientedCandidate) =>
    !(committedSaved && sameLogical(committedSaved, candidate)) &&
    (!committedPackage ||
      !retainsMapping(committedPackage.session, mappingForDisplayed(candidate)))
  const alternativesCount = (candidate: OrientedCandidate) =>
    committedPackage
      ? knownAlternatives(
          committedPackage.session,
          mappingForDisplayed(candidate),
        )
      : 0
  const committedAlternativeCount = committedPackage
    ? knownAlternatives(
        committedPackage.session,
        approved?.mapping ??
          committedPackage.baseline?.mapping ??
          committedPackage.session.candidates[0]?.mapping ??
          [],
      )
    : 0
  const acceptDisplayed = (candidate: OrientedCandidate) => {
    if (displayedBlocked(candidate)) return
    const original = committedGrids
    const restored = approved
      ? restoredCandidate(
          approved,
          original,
          size,
          readFixtureAssembled({ gridSize: size, capture: context }),
        )
      : null
    const sameSaved =
      restored &&
      sameCubeState(
        assembleCubeFromFaces(restored.faces, size),
        assembleCubeFromFaces(candidate.faces, size),
      )
    let record =
      sameSaved && approved ? { ...approved, view: 'canonical' } : null
    if (!record) {
      const logicalDraft = {
        ...initialDraft(mappingForDisplayed(candidate), null),
        view: 'canonical' as const,
        confirmed: false,
      }
      const logicalFrame = captureFrame(
        original,
        logicalDraft.mapping,
        logicalDraft.frontSlot,
        logicalDraft.upSlot,
      )
      if (!logicalFrame) return
      record = recordFor(logicalDraft, capturedFaces, logicalFrame)
    }
    setApproved(record)
    setRecordPresent(true)
    setOpen(false)
    setTransaction({ current: emptySnapshot(), initial: null, history: [] })
    onChoose(candidate, record)
  }
  const importedCandidate = () => committedSaved
  const baselineCandidate = () =>
    committedPackage?.baseline
      ? validateMapping(committedGrids, committedPackage.baseline.mapping, size)
          .candidate
      : null
  const captureConflict = () =>
    committedPackage?.baselineStatus === 'conflict'
      ? 'Capture conflicts with the physical guide. Check the photos and recorded steps.'
      : null
  return {
    open,
    acceptDisplayed,
    displayedBlocked,
    alternativesCount,
    committedAlternativeCount,
    baselineCandidate,
    captureConflict,
    workingFaces,
    sourcePhotoNames: sourcePhotoNamesForCapture(
      workingFaces,
      context?.protocol ?? null,
    ),
    sourceProtocol: sourcePresentationProtocol(
      capturedFaces,
      context?.protocol ?? null,
    ),
    sourcePhotoLabels: Object.fromEntries(
      ['U', 'R', 'F', 'D', 'L', 'B'].map((slot, i) => [
        slot,
        sourcePhotoNamesForCapture(capturedFaces, context?.protocol ?? null)[i],
      ]),
    ),
    committedProtocol,
    savedAssembly: () =>
      readFixtureAssembled({ gridSize: size, capture: context }),
    checkpoint: () => transaction,
    restoreCheckpoint: (checkpoint: typeof transaction) =>
      setTransaction(checkpoint),
    setDraftFaces: (value: Faces | ((previous: Faces) => Faces)) =>
      update((previous) => ({
        ...previous,
        faces:
          typeof value === 'function'
            ? value(previous.faces ?? capturedFaces)
            : value,
      })),
    choiceWarning:
      current.warning ??
      (workingPackage?.baselineStatus === 'conflict'
        ? 'Capture conflicts with the physical guide. Check the photos and recorded steps.'
        : null),
    pendingChoice: selectedChoice,
    selectedChoice,
    decisions,
    session,
    remainingCandidates,
    activeTarget,
    choices,
    presentedChoices,
    chooseOption,
    back,
    draft,
    history: transaction.history,
    approved,
    context,
    recordPresent,
    importWarning,
    confirmBlockedReason,
    savedSelection: !!savedCandidate,
    selectionBlocked,
    loadContext,
    reset: () => loadContext(null),
    begin,
    edit,
    cancel,
    close: cancel,
    confirm,
    validation,
    frame,
    importedCandidate,
  }
}
