// Unchecked typed-array access for the pixel loops: plain `a[i]` in the
// output, with no bounds checks or option wrapping.
@get_index external get: (Uint8ClampedArray.t, int) => int = ""
@set_index external set: (Uint8ClampedArray.t, int, int) => unit = ""
@new external make: int => Uint8ClampedArray.t = "Uint8ClampedArray"
@get external length: Uint8ClampedArray.t => int = "length"

// A float stored into a clamped array rounds and clamps like the browser.
@set_index external setFloat: (Uint8ClampedArray.t, int, float) => unit = ""
