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
import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
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
let t0 = null;
const now = () => Date.now();
const stamp = () => (t0 == null ? 0 : now() - t0);

// Capture REAL pointer/scroll events from the page (actual coords, not intended).
await page.exposeBinding("__demoRec", (_src, e) => events.push(e));
await page.addInitScript(() => {
  const send = (type, x, y) =>
    window.__demoRec &&
    window.__demoRec({ type, x, y, t: performance.now(), scrollY: window.scrollY });
  addEventListener("pointerdown", (e) => send("click", e.clientX, e.clientY), true);
  // Continuous cursor PATH: throttled mousemove so the compositor can ease a
  // cursor that truly follows the pointer (Screen-Studio look), not just teleport
  // between click targets. ~28ms ≈ 36Hz — plenty to smooth against in post.
  let lastMove = 0;
  addEventListener(
    "mousemove",
    (e) => {
      const t = performance.now();
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

async function run() {
  for (const step of spec.steps || []) {
    const a = step.action;
    if (a === "goto") {
      await page.goto(step.url || "/", { waitUntil: "networkidle" });
      if (t0 == null) t0 = now(); // anchor timeline to the first frame-ish moment
    } else if (a === "click") {
      const c = await centerOf(step.selector);
      if (c) {
        events.push({ type: "cursor", x: c.x, y: c.y, t: stamp(), rect: c.rect });
        // Move the real cursor in interpolated steps so any hover states fire.
        await page.mouse.move(c.x, c.y, { steps: 24 });
      }
      await page.locator(step.selector).first().click({ timeout: step.timeout_ms || 8000 });
    } else if (a === "type") {
      const c = await centerOf(step.selector);
      if (c) await page.mouse.move(c.x, c.y, { steps: 16 });
      await page.locator(step.selector).first().click();
      await page.locator(step.selector).first().type(step.text || "", {
        delay: step.delay_ms ?? 55, // per-char delay = visible, human typing
      });
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
    if (step.pause_ms) await page.waitForTimeout(step.pause_ms);
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
    await video.saveAs(rawPath).catch(() => {});
  }
  await writeFile(
    path.join(outDir, "events.json"),
    JSON.stringify(
      {
        meta: {
          viewport,
          deviceScaleFactor: spec.device_scale_factor || 2,
          t0,
          durationMs: stamp(),
          raw: rawPath ? path.basename(rawPath) : null,
        },
        // Merge intended (cursor targets) + real (pointerdown/scroll) events,
        // ordered by time — the compositor eases the cursor between these.
        events: events.sort((a, b) => a.t - b.t),
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${outDir}/raw.webm + events.json (${events.length} events)`);
}
process.exit(failed ? 1 : 0);
