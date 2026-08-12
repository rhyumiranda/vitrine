#!/usr/bin/env node
/**
 * Drive a REAL web app headless and capture what's needed for a cinematic demo.
 *
 * Usage:  node capture_web.mjs steps.json [outDir=./out]
 *
 * Produces in outDir:
 *   raw.webm      oversampled screen capture (the real app UI, real pixels)
 *   events.json   {meta, events:[{type,x,y,t,rect,scrollY}]} for the compositor
 *
 * Design: we capture the raw pixels + exact click coords/timing here, and add the
 * zoom/cursor cinematic layer in post (compositor/). We NEVER zoom in-browser —
 * that would reflow the real UI instead of pushing the camera into it.
 *
 * steps.json (web) shape — see references/steps-schema.md:
 * {
 *   "type": "web",
 *   "url": "http://localhost:3000",
 *   "viewport": {"width": 2560, "height": 1440},   // oversample for crisp zoom
 *   "device_scale_factor": 2,
 *   "steps": [
 *     {"action":"goto",  "url":"/"},
 *     {"action":"click", "selector":"text=Get started", "pause_ms":900},
 *     {"action":"type",  "selector":"#email", "text":"demo@example.com", "delay_ms":60},
 *     {"action":"press", "key":"Enter"},
 *     {"action":"scroll","dy":600, "pause_ms":700},
 *     {"action":"wait",  "selector":"text=Dashboard", "timeout_ms":10000}
 *   ]
 * }
 */
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const stepsPath = process.argv[2];
const outDir = path.resolve(process.argv[3] || "out");
if (!stepsPath) {
  console.error("usage: node capture_web.mjs steps.json [outDir]");
  process.exit(2);
}

const spec = JSON.parse(await readFile(stepsPath, "utf8"));
if (spec.type !== "web") {
  console.error(`capture_web.mjs handles web demos; got type=${spec.type}`);
  process.exit(2);
}

const viewport = spec.viewport || { width: 2560, height: 1440 };
const baseURL = spec.url || "http://localhost:3000";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  // headless Chromium needs no display server — that's why we prefer it here.
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: spec.device_scale_factor || 2,
  baseURL,
  recordVideo: { dir: outDir, size: viewport },
});
const page = await context.newPage();

const events = [];
const now = () => Date.now();
// Anchor the timeline to recording start (the video began at context creation,
// a hair before this). ALL event stamps are wall-clock Date.now() and get
// normalized to `t - t0` at write time. We must NOT use performance.now() for
// stamps: it resets to 0 on every full navigation (goto), which scrambles the
// timing of any multi-page demo and desyncs the zoom/cursor from the video.
const t0 = now();

// Capture REAL pointer/scroll events from the page (actual coords, not intended).
await page.exposeBinding("__demoRec", (_src, e) => events.push(e));
await page.addInitScript(() => {
  // Date.now() is a single monotonic wall clock shared with the Node side and
  // stable across navigations — unlike performance.now(), which restarts per document.
  const send = (type, x, y) =>
    window.__demoRec &&
    window.__demoRec({ type, x, y, t: Date.now(), scrollY: window.scrollY });
  addEventListener("pointerdown", (e) => send("click", e.clientX, e.clientY), true);
  // Continuous cursor PATH: throttled mousemove so the compositor can ease a
  // cursor that truly follows the pointer (Screen-Studio look), not just teleport
  // between click targets. ~28ms ≈ 36Hz — plenty to smooth against in post.
  let lastMove = 0;
  addEventListener(
    "mousemove",
    (e) => {
      const t = Date.now();
      if (t - lastMove < 28) return;
      lastMove = t;
      send("move", e.clientX, e.clientY);
    },
    true,
  );
  let st;
  addEventListener(
    "scroll",
    () => {
      clearTimeout(st);
      st = setTimeout(() => send("scroll", innerWidth / 2, innerHeight / 2), 80);
    },
    true,
  );
});

async function centerOf(selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, rect: box };
}

// ---- human motion engine ----------------------------------------------------
// A real person's cursor never travels dead-straight at constant speed. We move
// the mouse along a shallow Bézier ARC, sampled on a MINIMUM-JERK time curve
// (accelerate out, settle in), spread over real time (Fitts-scaled duration),
// with a taper of micro-jitter and an occasional overshoot-and-correct on long
// hops. That produces genuinely human telemetry — instead of a teleport that the
// compositor spring has to fake motion from. Numbers follow the documented
// human-movement recipe (Peekaboo/ghost-cursor): distance→duration bands,
// one-sided arc, ~20% overshoot on long moves, jitter tapering to 0 at the target.
const sleep = (ms) => page.waitForTimeout(Math.max(0, Math.round(ms)));
const rnd = (a, b) => a + Math.random() * (b - a);
function gauss(mean, sd) {
  const u = 1 - Math.random(), v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// classic minimum-jerk easing s(t) = 10t³ − 15t⁴ + 6t⁵
const minJerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t);
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

let cursor = { x: viewport.width * 0.5, y: viewport.height * 0.62 };

async function humanMove(tx, ty, opts = {}) {
  const from = { ...cursor };
  const dx = tx - from.x, dy = ty - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1.5) { cursor = { x: tx, y: ty }; return; }

  // Fitts-scaled duration + sample count by distance band.
  let dur, steps;
  if (dist < 200) { dur = rnd(280, 360); steps = Math.round(rnd(30, 40)); }
  else if (dist < 800) { dur = rnd(400, 900); steps = Math.round(rnd(44, 78)); }
  else { dur = rnd(900, 1700); steps = Math.round(rnd(80, 96)); }

  // one-sided shallow arc (both control points on the SAME side, or it looks wonky)
  const ux = dx / dist, uy = dy / dist;          // unit along
  const px = -uy, py = ux;                        // unit perpendicular
  const side = Math.random() < 0.5 ? 1 : -1;
  const arc = dist * rnd(0.06, 0.16) * side;
  const c1 = { x: from.x + dx * 0.33 + px * arc * rnd(0.6, 1), y: from.y + dy * 0.33 + py * arc * rnd(0.6, 1) };
  const c2 = { x: from.x + dx * 0.66 + px * arc * rnd(0.6, 1), y: from.y + dy * 0.66 + py * arc * rnd(0.6, 1) };

  const jitterAmp = opts.correct ? 0 : rnd(0.2, 0.6); // px, tapers to 0 at the end
  const dt = dur / steps;
  for (let i = 1; i <= steps; i++) {
    const te = minJerk(i / steps);               // equal dt + min-jerk t = human velocity
    let x = bez(from.x, c1.x, c2.x, tx, te);
    let y = bez(from.y, c1.y, c2.y, ty, te);
    if (i < steps) {                             // last point lands exactly on target
      const n = jitterAmp * (1 - te);
      x += px * gauss(0, n);
      y += py * gauss(0, n);
    }
    await page.mouse.move(x, y);
    await sleep(dt * rnd(0.85, 1.15));
  }
  cursor = { x: tx, y: ty };

  // overshoot-and-correct: only worth it on long hops (~18% of the time)
  if (!opts.correct && dist > 600 && Math.random() < 0.18) {
    const past = { x: tx + ux * rnd(8, 24), y: ty + uy * rnd(8, 24) };
    cursor = { x: past.x, y: past.y }; // pretend we drifted past
    await sleep(rnd(40, 90));
    await humanMove(tx, ty, { correct: true });
  }
}

async function humanType(locator, text, base) {
  for (const ch of text) {
    await locator.type(ch, { delay: 0 });
    let d = clamp(gauss(base, base * 0.5), 24, base * 3);
    if (ch === "@" || ch === "." || ch === " ") d += rnd(90, 240); // pause at boundaries
    if (Math.random() < 0.07) d += rnd(180, 480);                    // occasional "think"
    await sleep(d);
  }
}

async function run() {
  // Sync our tracked cursor with Playwright's real pointer at a natural start spot.
  await page.mouse.move(cursor.x, cursor.y);
  for (const step of spec.steps || []) {
    const a = step.action;
    if (a === "goto") {
      await page.goto(step.url || "/", { waitUntil: "networkidle" });
    } else if (a === "click" || a === "type") {
      const c = await centerOf(step.selector);
      // Look before you leap: a short reading pause, then move, settle, act.
      await sleep(step.read_ms ?? rnd(350, 750));
      if (c) {
        // aim for a natural off-center point within the target, not dead-center
        const tx = c.rect ? c.rect.x + c.rect.width * rnd(0.35, 0.65) : c.x;
        const ty = c.rect ? c.rect.y + c.rect.height * rnd(0.4, 0.6) : c.y;
        await humanMove(tx, ty);
        events.push({ type: "cursor", x: cursor.x, y: cursor.y, t: now(), rect: c.rect });
        await sleep(clamp(gauss(220, 70), 120, 400)); // dwell/settle before acting
      }
      if (a === "click") {
        await page.locator(step.selector).first().click({ timeout: step.timeout_ms || 8000 });
      } else {
        await page.locator(step.selector).first().click();
        await humanType(page.locator(step.selector).first(), step.text || "", step.delay_ms ?? 60);
      }
    } else if (a === "press") {
      await page.keyboard.press(step.key || "Enter");
    } else if (a === "scroll") {
      await page.mouse.wheel(step.dx || 0, step.dy || 600);
    } else if (a === "wait") {
      if (step.selector)
        await page.locator(step.selector).first().waitFor({ timeout: step.timeout_ms || 10000 });
      else await page.waitForTimeout(step.ms || 800);
    } else {
      console.error(`unknown action: ${a}`);
    }
    if (step.pause_ms) await sleep(step.pause_ms * rnd(0.85, 1.15)); // vary, never metronomic
  }
}

let failed = false;
try {
  await run();
} catch (err) {
  failed = true;
  console.error("capture error:", err.message);
} finally {
  const video = page.video();
  await context.close(); // finalizes the webm
  await browser.close();

  let rawPath = null;
  if (video) {
    rawPath = path.join(outDir, "raw.webm");
    // saveAs occasionally no-ops and leaves the video under its hashed name;
    // fall back to a direct copy so raw.webm always exists for the compositor.
    await video.saveAs(rawPath).catch(() => {});
    if (!existsSync(rawPath)) {
      const src = await video.path().catch(() => null);
      if (src && existsSync(src)) await copyFile(src, rawPath);
    }
  }
  // Normalize every stamp to the recording-start origin (t0) — one monotonic
  // clock, so zoom regions and the cursor path line up with the video frames.
  const rel = events
    .map((e) => ({ ...e, t: Math.max(0, e.t - t0) }))
    .sort((a, b) => a.t - b.t);
  await writeFile(
    path.join(outDir, "events.json"),
    JSON.stringify(
      {
        meta: {
          viewport,
          deviceScaleFactor: spec.device_scale_factor || 2,
          t0,
          durationMs: now() - t0,
          raw: rawPath ? path.basename(rawPath) : null,
        },
        // Merge intended (cursor targets) + real (pointerdown/scroll) events,
        // ordered by time — the compositor eases the cursor between these.
        events: rel,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${outDir}/raw.webm + events.json (${events.length} events)`);
}
process.exit(failed ? 1 : 0);
