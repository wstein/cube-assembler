@genType let mat4Create: unit => Float32Array.t
@genType let mat4Multiply: (Float32Array.t, Float32Array.t, Float32Array.t) => Float32Array.t
@genType
let mat4Perspective: (Float32Array.t, float, float, float, float) => Float32Array.t
@genType let mat4RotateX: (Float32Array.t, Float32Array.t, float) => Float32Array.t
@genType let mat4RotateY: (Float32Array.t, Float32Array.t, float) => Float32Array.t
@genType
let mat4Translate: (Float32Array.t, Float32Array.t, (float, float, float)) => Float32Array.t
