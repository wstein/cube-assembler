import { useState } from 'preact/hooks'
import { createSolvedCube, type CubeState } from '../cube/cubeAssembly'
import type { ParityResult } from '../cube/parity'
import {
  cubeCaptureFaces,
  parityStatus,
  parseCubeInput,
  solvedCaptureFaces,
} from './capture/captureFlow'
import type { useCaptureSession } from './capture/useCaptureSession'

type Session = ReturnType<typeof useCaptureSession>

interface AssembledCubeOptions {
  puzzleSize: number
  setPuzzleSize: (size: number) => void
  notationFormat: 'wrg' | 'urf'
  setNotationFormat: (format: 'wrg' | 'urf') => void
  setCapturedFaces: Session['setCapturedFaces']
  forgetResolvedProfile: () => void
  setLoading: (value: boolean) => void
}

// The cube the scanner shows - solved, typed in as facelets, or assembled
// from a reviewed capture - and its parity check.
export function useAssembledCube({
  puzzleSize,
  setPuzzleSize,
  notationFormat,
  setNotationFormat,
  setCapturedFaces,
  forgetResolvedProfile,
  setLoading,
}: AssembledCubeOptions) {
  const [cube, setCube] = useState<CubeState | null>(null)
  const [parity, setParity] = useState<ParityResult | null>(null)
  const [manualColorInput, setManualColorInput] = useState('')
  const [showColorInput, setShowColorInput] = useState(false)

  const updateParityStatus = (cubeState: CubeState, sizeOverride?: number) => {
    setParity(parityStatus(cubeState, sizeOverride ?? puzzleSize))
  }

  const handleApplySolved = async () => {
    const solved = createSolvedCube(puzzleSize)
    setCube(solved)
    forgetResolvedProfile()

    setCapturedFaces(solvedCaptureFaces(puzzleSize))
    updateParityStatus(solved)
  }

  const handleApplyFacelets = async () => {
    if (!manualColorInput.trim()) {
      alert('Please enter facelet data')
      return
    }

    setLoading(true)
    try {
      // The textarea's onInput already keeps notationFormat in sync with
      // pasted content via detectNotationFormat, but fall back to it here
      // too in case content ever reaches this handler without going
      // through that path (e.g. a fast paste-and-submit).
      const parsed = parseCubeInput(manualColorInput, notationFormat)
      if (!parsed.ok) {
        alert(parsed.message)
        return
      }
      const { cube: newCube, format: effectiveFormat } = parsed
      if (effectiveFormat !== notationFormat) setNotationFormat(effectiveFormat)

      const size = Math.sqrt(newCube.u.length)
      setPuzzleSize(size)
      setCube(newCube)
      forgetResolvedProfile()

      setCapturedFaces(cubeCaptureFaces(newCube, size))

      updateParityStatus(newCube, size)
      setManualColorInput('')
      setShowColorInput(false)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return {
    cube,
    setCube,
    parity,
    setParity,
    updateParityStatus,
    manualColorInput,
    setManualColorInput,
    showColorInput,
    setShowColorInput,
    handleApplySolved,
    handleApplyFacelets,
  }
}
