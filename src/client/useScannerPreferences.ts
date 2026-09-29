import { useEffect, useState } from 'preact/hooks'
import type { CaptureMode } from './capturePhoto'
import {
  AUTO_CAPTURE_COOKIE,
  CAPTURE_MODE_COOKIE,
  CUBE_SIZE_COOKIE,
  CUBE_VIEW_COOKIE,
  MIRROR_COOKIE,
  NOTATION_COOKIE,
  SOUND_COOKIE,
  preferenceCookie,
  readAutoCaptureFrames,
  readPreference,
  selectedCaptureMode,
  selectedCubeView,
  selectedNotationFormat,
  selectionCookie,
} from './preferences'

// The scanner's remembered choices (see preferences.ts) and the page the
// URL hash shows. Coming back from the settings page picks up what it
// changed.
export function useScannerPreferences(puzzleSize: number) {
  const [cubeViewMode, setCubeViewMode] = useState<'net' | '3d'>(
    () => selectedCubeView(document.cookie) ?? 'net',
  )
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() =>
    selectedCaptureMode(document.cookie),
  )
  // Auto capture, sound and mirror start off; the viewer's choices are kept
  // in cookies (see preferences.ts).
  const [autoCapture, setAutoCapture] = useState(() =>
    readPreference(document.cookie, AUTO_CAPTURE_COOKIE),
  )
  const [stableFrames, setStableFrames] = useState(() =>
    readAutoCaptureFrames(document.cookie),
  )
  const [captureSound, setCaptureSound] = useState(() =>
    readPreference(document.cookie, SOUND_COOKIE),
  )
  // Most laptop/webcam feeds are shown mirrored by convention (like a
  // physical mirror), which is what most users expect; default on but
  // let it be turned off for cameras that don't need it (e.g. a rear
  // phone camera fed in via some capture setups).
  const [mirrorPreview, setMirrorPreview] = useState(() =>
    readPreference(document.cookie, MIRROR_COOKIE),
  )
  const [notationFormat, setNotationFormat] = useState<'wrg' | 'urf'>(() =>
    selectedNotationFormat(document.cookie),
  )
  const changePreference = (
    name: string,
    set: (on: boolean) => void,
    on: boolean,
  ) => {
    set(on)
    document.cookie = preferenceCookie(name, on)
  }
  useEffect(() => {
    document.cookie = selectionCookie(CUBE_SIZE_COOKIE, String(puzzleSize))
  }, [puzzleSize])
  useEffect(() => {
    document.cookie = selectionCookie(CUBE_VIEW_COOKIE, cubeViewMode)
  }, [cubeViewMode])
  useEffect(() => {
    document.cookie = selectionCookie(NOTATION_COOKIE, notationFormat)
  }, [notationFormat])
  useEffect(() => {
    document.cookie = selectionCookie(CAPTURE_MODE_COOKIE, captureMode)
  }, [captureMode])
  // Applied for this session even when the browser won't keep it.
  // '#profiles' shows the profiles page instead of the scanner.
  const [page, setPage] = useState(() => location.hash)
  useEffect(() => {
    const onHash = () => setPage(location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // Back from the settings page, pick up what it changed.
  const onSettingsPage = page === '#settings'
  useEffect(() => {
    if (onSettingsPage) return
    const cookies = document.cookie
    setMirrorPreview(readPreference(cookies, MIRROR_COOKIE))
    setAutoCapture(readPreference(cookies, AUTO_CAPTURE_COOKIE))
    setCaptureSound(readPreference(cookies, SOUND_COOKIE))
    setNotationFormat(selectedNotationFormat(cookies))
    setCaptureMode(selectedCaptureMode(cookies))
    setStableFrames(readAutoCaptureFrames(cookies))
  }, [onSettingsPage])
  return {
    cubeViewMode,
    setCubeViewMode,
    captureMode,
    setCaptureMode,
    autoCapture,
    setAutoCapture,
    stableFrames,
    captureSound,
    setCaptureSound,
    mirrorPreview,
    setMirrorPreview,
    notationFormat,
    setNotationFormat,
    changePreference,
    page,
    onSettingsPage,
  }
}
