// The 3D view's shaders; its matrix helpers live in
// src/core/view/Mat4.res.
import { compileShader } from './webglShader'
export {
  mat4Create,
  mat4Multiply,
  mat4Perspective,
  mat4RotateX,
  mat4RotateY,
  mat4Translate,
} from '../core/view/Mat4.gen'

const VS_SOURCE = `
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec3 a_color;
attribute float a_occlusion;

uniform mat4 u_mvp;
uniform mat4 u_model;

varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_pos;
varying float v_occlusion;

void main() {
  v_color = a_color;
  v_occlusion = a_occlusion;
  v_normal = normalize(mat3(u_model[0].xyz, u_model[1].xyz, u_model[2].xyz) * a_normal);
  v_pos = (u_model * vec4(a_position, 1.0)).xyz;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`

const FS_SOURCE = `
precision mediump float;

varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_pos;
varying float v_occlusion;

uniform vec3 u_lightDir1;
uniform vec3 u_lightDir2;
uniform vec3 u_cameraPos;

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cameraPos - v_pos);

  // Key light: upper-right-front
  vec3 L1 = normalize(u_lightDir1);
  float diff1 = max(dot(N, L1), 0.0);
  vec3 H1 = normalize(L1 + V);
  float spec1 = pow(max(dot(N, H1), 0.0), 24.0) * 0.28;

  // Fill light: lower-left-rear
  vec3 L2 = normalize(u_lightDir2);
  float diff2 = max(dot(N, L2), 0.0) * 0.35;

  float ambient = 0.42;
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 lit = v_color * (ambient + diff1 * 0.65 + diff2) * v_occlusion;
  lit += vec3(spec1 * v_occlusion) + v_color * fresnel * 0.10;
  gl_FragColor = vec4(lit, 1.0);
}
`

export function initProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VS_SOURCE)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}
