// Mirror mode's view of the face on the far side of the cube: typed entry
// point for src/core/capture/CapturePresentation.res.
import { oppositeFacePreview as oppositeFacePreviewRes } from '../core/capture/CapturePresentation.gen'

// A captured opposite face, or only what the source's colors prove.
export function oppositeFacePreview(
  source: string[][],
  captured: Array<string[][] | undefined>,
): string[][] {
  return oppositeFacePreviewRes(source, captured)
}
