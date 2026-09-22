/* Notation.res
 * Unified facelet + cubie notation parser & printer for NxNxN Rubik's Cubes.
 *
 * The ONLY thing that differs between notation families is the 6-character
 * alphabet that maps facelet colors to printable symbols.
 *
 * ┌──────────────┬──────────────────────────────────────────────────────────┐
 * │ Notation     │ Alphabet (W  O  G  R  B  Y)                             │
 * ├──────────────┼──────────────────────────────────────────────────────────┤
 * │ WRG (WCA)    │ "W" "O" "G" "R" "B" "Y"  ← default                     │
 * │ URF (Singmaster) │ same letters, cubie-grouped output format           │
 * │ Kociemba     │ "U" "L" "F" "R" "B" "D"  (face-position based)        │
 * │ Numeric      │ "0" "1" "2" "3" "4" "5"  (ML / computer vision input) │
 * │ Custom       │ any 6 distinct single-char strings                      │
 * └──────────────┴──────────────────────────────────────────────────────────┘
 *
 * Both the WRG (facelet-flat) and URF (cubie-grouped) output formats are
 * provided by this single module, parameterised by `alphabet`.
 */

open CubeIR

/* ─── Alphabet ────────────────────────────────────────────────────────────── */

/** A bijection between the 6 facelet colors and 6 printable symbols.
    Field names are the colors; values are the symbol strings to use. */
type alphabet = {
  w: string,  // White
  o: string,  // Orange
  g: string,  // Green
  r: string,  // Red
  b: string,  // Blue
  y: string,  // Yellow
}

/** Standard WCA / WRG notation: W O G R B Y */
let wrgAlphabet: alphabet = { w: "W", o: "O", g: "G", r: "R", b: "B", y: "Y" }

/** Kociemba / cube solver notation: face-position symbols U L F R B D */
let kociembaAlphabet: alphabet = { w: "U", o: "L", g: "F", r: "R", b: "B", y: "D" }

/** Numeric alphabet: 0=W 1=O 2=G 3=R 4=B 5=Y (useful for ML pipelines) */
let numericAlphabet: alphabet = { w: "0", o: "1", g: "2", r: "3", b: "4", y: "5" }

/** URF / Singmaster: same letters as WRG (URF is a grouping format, not a different alphabet).
    Kept as a named alias for clarity in the API. */
let urfAlphabet: alphabet = wrgAlphabet

/** Translate a `faceletColor` to its symbol under a given `alphabet`. */
let colorToSym = (a: alphabet, c: faceletColor): string =>
  switch c {
  | W => a.w
  | O => a.o
  | G => a.g
  | R => a.r
  | B => a.b
  | Y => a.y
  }

/** Translate a symbol string back to a `faceletColor` under a given `alphabet`.
    Case-insensitive comparison. Returns `None` for unknown symbols. */
let symToColor = (a: alphabet, s: string): option<faceletColor> => {
  let su = String.toUpperCase(s)
  if      su == String.toUpperCase(a.w) { Some(W) }
  else if su == String.toUpperCase(a.o) { Some(O) }
  else if su == String.toUpperCase(a.g) { Some(G) }
  else if su == String.toUpperCase(a.r) { Some(R) }
  else if su == String.toUpperCase(a.b) { Some(B) }
  else if su == String.toUpperCase(a.y) { Some(Y) }
  else { None }
}

/** All 6 symbols of an alphabet as an array in [W,O,G,R,B,Y] order. */
let alphabetSymbols = (a: alphabet): array<string> =>
  [a.w, a.o, a.g, a.r, a.b, a.y]

/** Validate that an alphabet has 6 distinct single-char symbols. */
let validateAlphabet = (_a: alphabet): result<unit, string> => {
  // TODO: Implement full validation
  Ok()
}

/* ─── Parse Error ─────────────────────────────────────────────────────────── */

type parseError =
  | WrongTokenCount({ expected: int, got: int })
  | UnknownSymbol({ sym: string, position: int, alphabet: string })
  | AmbiguousSize({ tokens: int })
  | UnsupportedFormat(string)

let parseErrorMessage = (e: parseError): string =>
  switch e {
  | WrongTokenCount({ expected, got }) =>
    `Wrong token count: expected ${Int.toString(expected)}, got ${Int.toString(got)}`
  | UnknownSymbol({ sym, position, alphabet }) =>
    `Unknown symbol '${sym}' at position ${Int.toString(position)} (alphabet: ${alphabet})`
  | AmbiguousSize({ tokens }) =>
    `Cannot infer puzzle size from ${Int.toString(tokens)} tokens (not divisible by 6 or not a perfect square)`
  | UnsupportedFormat(s) => `Unsupported format: ${s}`
  }

/* ─── Shared Tokeniser ────────────────────────────────────────────────────── */

/** Split any notation string into tokens on whitespace + common separators.
    Strips labels like "U:" "Corners:" "Edges:" etc. */
let tokenize = (s: string): array<string> =>
  s
  ->Js.String2.replaceByRe(%re("/[Uu]p:|[Dd]own:|[Ll]eft:|[Rr]ight:|[Ff]ront:|[Bb]ack:|Corners:|Edges:|Centers:|[URFDLB]:/g"), " ")
  ->Js.String2.replaceByRe(%re("/[\n\r\t,;|]+/g"), " ")
  ->Js.String2.split(" ")
  ->Array.filter(t => String.length(String.trim(t)) > 0)

/** Infer puzzle size from total token count (must be 6×N²). */
let inferSize = (tokenCount: int): option<puzzleSize> => {
  if mod(tokenCount, 6) != 0 { None }
  else {
    let faceTokens = tokenCount / 6
    let n = ref(2)
    let found = ref(false)
    while n.contents <= 7 && !found.contents {
      if n.contents * n.contents == faceTokens { found := true }
      else { n := n.contents + 1 }
    }
    if found.contents { puzzleSizeFromN(n.contents) } else { None }
  }
}

/* ─── Facelet (WRG-style) Parser ──────────────────────────────────────────── */

/** Parse a flat facelet string into a `cubeIR`.
    Tokens are in URFDLB face order, row-major within each face.
    If `size` is `None`, it is inferred from the token count.
    Works with ANY alphabet. */
let parseFacelets = (
  s: string,
  ~alphabet: alphabet=wrgAlphabet,
  ~size: option<puzzleSize>=None,
  (),
): result<cubeIR, parseError> => {
  let tokens = tokenize(s)
  let totalTokens = Array.length(tokens)

  let sizeResult: result<puzzleSize, parseError> =
    switch size {
    | Some(sz) => Ok(sz)
    | None =>
      switch inferSize(totalTokens) {
      | Some(sz) => Ok(sz)
      | None => Error(AmbiguousSize({ tokens: totalTokens }))
      }
    }

  switch sizeResult {
  | Error(e) => Error(e)
  | Ok(sz) =>
    let n = puzzleSizeN(sz)
    let faceN = n * n
    let expected = faceN * 6

    if totalTokens != expected {
      Error(WrongTokenCount({ expected, got: totalTokens }))
    } else {
      // Translate all tokens → colors
      let alphabetStr = Js.Array2.joinWith(alphabetSymbols(alphabet), "")
      let colorResults: array<result<faceletColor, parseError>> =
        tokens->Array.mapWithIndex((tok, i) =>
          switch symToColor(alphabet, tok) {
          | Some(c) => Ok(c)
          | None => Error(UnknownSymbol({ sym: tok, position: i, alphabet: alphabetStr }))
          }
        )

      let firstErr = colorResults->Array.find(r => switch r { | Error(_) => true | _ => false })
      switch firstErr {
      | Some(Error(e)) => Error(e)
      | _ =>
        let colors = colorResults->Array.map(r => switch r { | Ok(c) => c | _ => W })
        let slice = (i: int) => Belt.Array.slice(colors, ~offset=i * faceN, ~len=faceN)
        switch fromFaceArray(sz, [
          { n, data: slice(0) }, // U
          { n, data: slice(1) }, // R
          { n, data: slice(2) }, // F
          { n, data: slice(3) }, // D
          { n, data: slice(4) }, // L
          { n, data: slice(5) }, // B
        ]) {
        | Some(cube) => Ok(cube)
        | None => Error(WrongTokenCount({ expected: 6, got: 0 }))
        }
      }
    }
  }
}

/* ─── Facelet (WRG-style) Printer ────────────────────────────────────────────  */

/** Print a single `faceGrid` as space-separated symbols. */
let printFace = (face: faceGrid, ~alphabet: alphabet=wrgAlphabet, ()): string =>
  face.data->Array.map(colorToSym(alphabet, ...))->Js.Array2.joinWith(" ")

/** Print a `cubeIR` as a labeled multi-line facelet string:
    U: W W W …
    R: R R R …
    …  */
let printLabeled = (cube: cubeIR, ~alphabet: alphabet=wrgAlphabet, ()): string => {
  [("U", cube.u), ("R", cube.r), ("F", cube.f), ("D", cube.d), ("L", cube.l), ("B", cube.b)]
  ->Array.map(((label, face)) => `${label}: ${printFace(face, ~alphabet, ())}`)
  ->Js.Array2.joinWith("\n")
}

/** Print a `cubeIR` as a compact single-line facelet string (faces separated by "  "). */
let printCompact = (cube: cubeIR, ~alphabet: alphabet=wrgAlphabet, ()): string =>
  toFaceArray(cube)
  ->Array.map(face => printFace(face, ~alphabet, ()))
  ->Js.Array2.joinWith("  ")

/** Print a `cubeIR` as a single flat symbol string with NO spaces (kociemba-style). */
let printFlat = (cube: cubeIR, ~alphabet: alphabet=wrgAlphabet, ()): string =>
  toFaceArray(cube)
  ->Array.flatMap(face => face.data->Array.map(c => colorToSym(alphabet, c)))
  ->Js.Array2.joinWith("")

/* ─── Cubie (URF-style) Printer ──────────────────────────────────────────── */

/** Corner sticker indices for 3×3 (facePos, idx) triplets.
    Physical order: UFR UBR UBL UFL DFR DBR DBL DFL */
let cornerFacelets3x3: array<array<(facePos, int)>> = [
  [(U,8),(R,0),(F,2)], [(U,2),(B,2),(R,2)], [(U,0),(L,2),(B,0)], [(U,6),(F,0),(L,2)],
  [(D,2),(F,8),(R,6)], [(D,8),(R,8),(B,6)], [(D,6),(B,8),(L,6)], [(D,0),(L,8),(F,6)],
]

let cornerNames3x3 = ["UFR","UBR","UBL","UFL","DFR","DBR","DBL","DFL"]

/** Edge sticker indices for 3×3. */
let edgeFacelets3x3: array<array<(facePos, int)>> = [
  [(U,7),(F,1)], [(U,5),(R,1)], [(U,1),(B,1)], [(U,3),(L,1)],
  [(D,1),(F,7)], [(D,5),(R,7)], [(D,7),(B,7)], [(D,3),(L,7)],
  [(F,5),(R,3)], [(F,3),(L,5)], [(B,5),(R,5)], [(B,3),(L,3)],
]

let edgeNames3x3 = ["UF","UR","UB","UL","DF","DR","DB","DL","FR","FL","BR","BL"]

/** Center indices for 3×3 (index 4 in a 9-element face). */
let centerFacelets3x3: array<(facePos, int)> =
  [(U,4),(R,4),(F,4),(D,4),(L,4),(B,4)]

let centerNames3x3 = ["U","R","F","D","L","B"]

/** Print cubies grouped as Corners / Edges / Centers (3×3 only).
    Uses the given `alphabet` for all color symbols. */
let printCubies3x3 = (_cube: cubeIR, ~alphabet as _alphabet=wrgAlphabet, ()): string => {
  "Corners: TODO\nEdges: TODO\nCenters: TODO"
}

/** Generic cubie printer: 3×3 uses grouped format; NxN falls back to labeled facelet. */
let printCubies = (cube: cubeIR, ~alphabet: alphabet=wrgAlphabet, ()): string =>
  switch cube.size {
  | ThreeByThree => printCubies3x3(cube, ~alphabet, ())
  | _ =>
    // NxN positional fallback — same data, N×N grid layout per face
    let header = `// ${puzzleSizeName(cube.size)} positional facelet (cubie URF not yet fully implemented)\n`
    header ++ printLabeled(cube, ~alphabet, ())
  }

/* ─── Cubie (URF-style) Parser ────────────────────────────────────────────── */

/** Parse a cubie-grouped string (output of `printCubies3x3`) back to a `cubeIR`.
    Works with ANY alphabet — it just uses `symToColor` under the given alphabet.
    Currently reconstructs only center colors (full corner/edge placement is a
    constraint problem deferred to a solver pass). */
let parseCubies3x3 = (
  s: string,
  ~alphabet: alphabet=wrgAlphabet,
  (),
): result<cubeIR, parseError> => {
  // Tokenize strips "Corners:" "Edges:" "Centers:" labels already
  let tokens = tokenize(s)

  // Separate into 3-sym corner tokens, 2-sym edge tokens, 1-sym center tokens
  // Token format: "UFR:WRG" or "WRG" (bare)
  let stripLabel = (tok: string): string =>
    switch Js.String2.split(tok, ":")->Array.length > 1 {
    | true => Js.String2.split(tok, ":")->Array.sliceToEnd(~start=1)->Js.Array2.joinWith("")
    | false => tok
    }

  let syms = tokens->Array.map(stripLabel)->Array.filter(t => String.length(t) > 0)

  // Find center tokens (1 symbol each, 6 of them)
  let alphabetStr = Js.Array2.joinWith(alphabetSymbols(alphabet), "")
  let centerSyms = syms->Array.filter(t => String.length(t) == 1)

  if Array.length(centerSyms) < 6 {
    // Fall back to flat facelet parsing — maybe it's WRG format after all
    parseFacelets(s, ~alphabet, ())
  } else {
    // Reconstruct center colors → build identity cube with corrected centers
    let cube = ref(makeIdentity(ThreeByThree))
    let centerSyms6 = Belt.Array.slice(centerSyms, ~offset=0, ~len=6)
    centerSyms6->Array.forEachWithIndex((sym, i) => {
      switch symToColor(alphabet, sym) {
      | None => ()  // skip unknown
      | Some(color) =>
        let pos = Belt.Array.getExn(allFacePositions, i)
        let face = getFace(cube.contents, pos)
        let newData = Array.copy(face.data)
        newData[4] = color
        cube := setFace(cube.contents, pos, { ...face, data: newData })
      }
    })
    let _ = alphabetStr  // used in error path
    Ok(cube.contents)
  }
}

/* ─── Unified Parse ───────────────────────────────────────────────────────── */

type format = Facelet | Cubie

/** Auto-detect format: if tokens contain 3-char cubie refs → Cubie, else → Facelet. */
let detectFormat = (s: string): format => {
  let tokens = tokenize(s)
  // If ANY token (after stripping labels) has length 2 or 3 and all chars are in known range → Cubie
  let hasCubieTokens = tokens->Array.some(t => {
    let stripped = switch Js.String2.split(t, ":")->Array.length > 1 {
    | true => Js.String2.split(t, ":")->Array.sliceToEnd(~start=1)->Js.Array2.joinWith("")
    | false => t
    }
    String.length(stripped) == 3 || String.length(stripped) == 2
  })
  if hasCubieTokens { Cubie } else { Facelet }
}

/** Parse either WRG (facelet) or URF (cubie) notation from a single string.
    Format is auto-detected unless `~format` is specified.
    Alphabet defaults to `wrgAlphabet` but can be any custom 6-char bijection. */
let parse = (
  s: string,
  ~alphabet: alphabet=wrgAlphabet,
  ~format: option<format>=None,
  ~size: option<puzzleSize>=None,
  (),
): result<cubeIR, parseError> => {
  let fmt = format->Option.getOr(detectFormat(s))
  switch fmt {
  | Facelet => parseFacelets(s, ~alphabet, ~size, ())
  | Cubie =>
    switch size {
    | Some(ThreeByThree) | None => parseCubies3x3(s, ~alphabet, ())
    | Some(sz) =>
      // For NxN > 3x3, cubie format falls back to facelet
      parseFacelets(s, ~alphabet, ~size=Some(sz), ())
    }
  }
}

/** Print a `cubeIR` in the given format and alphabet.
    - `Facelet` → labeled multi-line facelet (WRG-style)
    - `Cubie`   → grouped corner/edge/center (URF-style, 3×3 only) */
let print = (
  cube: cubeIR,
  ~alphabet: alphabet=wrgAlphabet,
  ~format: format=Facelet,
  (),
): string =>
  switch format {
  | Facelet => printLabeled(cube, ~alphabet, ())
  | Cubie   => printCubies(cube, ~alphabet, ())
  }

/* ─── Alphabet Conversion ─────────────────────────────────────────────────── */

/** Transcode a cube state from one alphabet's string to another.
    E.g. convert a Kociemba string ("UUUURRR…") to WRG ("WWWWRRR…"). */
let transcode = (
  s: string,
  ~from_: alphabet,
  ~to_: alphabet,
  ~format: format=Facelet,
  (),
): result<string, parseError> =>
  parse(s, ~alphabet=from_, ~format=Some(format), ())
  ->Belt.Result.map(cube => print(cube, ~alphabet=to_, ~format, ()))

/* ─── Round-trip ──────────────────────────────────────────────────────────── */

/** Parse and immediately re-print to normalise whitespace. */
let normalize = (
  s: string,
  ~alphabet: alphabet=wrgAlphabet,
  ~format: format=Facelet,
  (),
): result<string, parseError> =>
  parse(s, ~alphabet, ~format=Some(format), ())
  ->Belt.Result.map(cube => print(cube, ~alphabet, ~format, ()))
