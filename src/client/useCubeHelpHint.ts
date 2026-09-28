import { useEffect, useRef, useState } from 'preact/hooks'

const FIRST_TOUCH_DELAY_MS = 10_000
const IDLE_DELAY_MS = 20_000
const ACTIVE_PLAY_LIMIT_MS = 30 * 60_000

export function useCubeHelpHint(enabled: boolean, onAutoOff: () => void) {
  const [visible, setVisible] = useState(enabled)
  const touched = useRef(false)
  const activePointers = useRef(new Set<number>())
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSince = useRef<number | null>(null)
  const activePlayMs = useRef(0)
  const disabled = useRef(false)

  const stopActivePlay = () => {
    if (playTimer.current !== null) clearTimeout(playTimer.current)
    playTimer.current = null
    if (activeSince.current !== null) {
      activePlayMs.current += Date.now() - activeSince.current
      activeSince.current = null
    }
  }

  const startActivePlay = () => {
    if (activeSince.current !== null) return
    activeSince.current = Date.now()
    playTimer.current = setTimeout(
      () => {
        playTimer.current = null
        stopActivePlay()
        disabled.current = true
        clearShowTimer()
        setVisible(false)
        onAutoOff()
      },
      Math.max(0, ACTIVE_PLAY_LIMIT_MS - activePlayMs.current),
    )
  }

  const clearShowTimer = () => {
    if (showTimer.current !== null) clearTimeout(showTimer.current)
    showTimer.current = null
  }

  const showWhenIdle = () => {
    clearShowTimer()
    showTimer.current = setTimeout(() => {
      showTimer.current = null
      stopActivePlay()
      if (activePointers.current.size === 0) setVisible(true)
    }, IDLE_DELAY_MS)
  }

  const pointerDown = (id: number) => {
    if (!enabled || disabled.current) return
    activePointers.current.add(id)
    clearShowTimer()
    startActivePlay()
    if (!touched.current) {
      touched.current = true
      hideTimer.current = setTimeout(() => {
        hideTimer.current = null
        setVisible(false)
      }, FIRST_TOUCH_DELAY_MS)
    } else if (hideTimer.current === null) {
      setVisible(false)
    }
  }

  const pointerUp = (id: number) => {
    if (!enabled || disabled.current) return
    activePointers.current.delete(id)
    if (activePointers.current.size === 0 && touched.current) showWhenIdle()
  }

  // Touchpads deliver two-finger x/y/z moves as wheel events.
  const activity = () => {
    pointerDown(-1)
    pointerUp(-1)
  }

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current)
      clearShowTimer()
      stopActivePlay()
    },
    [],
  )

  return { visible, pointerDown, pointerUp, activity }
}
