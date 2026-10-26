# Synthetic Face Generator: Implementation Specification

Ownership: the Rust generator project owns the canonical specification. This
copy describes what the TypeScript/ReScript reference in this repository
renders, and `test/syntheticFaceSpec.test.ts` keeps it true to the code. It
is maintained here independently for as long as the function exists; when the
two differ, the Rust specification decides and this generator and copy follow.
Check the Rust specification before changing the generator or this text.

Status: normative, language independent. Reference implementation:
`src/core/vision/SyntheticFace.res` (ReScript, compiled to JavaScript on V8).
A port is correct when it reproduces the **test vectors in section 11**.

Renderer id `parametric/v1`. Later additions (the `real` preset and the
options `tone`, `shading` and `faceShift`) are off unless asked for and leave
every earlier vector unchanged, so the id stays. `test/syntheticFaceSpec.test.ts`
checks the vectors of section 11 against the reference on every test run: the
spec and the generator cannot drift apart unnoticed. When one changes, change
the other in the same commit.

The generator renders one cube face as a `size x size` RGBA photo from a
grid of sticker color letters. The photo looks like a cropped camera shot:
flat rounded stickers on a dark backdrop, a thin border, a vignette. It is
fully deterministic: the same `(grid, preset, seed, size, options)` always
yields the same bytes. A border strip carries the word `SYNTHETIC` so the
image can never be mistaken for a camera photo.

## 1. Interface

```
renderFace(grid, preset, seed, size, options) -> bytes[size * size * 4]
```

| Input     | Type                 | Meaning                                                                                                                                               |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grid`    | `string[n][n]`       | Sticker color letters, row-major, top row first. Letters `W Y O R G B` are known; any other string is "unknown" (gray). `n >= 1`. The grid is square. |
| `preset`  | string               | One of `clean scatter real gradient shadow dim-warm glare noise bad-camera`. Anything else: raise an error `Unknown synthetic preset: <name>`.        |
| `seed`    | int32                | Random seed. Use values that fit in 32 bits.                                                                                                          |
| `size`    | int                  | Photo side in pixels. Recommended 64..2048.                                                                                                           |
| `options` | record, all optional | See section 8.                                                                                                                                        |

Output: bytes in RGBA order, row-major, top row first, index
`(y * size + x) * 4`. Alpha is always 255.

## 2. Numeric conventions (read this first, most porting bugs live here)

All arithmetic is IEEE-754 binary64 (`double`) unless said otherwise.
1. **Pixel store rule.** The reference writes into a `Uint8ClampedArray`.
   Every store of a float `v` into a pixel byte means:
   `NaN -> 0`; otherwise clamp to `[0, 255]`; then **round half to even**
   (`0.5 -> 0`, `1.5 -> 2`, `2.5 -> 2`, `254.5 -> 254`). Every read gives that
   stored integer back, so each processing stage sees 8-bit quantized
   pixels. Do not keep floats between stages.
2. **`round(x)`** elsewhere in this document (margin, blur radius, OKLab to
   sRGB) is JavaScript `Math.round`: **round half up**, i.e.
   `floor(x + 0.5)`. It is _not_ the pixel store rule.
3. **Integer division** `a / b` on ints truncates toward zero.
4. **`toInt(f)`** truncates toward zero.
5. **`ToInt32(d)`** wraps a double modulo 2^32 into `[-2^31, 2^31)`
   (the JavaScript `|0` operation).
6. `clamp(v, lo, hi) = min(hi, max(lo, v))`.
7. Transcendentals (`cbrt`, `pow`, `exp`, `log`, `cos`, `sqrt`, `atan2`)
   may differ in the last bit between math libraries. The reference output
   is the V8 result. A port using another libm may differ by +-1 in a few
   bytes; see section 11 for the tolerance.

## 3. Random numbers (counter based)

The generator has no state. Every random value is a pure function of
`(seed, index)`.

```
hash(seed, i):
    a = ToInt32( ToInt32(seed * 374761393.0) + ToInt32(i * 668265263.0) )
    # products are double products, ToInt32 of the double
    b = a XOR (a >>> 13)                # >>> is the UNSIGNED shift; b as int32
    b = ToInt32( (double)b * 1274126177.0 )   # <-- see gotcha
    return b XOR (b >>> 16)             # result as int32 (may be negative)

unit(seed, i)  = (hash(seed, i) AND 0xFFFFFF) / 16777216.0      # in [0, 1)
gauss(seed, i) = sqrt(-2 * ln(unit(seed, 2*i) + 1e-9))
                 * cos(2 * PI * unit(seed, 2*i + 1))
```

**Gotcha (the most important one).** The second multiplication,
`b * 1274126177`, is the exact mathematical product of two integers up to
about 2^31 and 1.27e9, i.e. up to about 2.7e18, which exceeds 2^53. The
reference computes it as a **double product** (rounded to 53 bits), then
applies `ToInt32`. This is **not** the same as a wrapping 32-bit integer
multiply (`Math.imul`, C `uint32_t` multiply). The two differ for about 98%
of inputs. For example `hash(0, 1)` is `-995253203`; a wrapping multiply
gives `-995253211`. To port: convert `b` to `double`, multiply by the double
`1274126177.0`, then reduce modulo 2^32 (for a double `d`:
`m = fmod(d, 4294967296.0)`; if `m < 0` add 2^32; if `m >= 2^31` subtract
2^32). Use the same double-product-then-`ToInt32` form for the first two
multiplications; there the products stay below 2^53 for sane seeds and
indices, but the double form is still the specification.

Seed must be an int32 and `i` an int that keeps `i * 668265263` exact enough
for your language; the reference limits are `|i| < 2^22`, which every index
in this document satisfies for photos up to roughly 1400 x 1400 pixels
(noise uses `3 * pixelIndex + 2`; larger photos hit the double rounding of
the product, which is still the defined behavior as long as you compute it
in doubles).

## 4. Constants

Colors are `(r, g, b)` doubles.

| Name            | Value                   |
| --------------- | ----------------------- |
| Palette `W`     | (232, 232, 224)         |
| Palette `Y`     | (238, 206, 44)          |
| Palette `O`     | (238, 122, 34)          |
| Palette `R`     | (190, 36, 46)           |
| Palette `G`     | (34, 150, 74)           |
| Palette `B`     | (34, 84, 192)           |
| Backdrop        | (20, 20, 24)            |
| Unknown sticker | (128, 128, 128)         |
| Label color     | (170, 170, 176)         |
| Default margin  | 0.035 (share of `size`) |
| Default gap     | 0.07 (share of a cell)  |
| Default radius  | 0.14 (share of a cell)  |

Scatter table (hue sigma in degrees, chroma coefficient of variation):

| Letter | hue sigma | chroma CV |
| ------ | --------- | --------- |
| W      | 22.0      | 0.35      |
| Y      | 2.5       | 0.045     |
| O      | 1.2       | 0.034     |
| R      | 1.4       | 0.043     |
| G      | 0.7       | 0.063     |
| B      | 1.0       | 0.08      |
| other  | 2.0       | 0.05      |

Brightness tone per color: spread of the brightness as a share of its own
mean, then the correlation of the brightness with the chroma and with the
hue (measured on the saved captures of valid cubes, after the lighting plane
is taken out):

| Letter | spread L | corr(L, chroma) | corr(L, hue) |
| ------ | -------- | --------------- | ------------ |
| W      | 0.020    | 0.38            | -0.03        |
| Y      | 0.018    | -0.09           | 0.29         |
| O      | 0.016    | 0.23            | -0.35        |
| R      | 0.035    | 0.64            | -0.29        |
| G      | 0.029    | 0.53            | 0.44         |
| B      | 0.055    | 0.78            | -0.34        |
| other  | 0.025    | 0               | 0            |

Face shift per color: what one photo moves a color by, beyond the spread
within the photo (brightness and chroma as a share of their own mean, hue in
degrees):

| Letter | shift L | shift chroma | shift hue |
| ------ | ------- | ------------ | --------- |
| W      | 0.054   | 0.275        | 0         |
| Y      | 0.025   | 0.041        | 2.45      |
| O      | 0       | 0.038        | 1.37      |
| R      | 0.044   | 0.028        | 1.64      |
| G      | 0.053   | 0            | 0.61      |
| B      | 0.08    | 0.07         | 0.36      |
| other  | 0.035   | 0.05         | 1.0       |

Shading: the plane of light has a slope scale of `0.075` per photo width.

## 5. OKLab helpers

`rgb` channels are 0..255 numbers.

```
srgbToLinear(c):  v = c / 255;  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ^ 2.4

rgbToOKLCH(rgb):
    r,g,b = srgbToLinear of each channel
    l_ = cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b)
    m_ = cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b)
    s_ = cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b)
    L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
    a = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
    b = 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
    C = sqrt(a*a + b*b)
    h = atan2(b, a) * 180 / PI;  if h < 0: h += 360
    return (L, C, h)

linearToSrgb(v):  v = clamp(v, 0, 1)
    e = v <= 0.0031308 ? v * 12.92 : 1.055 * v^(1/2.4) - 0.055
    return clamp(round(e * 255), 0, 255)          # round half UP, returns a whole number

oklabToRgb(L, a, b):
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l = l_^3;  m = m_^3;  s = s_^3
    r = linearToSrgb( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s)
    g = linearToSrgb(-1.2684380046*l + 2.6097574011*m - 0.3413193965*s)
    b = linearToSrgb(-0.0041960863*l - 0.7034186147*m + 1.7076147010*s)
    return (r, g, b)                              # whole numbers 0..255
```

## 6. Per-sticker color (scatter, tone, face shift)

Every sticker color goes through OKLCH and back, **even with all three
switched off** (the round trip rounds to whole numbers, which the reference
output contains; skipping it changes bytes).

```
mix(shared, own, rho) = rho * shared + sqrt(1 - rho*rho) * own

scatterColor(base, label, seed, k, scatter, tone, faceShift):   # k = row * n + col
    (hueSigma, chromaCV) = scatterTable[label] or (2.0, 0.05)
    (L, C, h)  = rgbToOKLCH(base)
    hueNoise    = gauss(seed, 6000 + 2*k)
    chromaNoise = gauss(seed, 6001 + 2*k)

    if tone > 0:
        (spreadL, rhoC, rhoH) = toneTable[label] or (0.025, 0, 0)
        shared      = gauss(seed, 10000 + 3*k)
        L           = L * (1 + spreadL * tone * shared)
        hueNoise    = mix(shared, hueNoise, rhoH)
        chromaNoise = mix(shared, chromaNoise, rhoC)

    hue    = h + hueNoise * hueSigma * scatter
    chroma = C * (1 + chromaNoise * chromaCV * scatter)

    if faceShift > 0:
        (shiftL, shiftC, shiftH) = shiftTable[label] or (0.035, 0.05, 1.0)
        idx    = index of label in "WYORGB", or 6 if it is not one of those letters
        at     = 9000 + 3 * idx                 # one draw per photo and color
        (_, rhoC, rhoH) = toneTable[label] or (0, 0, 0)
        shared = gauss(seed, at)
        L      = L * (1 + shiftL * faceShift * shared)
        chroma = chroma * (1 + shiftC * faceShift * mix(shared, gauss(seed, at + 1), rhoC))
        hue    = hue + shiftH * faceShift * mix(shared, gauss(seed, at + 2), rhoH)

    radians = hue * PI / 180
    chroma  = max(0, chroma)
    return oklabToRgb(L, chroma * cos(radians), chroma * sin(radians))
```

`base` is the palette color for `label` (after the palette override of
section 8), or the unknown-sticker gray when the label has no color. All
tables are keyed by the **label letter**, even if the palette overrides its
color. A label that is not exactly one character is "not one of those
letters". Keep the order of the floating-point operations as written: the
bytes depend on it.

The tone gives each sticker its own brightness deviation and ties the hue and
chroma deviations to it, as in the saved captures (a darker blue is also a
more saturated one). The face shift does the same for the whole photo: one
draw per color moves brightness, chroma and hue together.

## 7. Rendering algorithm

### 7.1 Geometry

```
margin_px = round(size * marginShare)            # round half up, a whole number
inner     = size - 2 * margin_px
cell      = inner / n
gap       = max(2.0, cell * gapShare)
radius    = cell * radiusShare
half      = cell / 2 - gap / 2
corner    = half - radius
```

### 7.2 Stage 1: draw the face

Once per photo, the plane of light (a direction and a slope per photo width):

```
angle  = 2 * PI * unit(seed, 7000)
slope  = shading * 0.075 * sqrt(-2 * ln(1 - unit(seed, 7001)))
planeX = slope * cos(angle)
planeY = slope * sin(angle)
```

For every pixel `(x, y)`, `0 <= x, y < size`:

```
fx = x + 0.5 - margin_px
fy = y + 0.5 - margin_px
if fx < 0 or fy < 0 or fx >= inner or fy >= inner:
    color = backdrop
else:
    col = toInt(floor(fx / cell));  row = toInt(floor(fy / cell))
    dx  = fx - (col + 0.5) * cell;  dy = fy - (row + 0.5) * cell
    qx  = abs(dx) - corner;         qy = abs(dy) - corner
    outside  = sqrt(max(qx,0)^2 + max(qy,0)^2)
    distance = outside + min(max(qx, qy), 0) - radius       # < 0 inside the sticker
    coverage = clamp(0.5 - distance, 0, 1)
    label = grid[row][col]
    base  = scatterColor(palette[label] or unknown, label, seed, row*n + col,
                         scatter, tone, faceShift)
    if logo given and logo.row == row and logo.col == col:
        reach = (logo.size or 0.5) * half
        if sqrt(dx*dx + dy*dy) <= reach:
            base = palette[logo.color] or unknown      # no scatter on the patch
    rim    = 1 - 0.1 * clamp(1 - (-distance) / (cell * 0.08), 0, 1)
    tilt   = 1 + 0.04 * ( -(dx + dy) / cell )
    jitter = 1 + (unit(seed, row*n + col + 1000) - 0.5) * 0.05 * lightness
    shade  = rim * tilt * jitter
    color  = backdrop * (1 - coverage) + base * shade * coverage      # per channel
cx = x / size - 0.5          # x, y are the integer pixel coordinates here
cy = y / size - 0.5
falloff = 1 - 0.28 * (cx*cx + cy*cy)
if shading > 0:
    falloff = falloff * (1 + planeX * cx + planeY * cy)
store pixel (color.r * falloff, color.g * falloff, color.b * falloff)   # pixel store rule
alpha = 255
```

Notes: `-distance` in `rim` is the positive depth inside the sticker; the
sticker with the largest depth gets `rim = 1`, its edge band
(`0.08 * cell` wide) fades to `0.9`. Pixels with `fx` just inside `inner`
cannot index past the grid because `col, row <= n - 1` follows from
`fx < inner = n * cell` (guard against float rounding with
`min(n - 1, ...)` only if your language rounds differently; the reference
does not guard).

### 7.3 Stage 2: preset effect

`eachPixel(f)` reads the stored integer `r, g, b` of every pixel, computes
three floats and stores them with the pixel store rule. Positions passed to
`f` are `tx = x / size`, `ty = y / size` (integer pixel coordinates, no
half-pixel offset). The alpha byte is untouched.

| Preset                     | Effect                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `clean`, `scatter`, `real` | none                                                                                                         |
| `gradient`                 | `r' = r * (0.7 + 0.6*tx)`, `g' = g`, `b' = b * (1.3 - 0.6*tx)`                                               |
| `shadow`                   | the shadow stage below, with the options of `shadow` (strength 0.15, shape `band`, softness 0.03 by default) |
| `dim-warm`                 | multiply channels by `(0.6, 0.5, 0.35)`, **then** `addNoise(seed, sigma 8)`                                  |
| `glare`                    | see below                                                                                                    |
| `noise`                    | `addNoise(seed, sigma 20)`                                                                                   |
| `bad-camera`               | `blur(radius = max(1, round(size * 0.006)))` as integer, **then** `addNoise(seed, sigma 15)`                 |

`addNoise(seed, sigma)` over pixel index `k = y*size + x`:
`r' = r + gauss(seed, 3k) * sigma`, `g' = g + gauss(seed, 3k+1) * sigma`,
`b' = b + gauss(seed, 3k+2) * sigma`.

The **shadow stage** (`strength`, `shape`, `softness`; unknown shape: raise an
error `Unknown shadow shape: <name>`), per pixel with `tx = x / size`,
`ty = y / size`, `width = max(softness, 1e-6)`:

```
band:   t = (tx + ty) / 2
        inside = clamp((t - 0.4) / width, 0, 1) * clamp((0.65 - t) / width, 0, 1)
half:   inside = clamp(((tx + ty) / 2 - 0.5) / width + 0.5, 0, 1)
spot:   d = sqrt((tx - 0.65)^2 + (ty - 0.35)^2);  inside = clamp((0.25 - d) / width, 0, 1)
corner: d = sqrt((tx - 1)^2 + (ty - 1)^2);        inside = clamp((0.7 - d) / width, 0, 1)

factor = 1 - strength * inside          # multiply all three channels by it
```

A soft real shadow dims about 15 percent, hence the default strength.

`glare`: four spots `j = 0..3`:

```
cx = unit(seed, 5000 + 4j)          cy = unit(seed, 5001 + 4j)
rx = 0.06 + unit(seed, 5002 + 4j) * 0.08
ry = 0.05 + unit(seed, 5003 + 4j) * 0.07
```

per pixel: for each spot `q = (tx-cx)^2/rx^2 + (ty-cy)^2/ry^2`, spot weight
`= q < 1 ? 0.7 * (1 - q) : 0`; `weight = max over spots` (start 0). Each
channel `c' = c * (1 - weight) + 255 * weight`.

`blur(radius)` (integer radius `>= 1`): separable box blur, **horizontal
pass first into a temporary buffer, then vertical pass back**, clamping
sample coordinates to `[0, size-1]` (edge replicate). Each output channel is
`sum / (2*radius + 1)` of the integers of the source buffer of that pass,
stored with the pixel store rule; alpha written as 255.

### 7.4 Stage 3: option effects (in this order, after the preset)

0. `shadow` option given and the preset is not `shadow`: the shadow stage with
   those options (the `shadow` preset has already applied it).
1. `brightness` given: multiply every channel by `brightness`.
2. `blur` given and `blur >= 1`: `blur(radius = round(blur))` (round half up).
3. `noise` given and `noise > 0`: `addNoise(seed + 7919, sigma = noise)`
   (`seed + 7919` as plain int addition).

### 7.5 Stage 4: label

Text: `"SYNTHETIC " + UPPERCASE(preset)`, e.g. `SYNTHETIC BAD-CAMERA`.

```
margin_i = round(size * marginShare)             # same as margin_px, as an integer
scale    = max(1, (margin_i - 4) / 7)            # integer division, truncating
top      = size - margin_i + (margin_i - 7*scale) / 2     # integer division, truncating
for each character index c = 0.. of the text:
    glyph = glyphs[char]; if missing: skip it (it still advances the position)
    for gy in 0..6, gx in 0..4 where glyph[gy][gx] == '1':
        for dy in 0..scale-1, dx in 0..scale-1:
            X = margin_i + (c*6 + gx)*scale + dx
            Y = top + gy*scale + dy
            write the label color at flat index (Y*size + X)*4
```

The write uses the **flat index with no bounds check on X**: a glyph that
runs past the right edge wraps into the next row's left pixels (this
happens, e.g., for `BAD-CAMERA` at size 96). Writes whose flat index is
outside `[0, size*size*4)` are silently dropped. Alpha 255.

Glyphs: 5 columns x 7 rows, `1` = lit. Space has no glyph. Characters not
in the table are skipped.

```
A: 01110 10001 10001 11111 10001 10001 10001
B: 11110 10001 10001 11110 10001 10001 11110
C: 01110 10001 10000 10000 10000 10001 01110
D: 11110 10001 10001 10001 10001 10001 11110
E: 11111 10000 10000 11110 10000 10000 11111
G: 01110 10001 10000 10111 10001 10001 01111
H: 10001 10001 10001 11111 10001 10001 10001
I: 01110 00100 00100 00100 00100 00100 01110
L: 10000 10000 10000 10000 10000 10000 11111
M: 10001 11011 10101 10101 10001 10001 10001
N: 10001 11001 10101 10011 10001 10001 10001
O: 01110 10001 10001 10001 10001 10001 01110
R: 11110 10001 10001 11110 10100 10010 10001
S: 01111 10000 10000 01110 00001 00001 11110
T: 11111 00100 00100 00100 00100 00100 00100
W: 10001 10001 10001 10101 10101 11011 10001
Y: 10001 10001 01010 00100 00100 00100 00100
-: 00000 00000 00000 11111 00000 00000 00000
```

Each row string lists the 5 columns left to right; the 7 rows go top to
bottom in the order shown.

## 8. Options

All optional. Unspecified means the default.

| Option            | Type                             | Default                                        | Effect                                                                                                       |
| ----------------- | -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `scatter`         | float                            | `1` for presets `scatter` and `real`, else `0` | `scatter` argument of `scatterColor` (section 6)                                                             |
| `tone`            | float                            | `1` for preset `real`, else `0`                | `tone` argument of `scatterColor`: scales the brightness spread and ties hue and chroma to it                |
| `shading`         | float                            | `1` for preset `real`, else `0`                | scales the plane of light across the photo (7.2)                                                             |
| `faceShift`       | float                            | `1` for preset `real`, else `0`                | `faceShift` argument of `scatterColor`: scales the shift all stickers of a color share in one photo          |
| `lightness`       | float                            | `0` for preset `real`, else `1`                | scales the per-sticker brightness `jitter` (7.2)                                                             |
| `palette`         | map letter -> rgb                | none                                           | merged over the default palette; the user value wins per letter. New letters are allowed.                    |
| `logo`            | `{row, col, color, size?}`       | none                                           | round patch on one sticker (7.2); `size` default 0.5                                                         |
| `noise`           | float (sigma, 0..255 levels)     | none                                           | 7.4 step 3                                                                                                   |
| `blur`            | float (pixels)                   | none                                           | 7.4 step 2, only if `>= 1`                                                                                   |
| `brightness`      | float                            | none                                           | 7.4 step 1                                                                                                   |
| `shadow`          | `{strength?, shape?, softness?}` | none                                           | options of the shadow stage (7.3): the `shadow` preset takes them, any other preset gets a shadow when given |
| `geometry.margin` | float                            | 0.035                                          | `marginShare`                                                                                                |
| `geometry.gap`    | float                            | 0.07                                           | `gapShare`                                                                                                   |
| `geometry.radius` | float                            | 0.14                                           | `radiusShare`                                                                                                |

An unknown preset name is the only error case. The reference does no other
validation (a grid that is not square, an empty grid, a non-positive size are
out of scope; do not rely on any behavior for them).

## 9. Processing order summary

1. Allocate `size*size*4` zero bytes.
2. Stage 1 draw (7.2).
3. Preset effect (7.3).
4. `brightness`, then `blur`, then `noise` (7.4).
5. Label (7.5).
6. Return the bytes.

## 10. Implementation checklist

- [ ] `hash` uses the double product and `ToInt32` for the second multiply.
- [ ] Pixel stores round half to even and clamp; `Math.round` sites round half up.
- [ ] Every stage reads back the quantized integers, never floats.
- [ ] Sticker colors pass through the OKLCH round trip even with scatter, tone and face shift all 0.
- [ ] `tone`, `shading` and `faceShift` skip their random draws only when off (`> 0` tests), and keep the operation order of section 6.
- [ ] The label skips missing glyphs but advances 6 columns, and wraps by flat index.
- [ ] Blur is horizontal first, edge-clamped, and uses the previous pass's integers.
- [ ] Preset noise uses `seed`; the option noise uses `seed + 7919`.

## 11. Test vectors

Grid (3 x 3), seed `7`, size `96`:

```
W Y O
R G B
B W R
```

SHA-256 is over the raw `96*96*4` output bytes. `px(x,y)` is the RGBA of
that pixel.

| preset     | options                                                | sha256                                                             | px(48,48)     | px(10,10)       | px(80,20)      |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------ | ------------- | --------------- | -------------- |
| clean      | `{}`                                                   | `5e23f4b232c22e9859abf96dcba5b6fd79b9d5b55ba10292a75fd76f88c7e277` | 35,153,76,255 | 213,213,205,255 | 223,114,32,255 |
| scatter    | `{}`                                                   | `e89b5f3487a80023d4c3b137fd1d1224cf288d1025a651a1f18b78abeba2c3f7` | 13,154,70,255 | 214,213,206,255 | 225,113,18,255 |
| gradient   | `{}`                                                   | `c5b18bdaf6425dec42c9ac485f56867ccb945a75c10d9eec471a2c4aa4e9e6bb` | 35,153,76,255 | 162,213,254,255 | 255,114,26,255 |
| shadow     | `{}`                                                   | `1669ca66e13ee4b1aab0a7bb8955ee1bc4d8b9a47600d0ffa2e302f9ece14158` | 30,130,65,255 | 213,213,205,255 | 190,97,27,255  |
| dim-warm   | `{}`                                                   | `64ccb92ca85e307f7fed8d6d7ca19f21569e37649a83adbe1b585e2635f07478` | 18,76,27,255  | 115,109,52,255  | 131,52,7,255   |
| glare      | `{}`                                                   | `0404b91de9ed84f2d171ace2669201e4006db75139a7f76f58f01276b22c2a90` | 35,153,76,255 | 240,240,238,255 | 223,114,32,255 |
| noise      | `{}`                                                   | `05eb00a6cd2e933ebba624511c9afdbd623e4594b99b39cb76b5f98196635fd7` | 28,154,77,255 | 180,221,154,255 | 215,103,23,255 |
| bad-camera | `{}`                                                   | `c159f860628cb6abdb21f70b66c5bb97639bf3cfad22f83b3032288e5f654d82` | 29,154,77,255 | 188,219,167,255 | 217,106,25,255 |
| clean      | `{lightness: 3}`                                       | `4e43573ddb8afd9a4e591dcc0cbf363e519cfaeea527b6d64f88086e818cfbec` | 36,160,79,255 | 206,206,199,255 | 223,114,32,255 |
| clean      | `{palette: {W: (200,40,40)}}`                          | `1de8e2dc03c86163cbcbfe7a3617e57d96c4b7950bcba04a13640eb1f12c6651` | 35,153,76,255 | 183,37,37,255   | 223,114,32,255 |
| clean      | `{logo: {row 0, col 0, color B, size 0.5}}`            | `f1d5320bcea0e0948721c3652edcc5d5bffd73274707cad0e277b615f9bdeda2` | 35,153,76,255 | 213,213,205,255 | 223,114,32,255 |
| clean      | `{noise: 12}`                                          | `32289cbeb46095b71d4b35c57ac4cf313f843de23ac6500ec972a6894a84d998` | 43,146,67,255 | 211,217,183,255 | 223,121,32,255 |
| clean      | `{blur: 3}`                                            | `4c4872dae83762b6dac4cc42706485d24dcae720846c918ad8bc3e3da3f7c7b1` | 35,153,76,255 | 213,213,205,255 | 223,114,32,255 |
| clean      | `{brightness: 0.5}`                                    | `e923dfc88ebabb72f0b6df4fa360ae13bc1de4bb45722439d8a10b35497018d2` | 18,76,38,255  | 106,106,102,255 | 112,57,16,255  |
| real       | `{}`                                                   | `5b8a858235039105674afd36862f85810e143abbcf9854c836ebb190c7756399` | 22,153,74,255 | 232,230,224,255 | 228,117,9,255  |
| clean      | `{tone: 1}`                                            | `3b798eb2412d6e71440be2a2e3a064d10fdd668b9d1c65509444ee73118f30df` | 31,150,73,255 | 216,216,209,255 | 223,114,32,255 |
| clean      | `{shading: 1}`                                         | `47f2ae38f340983ddc0ee29253e15321b0e997e52f7ef1bfe6587d9c8b69be62` | 35,153,76,255 | 212,212,205,255 | 227,116,32,255 |
| clean      | `{faceShift: 1}`                                       | `a70f79cce79fc7b95361e56f15f2faadf299283c359465032ec19f86464122d2` | 38,158,82,255 | 225,225,217,255 | 222,115,26,255 |
| real       | `{tone: 0.5, shading: 2, faceShift: 0.3, noise: 6}`    | `1c5242cc1fa426083671d58ca9fc63d11e2da78ae0c78e5e228c575c37f8ef1d` | 27,147,66,255 | 220,221,202,255 | 233,121,17,255 |
| shadow     | `{shadow: {shape half, strength 0.3, softness 0.2}}`   | `4fabd5d6402b0112df39013df3ae2e0100126f4b7f98d578e653d7c39b7bfba9` | 30,130,65,255 | 213,213,205,255 | 183,93,26,255  |
| shadow     | `{shadow: {shape spot, strength 0.25, softness 0.05}}` | `9ee5af5975c3f6d76d7746ec4a3c44427bd21bc6a4f66a7b1835a253f65b3555` | 28,124,62,255 | 213,213,205,255 | 203,104,29,255 |
| shadow     | `{shadow: {shape corner, strength 0.2, softness 0.3}}` | `309022f2f45d2dfb25a3cc04bc9dda068bc581895347195ed98ce4a2754c4362` | 35,153,76,255 | 213,213,205,255 | 223,114,32,255 |
| clean      | `{shadow: {shape band, strength 0.3, softness 0.1}}`   | `bf0bc6d410375832c3ff7a9d4dcfe8ef5273f0013f34875070b8bbe2fb81aaf4` | 25,107,53,255 | 213,213,205,255 | 156,80,22,255  |
| clean      | `{geometry: {gap 0.2, radius 0.3, margin 0.06}}`       | `41d1c3b5d054261fff53476770c91f6fead4becd4f8c61cce55d257c82b3c1fc` | 35,153,76,255 | 18,18,22,255    | 223,114,32,255 |

Intermediate vectors, to debug the building blocks:

| Function       | Input                                 | Result                                                                   |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `hash`         | (0, 0)                                | `0`                                                                      |
| `hash`         | (0, 1)                                | `-995253203` (a wrapping 32-bit multiply gives `-995253211`: wrong)      |
| `hash`         | (2, 3)                                | `-258837870`                                                             |
| `hash`         | (1, 0)                                | `-2112589356`, `unit` = `0.07986187934875488`                            |
| `hash`         | (1, 1)                                | `-1443748110`, `unit` = `0.9459067583084106`                             |
| `hash`         | (7, 5)                                | `-1240902135`, `unit` = `0.03646904230117798`                            |
| `hash`         | (7, 6000)                             | `1296429893`, `unit` = `0.273243248462677`                               |
| `hash`         | (123456, 999999)                      | `-630710680`, `unit` = `0.40671396255493164`                             |
| `gauss`        | (7, 0)                                | `-0.32686746288037005`                                                   |
| `gauss`        | (7, 6000)                             | `-0.3998755282614002`                                                    |
| `gauss`        | (7, 6001)                             | `-0.5639761522217001`                                                    |
| `rgbToOKLCH`   | (190, 36, 46)                         | L `0.5217946271866125`, C `0.18836178322439825`, h `23.996476659333837`  |
| `rgbToOKLCH`   | (232, 232, 224)                       | L `0.9287812843768155`, C `0.010675359825349588`, h `106.60558918591029` |
| `rgbToOKLCH`   | (34, 84, 192)                         | L `0.4800873183057759`, C `0.17815358772718604`, h `262.8388343846658`   |
| `oklabToRgb`   | (0.6, 0.1, 0.05)                      | `(186, 100, 92)`                                                         |
| `scatterColor` | base R, label R, seed 7, k 4, scale 1 | `(193, 27, 43)`                                                          |
| `scatterColor` | base W, label W, seed 7, k 0, scale 1 | `(233, 232, 225)`                                                        |

**Acceptance.** First make every `hash`/`gauss` line match exactly (they use
only integer arithmetic, one `ln`, one `cos` and one `sqrt`; `gauss` should
match to at least 12 significant digits). Then check the pixel probes.
A port is **exact** when the SHA-256 values match. If only `ln`, `cos`,
`cbrt` or `pow` differ in the last bit, a few bytes can differ by 1; in
that case accept the port when every byte is within +-1 of the reference
and fewer than 1% of the bytes differ, and report which libm you used.
A single large difference (more than 1) always means a logic error.

## 12. Extension rules

When a new option or preset is added to the reference, it must (a) leave
all vectors above unchanged when it is absent, (b) draw its random numbers
from a **new index range** so that existing ranges stay stable, (c) append
its own vector to section 11, and (d) be added to this specification in the
same commit (the spec test fails otherwise).

Random indices in use, by function:

| Function    | Indices                  | Used for                                    |
| ----------- | ------------------------ | ------------------------------------------- |
| `unit`      | `1000 + k`               | per-sticker brightness jitter               |
| `unit`      | `5000 .. 5015`           | glare spots                                 |
| `unit`      | `7000`, `7001`           | direction and slope of the shading plane    |
| `gauss`     | `6000 + 2k`, `6001 + 2k` | scatter of hue and chroma                   |
| `gauss`     | `9000 .. 9020`           | face shift (3 per color letter, 7 colors)   |
| `gauss`     | `10000 + 3k`             | tone brightness deviation of sticker `k`    |
| `gauss`     | `3p .. 3p + 2`           | pixel noise, `p = y * size + x`             |
| seed offset | `seed + 7919`            | the `noise` option (same noise, other seed) |

`gauss(i)` consumes `unit(2i)` and `unit(2i + 1)`, so index ranges of the two
functions overlap numerically; the streams are used for unrelated purposes,
and the rule above only keeps them apart _within_ one purpose.
