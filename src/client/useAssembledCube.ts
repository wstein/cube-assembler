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
      // The format is detected from the text; only input that fits both
      // (R and B letters alone) is read in the saved notation format. Typing
      // facelets never changes that setting.
      const parsed = parseCubeInput(manualColorInput, notationFormat)
      if (!parsed.ok) {
        alert(parsed.message)
        return
      }
      const { cube: newCube } = parsed

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
