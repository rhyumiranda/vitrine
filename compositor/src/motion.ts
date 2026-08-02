/**
 * Cinematic camera + cursor motion — a Screen-Studio / Recordly-style feel,
 * reimplemented from first principles for Remotion's pure frame→transform model.
 *
 * Approach (why it looks smooth, unlike a naive zoom-per-click):
 *  - clicks within CLUSTER_GAP_MS are merged into ONE held zoom region — the
 *    camera stays zoomed and PANS between them instead of yo-yoing out each time;
 *  - a click region's zoom "strength" ramps on a cubic-bezier(.16,1,.3,1) curve;
 *  - scale, pan (x/y) and the cursor are each chased by an ANALYTIC damped spring
 *    (closed-form harmonic oscillator), so targets are followed with a glide;
 *  - the focal point uses a dead-zone: it only re-centers once the cursor leaves
 *    an inner safe box, so tiny jitters don't wobble the camera.
 *
 * Springs are stateful, so we integrate the WHOLE timeline once at fixed dt and
 * index by frame (Remotion re-renders each frame independently).
 */

export type MotionEvent = {
  type: "click" | "cursor" | "scroll" | "move";
  x: number; // capture-viewport px
  y: number;
  t: number; // ms from t0
};

export type MotionInput = {
  events: MotionEvent[];
  viewport: { width: number; height: number };
  outWidth: number;
  outHeight: number;
  fps: number;
  frames: number; // body length in frames
  depth: number; // target zoom scale at full strength (e.g. 1.5)
};

export type Frame = {
  scale: number;
  tx: number;
  ty: number;
  cursorX: number; // screen px (already through the camera)
  cursorY: number;
  bounce: number; // 1 = rest, dips on click
  cursorVisible: boolean;
};

// ---- analytic damped-spring solver (Hooke: F = -kx - cv) --------------------
type Spring = { value: number; velocity: number; init: boolean };
type SpringCfg = { stiffness: number; damping: number; mass: number; restDelta: number; restSpeed: number };

const clampDt = (ms: number) => (Number.isFinite(ms) && ms > 0 ? Math.min(80, Math.max(1, ms)) : 1000 / 60);

/** One step toward `target`; returns new value and mutates spring state. */
function step(s: Spring, target: number, deltaMs: number, c: SpringCfg): number {
  const dt = clampDt(deltaMs) / 1000;
  if (!s.init) {
    s.value = target;
    s.velocity = 0;
    s.init = true;
    return s.value;
  }
  if (Math.abs(target - s.value) <= c.restDelta && Math.abs(s.velocity) <= c.restSpeed) {
    s.value = target;
    s.velocity = 0;
    return s.value;
  }
  const w0 = Math.sqrt(c.stiffness / c.mass);
  const zeta = c.damping / (2 * Math.sqrt(c.stiffness * c.mass));
  const u0 = s.value - target; // displacement from equilibrium
  const v0 = s.velocity;
  // displacement u(t) from equilibrium, by damping regime
  const u = (t: number): number => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const e = Math.exp(-zeta * w0 * t);
      return e * (u0 * Math.cos(wd * t) + ((v0 + zeta * w0 * u0) / wd) * Math.sin(wd * t));
    }
    if (zeta === 1) {
      const e = Math.exp(-w0 * t);
      return e * (u0 + (v0 + w0 * u0) * t);
    }
    const wd = w0 * Math.sqrt(zeta * zeta - 1);
    const ft = Math.min(wd * t, 300); // guard against overflow
    const e = Math.exp(-zeta * w0 * t);
    return e * (u0 * Math.cosh(ft) + ((v0 + zeta * w0 * u0) / wd) * Math.sinh(ft));
  };
  const eps = 0.0001;
  const uNow = u(dt);
  const valNow = target + uNow;
  const vel = (u(dt + eps) - uNow) / eps;
  // overshoot guard for (near-)overdamped springs chasing a moving target
  if (zeta >= 1) {
    const crossed = (u0 > 0 && uNow < 0) || (u0 < 0 && uNow > 0);
    if (crossed) {
      s.value = target;
      s.velocity = 0;
      return target;
    }
  }
  s.value = valNow;
  s.velocity = vel;
  return valNow;
}

const mkSpring = (): Spring => ({ value: 0, velocity: 0, init: false });

// zoom/pan spring — smoothness 0.5 (ζ≈1.05, glides, no wobble)
const ZOOM_CFG: SpringCfg = { stiffness: 100, damping: 21, mass: 1, restDelta: 0.0005, restSpeed: 0.015 };
// cursor spring — "smooth" preset band (over-damped, elegant follow)
const CURSOR_CFG: SpringCfg = { stiffness: 329, damping: 82, mass: 1.8, restDelta: 0.0002, restSpeed: 0.01 };

// ---- cubic-bezier (matches CSS cubic-bezier) --------------------------------
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const fx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dfx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const fy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = fx(t) - x;
      if (Math.abs(err) < 1e-5) break;
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return fy(t);
  };
}
const easeOutZoom = cubicBezier(0.16, 1, 0.3, 1);

// ---- timing constants (ms), from the Recordly reference spec ----------------
const CLUSTER_GAP_MS = 2500; // clicks within this window share one held zoom
const CLUSTER_PAD_MS = 500;
const ZOOM_IN_MS = 1522.575;
const ZOOM_OUT_MS = 1015.05;
const ZOOM_OUT_EARLY_MS = 500;
const LEAD_MS = 200; // read the zoom slightly early
const IN_OVERLAP_MS = 1000;
const SAFE_ZONE_RATIO = 0.25; // cursor dead-zone before the camera re-centers
const CLICK_BOUNCE = 3.5;
const CLICK_BOUNCE_MS = 350;

type Region = { startMs: number; endMs: number; fx: number; fy: number };

function lerpPath(path: { t: number; x: number; y: number }[], tMs: number) {
  if (path.length === 0) return { x: 0, y: 0 };
  if (tMs <= path[0].t) return { x: path[0].x, y: path[0].y };
  const last = path[path.length - 1];
  if (tMs >= last.t) return { x: last.x, y: last.y };
  // linear search is fine for a short demo
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (tMs >= a.t && tMs <= b.t) {
      const p = b.t === a.t ? 0 : (tMs - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }
  }
  return { x: last.x, y: last.y };
}

/** Zoom strength ∈ [0,1] for one region at time tMs (ramp-in, hold, ramp-out). */
function regionStrength(r: Region, tMs: number): number {
  const adj = tMs - LEAD_MS;
  const leadInStart = r.startMs + IN_OVERLAP_MS - ZOOM_IN_MS;
  let zoomInEnd = leadInStart + ZOOM_IN_MS;
  let zoomOutStart = r.endMs - ZOOM_OUT_EARLY_MS;
  if (zoomInEnd > zoomOutStart) {
    const mid = (zoomInEnd + zoomOutStart) / 2;
    zoomInEnd = mid;
    zoomOutStart = mid;
  }
  const leadOutEnd = zoomOutStart + ZOOM_OUT_MS;
  if (adj < leadInStart || adj > leadOutEnd) return 0;
  if (adj < zoomInEnd) return easeOutZoom((adj - leadInStart) / Math.max(1, zoomInEnd - leadInStart));
  if (adj <= zoomOutStart) return 1;
  return 1 - easeOutZoom((adj - zoomOutStart) / ZOOM_OUT_MS);
}

const clampFocus = (f: number, scale: number) => {
  const half = 1 / (2 * Math.max(1, scale));
  return Math.min(1 - half, Math.max(half, f));
};

export function buildMotion(input: MotionInput): Frame[] {
  const { events, viewport, outWidth: W, outHeight: H, fps, frames, depth } = input;
  const sx = W / viewport.width;
  const sy = H / viewport.height;

  // cursor target path from real pointer telemetry (move + intended + clicks)
  const path = events
    .filter((e) => e.type === "move" || e.type === "cursor" || e.type === "click")
    .map((e) => ({ t: e.t, x: e.x * sx, y: e.y * sy }))
    .sort((a, b) => a.t - b.t);

  const clicks = events
    .filter((e) => e.type === "click")
    .map((e) => ({ t: e.t, x: e.x * sx, y: e.y * sy }))
    .sort((a, b) => a.t - b.t);

  // merge clicks into clusters → one held zoom region each
  const regions: Region[] = [];
  for (const c of clicks) {
    const last = regions[regions.length - 1];
    if (last && c.t - (last.endMs - CLUSTER_PAD_MS) <= CLUSTER_GAP_MS) {
      last.endMs = c.t + CLUSTER_PAD_MS; // extend cluster; focus tracks cursor anyway
    } else {
      regions.push({ startMs: c.t - CLUSTER_PAD_MS, endMs: c.t + CLUSTER_PAD_MS, fx: c.x / W, fy: c.y / H });
    }
  }

  // spring state, integrated forward frame by frame
  const sScale = mkSpring();
  const sTx = mkSpring();
  const sTy = mkSpring();
  const sCx = mkSpring();
  const sCy = mkSpring();
  let focusX = 0.5;
  let focusY = 0.5;
  let seededFocus = false;

  const dtMs = 1000 / fps;
  const out: Frame[] = [];

  for (let f = 0; f < frames; f++) {
    const tMs = f * dtMs;
    const target = lerpPath(path, tMs);

    // dominant region + strength
    let strength = 0;
    let active: Region | null = null;
    for (const r of regions) {
      const s = regionStrength(r, tMs);
      if (s > strength) {
        strength = s;
        active = r;
      }
    }

    const scaleTarget = 1 + (depth - 1) * strength;

    // focal point: dead-zone follow of the cursor while zoomed
    if (strength < 0.01 || !active) {
      seededFocus = false;
      focusX = clampFocus(0.5, scaleTarget);
      focusY = clampFocus(0.5, scaleTarget);
    } else {
      if (!seededFocus) {
        focusX = clampFocus(target.x / W, scaleTarget);
        focusY = clampFocus(target.y / H, scaleTarget);
        seededFocus = true;
      } else {
        const half = 1 / (2 * Math.max(1, scaleTarget));
        const inset = half * 2 * SAFE_ZONE_RATIO;
        const cxN = target.x / W;
        const cyN = target.y / H;
        if (cxN < focusX - (half - inset) || cxN > focusX + (half - inset)) focusX = cxN;
        if (cyN < focusY - (half - inset) || cyN > focusY + (half - inset)) focusY = cyN;
        focusX = clampFocus(focusX, scaleTarget);
        focusY = clampFocus(focusY, scaleTarget);
      }
    }

    // translation target so the focus eases toward screen center as strength rises
    const txTarget = (W / 2 - focusX * W * depth) * strength;
    const tyTarget = (H / 2 - focusY * H * depth) * strength;

    // glide scale + pan
    const scale = step(sScale, scaleTarget, dtMs, ZOOM_CFG);
    const tx = step(sTx, txTarget, dtMs, ZOOM_CFG);
    const ty = step(sTy, tyTarget, dtMs, ZOOM_CFG);

    // glide the cursor toward its telemetry target, then project through camera
    const cx = step(sCx, target.x, dtMs, CURSOR_CFG);
    const cy = step(sCy, target.y, dtMs, CURSOR_CFG);
    const cursorX = cx * scale + tx;
    const cursorY = cy * scale + ty;

    // click bounce
    let bounce = 1;
    for (const c of clicks) {
      const age = tMs - c.t;
      if (age >= 0 && age <= CLICK_BOUNCE_MS) {
        const p = 1 - age / CLICK_BOUNCE_MS;
        bounce = Math.min(bounce, Math.max(0.72, 1 - Math.sin(p * Math.PI) * 0.08 * CLICK_BOUNCE));
      }
    }

    out.push({ scale, tx, ty, cursorX, cursorY, bounce, cursorVisible: path.length > 0 });
  }
  return out;
}
