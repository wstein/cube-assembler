import { FaceGrid } from './captureNet'
import type { MiniNetItem } from './approvalPhotos'
import { PhotoOverlay } from './orientationPresentation'

// The faces captured so far as a small net, each face a button that shows
// its original photo while the pointer (or focus) is on it.
export function FaceNet({
  items,
  label,
  current,
  images,
  stickerColors,
  itemLabel,
  onSelect,
}: {
  items: MiniNetItem[]
  label: string
  // Capture slot to mark as the current one.
  current?: number
  // The photo of each capture slot.
  images: Array<string | undefined>
  stickerColors: Record<string, string>
  itemLabel: (item: MiniNetItem) => string
  // Without it the faces only show their photos.
  onSelect?: (slot: number) => void
}) {
  return (
    <div class="face-net" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          class={`face-net-face${onSelect ? '' : ' face-net-face-static'}`}
          style={{ gridArea: item.area }}
          aria-current={item.slot === current ? 'step' : undefined}
          aria-label={itemLabel(item)}
          title={itemLabel(item)}
          onClick={() => onSelect?.(item.slot)}
        >
          <FaceGrid
            colors={item.colors}
            stickerColors={stickerColors}
            undecided={!item.captured}
            current={item.slot === current}
          />
          <PhotoOverlay
            photo={{ image: images[item.slot], turns: item.turns }}
            label={itemLabel(item)}
          />
        </button>
      ))}
    </div>
  )
}
