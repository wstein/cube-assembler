// Load a photo into a canvas once, then let the caller use its pixels.
export function loadPhotoPixels(
  src: string,
  onLoad: (
    pixels: ImageData,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
  ) => void,
): () => void {
  let active = true
  const image = new Image()
  image.onload = () => {
    if (!active) return
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context || !canvas.width || !canvas.height) return
    context.drawImage(image, 0, 0)
    onLoad(
      context.getImageData(0, 0, canvas.width, canvas.height),
      canvas,
      context,
    )
  }
  image.src = src
  return () => {
    active = false
    image.onload = null
  }
}
