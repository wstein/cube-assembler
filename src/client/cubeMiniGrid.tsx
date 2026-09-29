// Mini cube sampling grids and the last photo's outer-cell measurement.
import { useEffect, useState } from 'preact/hooks'
import { cellEdges, estimateOuterCellRatio } from './gridAlignment'
import { sampledSquares as sampledSquaresOf } from './cubeProfileReview'

export interface ReviewPhoto {
  size: number
  // The aligned face crop of the last capture (a data URL).
  src: string
  label: string
}

// The sampled square of every cell: `core` of the cell, centered.
export const sampledSquares = (size: number, core: number, outer = 1) =>
  sampledSquaresOf(size, core, outer)

export function MiniGrid({
  size,
  core,
  class: cls = 'cube-review-mini',
}: {
  size: number
  core: number
  class?: string
}) {
  const inner = cellEdges(size).slice(1, -1)
  return (
    <svg class={cls} viewBox="0 0 100 100" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="99"
        height="99"
        rx="4"
        fill="var(--color-bg-primary)"
        stroke="var(--color-border)"
      />
      <g stroke="var(--color-border)">
        {inner.map((t) => (
          <g key={t}>
            <line x1={t * 100} y1="0" x2={t * 100} y2="100" />
            <line x1="0" y1={t * 100} x2="100" y2={t * 100} />
          </g>
        ))}
      </g>
      <g fill="var(--color-accent)" opacity="0.75">
        {sampledSquares(size, core).map((s, i) => (
          <rect
            key={i}
            x={s.x * 100}
            y={s.y * 100}
            width={s.w * 100}
            height={s.h * 100}
            rx="1"
          />
        ))}
      </g>
    </svg>
  )
}

// The photo's outer-cell ratio, measured the way the scanner does (5x5 and
// up have wider outer cubies); 1 until the photo has loaded.
export function useOuterRatio(photo: ReviewPhoto | null): number {
  const [outer, setOuter] = useState(1)
  useEffect(() => {
    setOuter(1)
    if (!photo) return
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width || !canvas.height) return
      ctx.drawImage(image, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setOuter(
        estimateOuterCellRatio(data, canvas.width, canvas.height, photo.size),
      )
    }
    image.src = photo.src
    return () => {
      active = false
    }
  }, [photo?.src, photo?.size])
  return outer
}
