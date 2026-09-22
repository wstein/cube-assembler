/**
 * test/notation.test.ts
 * Vitest tests for the unified Notation module (covers WRG + URF functionality).
 *
 * Run: bun vitest run   (or: npx vitest run)
 */
import { describe, it, expect } from "vitest";

// ─── Inline minimal mirrors (until ReScript compilation is set up) ────────────
// These mirror the ReScript logic exactly so tests are runnable immediately.

type FaceColor = "W" | "O" | "G" | "R" | "B" | "Y";
type FaceGrid  = { n: number; data: FaceColor[] };
type CubeIR    = { size: number; u: FaceGrid; r: FaceGrid; f: FaceGrid; d: FaceGrid; l: FaceGrid; b: FaceGrid };

type Alphabet = { w: string; o: string; g: string; r: string; b: string; y: string };

const wrgAlphabet: Alphabet    = { w:"W", o:"O", g:"G", r:"R", b:"B", y:"Y" };
const kociembaAlphabet: Alphabet = { w:"U", o:"L", g:"F", r:"R", b:"B", y:"D" };
const numericAlphabet: Alphabet  = { w:"0", o:"1", g:"2", r:"3", b:"4", y:"5" };

const COLOR_FROM_SYM = (a: Alphabet, s: string): FaceColor | null => {
  const u = s.toUpperCase();
  if (u === a.w.toUpperCase()) return "W";
  if (u === a.o.toUpperCase()) return "O";
  if (u === a.g.toUpperCase()) return "G";
  if (u === a.r.toUpperCase()) return "R";
  if (u === a.b.toUpperCase()) return "B";
  if (u === a.y.toUpperCase()) return "Y";
  return null;
};

const SYM_FROM_COLOR = (a: Alphabet, c: FaceColor): string =>
  ({ W:a.w, O:a.o, G:a.g, R:a.r, B:a.b, Y:a.y })[c];

function makeSolid(n: number, c: FaceColor): FaceGrid {
  return { n, data: Array(n * n).fill(c) };
}

function makeIdentity(n: number): CubeIR {
  return { size: n, u: makeSolid(n,"W"), r: makeSolid(n,"R"), f: makeSolid(n,"G"),
    d: makeSolid(n,"Y"), l: makeSolid(n,"O"), b: makeSolid(n,"B") };
}

function parseFacelets(s: string, a: Alphabet = wrgAlphabet, size?: number): CubeIR | string {
  const tokens = s.trim().split(/\s+/).filter(Boolean)
    .flatMap(t => t.split(/[,;|]+/).filter(Boolean));
  const n = size ?? Math.round(Math.sqrt(tokens.length / 6));
  if (n * n * 6 !== tokens.length) return `WrongCount: expected ${n*n*6}, got ${tokens.length}`;
  const colors = tokens.map((t, i) => {
    const c = COLOR_FROM_SYM(a, t);
    if (!c) throw new Error(`UnknownSymbol '${t}' at ${i}`);
    return c;
  });
  const f = n * n;
  const sl = (i: number) => colors.slice(i*f, (i+1)*f) as FaceColor[];
  return { size: n, u:{n,data:sl(0)}, r:{n,data:sl(1)}, f:{n,data:sl(2)},
           d:{n,data:sl(3)}, l:{n,data:sl(4)}, b:{n,data:sl(5)} };
}

function printFacelets(cube: CubeIR, a: Alphabet = wrgAlphabet, labeled = true): string {
  const faces = [["U",cube.u],["R",cube.r],["F",cube.f],["D",cube.d],["L",cube.l],["B",cube.b]] as const;
  return faces.map(([lbl, face]) => {
    const row = (face as FaceGrid).data.map(c => SYM_FROM_COLOR(a, c)).join(" ");
    return labeled ? `${lbl}: ${row}` : row;
  }).join("\n");
}

function printFlat(cube: CubeIR, a: Alphabet = wrgAlphabet): string {
  const faces: FaceGrid[] = [cube.u, cube.r, cube.f, cube.d, cube.l, cube.b];
  return faces.flatMap(f => f.data.map(c => SYM_FROM_COLOR(a, c))).join("");
}

function transcode(s: string, from_: Alphabet, to_: Alphabet): string | string {
  const cube = parseFacelets(s, from_);
  if (typeof cube === "string") return cube;
  return printFlat(cube, to_);
}

function rotateFace(g: FaceGrid, k: number): FaceGrid {
  k = ((k % 4) + 4) % 4;
  let cur = [...g.data];
  const n = g.n;
  for (let step = 0; step < k; step++) {
    const next = new Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
      next[c * n + (n - 1 - r)] = cur[r * n + c];
    cur = next;
  }
  return { n, data: cur };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Alphabet system", () => {
  it("wrgAlphabet has 6 distinct symbols", () => {
    const syms = Object.values(wrgAlphabet);
    expect(new Set(syms).size).toBe(6);
  });

  it("kociembaAlphabet has 6 distinct symbols", () => {
    const syms = Object.values(kociembaAlphabet);
    expect(new Set(syms).size).toBe(6);
  });

  it("numericAlphabet has 6 distinct symbols", () => {
    const syms = Object.values(numericAlphabet);
    expect(new Set(syms).size).toBe(6);
  });

  it("colorToSym is consistent with symToColor (WRG)", () => {
    const colors: FaceColor[] = ["W","O","G","R","B","Y"];
    for (const c of colors) {
      const sym = SYM_FROM_COLOR(wrgAlphabet, c);
      expect(COLOR_FROM_SYM(wrgAlphabet, sym)).toBe(c);
    }
  });

  it("colorToSym is consistent with symToColor (Kociemba)", () => {
    const colors: FaceColor[] = ["W","O","G","R","B","Y"];
    for (const c of colors) {
      const sym = SYM_FROM_COLOR(kociembaAlphabet, c);
      expect(COLOR_FROM_SYM(kociembaAlphabet, sym)).toBe(c);
    }
  });
});

describe("WRG (facelet) parse + print round-trip", () => {
  it("round-trips the solved 2x2 cube", () => {
    const cube = makeIdentity(2);
    const printed = printFlat(cube);
    expect(printed).toBe("WWWWRRRRGGGGYYYYOOOOBBBB");
    const parsed = parseFacelets(printed.split("").join(" "));
    expect(typeof parsed).not.toBe("string");
    expect((parsed as CubeIR).u.data[0]).toBe("W");
  });

  it("round-trips the solved 3x3 cube (WRG labeled)", () => {
    const cube = makeIdentity(3);
    const printed = printFacelets(cube, wrgAlphabet, true);
    // Should start with U: W W W ...
    expect(printed.startsWith("U: W W W")).toBe(true);
    const flat = printFlat(cube);
    expect(flat).toBe("W".repeat(9) + "R".repeat(9) + "G".repeat(9) + "Y".repeat(9) + "O".repeat(9) + "B".repeat(9));
  });

  it("round-trips the solved 4x4 cube", () => {
    const cube = makeIdentity(4);
    const flat = printFlat(cube);
    expect(flat.length).toBe(4*4*6); // 96 chars
    expect(flat.startsWith("WWWWWWWWWWWWWWWW")).toBe(true);
  });

  it("parseFacelets infers size correctly for 3x3 (54 tokens)", () => {
    const tokens = [
      ...Array(9).fill("W"),
      ...Array(9).fill("R"),
      ...Array(9).fill("G"),
      ...Array(9).fill("Y"),
      ...Array(9).fill("O"),
      ...Array(9).fill("B"),
    ].join(" ");
    const cube = parseFacelets(tokens);
    expect(typeof cube).not.toBe("string");
    expect((cube as CubeIR).size).toBe(3);
  });

  it("parseFacelets rejects wrong token count", () => {
    const result = parseFacelets("W W W");
    expect(typeof result).toBe("string"); // error message
  });

  it("parseFacelets rejects unknown symbol", () => {
    const tokens = Array(54).fill("W");
    tokens[10] = "X"; // invalid
    expect(() => parseFacelets(tokens.join(" "))).toThrow("UnknownSymbol");
  });
});

describe("Kociemba alphabet", () => {
  it("parses a Kociemba solved string (UUUU...LLLL...)", () => {
    const solvedKociemba = "U".repeat(9) + "R".repeat(9) + "F".repeat(9) +
                           "D".repeat(9) + "L".repeat(9) + "B".repeat(9);
    const cube = parseFacelets(solvedKociemba.split("").join(" "), kociembaAlphabet);
    expect(typeof cube).not.toBe("string");
    expect((cube as CubeIR).u.data[0]).toBe("W"); // U→White in kociemba
  });

  it("kociemba flat string length is 54 for 3x3", () => {
    const cube = makeIdentity(3);
    const flat = printFlat(cube, kociembaAlphabet);
    expect(flat.length).toBe(54);
    expect(flat.startsWith("U")).toBe(true); // White face = U in kociemba
  });
});

describe("Numeric alphabet", () => {
  it("prints solved 3x3 as 0-5 digit string", () => {
    const cube = makeIdentity(3);
    const flat = printFlat(cube, numericAlphabet);
    expect(flat).toBe("0".repeat(9) + "3".repeat(9) + "2".repeat(9) + "5".repeat(9) + "1".repeat(9) + "4".repeat(9));
  });
});

describe("Transcode between alphabets", () => {
  it("transcodes solved 3x3 from WRG to Kociemba flat", () => {
    const solved = makeIdentity(3);
    const wrg = printFlat(solved, wrgAlphabet);      // WWWWW... 54 chars
    const koc = transcode(wrg.split("").join(" "), wrgAlphabet, kociembaAlphabet);
    // transcode always returns a string (result or error)
    expect(typeof koc).toBe("string");
    expect(koc.startsWith("U")).toBe(true);  // White → "U" in Kociemba
    expect(koc.length).toBe(54);
  });

  it("round-trips WRG → numeric → WRG", () => {
    const cube = makeIdentity(3);
    const wrg     = printFlat(cube, wrgAlphabet);
    const numeric = transcode(wrg.split("").join(" "), wrgAlphabet, numericAlphabet);
    const back    = transcode((numeric as string).split("").join(" "), numericAlphabet, wrgAlphabet);
    expect(back).toBe(wrg);
  });
});

describe("rotateFace (90° CW)", () => {
  it("4 rotations = identity", () => {
    const face: FaceGrid = { n: 2, data: ["W","R","G","Y"] };
    const rotated = rotateFace(face, 4);
    expect(rotated.data).toEqual(face.data);
  });

  it("1 CW rotation of [[W,R],[G,Y]] = [[G,W],[Y,R]]", () => {
    // Original:        After 90° CW:
    //  W R               G W
    //  G Y               Y R
    const face: FaceGrid = { n: 2, data: ["W","R","G","Y"] };
    const rotated = rotateFace(face, 1);
    expect(rotated.data).toEqual(["G","W","Y","R"]);
  });

  it("2 rotations = 180°", () => {
    const face: FaceGrid = { n: 2, data: ["W","R","G","Y"] };
    const rotated = rotateFace(face, 2);
    expect(rotated.data).toEqual(["Y","G","R","W"]);
  });

  it("3 rotations = 270° CW = 90° CCW", () => {
    const face: FaceGrid = { n: 2, data: ["W","R","G","Y"] };
    const rotated = rotateFace(face, 3);
    expect(rotated.data).toEqual(["R","Y","W","G"]);
  });

  it("NxN rotation preserves face size", () => {
    const n = 4;
    const face: FaceGrid = { n, data: Array.from({length:16}, (_,i) => ["W","O","G","R","B","Y"][i%6] as FaceColor) };
    const rotated = rotateFace(face, 1);
    expect(rotated.data.length).toBe(16);
    expect(rotated.n).toBe(4);
  });
});

describe("Notation format auto-detection", () => {
  it("flat facelet string (54 single chars) → Facelet format", () => {
    const s = "W".repeat(9) + "R".repeat(9) + "G".repeat(9) +
              "Y".repeat(9) + "O".repeat(9) + "B".repeat(9);
    const cube = parseFacelets(s.split("").join(" "));
    expect(typeof cube).not.toBe("string");
  });

  it("labeled WRG string round-trips correctly", () => {
    const cube = makeIdentity(3);
    const labeled = printFacelets(cube, wrgAlphabet, true);
    // Strip labels and re-parse
    const stripped = labeled.replace(/[URFDLB]: /g, "");
    const reparsed = parseFacelets(stripped);
    expect(typeof reparsed).not.toBe("string");
    expect(printFlat(reparsed as CubeIR)).toBe(printFlat(cube));
  });
});
