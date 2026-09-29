import { useEffect, useRef, useState, type MutableRef } from 'preact/hooks'
import type { CubeState } from '../cube/cubeAssembly'
import { createShadowRenderer } from './cubeShadow'
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
import type { MeshUpdate } from './useCubeTurns'

interface CubeRendererOptions {
  canvasRef: MutableRef<HTMLCanvasElement | null>
  cubeRef: MutableRef<CubeState>
  // Starts the renderer over when it changes, like the other settings.
  resetKey: unknown
  puzzleSize: number
  palette: Record<string, string>
  isStickerless: boolean
  viewRef: MutableRef<{ pitch: number; yaw: number; zoom: number }>
  // Advances the view by `elapsed` ms and says what the mesh must show.
  onFrame: (time: number, elapsed: number) => MeshUpdate | null
}

// Draws the cube and its shadow with WebGL every animation frame. False
// when the browser has no WebGL.
export function useCubeRenderer({
  canvasRef,
  cubeRef,
  resetKey,
  puzzleSize,
  palette,
  isStickerless,
  viewRef,
  onFrame,
}: CubeRendererOptions) {
  const [isSupported, setIsSupported] = useState<boolean>(true)
  const lastFrameTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

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
      cubeRef.current,
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

      const update = onFrameRef.current(time, elapsed)
      if (update) {
        const next = buildCubeMesh(
          cubeRef.current,
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
      const currentZoom = viewRef.current.zoom
      const view = mat4Translate(mat4Create(), mat4Create(), [
        0,
        0,
        -currentZoom,
      ])

      // Model matrix: pitch and yaw rotations
      const model = mat4Create()
      mat4RotateX(model, model, viewRef.current.pitch)
      mat4RotateY(model, model, viewRef.current.yaw)

      // MVP = Proj * View * Model
      const mvp = mat4Create()
      const viewProj = mat4Create()
      mat4Multiply(viewProj, proj, view)
      mat4Multiply(mvp, viewProj, model)

      shadow?.draw(
        viewProj,
        puzzleSize,
        viewRef.current.pitch,
        viewRef.current.yaw,
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
  }, [resetKey, puzzleSize, palette, isStickerless])

  return isSupported
}
