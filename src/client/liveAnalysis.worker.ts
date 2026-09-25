// Runs the capture dialog's live analysis (analyzeLiveFrame) off the page's
// thread. Each full-resolution camera frame is scaled down here, not on
// the page (a resized createImageBitmap cost ~13 ms of the page's time per
// frame), analyzed, and handed back with its result - so the page can
// capture from exactly the frame the detection judged.

import { analyzeLiveFrame, type LiveAnalysis, type LiveAnalysisRequest } from './liveAnalysis'

export interface LiveFrameMessage {
  id: number
  frame: ImageBitmap
  // The frame is analyzed at most this tall.
  maxHeight: number
  request: LiveAnalysisRequest
}

// `frame` is the same bitmap that was sent; `scale` is the analyzed size
// over the frame's.
export type LiveResultMessage =
  | { id: number; frame: ImageBitmap; scale: number; result: LiveAnalysis }
  | { id: number; frame: ImageBitmap; error: string }

let canvas: OffscreenCanvas | null = null

self.onmessage = (event: MessageEvent<LiveFrameMessage>) => {
  const { id, frame, maxHeight, request } = event.data
  let message: LiveResultMessage
  try {
    const scale = Math.min(1, maxHeight / frame.height)
    const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale)
    if (!canvas || canvas.width !== width || canvas.height !== height) canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('No 2D context in the worker')
    ctx.drawImage(frame, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    message = { id, frame, scale, result: analyzeLiveFrame(data, width, height, request) }
  } catch (error) {
    message = { id, frame, error: error instanceof Error ? error.message : String(error) }
  }
  self.postMessage(message, [frame])
}
