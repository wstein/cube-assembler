import { useEffect, useRef, useState } from 'preact/hooks'
import '../../web/cube3d.css'
import { createShadowRenderer } from './cubeShadow'
import {
  clampZoom,
  followDrag,
  gestureAfterPointerUp,
  gestureForPointerDown,
  gestureWhenSwipeTurnsNothing,
  pickCubeSurface,
  pickSwipeLayer,
  pressLevel,
  releaseDrag,
  seamFollow,
  swipeLayerAngle,
  swipeStart,
  wholeCubeLayer,
  twoFingerLock,
  twoFingerMotion,
  nextWheelSwipe,
  wheelGesture,
  WHEEL_SWIPE_GAP_MS,
  type WheelSwipe,
  type TwoFingerLock,
  type PressLevel,
} from './cubeGesture'
import {} from '../core/view/TurnAnimation.gen'
import { MODE_CUE_GAIN, playWideCue } from './turnFeel'
import {
  STICKERLESS_COOKIE,
  preferenceCookie,
  readPreference,
  readSwipeTuning,
  readTurnFeel,
  turnSoundOn,
  vibrationOn,
  readVibrationMs,
} from './preferences'
import type { CubeState } from '../cube/cubeAssembly'

import { AxisGizmo } from './axisGizmo'
import { buildCubeMesh } from './cubeMesh'
import { CubeView3DPresentation } from './cubeView3DPresentation'
import { useCubeCamera } from './useCubeCamera'
import { useCubeTurns } from './useCubeTurns'
import { createCubeViewControls } from './cubeViewControls'
import {
  createDragInteraction,
  type CubePointerGesture,
} from './cubeDragInteraction'
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
  AUTO_ROTATE_RESUME_DELAY_MS,
  DEFAULT_STICKER_HEX,
  type CubeTurn,
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
  const {
    pitch,
    setPitch,
    yaw,
    setYaw,
    setZoom,
    stateRef,
    isDraggingRef,
    resumeAutoAtRef,
    lastPointerRef,
    inertiaRef,
    pauseAutoRotation,
    rotateView,
    stepCamera,
    gestureCamera,
    isRotating,
    toggleAutoRotate,
  } = useCubeCamera(puzzleSize)
  const [isSupported, setIsSupported] = useState<boolean>(true)
  const [isStickerless, setIsStickerless] = useState<boolean>(() =>
    readPreference(document.cookie, STICKERLESS_COOKIE, stickerless),
  )
  const {
    currentCube,
    currentCubeRef,
    moves,
    isScrambling,
    isTurning,
    setIsTurning,
    dragTurnRef,
    busy,
    finishSettlingTurn,
    settleDrag,
    toggleScramble,
    resetCube,
    undoLastTurn,
    isInitialCube,
    advance,
  } = useCubeTurns({
    cube,
    initialCube,
    initialMoves,
    puzzleSize,
    onTurnStateChange,
    pauseAutoRotation,
  })

  useEffect(() => {
    document.cookie = preferenceCookie(STICKERLESS_COOKIE, isStickerless)
  }, [isStickerless])

  const gestureRef = useRef<CubePointerGesture | null>(null)
  const [pressMode, setPressMode] = useState<PressLevel | null>(null)
  // Fingers on the canvas, and where the two tilting fingers were last.
  const touchesRef = useRef(new Map<number, [number, number]>())
  const activePointersRef = useRef(new Set<number>())
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
  const lastFrameTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number | null>(null)

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

    // Read once per view: the settings page is a page of its own.
    const magnetic = readTurnFeel(document.cookie).overshoot

    const render = (time: number) => {
      const elapsed = Math.min(time - (lastFrameTimeRef.current ?? time), 50)
      lastFrameTimeRef.current = time

      const update = advance(time, magnetic)
      if (update) {
        const next = buildCubeMesh(
          currentCubeRef.current,
          puzzleSize,
          palette,
          isStickerless,
          update.layer,
        )
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, next.positions)
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, next.normals)
        if (update.colors) {
          gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, next.colors)
        }
      }
      stepCamera(time, elapsed)

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

  // Shows, sounds and (on phones) buzzes when a wide turn is selected.
  const announceWideTurn = () => {
    setPressMode('wide')
    const cookies = document.cookie
    playWideCue(turnSoundOn(cookies) ? MODE_CUE_GAIN : 0)
    try {
      if (vibrationOn(cookies)) navigator.vibrate?.(readVibrationMs(cookies))
    } catch {
      // Vibration is only a hint.
    }
  }

  const { startDragTurn } = createDragInteraction({
    dragTurnRef,
    setIsTurning,
  })

  // Two fingers put down on the cube turn the whole cube once they move
  // together (a tilt, see twoFingerLock): the sticker under their midpoint
  // and where the midpoint started. Beside the cube they rotate the view.
  const twoFingerCubeRef = useRef<{
    hit: NonNullable<ReturnType<typeof pickCubeSurface>>
    start: [number, number]
    startTime: number
    dragging: boolean
  } | null>(null)

  // The whole cube follows a swipe, like a layer does: `dx`/`dy` from where
  // it started on `hit`. Returns false until the swipe picks an axis.
  const dragWholeCube = (
    swipe: {
      hit: NonNullable<ReturnType<typeof pickCubeSurface>>
      startTime: number
      dragging: boolean
    },
    dx: number,
    dy: number,
    timeStamp: number,
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const camera = gestureCamera(rect)
    const drag = dragTurnRef.current
    if (!swipe.dragging) {
      const layer = pickSwipeLayer(
        swipe.hit,
        dx,
        dy,
        camera,
        readSwipeTuning(document.cookie).startPx,
      )
      if (!layer) return
      const whole = wholeCubeLayer(layer.axis, puzzleSize)
      const angle = swipeLayerAngle(swipe.hit, whole, dx, dy, camera)
      swipe.dragging = true
      dragTurnRef.current = {
        layer: whole,
        // Its speed so far, so a quick flick counts from the first move.
        ...followDrag(
          { angle: 0, velocity: 0, time: swipe.startTime },
          angle,
          timeStamp,
        ),
        drawn: null,
      }
      setIsTurning(true)
      return
    }
    if (!drag) return
    const angle = swipeLayerAngle(swipe.hit, drag.layer, dx, dy, camera)
    Object.assign(drag, followDrag(drag, angle, timeStamp))
  }

  // Settles a whole-cube drag on whole quarter turns.
  const releaseWholeCube = (timeStamp: number, cancelled: boolean) => {
    const drag = dragTurnRef.current
    if (!drag) return
    const { turns, speed } = releaseDrag(
      drag.angle,
      drag.velocity,
      drag.time,
      timeStamp,
      cancelled,
      readSwipeTuning(document.cookie),
    )
    settleDrag(turns, speed)
  }

  // Where two fingers meet, over the cube if they are, while no turn plays.
  const cubeUnder = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return rect && !busy()
      ? pickCubeSurface(
          clientX - rect.left,
          clientY - rect.top,
          gestureCamera(rect),
        )
      : null
  }

  const handlePointerDown = (e: PointerEvent) => {
    activePointersRef.current.add(e.pointerId)
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
      // Two fingers turn the whole cube on it, rotate the view beside it,
      // or pinch to zoom.
      const gesture = gestureRef.current
      const mode = gestureForPointerDown(
        'touch',
        touches,
        null,
        gesture?.mode ?? null,
      )
      if (gesture) gesture.mode = mode
      if (mode === 'two-finger') {
        // A second finger lets go of a dragged layer.
        setPressMode(null)
        settleDrag(0)
        startTilt()
        const pair = twoTouches()
        const midpoint = pair ? midpointOf(pair) : null
        const hit = midpoint ? cubeUnder(...midpoint) : null
        twoFingerCubeRef.current =
          midpoint && hit
            ? { hit, start: midpoint, startTime: e.timeStamp, dragging: false }
            : null
        lastPointerRef.current = {
          ...lastPointerRef.current,
          time: e.timeStamp,
        }
      }
      return
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY, time: e.timeStamp }
    finishSettlingTurn()
    const rect = canvasRef.current?.getBoundingClientRect()
    const hit =
      rect && !busy()
        ? pickCubeSurface(
            e.clientX - rect.left,
            e.clientY - rect.top,
            gestureCamera(rect),
          )
        : null
    const level = pressLevel(e)
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
    if (level === 'wide') announceWideTurn()
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && touchesRef.current.has(e.pointerId))
      touchesRef.current.set(e.pointerId, [e.clientX, e.clientY])
    if (!isDraggingRef.current) return
    const gesture = gestureRef.current
    if (!gesture) return
    if (gesture.mode === 'two-finger') {
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
      // it locks; after that only the locked one follows the fingers. On
      // the cube a tilt turns the whole cube instead of the view.
      const cube = twoFingerCubeRef.current
      if (lock === 'tilt' && cube) {
        dragWholeCube(cube, mx - cube.start[0], my - cube.start[1], e.timeStamp)
        return
      }
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
      const camera = gestureCamera(rect)
      // A young seam swipe follows its lean, so the highlighted block can
      // be corrected before it locks.
      if (gesture.seamOpen) {
        const step = seamFollow(
          hit,
          drag.layer,
          drag.angle,
          e.clientX - fromX,
          e.clientY - fromY,
          camera,
        )
        if (step.locked) gesture.seamOpen = false
        else if (step.layer) {
          const wide = (step.layer.width ?? 1) > 1
          drag.layer = step.layer
          drag.highlight = wide
          if (wide && gesture.level !== 'wide') announceWideTurn()
          if (!wide) setPressMode(null)
          gesture.level = wide ? 'wide' : 'layer'
        }
      }
      const angle = swipeLayerAngle(
        hit,
        drag.layer,
        e.clientX - fromX,
        e.clientY - fromY,
        camera,
      )
      Object.assign(drag, followDrag(drag, angle, e.timeStamp))
      return
    }
    if (gesture.mode === 'pending' && gesture.hit) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const start = swipeStart(
        gesture.hit,
        e.clientX - gesture.x,
        e.clientY - gesture.y,
        gestureCamera(rect),
        gesture.tuning.startPx,
        gesture.level,
      )
      if (start.kind === 'wait') return
      if (start.layer) {
        gesture.seamOpen = start.seam
        if (start.wide) {
          gesture.level = 'wide'
          announceWideTurn()
        }
        startDragTurn(
          gesture,
          start.layer,
          [gesture.x, gesture.y],
          gesture.hit,
          e,
          gestureCamera(rect),
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
    // Capture can disappear without pointerup (for example when a touch is
    // interrupted). Cancel the partial turn so the cube returns upright.
    if (
      e.type === 'lostpointercapture' &&
      !activePointersRef.current.has(e.pointerId)
    )
      return
    activePointersRef.current.delete(e.pointerId)
    const cancelled =
      e.type === 'pointercancel' || e.type === 'lostpointercapture'
    const touch = e.pointerType === 'touch'
    if (touch) touchesRef.current.delete(e.pointerId)
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Ignore if pointer capture release fails
    }
    const remaining = touch ? touchesRef.current.size : 0
    // Lifting a finger lets go of a whole-cube turn; the other finger, if
    // still down, does nothing more.
    const cube = twoFingerCubeRef.current
    twoFingerCubeRef.current = null
    if (cube?.dragging) {
      releaseWholeCube(e.timeStamp, cancelled)
      if (remaining > 0) {
        if (gestureRef.current) gestureRef.current.mode = 'none'
        tiltFromRef.current = null
        return
      }
    }
    const next = gestureAfterPointerUp(
      remaining,
      gestureRef.current?.mode ?? null,
    )
    if (next !== null) {
      if (gestureRef.current) gestureRef.current.mode = next
      if (next === 'two-finger') startTilt()
      else tiltFromRef.current = null
      return
    }
    isDraggingRef.current = false
    setPressMode(null)
    const gesture = gestureRef.current
    if (gesture?.mode === 'turn') {
      inertiaRef.current = { yaw: 0, pitch: 0 }
      const drag = dragTurnRef.current
      if (drag) {
        const { turns, speed } = releaseDrag(
          drag.angle,
          drag.velocity,
          drag.time,
          e.timeStamp,
          cancelled,
          gesture.tuning,
        )
        settleDrag(turns, speed)
      }
    }
    gestureRef.current = null
    tiltFromRef.current = null
    resumeAutoAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS
    if (cancelled || e.timeStamp - lastPointerRef.current.time > 120) {
      inertiaRef.current = { yaw: 0, pitch: 0 }
    }
  }

  // A touchpad's two-finger swipe arrives as wheel events, not touches.
  // One that starts over the cube turns the whole cube like two fingers
  // on a touch screen, and settles when the swipe pauses; elsewhere it
  // rotates the view, and pinches and mouse wheels zoom (see
  // cubeViewControls).
  const wheelSwipeRef = useRef<{
    swipe: WheelSwipe
    cube: {
      hit: NonNullable<ReturnType<typeof pickCubeSurface>>
      startTime: number
      dragging: boolean
    } | null
    timer: ReturnType<typeof setTimeout>
  } | null>(null)

  const handleCubeWheel = (e: WheelEvent) => {
    if (wheelGesture(e) !== 'tilt') {
      handleViewWheel(e)
      return
    }
    const current = wheelSwipeRef.current
    const swipe = nextWheelSwipe(
      current?.swipe ?? null,
      e.timeStamp,
      e.deltaX,
      e.deltaY,
    )
    const fresh = swipe.startTime === e.timeStamp
    if (current) clearTimeout(current.timer)
    const hit = fresh ? cubeUnder(e.clientX, e.clientY) : null
    const cube = fresh
      ? hit && { hit, startTime: e.timeStamp, dragging: false }
      : (current?.cube ?? null)
    const state = {
      swipe,
      cube,
      timer: setTimeout(() => {
        if (wheelSwipeRef.current !== state) return
        wheelSwipeRef.current = null
        // The swipe has already coasted, so it throws nothing more.
        if (state.cube?.dragging)
          releaseWholeCube(Number.POSITIVE_INFINITY, false)
      }, WHEEL_SWIPE_GAP_MS),
    }
    wheelSwipeRef.current = state
    if (!cube) {
      handleViewWheel(e)
      return
    }
    e.preventDefault()
    pauseAutoRotation()
    if (swipe.coasting) {
      // The fingers have lifted: settle now, and let the momentum pass.
      if (cube.dragging) {
        cube.dragging = false
        releaseWholeCube(Number.POSITIVE_INFINITY, false)
      }
      return
    }
    dragWholeCube(cube, swipe.dx, swipe.dy, e.timeStamp)
  }

  const {
    resetView,
    setPreset,
    handleWheel: handleViewWheel,
    handleKeyDown,
  } = createCubeViewControls({
    puzzleSize,
    pauseAutoRotation,
    setPitch,
    setYaw,
    setZoom,
    rotateView,
  })

  return (
    <CubeView3DPresentation
      isSupported={isSupported}
      canvasRef={canvasRef}
      handleKeyDown={handleKeyDown}
      handlePointerDown={handlePointerDown}
      handlePointerMove={handlePointerMove}
      handlePointerUp={handlePointerUp}
      handleWheel={handleCubeWheel}
      gizmo={
        <AxisGizmo
          cube={currentCube}
          puzzleSize={puzzleSize}
          pitch={pitch}
          yaw={yaw}
          palette={palette}
        />
      }
      pressMode={pressMode}
      coarsePointer={coarsePointer}
      setPreset={setPreset}
      resetView={resetView}
      isScrambling={isScrambling}
      toggleScramble={toggleScramble}
      undoLastTurn={undoLastTurn}
      moves={moves}
      isTurning={isTurning}
      resetCube={resetCube}
      isInitialCube={isInitialCube}
      puzzleSize={puzzleSize}
      isStickerless={isStickerless}
      onToggleStickerless={() => setIsStickerless((value) => !value)}
      isRotating={isRotating}
      onToggleAutoRotate={toggleAutoRotate}
    />
  )
}
