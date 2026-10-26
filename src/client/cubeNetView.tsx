import { useState } from 'preact/hooks'
import type { CubeState } from '../cube/cubeAssembly'
import type { ParityResult } from '../cube/parity'
import { miniNet, netCells } from './capture/approvalPhotos'
import { stickerMark } from './capture/captureSteps'
import { diagonalSplit } from './capture/stickerSplit'
import { forcedReading, forcedSentence } from './capture/forcedStickers'
import type { FaceCaptureData } from './capture/captureTypes'
import { faceSources, pieceKey, sourceIndex } from './netPresentation'

interface CubeNetViewProps {
  cube: CubeState
  size: number
  parity: ParityResult | null
  capturedFaces: Record<string, FaceCaptureData>
  faceOrder: readonly string[]
  stickerColors: Record<string, string>
  colorNames: Record<string, string>
  // Opens the color edit dialog on a marked sticker of a captured face.
  onEditSticker?: (
    face: string,
    row: number,
    col: number,
    turns: number,
  ) => void
}

// Face names shown on the net, keyed by CubeIR face.
const NET_FACE_NAMES: Record<string, string> = {
  u: 'Top',
  l: 'Left',
  f: 'Front',
  r: 'Right',
  b: 'Back',
  d: 'Bottom',
}

// The review mark for sticker `index` (row-major) of a captured face: hand
// corrected, or flagged as unsure (low confidence or close to another color).
function netStickerMark(
  face: {
    colors: string[][]
    detectedColors?: string[][]
    cellConfidences?: number[][]
    cellLookalikes?: (string | null)[][]
  },
  index: number,
): 'corrected' | 'flagged' | null {
  const n = face.colors.length,
    r = Math.floor(index / n),
    c = index % n
  return stickerMark(
    face.detectedColors?.[r]?.[c],
    face.colors[r]?.[c],
    face.cellConfidences?.[r]?.[c] ?? 1,
    face.cellLookalikes?.[r]?.[c],
  )
}

export function CubeNetView({
  cube: visibleCube,
  size: puzzleSize,
  parity,
  capturedFaces,
  faceOrder,
  stickerColors,
  colorNames,
  onEditSticker,
}: CubeNetViewProps) {
  const [hoveredHighlightGroup, setHoveredHighlightGroup] = useState<
    string | null
  >(null)
  const [hoveredNetCell, setHoveredNetCell] = useState<{
    face: string
    index: number
  } | null>(null)
  // parity.highlight (see parity.ts's HighlightGroup) is a
  // list of readings, each with its own `group` tag (the color
  // combination or matched piece name it read as) and the facelets
  // backing it. Multiple entries can share a `group` - e.g. every
  // wing that matched an over-represented pair - which is exactly
  // the set to cross-highlight on hover, since they're the
  // candidates for "which of these is actually the misread one".
  // When the equal color share moved enough stickers to hide a misread
  // (see forcedReading), those are the stickers to look at instead.
  const reading = forcedReading(capturedFaces, [...faceOrder])
  const slotCells = reading.warn
    ? netCells(miniNet(capturedFaces, [...faceOrder], puzzleSize), puzzleSize)
    : null
  const forcedFacelets: { face: string; index: number }[] = []
  if (slotCells) {
    faceOrder.forEach((key, slot) => {
      reading.faces[key]?.forced.forEach((row, r) =>
        row.forEach((forced, c) => {
          const cell = slotCells[slot]?.[r * puzzleSize + c]
          if (forced && cell)
            forcedFacelets.push({
              face: cell.face.toLowerCase(),
              index: cell.row * puzzleSize + cell.col,
            })
        }),
      )
    })
  }
  const forcedNote =
    forcedFacelets.length > 0
      ? forcedSentence(reading.result.forced, colorNames)
      : ''
  const highlightGroups: Array<{
    group: string
    facelets: { face: string; index: number }[]
  }> =
    forcedFacelets.length > 0
      ? [{ group: 'moved', facelets: forcedFacelets }]
      : (parity?.highlight ?? [])
  const totalHighlighted = highlightGroups.reduce(
    (n, g) => n + g.facelets.length,
    0,
  )
  const groupAt = (face: string, index: number): string | undefined =>
    highlightGroups.find((g) =>
      g.facelets.some((f) => f.face === face && f.index === index),
    )?.group
  // Which photo each net face shows, for its review marks and preview.
  const rows = (flat: string[]) =>
    Array.from({ length: puzzleSize }, (_, r) =>
      flat.slice(r * puzzleSize, (r + 1) * puzzleSize),
    )
  const netSources = faceSources(
    {
      u: rows(visibleCube.u),
      r: rows(visibleCube.r),
      f: rows(visibleCube.f),
      d: rows(visibleCube.d),
      l: rows(visibleCube.l),
      b: rows(visibleCube.b),
    },
    Object.fromEntries(
      faceOrder
        .filter((f) => capturedFaces[f])
        .map((f) => [f, capturedFaces[f].colors]),
    ),
  )
  const hoveredPiece = hoveredNetCell
    ? pieceKey(puzzleSize, hoveredNetCell.face, hoveredNetCell.index)
    : null
  const hoveredInfo = (() => {
    if (!hoveredNetCell || !hoveredPiece) return null
    const members = (['u', 'r', 'f', 'd', 'l', 'b'] as const).filter((face) =>
      Array.from({ length: puzzleSize * puzzleSize }, (_, i) => i).some(
        (i) => pieceKey(puzzleSize, face, i) === hoveredPiece,
      ),
    ).length
    const source = netSources[hoveredNetCell.face]
    const photo = source ? capturedFaces[source.slot] : undefined
    const index = source
      ? sourceIndex(puzzleSize, source.turns, hoveredNetCell.index)
      : -1
    const mark = photo ? netStickerMark(photo, index) : null
    const r = Math.floor(index / puzzleSize),
      c = index % puzzleSize
    const detected = photo?.detectedColors?.[r]?.[c]
    const first = source ? reading.faces[source.slot]?.guess[r]?.[c] : undefined
    const color = visibleCube[hoveredNetCell.face as keyof CubeState][
      hoveredNetCell.index
    ] as string
    return {
      faceName: NET_FACE_NAMES[hoveredNetCell.face],
      pieceName:
        members === 3
          ? 'corner piece'
          : members === 2
            ? 'edge piece'
            : 'center piece',
      photo: photo?.croppedImage,
      turns: source?.turns ?? 0,
      note:
        first && photo && first !== photo.colors[r]?.[c]
          ? `First guess ${colorNames[first] ?? first}, moved to ${colorNames[color] ?? color}.`
          : mark === 'corrected'
            ? `Detected ${colorNames[detected!] ?? detected}, you changed it to ${colorNames[color] ?? color}.`
            : mark === 'flagged'
              ? 'Detection was unsure about this sticker.'
              : null,
    }
  })()
  return (
    <div class="net-region">
      {forcedNote && (
        <p class="net-highlight-note">
          ⚠ {forcedNote} Those stickers are outlined below.
        </p>
      )}
      {!forcedNote && totalHighlighted > 0 && (
        <p class="net-highlight-note">
          ⚠ {totalHighlighted} sticker
          {totalHighlighted === 1 ? '' : 's'} outlined below may be involved in
          the problem above. Hover one to see which others share its color
          reading.
        </p>
      )}
      <div
        class="cube-net"
        style={{
          '--net-gap':
            puzzleSize >= 6 ? '1px' : puzzleSize >= 4 ? '2px' : '3px',
        }}
        onMouseLeave={() => {
          setHoveredNetCell(null)
          setHoveredHighlightGroup(null)
        }}
      >
        {(
          [
            ['U', visibleCube.u, 'net-u'],
            ['L', visibleCube.l, 'net-l'],
            ['F', visibleCube.f, 'net-f'],
            ['R', visibleCube.r, 'net-r'],
            ['B', visibleCube.b, 'net-b'],
            ['D', visibleCube.d, 'net-d'],
          ] as [string, string[], string][]
        ).map(([label, data, cls]) => {
          // Faces are named by their lowercase CubeIR key ('u','r',...)
          // in parity.highlight, matching `cube`'s own keys - `label`
          // here is only the uppercase display letter used for the
          // net-u/net-l/... CSS class.
          const faceKey = label.toLowerCase()
          const source = netSources[faceKey]
          const photo = source ? capturedFaces[source.slot] : undefined
          return (
            <div class={`net-face ${cls}`} key={label}>
              <div class="net-face-label">{NET_FACE_NAMES[faceKey]}</div>
              <div
                class="net-face-grid"
                style={{
                  gridTemplateColumns: `repeat(${puzzleSize}, 1fr)`,
                }}
              >
                {data.map((color, i) => {
                  const group = groupAt(faceKey, i)
                  const isHoverRelated =
                    group !== undefined && group === hoveredHighlightGroup
                  const samePiece =
                    hoveredPiece !== null &&
                    pieceKey(puzzleSize, faceKey, i) === hoveredPiece
                  const mark =
                    photo && source
                      ? netStickerMark(
                          photo,
                          sourceIndex(puzzleSize, source.turns, i),
                        )
                      : null
                  const index = source
                    ? sourceIndex(puzzleSize, source.turns, i)
                    : -1
                  const r = Math.floor(index / puzzleSize)
                  const c = index % puzzleSize
                  // What the sticker read as on its own, when the equal color
                  // share moved it to another color.
                  const first = source
                    ? reading.faces[source.slot]?.guess[r]?.[c]
                    : undefined
                  const moved =
                    first !== undefined &&
                    photo !== undefined &&
                    first !== photo.colors[r]?.[c]
                  const lookalike = photo?.cellLookalikes?.[r]?.[c]
                  // A marked or moved sticker links to the color edit dialog.
                  const editable =
                    onEditSticker !== undefined && (mark !== null || moved)
                  return (
                    <div
                      class={`net-cell ${group !== undefined ? 'net-cell-highlighted' : ''} ${isHoverRelated ? 'net-cell-hover-related' : ''} ${samePiece ? 'net-cell-piece' : ''}`}
                      key={i}
                      style={{
                        background: moved
                          ? diagonalSplit(
                              stickerColors[color] || '#888',
                              stickerColors[first] || '#888',
                            )
                          : stickerColors[color] || '#888',
                      }}
                      onMouseEnter={() => {
                        setHoveredNetCell({
                          face: faceKey,
                          index: i,
                        })
                        setHoveredHighlightGroup(group ?? null)
                      }}
                    >
                      {(mark === 'corrected' || editable) && (
                        <span
                          class="net-cell-mark corrected"
                          aria-hidden="true"
                        >
                          ✎
                        </span>
                      )}
                      {mark === 'flagged' && (
                        <span
                          class="net-cell-mark flagged"
                          aria-hidden="true"
                          style={
                            lookalike
                              ? { '--look-alike': stickerColors[lookalike] }
                              : undefined
                          }
                        />
                      )}
                      {editable && source && onEditSticker && (
                        <button
                          type="button"
                          class="net-cell-edit"
                          aria-label="Edit this sticker"
                          title="Edit this sticker"
                          onClick={() =>
                            onEditSticker(source.slot, r, c, source.turns)
                          }
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div class="net-info" aria-live="polite">
          {hoveredInfo ? (
            <>
              {hoveredInfo.photo && (
                <img
                  class="net-info-photo"
                  src={hoveredInfo.photo}
                  alt={`Photo of the ${hoveredInfo.faceName} face`}
                  style={{
                    transform: `rotate(${hoveredInfo.turns * 90}deg)`,
                  }}
                />
              )}
              <p>
                <strong>{hoveredInfo.faceName}</strong> ·{' '}
                {hoveredInfo.pieceName}
              </p>
              {hoveredInfo.note && (
                <p class="net-info-note">{hoveredInfo.note}</p>
              )}
            </>
          ) : (
            <p class="net-info-hint">
              Point at a sticker to see its whole piece and the photo it came
              from.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
