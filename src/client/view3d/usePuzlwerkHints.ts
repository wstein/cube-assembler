// State and handlers of the hint overlay of the main 3D view on the PuzlWerk viewer (texts and
// conditions: puzlwerkHints.ts). The help line reuses the existing idle/active timing.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { PlayEvent } from '@puzlwerk/viewer'
import {
  preferenceCookie,
  readPreference,
  readSwipeTuning,
  SEAM_WIDE_COOKIE,
  VIEW_HELP_COOKIE,
} from '../preferences'
import {
  helpHintText,
  LOCKED_HINT_VISIBLE_MS,
  lockedHintShouldShow,
  wideBadgeAfter,
} from './puzlwerkHints'
import { useCubeHelpHint } from './useCubeHelpHint'

export interface PuzlwerkHintsOptions {
  size: number
  // Layer moves are locked: a drag only orbits the view.
  locked: boolean
}

export function usePuzlwerkHints({ size, locked }: PuzlwerkHintsOptions) {
  const helpEnabled = readPreference(document.cookie, VIEW_HELP_COOKIE, true)
  const seamWide = readPreference(document.cookie, SEAM_WIDE_COOKIE)
  const help = useCubeHelpHint(helpEnabled, () => {
    document.cookie = preferenceCookie(VIEW_HELP_COOKIE, false)
  })
  const [coarse] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  )
  const [wideBadge, setWideBadge] = useState(false)
  const [lockedHint, setLockedHint] = useState(false)
  const lockedShownAt = useRef<number | null>(null)
  const lockedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const down = useRef(new Set<number>())
  const dragStart = useRef<{ id: number; x: number; y: number } | null>(null)
  const latest = useRef({ size, locked })
  latest.current = { size, locked }
  const wideShown = useRef(false)

  useEffect(
    () => () => {
      if (lockedTimer.current !== null) clearTimeout(lockedTimer.current)
    },
    [],
  )

  const showLocked = () => {
    lockedShownAt.current = Date.now()
    setLockedHint(true)
    if (lockedTimer.current !== null) clearTimeout(lockedTimer.current)
    lockedTimer.current = setTimeout(
      () => setLockedHint(false),
      LOCKED_HINT_VISIBLE_MS,
    )
  }

  const release = (id: number) => {
    down.current.delete(id)
    if (dragStart.current?.id === id) dragStart.current = null
    help.pointerUp(id)
  }

  return {
    helpVisible: help.visible,
    helpText: helpHintText(coarse, seamWide),
    seamWide,
    wideBadge,
    lockedHint: lockedHint && locked,
    // Stage option `onPlayEvent`; stable, reads the latest size.
    onPlayEvent: (event: PlayEvent) => {
      const next = wideBadgeAfter(wideShown.current, event, latest.current.size)
      if (next === wideShown.current) return
      wideShown.current = next
      setWideBadge(next)
    },
    // Capture handlers of the element around the stage.
    handlers: {
      onPointerDownCapture: (event: PointerEvent) => {
        help.pointerDown(event.pointerId)
        down.current.add(event.pointerId)
        const onCanvas =
          event.target instanceof HTMLElement &&
          event.target.tagName === 'CANVAS'
        dragStart.current =
          down.current.size === 1 && onCanvas
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : null
      },
      onPointerMoveCapture: (event: PointerEvent) => {
        const start = dragStart.current
        if (!start || start.id !== event.pointerId) return
        const move = {
          dx: event.clientX - start.x,
          dy: event.clientY - start.y,
          startPx: readSwipeTuning(document.cookie).startPx,
        }
        // One decision per drag, as the existing view.
        if (Math.hypot(move.dx, move.dy) < move.startPx) return
        dragStart.current = null
        if (
          lockedHintShouldShow({
            ...move,
            locked: latest.current.locked,
            lastShownAt: lockedShownAt.current,
            now: Date.now(),
          })
        )
          showLocked()
      },
      onPointerUpCapture: (event: PointerEvent) => release(event.pointerId),
      onPointerCancelCapture: (event: PointerEvent) => release(event.pointerId),
      onWheelCapture: () => help.activity(),
    },
  }
}
