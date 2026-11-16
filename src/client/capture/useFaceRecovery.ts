import { useEffect, useMemo, useState } from 'preact/hooks'
import type { FaceKey, OrientedCandidate } from '../../cube/cubeAssembly'
import {
  assignMapping,
  captureFrame,
  initializeMapping,
  rotateMapping,
  validateMapping,
  type FaceMapping,
} from './captureFaceMapping'
import {
  readRecovery,
  restoredCandidate,
  mergeGuideObservations,
  type CaptureRecovery,
} from './captureRecovery'
import { readFixtureAssembled } from '../fixtures/fixtureFormat'
import type { FaceCaptureData } from './captureTypes'
import {
  generate,
  remaining,
  options,
  nextSlot,
  reconcile,
  preserveMapping,
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

// Browser lifecycle only. Mapping, validation, pose transforms and decoding
// are ReScript functions; closing the dialog preserves the unapproved draft.
export function useFaceRecovery({
  capturedFaces,
  size,
  mirrored,
  guided,
  onChoose,
  onCommitFaces,
}: {
  capturedFaces: Record<string, FaceCaptureData>
  size: number
  mirrored: boolean
  guided: boolean
  onCommitFaces: (faces: Record<string, FaceCaptureData>) => void
  onChoose: (candidate: OrientedCandidate, recovery?: CaptureRecovery) => void
}) {
  const [open, setOpen] = useState(false)
  const [draftFaces, setDraftFaces] = useState<Record<
    string,
    FaceCaptureData
  > | null>(null)
  const workingFaces = draftFaces ?? capturedFaces
  const [choiceWarning, setChoiceWarning] = useState<string | null>(null)
  const [activeOverride, setActiveOverride] = useState<string | null>(null)
  const [pendingChoice, setPendingChoice] = useState<Choice | null>(null)
  useEffect(() => setPendingChoice(null), [workingFaces])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const session = useMemo(
    () =>
      open
        ? generate(
            Object.fromEntries(
              Object.entries(workingFaces).map(([slot, f]) => [slot, f.colors]),
            ),
            size,
            guided,
          )
        : null,
    [open, workingFaces, size, guided],
  )
  const remainingCandidates = session ? remaining(session, decisions) : []
  const activeSlot =
    activeOverride ?? (session ? nextSlot(session, decisions) : null)
  const questionIndex = decisions.findIndex(
    (decision) => decision.slot === activeSlot,
  )
  const prefixDecisions =
    questionIndex < 0 ? decisions : decisions.slice(0, questionIndex)
  const choices =
    session && activeSlot ? options(session, prefixDecisions, activeSlot) : []
  const [draft, setDraft] = useState<RecoveryDraft | null>(null)
  const [initial, setInitial] = useState<RecoveryDraft | null>(null)
  const [history, setHistory] = useState<RecoveryDraft[]>([])
  const [approved, setApproved] = useState<CaptureRecovery | null>(null)
  const [recordPresent, setRecordPresent] = useState(false)
  const [context, setContext] = useState<CaptureContext | null>(null)
  const [importWarning, setImportWarning] = useState<string | null>(null)
  const grids = Object.fromEntries(
    Object.entries(workingFaces).map(([slot, f]) => [slot, f.colors]),
  )
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
    setDraftFaces(null)
    setDraft(null)
    setInitial(null)
    setHistory([])
    setDecisions([])
    setActiveOverride(null)
    setChoiceWarning(null)
    setPendingChoice(null)
    setOpen(false)
    setImportWarning(
      value?.faceRecovery != null && !recovered
        ? 'The saved face mapping or pose is malformed or uses an unsupported version. Review the six photos before confirming.'
        : null,
    )
  }
  const reset = () => loadContext(null)
  const begin = (candidate: OrientedCandidate | null) => {
    if (!draft) {
      setDraftFaces(capturedFaces)
      const mapping = approved?.mapping ?? initializeMapping(grids, candidate)
      const frontSlot = approved?.captureFrame.frontSlot ?? 'U'
      const front = mapping.find((m) => m.slot === frontSlot)?.target
      const upSlot =
        approved?.captureFrame.upSlot ??
        mapping.find(
          (m) => m.target === (front === 'U' || front === 'D' ? 'F' : 'U'),
        )?.slot ??
        'L'
      const next: RecoveryDraft = {
        mapping,
        frontSlot,
        upSlot,
        confirmed: approved?.captureFrame.confirmed ?? false,
        view: approved?.view === 'canonical' ? 'canonical' : 'capture',
        turnDirection: approved?.captureFrame.turnDirection ?? 'unknown',
        capOrder: approved?.captureFrame.capOrder ?? 'unknown',
      }
      setDraft(next)
      setInitial(next)
      setHistory([])
    }
    setOpen(true)
  }
  const update = (next: RecoveryDraft) => {
    if (draft) setHistory((previous) => [...previous, draft])
    setDraft(next)
  }
  const edit = (patch: Partial<RecoveryDraft>) =>
    draft && update({ ...draft, ...patch })
  const rotate = (slot: string, turns: number) =>
    draft &&
    update({ ...draft, mapping: rotateMapping(draft.mapping, slot, turns) })
  const assign = (slot: string, target: FaceKey) =>
    draft &&
    update({
      ...draft,
      mapping: assignMapping(draft.mapping, slot, target),
      confirmed: false,
    })
  const undo = () => {
    const previous = history.at(-1)
    if (previous) {
      setDraft(previous)
      setHistory(history.slice(0, -1))
    }
  }
  const resetDraft = () => {
    setDecisions([])
    setActiveOverride(null)
    setChoiceWarning(null)
    setPendingChoice(null)
    setDraftFaces(capturedFaces)
    if (initial) update(initial)
  }
  const cancel = () => {
    setDraftFaces(capturedFaces)
    setDecisions([])
    setDraft(initial)
    setHistory([])
    setOpen(false)
  }
  const chooseOption = (choice: Choice) => {
    if (!draft || !session) return
    const reconciled = reconcile(session, decisions, {
      slot: choice.slot,
      target: choice.target,
      quarterTurns: choice.quarterTurns,
    })
    const nextDecisions = reconciled.decisions
    setChoiceWarning(
      reconciled.conflicts.length
        ? `${reconciled.conflicts.length} incompatible later choices need another answer. Compatible choices were kept.`
        : null,
    )
    setPendingChoice(choice)
    const matching = remaining(session, nextDecisions)
    if (matching.length) {
      update({
        ...draft,
        mapping: preserveMapping(grids, draft.mapping, matching[0]),
      })
    }
  }
  const back = () => {
    setPendingChoice(null)
    const currentIndex = activeOverride
      ? decisions.findIndex((d) => d.slot === activeOverride)
      : decisions.length
    const previousDecision = decisions[Math.max(0, currentIndex - 1)]
    if (previousDecision) setActiveOverride(previousDecision.slot)
  }
  const next = () => {
    if (!pendingChoice) return
    setDecisions(
      reconcile(session!, decisions, {
        slot: pendingChoice.slot,
        target: pendingChoice.target,
        quarterTurns: pendingChoice.quarterTurns,
      }).decisions,
    )
    setPendingChoice(null)
    setActiveOverride(null)
  }
  const validation = draft ? validateMapping(grids, draft.mapping, size) : null
  const frame = draft
    ? captureFrame(grids, draft.mapping, draft.frontSlot, draft.upSlot)
    : null
  const confirm = () => {
    if (
      !draft ||
      !validation?.valid ||
      !validation.candidate ||
      !frame ||
      (draft.view === 'capture' && !draft.confirmed)
    )
      return
    const record: CaptureRecovery = {
      stateRelation: 'capture',
      version: 1,
      transformConvention: 'cube-geometry-orientations/v1',
      mapping: draft.mapping.map((p) => ({ ...p })),
      view: draft.view,
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
    setApproved(record)
    setRecordPresent(true)
    setOpen(false)
    setInitial(draft)
    setHistory([])
    onCommitFaces(workingFaces)
    onChoose(validation.candidate, record)
  }
  // Imported explicit choices bypass automatic reranking. Validate the pose
  // against the source identity mapping, not a best color-content match.
  const importedCandidate = () => {
    if (!approved) return null
    const saved = readFixtureAssembled({ gridSize: size, capture: context })
    return restoredCandidate(approved, grids, size, saved)
  }
  return {
    open,
    workingFaces,
    setDraftFaces: (
      value:
        | Record<string, FaceCaptureData>
        | ((
            previous: Record<string, FaceCaptureData>,
          ) => Record<string, FaceCaptureData>),
    ) =>
      setDraftFaces((previous) =>
        typeof value === 'function' ? value(previous ?? capturedFaces) : value,
      ),
    choiceWarning,
    pendingChoice,
    decisions,
    session,
    remainingCandidates,
    activeSlot,
    choices,
    chooseOption,
    back,
    next,
    draft,
    history,
    approved,
    context,
    recordPresent,
    importWarning,
    loadContext,
    reset,
    begin,
    edit,
    rotate,
    assign,
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
