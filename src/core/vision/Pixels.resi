@get_index external get: (Uint8ClampedArray.t, int) => int = ""
@set_index external set: (Uint8ClampedArray.t, int, int) => unit = ""
// Indexed by a float, as JavaScript code indexes: a fractional or negative
// index reads undefined, which then turns sums into NaN like the original.
@get_index external getAt: (Uint8ClampedArray.t, float) => float = ""
@new external make: int => Uint8ClampedArray.t = "Uint8ClampedArray"
@get external length: Uint8ClampedArray.t => int = "length"
@set_index external setFloat: (Uint8ClampedArray.t, int, float) => unit = ""

module F64: {
  @get_index external get: (Float64Array.t, int) => float = ""
  @get_index external getAt: (Float64Array.t, float) => float = ""
  @set_index external set: (Float64Array.t, int, float) => unit = ""
  @new external make: int => Float64Array.t = "Float64Array"
  @get external length: Float64Array.t => int = "length"
}

module F32: {
  @get_index external get: (Float32Array.t, int) => float = ""
  @set_index external set: (Float32Array.t, int, float) => unit = ""
  @new external make: int => Float32Array.t = "Float32Array"
}
