# CubeLab fingerprint

CubeAssembler publishes two machine-readable hints in its page so a browser
extension (a content script that only sees the DOM) can recognize the app and
read the cube's move history without scraping the visible text. Both are
invisible to people.

## The marker

A `<meta>` element in the static HTML shell, present before any script runs:

```html
<meta name="cubelab-fingerprint" content="spec=1;app=cube-assembler@0.1.0" />
```

`content` is a semicolon-separated list of `key=value` pairs. `spec` is the
version of this contract; `app` is the app name and its package version. The
build writes the version into `index.html` (a small Vite plugin replaces a
placeholder), so the marker needs no client code. It is on every page of the
app, including pages without a cube.

## The moves block

While the 3D cube view is shown (it renders the "Moves:" line), the page also
contains:

```html
<script type="application/json" id="cubelab-moves">
{"size":3,"moves":"2L' 2R U2","format":"layer-prefix/v1"}
</script>
```

The block is rewritten with the Moves line and always agrees with it after a
scramble, an undo, a reset or a turn. Without moves it still exists with
`"moves": ""` (the visible line says "None"; the block never contains that
word). When the 3D view is not shown (2D net, other pages) the block is absent.

| Field    | Type    | Meaning                                                      |
| -------- | ------- | ------------------------------------------------------------ |
| `size`   | integer | Cube size, 2 to 7 (an N×N×N cube).                           |
| `moves`  | string  | The move history, turns separated by single spaces, or `""`. |
| `format` | string  | The notation id; currently always `layer-prefix/v1`.         |

The JSON is validated by
[`cubelab-fingerprint-v1.schema.json`](https://wstein.github.io/cube-assembler/schemas/cubelab-fingerprint-v1.schema.json)
(source: `public/schemas/`). The text inside the element escapes `<` as
`<`; `JSON.parse` returns the original characters.

## Move notation `layer-prefix/v1`

One turn is `[layers]FACE[w][amount]`, or a whole-cube rotation.
- Face letters: `U` up, `D` down, `R` right, `L` left, `F` front, `B` back.
  Clockwise is as seen looking at that face.
- Amount: nothing is one clockwise quarter turn, `'` is one counterclockwise
  quarter turn, `2` is a half turn (direction is not distinguished).
- A single layer counted from the face: no prefix is the outer layer
  (`R`), `2R` is the second layer from the right face, `3U'` the third from
  the top. `2B2` is the second layer from the back, half turn. A prefix is
  the depth counted from the named face, so `2L'` and `2R` on a 5×5 are
  different slices.
- A block of layers: `w` after the face letter. `Rw` turns the two outer
  layers on the right (`R` and `2R`), `3Rw` the three outermost, `2-3Rw` the
  second and third layers only (an inner block). A block always has at least
  two layers and fewer than the whole cube.
- The whole cube: `x`, `y`, `z` (turning like `R`, `U`, `F`), with `'` for
  counterclockwise and `2` for a half turn (`x2`). A whole-cube turn is a
  block as wide as the cube.
- Consecutive turns of the same layers are merged by the app (`R R` becomes
  `R2`, `R R'` disappears), so the string is the shortest history.

Moves are written for the cube `size` in the block; the same turn can differ
between sizes (for example, a block as wide as the cube is a rotation).

## Versioning

Fields may be added to the block or marker without changing `spec`; readers
must ignore fields and `key=value` pairs they do not know. `spec` rises only
for a breaking change (a field removed, renamed or reinterpreted). A new
notation gets a new `format` id (for example `layer-prefix/v2`) instead of
changing `layer-prefix/v1`.

## Privacy

The marker and block contain only the spec version, the app name and version,
the cube size and the move string. They never contain the view mode, photos,
color profiles, settings, facelets or anything personal, and nothing is sent
anywhere by the app because of them.
