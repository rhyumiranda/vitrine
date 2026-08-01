#!/usr/bin/env node
/**
 * Composite the demo body + animated intro/outro and render to MP4.
 *
 * Web (cinematic zoom/cursor over a real capture):
 *   node render.mjs <raw.webm> <events.json> <out.mp4> [--brand brand.json] [--zoom 1.6]
 *
 * CLI (wrap a VHS terminal recording with intro/outro):
 *   node render.mjs <vhs.mp4> <out.mp4> --mode cli [--brand brand.json]
 *   (no events.json — pass just two positionals, or use "-" for the middle one)
 *
 * brand.json (all optional) enables the intro logo + outro:
 *   { "title": "mytool", "subtitle": "…", "logo": "logo.png",
 *     "accent": "#7c5cff", "background": "#0b0d12",
 *     "intro_ms": 1600, "outro_ms": 2200, "outro_cta": "github.com/you/mytool" }
 * Set intro_ms/outro_ms to 0 to skip that bookend. Omit brand entirely for none.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function flag(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const mode = flag("--mode", "web");
const zoom = Number(flag("--zoom", "1.6"));
const fps = Number(flag("--fps", "30"));
const brandPath = flag("--brand", null);

const positional = process.argv.slice(2).filter((a, i, arr) => {
  if (a.startsWith("--")) return false;
  // drop values that belong to a preceding --flag
  const prev = arr[i - 1];
  return !(prev && prev.startsWith("--"));
});

let rawPath, eventsPath, outPath;
if (positional.length >= 3) {
  [rawPath, eventsPath, outPath] = positional;
  if (eventsPath === "-") eventsPath = null;
} else if (positional.length === 2) {
  [rawPath, outPath] = positional;
  eventsPath = null;
} else {
  console.error("usage: node render.mjs <video> [events.json] <out.mp4> [--mode web|cli] [--brand brand.json] [--zoom 1.6]");
  process.exit(2);
}

/** Probe container duration (seconds) with ffprobe; null if unavailable. */
function probeSeconds(file) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf8" },
    );
    const s = parseFloat(out.trim());
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

// Put the video + logo where Remotion's public dir will serve them.
const publicDir = path.join(__dirname, "public");
await mkdir(publicDir, { recursive: true });
const rawName = "raw" + (path.extname(rawPath) || ".mp4");
await cp(rawPath, path.join(publicDir, rawName));

let brand = null;
if (brandPath && existsSync(brandPath)) {
  brand = JSON.parse(await readFile(brandPath, "utf8"));
  if (brand.logo && existsSync(brand.logo)) {
    const logoName = "logo" + path.extname(brand.logo);
    await cp(brand.logo, path.join(publicDir, logoName));
    brand.logo = logoName; // reference by public/ basename
  }
}

let events = [];
let meta = { viewport: { width: 2560, height: 1440 }, durationMs: 8000, t0: 0, raw: rawName };
if (eventsPath && existsSync(eventsPath)) {
  const log = JSON.parse(await readFile(eventsPath, "utf8"));
  events = log.events || [];
  meta = { ...meta, ...(log.meta || {}) };
}

// Body length comes from the real video when we can probe it.
const probed = probeSeconds(path.join(publicDir, rawName));
if (probed) meta.durationMs = Math.round(probed * 1000);

const inputProps = {
  video: rawName,
  mode,
  fps,
  events,
  meta,
  camera: { zoom, zoomInFrames: 14, zoomOutFrames: 20, holdFrames: 45, background: brand?.background || "#0b0d12" },
  brand,
  introFrames: 0,
  bodyFrames: 240,
  outroFrames: 0,
};

console.log(`bundling compositor… (mode=${mode}, brand=${brand ? "yes" : "none"})`);
const serveUrl = await bundle({ entryPoint: path.join(__dirname, "src/index.ts"), publicDir });

const composition = await selectComposition({ serveUrl, id: "Demo", inputProps });

console.log(`rendering ${composition.durationInFrames} frames @ ${composition.fps}fps → ${outPath}`);
await renderMedia({
  serveUrl,
  composition,
  codec: "h264",
  crf: 18,
  outputLocation: outPath,
  inputProps,
  chromiumOptions: { gl: "angle" }, // software render; no GPU in the container
});

console.log(`done: ${outPath}`);
