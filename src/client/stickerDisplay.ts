import {
  colorOrder,
  confidenceTier as confidenceTierRes,
} from '../core/capture/CaptureSteps.gen'

// How each color is drawn on screen (nets, review, picker) - slightly
// calmer than pure RGB so the six still read at a glance without glaring.
// Display only: detection never compares against these.
// Readable names for parity.ts's checks (unknown ones show as-is).
export const STICKER_HEX: Record<string, string> = {
  W: '#f7f6f1',
  O: '#ff7a1a',
  G: '#1e9e57',
  R: '#cf2a3a',
  B: '#2459d6',
  Y: '#f2d21b',
}

export const COLOR_NAME: Record<string, string> = {
  W: 'White',
  O: 'Orange',
  G: 'Green',
  R: 'Red',
  B: 'Blue',
  Y: 'Yellow',
}

export function confidenceTier(c: number): 'high' | 'medium' | 'low' {
  return confidenceTierRes(c)
}

export const COLOR_ORDER: string[] = colorOrder
