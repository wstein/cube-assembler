import { useMemo, useState } from 'preact/hooks'
import {
  assembleCubeFromFaces,
  type OrientedCandidate,
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
import { sameCubeState } from './recoveryPresentation'
import { readFixtureAssembled } from '../fixtures/fixtureFormat'
import type { FaceCaptureData } from './captureTypes'
import {
  generate,
  remaining,
  nextSlot,
  retainsMapping,
  propose,
  presentChoices,
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
  cursor: string | null
  warning: string | null
  savedSelection: boolean
}
const emptySnapshot = (): Snapshot => ({
  draft: null,
  faces: null,
  decisions: [],
  cursor: null,
  warning: null,
  savedSelection: false,
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
}: {
  capturedFaces: Faces
  size: number
  mirrored: boolean
  guided: boolean
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
  const grids = Object.fromEntries(
    Object.entries(workingFaces).map(([slot, face]) => [slot, face.colors]),
  )
  const session = useMemo(
    () =>
      Object.keys(workingFaces).length === 6
        ? generate(
            Object.fromEntries(
              Object.entries(workingFaces).map(([slot, face]) => [
                slot,
                face.colors,
              ]),
            ),
            size,
            guided,
          )
        : null,
    [workingFaces, size, guided],
  )
  const decisions = current.decisions
  const remainingCandidates = session ? remaining(session, decisions) : []
  const activeSlot = current.savedSelection
    ? null
    : (current.cursor ?? (session ? nextSlot(session, decisions) : null))
  const presentedChoices =
    draft && session && activeSlot
      ? presentChoices(
          grids,
          session,
          decisions,
          activeSlot,
          draft.mapping,
          draft.frontSlot,
          draft.upSlot,
          false,
        )
      : []
  const choices = presentedChoices.map((presented) => presented.choice)
  const selectedChoice =
    presentedChoices.find(
      (presented) =>
        presented.isCurrent &&
        decisions.some(
          (decision) =>
            decision.slot === presented.choice.slot &&
            decision.target === presented.choice.target &&
            decision.quarterTurns === presented.choice.quarterTurns,
        ),
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
    const frontSlot = saved?.captureFrame.frontSlot ?? 'U'
    const front = mapping.find((entry) => entry.slot === frontSlot)?.target
    return {
      mapping,
      frontSlot,
      upSlot:
        saved?.captureFrame.upSlot ??
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
    if (!draft) {
      const first: Snapshot = {
        ...emptySnapshot(),
        draft: initialDraft(
          approved?.mapping ?? initializeMapping(grids, candidate),
          approved,
        ),
        faces: capturedFaces,
        savedSelection: !!approved,
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
  const undo = () =>
    setTransaction((previous) => {
      const snapshot = previous.history.at(-1)
      return snapshot
        ? {
            ...previous,
            current: snapshot,
            history: previous.history.slice(0, -1),
          }
        : previous
    })
  const resetDraft = () =>
    setTransaction((previous) =>
      previous.initial
        ? {
            ...previous,
            current: previous.initial,
            history: [...previous.history, previous.current],
          }
        : previous,
    )
  const cancel = () => {
    setTransaction((previous) => ({
      ...previous,
      current: previous.initial ?? emptySnapshot(),
      history: [],
    }))
    setOpen(false)
  }
  const chooseOption = (choice: Choice) => {
    if (!draft || !session) return
    const proposal = propose(grids, session, decisions, choice, draft.mapping)
    if (!proposal) return
    update((previous) => ({
      ...previous,
      draft: { ...draft, mapping: proposal.mapping },
      decisions: proposal.decisions,
      savedSelection: false,
      cursor: choice.slot,
      warning: proposal.conflicts.length
        ? `${proposal.conflicts.length} later answers need review.`
        : null,
    }))
  }
  const back = () => {
    const index = current.cursor
      ? decisions.findIndex((decision) => decision.slot === current.cursor)
      : decisions.length
    const previous = decisions[Math.max(0, index - 1)]
    if (previous)
      update((snapshot) => ({ ...snapshot, cursor: previous.slot }), false)
  }
  const next = () => {
    if (!selectedChoice || !draft || !session) return
    const proposal = propose(
      grids,
      session,
      decisions,
      selectedChoice,
      draft.mapping,
    )
    if (!proposal) return
    const answered = decisions.some(
      (decision) =>
        decision.slot === selectedChoice.slot &&
        decision.target === selectedChoice.target &&
        decision.quarterTurns === selectedChoice.quarterTurns,
    )
    update(
      (previous) => ({
        ...previous,
        draft: { ...draft, mapping: proposal.mapping },
        decisions: proposal.decisions,
        cursor: nextSlot(session, proposal.decisions),
        savedSelection: false,
      }),
      !answered,
    )
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
          context?.protocol ?? (guided ? 'sides-then-top-bottom/v1' : null),
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
  const originalGrids = () =>
    Object.fromEntries(
      Object.entries(capturedFaces).map(([slot, face]) => [slot, face.colors]),
    )
  const displayedBlocked = (candidate: OrientedCandidate) =>
    !!session?.guided &&
    !approved &&
    !retainsMapping(session, initializeMapping(originalGrids(), candidate))
  const acceptDisplayed = (candidate: OrientedCandidate) => {
    if (displayedBlocked(candidate)) return
    const original = originalGrids()
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
        ...initialDraft(initializeMapping(original, candidate), null),
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
  const importedCandidate = () =>
    approved
      ? restoredCandidate(
          approved,
          grids,
          size,
          readFixtureAssembled({ gridSize: size, capture: context }),
        )
      : null
  return {
    open,
    acceptDisplayed,
    displayedBlocked,
    workingFaces,
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
    choiceWarning: current.warning,
    pendingChoice: selectedChoice,
    selectedChoice,
    decisions,
    session,
    remainingCandidates,
    activeSlot,
    choices,
    presentedChoices,
    chooseOption,
    back,
    next,
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
    undo,
    resetDraft,
    cancel,
    close: () => setOpen(false),
    confirm,
    validation,
    frame,
    importedCandidate,
  }
}
