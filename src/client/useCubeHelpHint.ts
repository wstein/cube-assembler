import { useEffect, useRef, useState } from 'preact/hooks'

const FIRST_TOUCH_DELAY_MS = 10_000
const IDLE_DELAY_MS = 20_000

export function useCubeHelpHint(enabled: boolean) {
  const [visible, setVisible] = useState(enabled)
  const touched = useRef(false)
  const activePointers = useRef(new Set<number>())
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearShowTimer = () => {
    if (showTimer.current !== null) clearTimeout(showTimer.current)
    showTimer.current = null
  }

  const showWhenIdle = () => {
    clearShowTimer()
    showTimer.current = setTimeout(() => {
      showTimer.current = null
      if (activePointers.current.size === 0) setVisible(true)
    }, IDLE_DELAY_MS)
  }

  const pointerDown = (id: number) => {
    if (!enabled) return
    activePointers.current.add(id)
    clearShowTimer()
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
    if (!enabled) return
    activePointers.current.delete(id)
    if (activePointers.current.size === 0 && touched.current) showWhenIdle()
  }

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current)
      clearShowTimer()
    },
    [],
  )

  return { visible, pointerDown, pointerUp }
}
