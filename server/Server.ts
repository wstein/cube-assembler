/**
 * server/Server.ts — CubeAssembler Hono + Bun Server
 *
 * The API behind the Vite app: the page itself is served by Vite in
 * development (which forwards /api here) and by GitHub Pages in production.
 *
 * Routes:
 *   POST /api/fixtures             → save a human-verified capture to
 *                                     test/fixtures/ as a regression fixture
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { wrgFaceletsToGrids } from "../src/client/notationOutput";

// ─── Hono app ─────────────────────────────────────────────────────────────────

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors({ origin: "*" }));

// ── POST /api/fixtures ───────────────────────────────────────────────────────
// Saves a real, human-verified capture (each face's actual photo plus the
// color grid after any manual corrections) to test/fixtures/<name>/, so a
// misclassification a human caught in the review wizard becomes a
// permanent regression fixture instead of a one-off bug report - see
// test/fixtures.test.ts, which runs the real detection pipeline
// (extractColorsFromImageData) against every saved fixture and checks it
// against the stored, human-verified colors.
type SaveFixtureRequest = {
  name?: string;
  gridSize: number;
  // Human-verified colors of all 6 faces as one WRG facelets string in
  // U R F D L B order (each face row-major, as photographed), e.g.
  // "GRRYOYWYW WYWROGORB ...". `detectedURFDLB` is the same for what
  // detection produced before any hand correction.
  colorsURFDLB: string;
  detectedURFDLB?: string;
  // Any other per-face fields (crop, camera settings, ...) are
  // informational and stored as-is, like `meta`.
  faces: Record<string, { photo: string } & Record<string, unknown>>;
  // Informational capture context (camera, white balance, etc) - opaque to
  // the server, stored as-is alongside the fixture for later debugging.
  meta?: unknown;
};

const FIXTURES_DIR = join(import.meta.dir, "..", "test", "fixtures");
const REQUIRED_FACES = ["u", "r", "f", "d", "l", "b"];

function stampCommit(meta: unknown): Record<string, unknown> {
  const capture = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const app = capture.app && typeof capture.app === "object" ? capture.app : {};
  return { ...capture, app: { ...app, commit: gitCommit() } };
}

// Which code produced a saved fixture: short commit hash, plus "-dirty"
// for uncommitted changes, read when the fixture is saved. Stamped here
// rather than baked into the client bundle, which the dev server computes
// once at startup and hot reload never refreshes - so it went stale as
// soon as anything was committed. "unknown" outside a git checkout.
function gitCommit(): string {
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: import.meta.dir });
    return result.success ? result.stdout.toString().trim() : null;
  };
  const hash = git("rev-parse", "--short", "HEAD");
  if (!hash) return "unknown";
  const status = git("status", "--porcelain", "--untracked-files=no");
  return status ? `${hash}-dirty` : hash;
}

app.post("/api/fixtures", async (c) => {
  const body = await c.req.json<SaveFixtureRequest>();

  const faceEntries = Object.entries(body.faces ?? {}).map(
    ([key, value]) => [key.toLowerCase(), value] as const
  );
  const faceKeys = new Set(faceEntries.map(([key]) => key));
  if (!REQUIRED_FACES.every((f) => faceKeys.has(f))) {
    return c.json({ error: "Expected all 6 faces (U, R, F, D, L, B)" }, 400);
  }
  if (!Number.isInteger(body.gridSize) || body.gridSize < 2 || body.gridSize > 7) {
    return c.json({ error: "gridSize must be an integer between 2 and 7" }, 400);
  }
  for (const key of ["colorsURFDLB", "detectedURFDLB"] as const) {
    const value = body[key];
    if (value === undefined && key === "detectedURFDLB") continue;
    const grids = typeof value === "string" ? wrgFaceletsToGrids(value) : null;
    if (!grids || grids.U.length !== body.gridSize) {
      return c.json({ error: `${key} must be 6 space-separated ${body.gridSize}x${body.gridSize} faces of W/O/G/R/B/Y` }, 400);
    }
  }

  // Written directly to disk below, so strip anything but a safe
  // directory-name character set - never trust a client-provided name as
  // a path component as-is.
  const rawName = body.name ?? `capture-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  if (!safeName) {
    return c.json({ error: "Invalid fixture name" }, 400);
  }

  const dir = join(FIXTURES_DIR, safeName);
  await mkdir(dir, { recursive: true });

  const meta: {
    gridSize: number;
    colorsURFDLB: string;
    detectedURFDLB?: string;
    faces: Record<string, { photo: string } & Record<string, unknown>>;
    capture?: unknown;
  } = {
    gridSize: body.gridSize,
    colorsURFDLB: body.colorsURFDLB,
    ...(body.detectedURFDLB !== undefined ? { detectedURFDLB: body.detectedURFDLB } : {}),
    faces: {},
    capture: stampCommit(body.meta),
  };

  for (const [faceKey, faceData] of faceEntries) {
    const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(faceData.photo ?? "");
    if (!match) {
      return c.json({ error: `Face ${faceKey.toUpperCase()}: photo must be a JPEG/PNG data URL` }, 400);
    }
    const ext = match[1] === "png" ? "png" : "jpg";
    const buffer = Buffer.from(match[2], "base64");
    const photoFilename = `face-${faceKey}.${ext}`;
    await Bun.write(join(dir, photoFilename), buffer);
    const { photo: _photo, ...extra } = faceData;
    meta.faces[faceKey] = { photo: photoFilename, ...extra };
  }

  await Bun.write(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  return c.json({ success: true, name: safeName, path: `test/fixtures/${safeName}` });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);
export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`🧩 CubeAssembler running on http://localhost:${PORT}`);
