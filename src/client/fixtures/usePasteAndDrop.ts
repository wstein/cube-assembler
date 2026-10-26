import { useEffect, useRef } from 'preact/hooks'

interface PasteAndDropOptions {
  // Off while a dialog or a capture is under way.
  enabled: boolean
  // Files pasted or dropped on the page: photos, a net picture, a fixture ZIP
  // or meta.json.
  onFiles: (files: File[]) => void
  // Text pasted outside a field (facelets, an Orbit64 token).
  onText: (text: string) => void
}

// Browsers hand out a new File object for each way of asking, so the same
// file is told by what it says about itself.
const sameFile = (a: File, b: File) =>
  a === b ||
  (a.name === b.name &&
    a.size === b.size &&
    a.type === b.type &&
    a.lastModified === b.lastModified)

// The files on the clipboard: those it lists and any file it only offers as an
// item - a copied screenshot or image arrives that way in some browsers.
export function clipboardFiles(data: {
  files: ArrayLike<File>
  items: ArrayLike<{ kind: string; getAsFile: () => File | null }>
}): File[] {
  const files = Array.from(data.files)
  for (const item of Array.from(data.items)) {
    const file = item.kind === 'file' ? item.getAsFile() : null
    if (file && !files.some((known) => sameFile(known, file))) files.push(file)
  }
  return files
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement)

// Paste (Ctrl/Cmd+V) and drag-and-drop onto the page, taking the same files
// as the Upload files button. A paste into a field stays the field's own.
export function usePasteAndDrop(options: PasteAndDropOptions) {
  const ref = useRef(options)
  ref.current = options

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!ref.current.enabled || isEditable(event.target)) return
      const files = event.clipboardData
        ? clipboardFiles(event.clipboardData)
        : []
      if (files.length > 0) {
        event.preventDefault()
        ref.current.onFiles(files)
        return
      }
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (text.trim()) ref.current.onText(text)
    }
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const onDragOver = (event: DragEvent) => {
      if (ref.current.enabled && hasFiles(event)) event.preventDefault()
    }
    const onDrop = (event: DragEvent) => {
      if (!ref.current.enabled || !hasFiles(event)) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) ref.current.onFiles(files)
    }
    document.addEventListener('paste', onPaste)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [])
}
