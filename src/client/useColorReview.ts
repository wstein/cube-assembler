import { useEffect, useState } from 'preact/hooks'
import type { OrientationSolution } from '../cube/cubeAssembly'
import { readyAssemblyAfterCapture } from './captureReviewRouting'
import { FACE_ORDER } from './captureSteps'
import type { FaceCaptureData } from './captureTypes'
import type { useCaptureSession } from './useCaptureSession'

type Session = ReturnType<typeof useCaptureSession>

interface ColorReviewOptions {
  capturedFaces: Session['capturedFaces']
  setCapturedFaces: Session['setCapturedFaces']
  confirmReview: (ready: OrientationSolution) => void
}

// The sticker color review after all six faces are in: whether it shows,
// which step and sticker it is on, and fixing one sticker's color. A
// capture that needs no review goes straight on to assembly.
export function useColorReview({
  capturedFaces,
  setCapturedFaces,
  confirmReview,
}: ColorReviewOptions) {
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [reviewStep, setReviewStep] = useState(0)
  const [reviewEditingCell, setReviewEditingCell] = useState<{
    face: string
    row: number
    col: number
  } | null>(null)
  const [reviewRouting, routeReview] = useState<{
    faces: Record<string, FaceCaptureData>
    glare: string[]
    mixedUp: string[]
  } | null>(null)

  const handleFixCellColor = (
    face: string,
    row: number,
    col: number,
    newColor: string,
  ) => {
    setCapturedFaces((prev) => {
      const faceData = prev[face]
      if (!faceData) return prev

      const newColors = faceData.colors.map((r) => [...r])
      newColors[row][col] = newColor

      // Detection's confidence and lookalike stay as measured (saved with
      // fixtures); the review hides them while the sticker differs from
      // what detection saw, and shows them again if it's set back.
      return {
        ...prev,
        [face]: { ...faceData, colors: newColors },
      }
    })
    setReviewEditingCell(null)
  }

  // Routes once the faces it was asked about are the captured ones.
  useEffect(() => {
    if (!reviewRouting || capturedFaces !== reviewRouting.faces) return
    routeReview(null)
    const showColorReview = () => {
      setReviewStep(0)
      setShowReviewDialog(true)
    }
    const ready = readyAssemblyAfterCapture(
      capturedFaces,
      FACE_ORDER,
      reviewRouting.glare,
      reviewRouting.mixedUp,
    )
    if (!ready) {
      showColorReview()
      return
    }
    confirmReview(ready)
  }, [reviewRouting, capturedFaces])

  return {
    showReviewDialog,
    setShowReviewDialog,
    reviewStep,
    setReviewStep,
    reviewEditingCell,
    setReviewEditingCell,
    routeReview,
    handleFixCellColor,
  }
}
