// A soft floor shadow for the 3D cube, lit from straight above like a studio
// light. The shadow is the outline of the rotated cube seen from above, drawn
// on a floor below it with edges that fade out; the shader needs a fixed
// number of outline corners.

type Vec3 = [number, number, number]
type FloorPoint = [number, number]

export const SHADOW_OUTLINE_POINTS = 8

// Below the cube's bounding sphere, so no orientation reaches the floor.
export function shadowFloorY(n: number): number {
  return -n * 0.9
}

// The view's model matrix: rotate about X by the pitch after Y by the yaw.
export function rotateModelPoint(p: Vec3, pitch: number, yaw: number): Vec3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const x = p[0] * cy + p[2] * sy
  const z = -p[0] * sy + p[2] * cy
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  return [x, p[1] * cp - z * sp, p[1] * sp + z * cp]
}

// Counter-clockwise convex outline, in floor (x, z) coordinates, of the cube
// seen from above.
export function shadowOutline(
  n: number,
  pitch: number,
  yaw: number,
): FloorPoint[] {
  const h = n / 2
  const points: FloorPoint[] = []
  for (const x of [-h, h])
    for (const y of [-h, h])
      for (const z of [-h, h]) {
        const [rx, , rz] = rotateModelPoint([x, y, z], pitch, yaw)
        points.push([rx, rz])
      }
  return convexHull(points)
}

export function paddedOutline(outline: FloorPoint[]): Float32Array {
  const out = new Float32Array(SHADOW_OUTLINE_POINTS * 2)
  for (let i = 0; i < SHADOW_OUTLINE_POINTS; i++) {
    const [x, z] = outline[Math.min(i, outline.length - 1)]
    out[i * 2] = x
    out[i * 2 + 1] = z
  }
  return out
}

// Andrew's monotone chain; collinear and repeated points are dropped.
function convexHull(points: FloorPoint[]): FloorPoint[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: FloorPoint, a: FloorPoint, b: FloorPoint) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: FloorPoint[]) => {
    const hull: FloorPoint[] = []
    for (const p of list) {
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 1e-9
      )
        hull.pop()
      hull.push(p)
    }
    hull.pop()
    return hull
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

const SHADOW_VS = `
attribute vec2 a_floor;
uniform mat4 u_viewProj;
uniform float u_floorY;
varying vec2 v_floor;
void main() {
  v_floor = a_floor;
  gl_Position = u_viewProj * vec4(a_floor.x, u_floorY, a_floor.y, 1.0);
}
`

// Signed distance to the outline (negative inside), after Inigo Quilez's
// polygon distance. Repeated corners are skipped.
const SHADOW_FS = `
precision mediump float;
varying vec2 v_floor;
uniform vec2 u_outline[${SHADOW_OUTLINE_POINTS}];
uniform float u_soft;
uniform float u_alpha;
float outlineDistance(vec2 p) {
  float d = dot(p - u_outline[0], p - u_outline[0]);
  float s = 1.0;
  vec2 prev = u_outline[${SHADOW_OUTLINE_POINTS - 1}];
  for (int i = 0; i < ${SHADOW_OUTLINE_POINTS}; i++) {
    vec2 cur = u_outline[i];
    vec2 e = prev - cur;
    vec2 w = p - cur;
    float ee = dot(e, e);
    if (ee > 1e-6) {
      vec2 b = w - e * clamp(dot(w, e) / ee, 0.0, 1.0);
      d = min(d, dot(b, b));
      bvec3 c = bvec3(p.y >= cur.y, p.y < prev.y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s = -s;
    }
    prev = cur;
  }
  return s * sqrt(d);
}
void main() {
  float d = outlineDistance(v_floor);
  // A darker core under the cube and a wide, faint falloff around it.
  float core = 1.0 - smoothstep(-u_soft * 0.6, u_soft, d);
  float halo = 1.0 - smoothstep(-u_soft, u_soft * 3.5, d);
  float a = u_alpha * max(core, halo * 0.45);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export interface ShadowRenderer {
  draw(
    viewProj: Float32Array,
    n: number,
    pitch: number,
    yaw: number,
    alpha: number,
  ): void
  dispose(): void
}

// Draws the shadow before the cube: blended, without writing depth, so the
// cube always covers it. Returns null when the shader cannot be built, and
// the cube is then drawn without a shadow.
export function createShadowRenderer(
  gl: WebGLRenderingContext,
): ShadowRenderer | null {
  const vs = compile(gl, gl.VERTEX_SHADER, SHADOW_VS)
  const fs = compile(gl, gl.FRAGMENT_SHADER, SHADOW_FS)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  const buffer = gl.createBuffer()
  const aFloor = gl.getAttribLocation(program, 'a_floor')
  const uViewProj = gl.getUniformLocation(program, 'u_viewProj')
  const uFloorY = gl.getUniformLocation(program, 'u_floorY')
  const uOutline = gl.getUniformLocation(program, 'u_outline')
  const uSoft = gl.getUniformLocation(program, 'u_soft')
  const uAlpha = gl.getUniformLocation(program, 'u_alpha')
  let quadSize = 0

  return {
    draw(viewProj, n, pitch, yaw, alpha) {
      if (alpha <= 0) return
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      const size = n * 3
      if (size !== quadSize) {
        quadSize = size
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([
            -size,
            -size,
            size,
            -size,
            -size,
            size,
            size,
            size,
          ]),
          gl.STATIC_DRAW,
        )
      }
      gl.vertexAttribPointer(aFloor, 2, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aFloor)
      gl.uniformMatrix4fv(uViewProj, false, viewProj)
      gl.uniform1f(uFloorY, shadowFloorY(n))
      gl.uniform2fv(uOutline, paddedOutline(shadowOutline(n, pitch, yaw)))
      gl.uniform1f(uSoft, n * 0.2)
      gl.uniform1f(uAlpha, alpha)
      gl.depthMask(false)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.BLEND)
      // The canvas is premultiplied: black at alpha a is (0, 0, 0, a).
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.disable(gl.BLEND)
      gl.enable(gl.CULL_FACE)
      gl.depthMask(true)
      gl.disableVertexAttribArray(aFloor)
    },
    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}
