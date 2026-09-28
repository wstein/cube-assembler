import { useEffect, useRef, useState } from 'preact/hooks'
import '../../web/cube3d.css'
import { createShadowRenderer } from './cubeShadow'
import {
  clampZoom,
  gestureAfterPointerUp,
  gestureForPointerDown,
  gestureWhenSwipeTurnsNothing,
  pickCubeSurface,
  PRESS_SLOP_PX,
  blockLayer,
  facePlanePoint,
  layerIndex,
  pickSwipeLayer,
  pressLevel,
  releasedQuarterTurns,
  swipeLayerAngle,
  swipeMoveAxis,
  wholeCubeLayer,
  twoFingerLock,
  twoFingerMotion,
  wheelGesture,
  type CubeGesture,
  type TwoFingerLock,
  type CubeSurfaceHit,
  type CubeGestureCamera,
  type GestureAxis,
  type PressLevel,
  type SwipeLayer,
  type SwipeTuning,
} from './cubeGesture'
import { stepDragInertia } from './dragInertia'
import {
  MODE_CUE_GAIN,
  playModeCue,
  playTurnClick,
  scrambleDuration,
  settleDuration,
  turnClickGain,
  turnEase,
} from './turnFeel'
import {
  AUTO_ROTATE_COOKIE,
  STICKERLESS_COOKIE,
  preferenceCookie,
  readHoldTimings,
  readPreference,
  readScrambleOptions,
  readSwipeTuning,
  readTurnFeel,
  turnSoundOn,
  vibrationOn,
} from './preferences'
import type { CubeState, FaceKey } from '../cube/cubeAssembly'

import { buildCubeMesh } from './cubeMesh'
import {
  initProgram,
  mat4Create,
  mat4Multiply,
  mat4Perspective,
  mat4RotateX,
  mat4RotateY,
  mat4Translate,
} from './cubeView3DGraphics'
import {
  AUTO_ROTATE_RADIANS_PER_MS,
  AUTO_ROTATE_RESUME_DELAY_MS,
  DEFAULT_STICKER_HEX,
  applyCubeLayerMove,
  formatCubeTurn,
  generateScrambleMoves,
  getDefaultZoom,
  recordTurn,
  type CubeTurn,
  type Point,
} from './cubeView3DState'
export * from './cubeMesh'
export * from './cubeView3DGraphics'
export * from './cubeView3DState'

export interface CubeView3DProps {
  cube: CubeState
  initialCube?: CubeState
  initialMoves?: CubeTurn[]
  onTurnStateChange?: (cube: CubeState, moves: CubeTurn[]) => void
  puzzleSize: number
  palette?: Record<string, string>
  stickerless?: boolean
  onClose?: () => void
}

export function CubeView3D({
  cube,
  initialCube = cube,
  initialMoves = [],
  onTurnStateChange,
  puzzleSize,
  palette = DEFAULT_STICKER_HEX,
  stickerless = true,
}: CubeView3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [currentCube, setCurrentCube] = useState<CubeState>(initialCube)
  const [moves, setMoves] = useState<CubeTurn[]>(initialMoves)
  const [pitch, setPitch] = useState<number>(0.42) // ~24 deg
  const [yaw, setYaw] = useState<number>(-0.62) // ~-35 deg
  const [zoom, setZoom] = useState<number>(getDefaultZoom(puzzleSize))
  const [isRotating, setIsRotating] = useState<boolean>(() =>
    readPreference(document.cookie, AUTO_ROTATE_COOKIE),
  )
  const [isSupported, setIsSupported] = useState<boolean>(true)
  const [isStickerless, setIsStickerless] = useState<boolean>(() =>
    readPreference(document.cookie, STICKERLESS_COOKIE, stickerless),
  )
  const [isScrambling, setIsScrambling] = useState<boolean>(false)
  const [isTurning, setIsTurning] = useState(false)

  const currentCubeRef = useRef<CubeState>(initialCube)
  currentCubeRef.current = currentCube
  const movesRef = useRef(initialMoves)
  movesRef.current = moves
  const onTurnStateChangeRef = useRef(onTurnStateChange)
  onTurnStateChangeRef.current = onTurnStateChange
  const sourceCubeRef = useRef(cube)

  useEffect(() => {
    if (sourceCubeRef.current === cube) return
    sourceCubeRef.current = cube
    setCurrentCube(cube)
    currentCubeRef.current = cube
    movesRef.current = []
    setMoves([])
    turnQueueRef.current = []
    currentTurnRef.current = null
    dragTurnRef.current = null
    setIsScrambling(false)
    setIsTurning(false)
    forceUpdateMeshRef.current = true
  }, [cube])

  const turnQueueRef = useRef<
    Array<{
      face: FaceKey
      depth?: number
      width?: number
      turns: number
      from?: number
      duration?: number
      undo?: boolean
    }>
  >([])
  const currentTurnRef = useRef<{
    face: FaceKey
    depth?: number
    width?: number
    turns: number
    // A released drag settles from where the finger left the layer.
    from?: number
    startTime: number
    duration: number
    // Whether it snaps a little past like a magnetic cube.
    overshoot: boolean
    undo?: boolean
  } | null>(null)
  // The layer a sticker drag is turning, following the finger until release.
  const dragTurnRef = useRef<{
    layer: SwipeLayer
    angle: number
    velocity: number
    time: number
    // Lights up the grabbed layers of a block or whole-cube turn.
    highlight?: boolean
    // What the mesh last showed, so it is rebuilt only when that changes.
    drawn: string | null
  } | null>(null)
  const forceUpdateMeshRef = useRef(false)

  useEffect(() => {
    document.cookie = preferenceCookie(AUTO_ROTATE_COOKIE, isRotating)
  }, [isRotating])
  useEffect(() => {
    document.cookie = preferenceCookie(STICKERLESS_COOKIE, isStickerless)
  }, [isStickerless])

  const isDraggingRef = useRef(false)
  const gestureRef = useRef<{
    x: number
    y: number
    hit: CubeSurfaceHit | null
    mode: CubeGesture
    pointerType: string
    // What a held sticker turns: its layer, a block of layers, the cube.
    level: PressLevel
    holdTimer?: ReturnType<typeof setTimeout>
    // A block being picked: the layers from `from` to `to` along `axis`,
    // and where the finger was when it last moved across them.
    block?: { axis: GestureAxis; from: number; to: number; anchor: Point }
    // How eager swipes are, as set on the settings page.
    tuning: SwipeTuning
    // Where the turn's angle is measured from once dragging turns layers.
    turnHit?: CubeSurfaceHit
    turnFrom?: Point
  } | null>(null)
  // Shown while a held sticker turns a block or the whole cube.
  const [pressMode, setPressMode] = useState<PressLevel | null>(null)
  // Fingers on the canvas, and where the two tilting fingers were last.
  const touchesRef = useRef(new Map<number, [number, number]>())
  const tiltFromRef = useRef<[[number, number], [number, number]] | null>(null)
  // Where two fingers landed (spread and midpoint), and whether the gesture
  // has locked to tilting or pinching.
  const pinchRef = useRef<{
    start: number
    midpoint: [number, number]
    lock: TwoFingerLock
  }>({ start: 0, midpoint: [0, 0], lock: 'undecided' })
  const [coarsePointer] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  )
  const resumeAutoAtRef = useRef(0)
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 })
  const inertiaRef = useRef({ yaw: 0, pitch: 0 })
  const lastFrameTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Keep state accessible to render loop
  const stateRef = useRef({ pitch, yaw, zoom, isRotating })
  stateRef.current = { pitch, yaw, zoom, isRotating }

  // Auto-scale zoom when puzzleSize changes
  useEffect(() => {
    setZoom(getDefaultZoom(puzzleSize))
  }, [puzzleSize])

  const pauseAutoRotation = () => {
    inertiaRef.current = { yaw: 0, pitch: 0 }
    resumeAutoAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS
  }

  // The isometric view, from the front corner or the opposite back one.
  const resetView = (back = false) => {
    pauseAutoRotation()
    setPitch(back ? -0.42 : 0.42)
    setYaw(-0.62 + (back ? Math.PI : 0))
    setZoom(getDefaultZoom(puzzleSize))
  }

  // Preset face views
  const setPreset = (targetPitch: number, targetYaw: number) => {
    pauseAutoRotation()
    setPitch(targetPitch)
    setYaw(targetYaw)
  }

  const triggerTurn = (
    face: FaceKey,
    turns: number,
    depth = 1,
    undo = false,
    width = 1,
  ) => {
    pauseAutoRotation()
    turnQueueRef.current.push({
      face,
      depth,
      width,
      turns,
      duration: readTurnFeel(document.cookie).turnMs,
      undo,
    })
    setIsTurning(true)
  }

  const toggleScramble = () => {
    pauseAutoRotation()
    if (isScrambling) {
      turnQueueRef.current = []
      setIsScrambling(false)
      if (!currentTurnRef.current) setIsTurning(false)
    } else {
      setIsScrambling(true)
      setIsTurning(true)
      const moves = generateScrambleMoves(
        puzzleSize,
        readScrambleOptions(document.cookie),
      )
      const duration = scrambleDuration(readTurnFeel(document.cookie).turnMs)
      turnQueueRef.current = moves.map((m) => ({ ...m, duration }))
    }
  }

  const resetCube = () => {
    turnQueueRef.current = []
    currentTurnRef.current = null
    dragTurnRef.current = null
    setIsScrambling(false)
    setIsTurning(false)
    currentCubeRef.current = cube
    setCurrentCube(cube)
    movesRef.current = []
    setMoves([])
    onTurnStateChangeRef.current?.(cube, [])
    forceUpdateMeshRef.current = true
  }

  const undoLastTurn = () => {
    if (isTurning) return
    const last = movesRef.current.at(-1)
    if (last)
      triggerTurn(last.face, -last.turns, last.depth, true, last.width ?? 1)
  }

  const isInitialCube =
    currentCube === cube ||
    (['u', 'r', 'f', 'd', 'l', 'b'] as const).every((k) =>
      currentCube[k].every((v, i) => v === cube[k][i]),
    )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl =
      (canvas.getContext('webgl2', {
        antialias: true,
        alpha: true,
      }) as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl', {
        antialias: true,
        alpha: true,
      }) as WebGLRenderingContext | null)
    if (!gl) {
      setIsSupported(false)
      return
    }

    gl.getExtension('OES_element_index_uint')

    const program = initProgram(gl)
    if (!program) {
      setIsSupported(false)
      return
    }

    const shadow = createShadowRenderer(gl)
    // Shadow strength comes from the backdrop's CSS so it follows the theme.
    let shadowAlpha = 0.3
    const readShadowAlpha = () => {
      const value = Number.parseFloat(
        getComputedStyle(canvas).getPropertyValue('--cube-3d-shadow'),
      )
      shadowAlpha = Number.isFinite(value) ? value : 0.3
    }
    readShadowAlpha()
    const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)')
    colorScheme?.addEventListener('change', readShadowAlpha)

    gl.useProgram(program)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.clearColor(0, 0, 0, 0)

    // Build geometry
    const mesh = buildCubeMesh(
      currentCubeRef.current,
      puzzleSize,
      palette,
      isStickerless,
    )

    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW)

    const normBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW)

    const colBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.DYNAMIC_DRAW)

    const occlusionBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, occlusionBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.occlusion, gl.STATIC_DRAW)

    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(program, 'a_position')
    const aNorm = gl.getAttribLocation(program, 'a_normal')
    const aCol = gl.getAttribLocation(program, 'a_color')
    const aOcclusion = gl.getAttribLocation(program, 'a_occlusion')

    const uMvp = gl.getUniformLocation(program, 'u_mvp')
    const uModel = gl.getUniformLocation(program, 'u_model')
    const uLight1 = gl.getUniformLocation(program, 'u_lightDir1')
    const uLight2 = gl.getUniformLocation(program, 'u_lightDir2')
    const uCameraPos = gl.getUniformLocation(program, 'u_cameraPos')

    gl.uniform3f(uLight1, 1.5, 2.5, 2.0)
    gl.uniform3f(uLight2, -2.0, -1.0, -2.0)

    const render = (time: number) => {
      const elapsed = Math.min(time - (lastFrameTimeRef.current ?? time), 50)
      lastFrameTimeRef.current = time

      // Handle layer turn animation & mesh updates
      if (forceUpdateMeshRef.current) {
        forceUpdateMeshRef.current = false
        const updatedMesh = buildCubeMesh(
          currentCubeRef.current,
          puzzleSize,
          palette,
          isStickerless,
        )
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedMesh.positions)
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedMesh.normals)
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedMesh.colors)
      } else if (currentTurnRef.current) {
        const anim = currentTurnRef.current
        const turnElapsed = time - anim.startTime
        const progress = Math.min(1, Math.max(0, turnElapsed / anim.duration))
        const ease = turnEase(progress, anim.overshoot)
        const from = anim.from ?? 0
        const targetAngle = anim.turns * (Math.PI / 2)
        const currentAngle = from + ease * (targetAngle - from)

        const turnMesh = buildCubeMesh(
          currentCubeRef.current,
          puzzleSize,
          palette,
          isStickerless,
          {
            face: anim.face,
            depth: anim.depth,
            width: anim.width,
            angle: currentAngle,
          },
        )
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, turnMesh.positions)
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, turnMesh.normals)

        if (progress >= 1) {
          // A drag released short of a quarter turn springs back silently.
          if (anim.turns !== 0) {
            playTurnClick(
              turnClickGain(anim.duration, turnSoundOn(document.cookie)),
            )
            const nextCube = applyCubeLayerMove(
              currentCubeRef.current,
              puzzleSize,
              anim.face,
              anim.depth ?? 1,
              anim.turns,
              anim.width ?? 1,
            )
            currentCubeRef.current = nextCube
            setCurrentCube(nextCube)
            const nextMoves = anim.undo
              ? movesRef.current.slice(0, -1)
              : recordTurn(movesRef.current, {
                  face: anim.face,
                  depth: anim.depth ?? 1,
                  width: anim.width,
                  turns: anim.turns,
                })
            movesRef.current = nextMoves
            setMoves(nextMoves)
            onTurnStateChangeRef.current?.(nextCube, nextMoves)
          }

          const finalMesh = buildCubeMesh(
            currentCubeRef.current,
            puzzleSize,
            palette,
            isStickerless,
          )
          gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, finalMesh.positions)
          gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, finalMesh.normals)
          gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, finalMesh.colors)

          if (turnQueueRef.current.length > 0) {
            const next = turnQueueRef.current.shift()!
            currentTurnRef.current = {
              face: next.face,
              depth: next.depth,
              width: next.width,
              turns: next.turns,
              from: next.from,
              startTime: time,
              duration: next.duration ?? 90,
              overshoot: readTurnFeel(document.cookie).overshoot,
              undo: next.undo,
            }
          } else {
            currentTurnRef.current = null
            setIsScrambling(false)
            setIsTurning(false)
          }
        }
      } else if (dragTurnRef.current) {
        // Queued turns wait until the finger lets go of the layer.
        const drag = dragTurnRef.current
        const shown = `${drag.layer.face}${drag.layer.depth}/${drag.layer.width ?? 1}:${drag.angle}:${drag.highlight ? 1 : 0}`
        if (drag.drawn !== shown) {
          drag.drawn = shown
          const dragMesh = buildCubeMesh(
            currentCubeRef.current,
            puzzleSize,
            palette,
            isStickerless,
            {
              face: drag.layer.face,
              depth: drag.layer.depth,
              width: drag.layer.width,
              angle: drag.angle,
              highlight: drag.highlight,
            },
          )
          gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, dragMesh.positions)
          gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, dragMesh.normals)
          gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, dragMesh.colors)
        }
      } else if (turnQueueRef.current.length > 0) {
        const next = turnQueueRef.current.shift()!
        currentTurnRef.current = {
          face: next.face,
          depth: next.depth,
          width: next.width,
          turns: next.turns,
          from: next.from,
          startTime: time,
          duration: next.duration ?? 160,
          overshoot: readTurnFeel(document.cookie).overshoot,
          undo: next.undo,
        }
      }
      if (!isDraggingRef.current) {
        const yawStep = stepDragInertia(inertiaRef.current.yaw, elapsed)
        const pitchStep = stepDragInertia(inertiaRef.current.pitch, elapsed)
        inertiaRef.current = {
          yaw: yawStep.velocity,
          pitch: pitchStep.velocity,
        }
        if (yawStep.delta) setYaw((prev) => prev + yawStep.delta)
        if (pitchStep.delta) {
          setPitch((prev) =>
            Math.max(
              -Math.PI / 2 + 0.05,
              Math.min(Math.PI / 2 - 0.05, prev + pitchStep.delta),
            ),
          )
        }
      }
      if (
        stateRef.current.isRotating &&
        !isDraggingRef.current &&
        time >= resumeAutoAtRef.current &&
        inertiaRef.current.yaw === 0 &&
        inertiaRef.current.pitch === 0
      ) {
        setYaw((prev) => prev + elapsed * AUTO_ROTATE_RADIANS_PER_MS)
      }

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const width = Math.floor(rect.width * dpr)
      const height = Math.floor(rect.height * dpr)

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width || 400
        canvas.height = height || 400
        gl.viewport(0, 0, canvas.width, canvas.height)
      }

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      const aspect = canvas.width / (canvas.height || 1)
      const proj = mat4Perspective(
        mat4Create(),
        (45 * Math.PI) / 180,
        aspect,
        0.1,
        100.0,
      )

      // Camera view matrix: translation back by zoom
      const currentZoom = stateRef.current.zoom
      const view = mat4Translate(mat4Create(), mat4Create(), [
        0,
        0,
        -currentZoom,
      ])

      // Model matrix: pitch and yaw rotations
      const model = mat4Create()
      mat4RotateX(model, model, stateRef.current.pitch)
      mat4RotateY(model, model, stateRef.current.yaw)

      // MVP = Proj * View * Model
      const mvp = mat4Create()
      const viewProj = mat4Create()
      mat4Multiply(viewProj, proj, view)
      mat4Multiply(mvp, viewProj, model)

      shadow?.draw(
        viewProj,
        puzzleSize,
        stateRef.current.pitch,
        stateRef.current.yaw,
        shadowAlpha,
      )
      gl.useProgram(program)
      gl.uniformMatrix4fv(uMvp, false, mvp)
      gl.uniformMatrix4fv(uModel, false, model)
      gl.uniform3f(uCameraPos, 0, 0, currentZoom)

      // Bind attributes
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aPos)

      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aNorm)

      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aCol)

      gl.bindBuffer(gl.ARRAY_BUFFER, occlusionBuf)
      gl.vertexAttribPointer(aOcclusion, 1, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aOcclusion)

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
      const indexType =
        mesh.indices instanceof Uint32Array
          ? gl.UNSIGNED_INT
          : gl.UNSIGNED_SHORT
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, indexType, 0)

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      lastFrameTimeRef.current = null
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
      gl.deleteBuffer(posBuf)
      gl.deleteBuffer(normBuf)
      gl.deleteBuffer(colBuf)
      gl.deleteBuffer(occlusionBuf)
      gl.deleteBuffer(idxBuf)
      gl.deleteProgram(program)
      shadow?.dispose()
      colorScheme?.removeEventListener('change', readShadowAlpha)
    }
  }, [cube, puzzleSize, palette, isStickerless])

  const spreadOf = ([a, b]: [[number, number], [number, number]]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1])
  const midpointOf = ([a, b]: [[number, number], [number, number]]): [
    number,
    number,
  ] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

  const startTilt = () => {
    const touches = twoTouches()
    tiltFromRef.current = touches
    pinchRef.current = {
      start: touches ? spreadOf(touches) : 0,
      midpoint: touches ? midpointOf(touches) : [0, 0],
      lock: 'undecided',
    }
  }

  const twoTouches = (): [[number, number], [number, number]] | null => {
    const points = [...touchesRef.current.values()]
    return points.length >= 2 ? [points[0], points[1]] : null
  }

  const rotateView = (dx: number, dy: number, timeStamp: number) => {
    const elapsed = Math.max(timeStamp - lastPointerRef.current.time, 8)
    lastPointerRef.current = {
      x: lastPointerRef.current.x + dx,
      y: lastPointerRef.current.y + dy,
      time: timeStamp,
    }
    const speed = 0.008
    inertiaRef.current = {
      yaw: Math.max(-0.006, Math.min(0.006, (dx * speed) / elapsed)),
      pitch: Math.max(-0.006, Math.min(0.006, (dy * speed) / elapsed)),
    }
    setYaw((prev) => prev + dx * speed)
    setPitch((prev) => {
      const next = prev + dy * speed
      const limit = Math.PI / 2 - 0.05
      return Math.max(-limit, Math.min(limit, next))
    })
  }

  const gestureCamera = (rect: DOMRect): CubeGestureCamera => ({
    width: rect.width,
    height: rect.height,
    zoom: stateRef.current.zoom,
    pitch: stateRef.current.pitch,
    yaw: stateRef.current.yaw,
    size: puzzleSize,
  })

  const clearHold = () => {
    const gesture = gestureRef.current
    if (gesture?.holdTimer) clearTimeout(gesture.holdTimer)
    if (gesture) gesture.holdTimer = undefined
  }

  // Shows, sounds and (on phones) buzzes that a held sticker or a modifier
  // key now turns a block of layers or the whole cube.
  const announcePressMode = (level: 'block' | 'cube') => {
    setPressMode(level)
    const cookies = document.cookie
    playModeCue(level, turnSoundOn(cookies) ? MODE_CUE_GAIN : 0)
    try {
      if (vibrationOn(cookies)) navigator.vibrate?.(level === 'cube' ? 20 : 10)
    } catch {
      // Vibration is only a hint.
    }
  }

  // Holding the sticker still widens what it turns: a block of layers, then
  // the whole cube, after the times saved on the settings page.
  const holdSticker = (gesture: NonNullable<typeof gestureRef.current>) => {
    const { blockMs, cubeMs } = readHoldTimings(document.cookie)
    const upgrade = (level: 'block' | 'cube', next?: () => void) => {
      if (gestureRef.current !== gesture || gesture.mode !== 'pending') return
      if (gesture.block) return
      gesture.level = level
      announcePressMode(level)
      next?.()
    }
    gesture.holdTimer = setTimeout(
      () =>
        upgrade('block', () => {
          gesture.holdTimer = setTimeout(
            () => upgrade('cube'),
            cubeMs - blockMs,
          )
        }),
      blockMs,
    )
  }

  // From here the layers follow the finger until release.
  const startDragTurn = (
    gesture: NonNullable<typeof gestureRef.current>,
    layer: SwipeLayer,
    from: Point,
    hit: CubeSurfaceHit,
    e: PointerEvent,
    camera: CubeGestureCamera,
  ) => {
    clearHold()
    gesture.mode = 'turn'
    gesture.turnHit = hit
    gesture.turnFrom = from
    dragTurnRef.current = {
      layer,
      angle: swipeLayerAngle(
        hit,
        layer,
        e.clientX - from[0],
        e.clientY - from[1],
        camera,
      ),
      velocity: 0,
      time: e.timeStamp,
      highlight: gesture.level !== 'layer',
      drawn: null,
    }
    setIsTurning(true)
  }

  // Picking a block: the first clear move across layers chooses the axis,
  // later moves stretch the block to the layer under the finger, and a move
  // the other way starts turning it.
  const pickBlock = (
    gesture: NonNullable<typeof gestureRef.current>,
    hit: CubeSurfaceHit,
    e: PointerEvent,
    rect: DOMRect,
    camera: CubeGestureCamera,
  ) => {
    const here: Point = [e.clientX, e.clientY]
    const onPlane = (point: Point) =>
      facePlanePoint(point[0] - rect.left, point[1] - rect.top, camera, hit)
    let block = gesture.block
    if (!block) {
      const axis = swipeMoveAxis(
        hit,
        e.clientX - gesture.x,
        e.clientY - gesture.y,
        camera,
        gesture.tuning.startPx,
      )
      if (axis === null) return
      const start = layerIndex(hit.point[axis], puzzleSize)
      block = { axis, from: start, to: start, anchor: here }
      gesture.block = block
    } else {
      const anchorPoint = onPlane(block.anchor)
      if (anchorPoint) {
        const anchorHit = { ...hit, point: anchorPoint }
        const move = pickSwipeLayer(
          anchorHit,
          e.clientX - block.anchor[0],
          e.clientY - block.anchor[1],
          camera,
          gesture.tuning.startPx,
        )
        if (move?.axis === block.axis) {
          startDragTurn(
            gesture,
            blockLayer(block.axis, block.from, block.to, puzzleSize),
            block.anchor,
            anchorHit,
            e,
            camera,
          )
          return
        }
        if (move) block.anchor = here
      }
    }
    const point = onPlane(here)
    if (point) block.to = layerIndex(point[block.axis], puzzleSize)
    // The picked layers light up until they start turning.
    dragTurnRef.current = {
      layer: blockLayer(block.axis, block.from, block.to, puzzleSize),
      angle: 0,
      velocity: 0,
      time: e.timeStamp,
      highlight: true,
      drawn: dragTurnRef.current?.drawn ?? null,
    }
    setIsTurning(true)
  }

  // Hands a released drag to the turn animation, which settles the layer on
  // whole quarter turns from where the finger left it.
  const settleDrag = (turns: number) => {
    const drag = dragTurnRef.current
    if (!drag) return
    dragTurnRef.current = null
    const quarter = Math.PI / 2
    const distance = Math.abs(turns * quarter - drag.angle) / quarter
    turnQueueRef.current.unshift({
      face: drag.layer.face,
      depth: drag.layer.depth,
      width: drag.layer.width,
      turns,
      from: drag.angle,
      duration: settleDuration(distance, readTurnFeel(document.cookie).turnMs),
    })
  }

  const handlePointerDown = (e: PointerEvent) => {
    const touch = e.pointerType === 'touch'
    if (touch) touchesRef.current.set(e.pointerId, [e.clientX, e.clientY])
    const touches = touch ? touchesRef.current.size : 1
    try {
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      // Capture is only a convenience; the gesture works without it.
    }
    isDraggingRef.current = true
    resumeAutoAtRef.current = Number.POSITIVE_INFINITY
    inertiaRef.current = { yaw: 0, pitch: 0 }
    if (touches > 1) {
      // A second finger switches to tilting, whatever the first one did.
      const gesture = gestureRef.current
      const mode = gestureForPointerDown(
        'touch',
        touches,
        null,
        gesture?.mode ?? null,
      )
      if (gesture) gesture.mode = mode
      if (mode === 'tilt') {
        // A second finger lets go of a dragged layer.
        clearHold()
        setPressMode(null)
        settleDrag(0)
        startTilt()
        lastPointerRef.current = {
          ...lastPointerRef.current,
          time: e.timeStamp,
        }
      }
      return
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY, time: e.timeStamp }
    const rect = canvasRef.current?.getBoundingClientRect()
    const hit =
      rect &&
      !currentTurnRef.current &&
      !dragTurnRef.current &&
      turnQueueRef.current.length === 0
        ? pickCubeSurface(
            e.clientX - rect.left,
            e.clientY - rect.top,
            gestureCamera(rect),
          )
        : null
    const level = pressLevel(0, e)
    const gesture: NonNullable<typeof gestureRef.current> = {
      x: e.clientX,
      y: e.clientY,
      hit,
      mode: gestureForPointerDown(e.pointerType, 1, hit, null),
      pointerType: e.pointerType,
      level,
      tuning: readSwipeTuning(document.cookie),
    }
    gestureRef.current = gesture
    if (gesture.mode !== 'pending') return
    if (level === 'layer') holdSticker(gesture)
    else announcePressMode(level)
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && touchesRef.current.has(e.pointerId))
      touchesRef.current.set(e.pointerId, [e.clientX, e.clientY])
    if (!isDraggingRef.current) return
    const gesture = gestureRef.current
    if (!gesture) return
    if (gesture.mode === 'tilt') {
      const from = tiltFromRef.current
      const to = twoTouches()
      if (!from || !to) return
      tiltFromRef.current = to
      const [mx, my] = midpointOf(to)
      const [sx, sy] = pinchRef.current.midpoint
      const lock = twoFingerLock(
        pinchRef.current.start,
        spreadOf(to),
        Math.hypot(mx - sx, my - sy),
        pinchRef.current.lock,
      )
      pinchRef.current.lock = lock
      // Undecided moves do nothing, so neither a tilt nor a pinch jumps once
      // it locks; after that only the locked one follows the fingers.
      const motion = twoFingerMotion(from, to)
      if (lock === 'tilt') rotateView(motion.dx, motion.dy, e.timeStamp)
      if (lock === 'pinch' && motion.scale !== 1)
        setZoom((prev) => clampZoom(prev / motion.scale, puzzleSize))
      return
    }
    if (gesture.mode === 'none') return
    if (gesture.mode === 'turn') {
      const drag = dragTurnRef.current
      const rect = canvasRef.current?.getBoundingClientRect()
      const hit = gesture.turnHit ?? gesture.hit
      const [fromX, fromY] = gesture.turnFrom ?? [gesture.x, gesture.y]
      if (!drag || !hit || !rect) return
      const angle = swipeLayerAngle(
        hit,
        drag.layer,
        e.clientX - fromX,
        e.clientY - fromY,
        gestureCamera(rect),
      )
      drag.velocity =
        (angle - drag.angle) / Math.max(e.timeStamp - drag.time, 8)
      drag.angle = angle
      drag.time = e.timeStamp
      return
    }
    if (gesture.mode === 'pending' && gesture.hit) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = e.clientX - gesture.x
      const dy = e.clientY - gesture.y
      const distance = Math.hypot(dx, dy)
      // Moving before the hold is up makes it a plain swipe.
      if (gesture.level === 'layer' && distance > PRESS_SLOP_PX) clearHold()
      const camera = gestureCamera(rect)
      if (gesture.level === 'block') {
        pickBlock(gesture, gesture.hit, e, rect, camera)
        return
      }
      if (distance < gesture.tuning.startPx) return
      const layer = pickSwipeLayer(
        gesture.hit,
        dx,
        dy,
        camera,
        gesture.tuning.startPx,
      )
      if (layer) {
        startDragTurn(
          gesture,
          gesture.level === 'cube'
            ? wholeCubeLayer(layer.axis, puzzleSize)
            : layer,
          [gesture.x, gesture.y],
          gesture.hit,
          e,
          camera,
        )
        return
      }
      gesture.mode = gestureWhenSwipeTurnsNothing(gesture.pointerType)
      if (gesture.mode !== 'camera') return
    }
    rotateView(
      e.clientX - lastPointerRef.current.x,
      e.clientY - lastPointerRef.current.y,
      e.timeStamp,
    )
  }

  const handlePointerUp = (e: PointerEvent) => {
    const touch = e.pointerType === 'touch'
    if (touch) touchesRef.current.delete(e.pointerId)
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Ignore if pointer capture release fails
    }
    const remaining = touch ? touchesRef.current.size : 0
    const next = gestureAfterPointerUp(
      remaining,
      gestureRef.current?.mode ?? null,
    )
    if (next !== null) {
      if (gestureRef.current) gestureRef.current.mode = next
      if (next === 'tilt') startTilt()
      else tiltFromRef.current = null
      return
    }
    isDraggingRef.current = false
    clearHold()
    setPressMode(null)
    // A block picked but never turned springs back.
    if (gestureRef.current?.mode === 'pending') settleDrag(0)
    const gesture = gestureRef.current
    if (gesture?.mode === 'turn') {
      inertiaRef.current = { yaw: 0, pitch: 0 }
      const drag = dragTurnRef.current
      if (drag) {
        // A finger that stopped before lifting throws nothing.
        const velocity = e.timeStamp - drag.time > 100 ? 0 : drag.velocity
        settleDrag(
          e.type === 'pointercancel'
            ? 0
            : releasedQuarterTurns(
                drag.angle,
                velocity,
                gesture.tuning.commitFraction,
                gesture.tuning.flickMs,
              ),
        )
      }
    }
    gestureRef.current = null
    tiltFromRef.current = null
    resumeAutoAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS
    if (
      e.type === 'pointercancel' ||
      e.timeStamp - lastPointerRef.current.time > 120
    ) {
      inertiaRef.current = { yaw: 0, pitch: 0 }
    }
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (wheelGesture(e) === 'tilt') {
      // Touchpads already coast their swipes, so add no inertia of our own.
      rotateView(-e.deltaX, -e.deltaY, e.timeStamp)
      pauseAutoRotation()
      return
    }
    // Pinch steps are small; mouse wheel notches are about 100.
    const zoomDelta = e.deltaY * (e.ctrlKey ? 0.05 : 0.01)
    setZoom((prev) => clampZoom(prev + zoomDelta, puzzleSize))
  }

  const limit = Math.PI / 2 - 0.05
  const step = 0.2

  const tiltUp = () => {
    pauseAutoRotation()
    setPitch((p) => Math.min(limit, p + step))
  }
  const tiltDown = () => {
    pauseAutoRotation()
    setPitch((p) => Math.max(-limit, p - step))
  }
  const rotateLeft = () => {
    pauseAutoRotation()
    setYaw((y) => y + step)
  }
  const rotateRight = () => {
    pauseAutoRotation()
    setYaw((y) => y - step)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        tiltUp()
        break
      case 'ArrowDown':
        e.preventDefault()
        tiltDown()
        break
      case 'ArrowLeft':
        e.preventDefault()
        rotateLeft()
        break
      case 'ArrowRight':
        e.preventDefault()
        rotateRight()
        break
      case 'u':
      case 'U':
        setPreset(Math.PI / 2 - 0.05, 0)
        break
      case 'd':
      case 'D':
        setPreset(-Math.PI / 2 + 0.05, 0)
        break
      case 'f':
      case 'F':
        setPreset(0, 0)
        break
      case 'b':
      case 'B':
        setPreset(0, Math.PI)
        break
      case 'l':
      case 'L':
        setPreset(0, Math.PI / 2)
        break
      case 'r':
      case 'R':
        setPreset(0, -Math.PI / 2)
        break
    }
  }

  return (
    <div class="cube-3d-container">
      {!isSupported ? (
        <div class="cube-3d-unsupported">
          <p>WebGL is not available in your browser.</p>
        </div>
      ) : (
        <>
          <div
            class="cube-3d-canvas-wrap"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="region"
            aria-label="3D Rubik's cube interactive canvas"
          >
            <canvas
              ref={canvasRef}
              class="cube-3d-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              // A held sticker must not open the long-press menu.
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleWheel}
              aria-label="Interactive 3D Rubik's Cube Viewer"
            />
            {pressMode && pressMode !== 'layer' && (
              <div class="cube-3d-press-mode" role="status">
                {pressMode === 'block'
                  ? 'Wide turn: drag across layers, then turn them'
                  : 'Whole cube: drag to rotate it'}
              </div>
            )}
            <div class="cube-3d-hint">
              {coarsePointer ? (
                <>
                  Swipe a sticker to turn its layer; hold it first for several
                  layers or the whole cube &bull; Two fingers to tilt, pinch to
                  zoom
                </>
              ) : (
                <>
                  Swipe a sticker to turn its layer; Shift or hold for several
                  layers, Alt for the whole cube &bull; Drag the background or
                  swipe two fingers to rotate &bull; Pinch or scroll to zoom
                </>
              )}
            </div>
          </div>
          <div class="cube-3d-toolbar">
            <div class="cube-3d-section">
              <span class="cube-3d-label">Faces:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(Math.PI / 2 - 0.05, 0)}
                  title="Up face"
                >
                  Up (U)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, -Math.PI / 2)}
                  title="Right face"
                >
                  Right (R)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, 0)}
                  title="Front face"
                >
                  Front (F)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(-Math.PI / 2 + 0.05, 0)}
                  title="Down face"
                >
                  Down (D)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, Math.PI / 2)}
                  title="Left face"
                >
                  Left (L)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, Math.PI)}
                  title="Back face"
                >
                  Back (B)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => resetView()}
                  title="Reset to Isometric view"
                >
                  Isometric
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => resetView(true)}
                  title="Isometric view from behind"
                >
                  Iso-back
                </button>
              </div>
            </div>

            <div class="cube-3d-section">
              <span class="cube-3d-label">Cube:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class={`cube-3d-btn ${isScrambling ? 'cube-3d-btn-active' : ''}`}
                  onClick={toggleScramble}
                  title={isScrambling ? 'Stop scramble' : 'Scramble cube'}
                >
                  {isScrambling ? 'Stop' : 'Scramble'}
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={undoLastTurn}
                  disabled={moves.length === 0 || isTurning}
                  title="Undo the last completed layer turn"
                >
                  Undo
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={resetCube}
                  disabled={isInitialCube && moves.length === 0}
                  title="Reset cube to initial assembled state"
                >
                  Reset
                </button>
              </div>
            </div>

            <div
              class="cube-3d-move-history"
              role="status"
              aria-label="Move history"
            >
              Moves:{' '}
              {moves.length
                ? moves
                    .map((move) => formatCubeTurn(move, puzzleSize))
                    .join(' ')
                : 'None'}
            </div>

            <div class="cube-3d-actions">
              <button
                type="button"
                class="cube-3d-btn"
                onClick={() => setIsStickerless((v) => !v)}
                title="Toggle between stickerless and stickered appearance"
              >
                {isStickerless ? 'Stickerless' : 'Stickered'}
              </button>
              <button
                type="button"
                class={`cube-3d-btn ${isRotating ? 'cube-3d-btn-active' : ''}`}
                onClick={() => {
                  inertiaRef.current = { yaw: 0, pitch: 0 }
                  resumeAutoAtRef.current = 0
                  setIsRotating((v) => !v)
                }}
              >
                {isRotating ? 'Pause' : 'Auto-rotate'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
