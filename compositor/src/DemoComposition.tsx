import React from "react";
import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Intro, Outro, type BrandConfig } from "./Brand";

export type DemoEvent = {
  type: "click" | "cursor" | "scroll";
  x: number; // capture-viewport px
  y: number;
  t: number; // ms from t0
  rect?: { x: number; y: number; width: number; height: number };
};

export type DemoProps = {
  video: string; // filename in public/ (raw.webm) or http url
  mode: "web" | "cli";
  fps: number;
  events: DemoEvent[];
  meta: {
    viewport: { width: number; height: number };
    durationMs: number;
    t0: number;
    raw: string | null;
  };
  camera: {
    zoom: number;
    zoomInFrames: number;
    zoomOutFrames: number;
    holdFrames: number;
    background: string;
  };
  brand?: BrandConfig;
  // Injected by calculateMetadata:
  introFrames: number;
  bodyFrames: number;
  outroFrames: number;
};

const CURSOR_EASE = Easing.bezier(0.22, 1, 0.36, 1);

function cameraAt(
  frame: number,
  clicks: { f: number; x: number; y: number }[],
  cam: DemoProps["camera"],
): { zoom: number; fx: number; fy: number } {
  if (clicks.length === 0) return { zoom: 1, fx: 0.5, fy: 0.5 };
  let active: { f: number; x: number; y: number } | null = null;
  for (const c of clicks) {
    const end = c.f + cam.holdFrames + cam.zoomOutFrames;
    if (frame >= c.f - cam.zoomInFrames && frame <= end) active = c;
  }
  if (!active) return { zoom: 1, fx: 0.5, fy: 0.5 };
  const inStart = active.f - cam.zoomInFrames;
  const holdEnd = active.f + cam.holdFrames;
  const outEnd = holdEnd + cam.zoomOutFrames;
  const zoom = interpolate(
    frame,
    [inStart, active.f, holdEnd, outEnd],
    [1, cam.zoom, cam.zoom, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) },
  );
  return { zoom, fx: active.x, fy: active.y };
}

function cursorAt(
  frame: number,
  pts: { f: number; x: number; y: number }[],
): { x: number; y: number; pressing: boolean } | null {
  if (pts.length === 0) return null;
  if (frame <= pts[0].f) return { x: pts[0].x, y: pts[0].y, pressing: false };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (frame >= a.f && frame <= b.f) {
      const travel = Math.max(1, b.f - a.f - 6);
      const p = interpolate(frame, [a.f, a.f + travel], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: CURSOR_EASE,
      });
      const pressing = frame >= b.f - 3 && frame <= b.f + 4;
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, pressing };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, pressing: false };
}

function videoSrc(video: string): string {
  return /^https?:\/\//.test(video) ? video : staticFile(video);
}

/** CLI body: the VHS terminal video, centered, no zoom. */
const CliBody: React.FC<DemoProps> = (props) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: props.camera.background, alignItems: "center", justifyContent: "center" }}>
      <OffthreadVideo src={videoSrc(props.video)} style={{ width, height, objectFit: "contain" }} />
    </AbsoluteFill>
  );
};

/** Web body: real capture + cinematic zoom-on-click + eased cursor. */
const WebBody: React.FC<DemoProps> = (props) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const { events, meta, camera } = props;

  const sx = width / meta.viewport.width;
  const sy = height / meta.viewport.height;
  const toFrame = (ms: number) => Math.round((ms / 1000) * fps);

  const clicks = events
    .filter((e) => e.type === "click" || e.type === "cursor")
    .map((e) => ({ f: toFrame(e.t), x: e.x * sx, y: e.y * sy }));
  const targets = clicks.filter(
    (c, i) =>
      i === 0 ||
      Math.abs(c.f - clicks[i - 1].f) > 2 ||
      Math.hypot(c.x - clicks[i - 1].x, c.y - clicks[i - 1].y) > 4,
  );

  const clicksForCam = targets.map((c) => ({ f: c.f, x: c.x / width, y: c.y / height }));
  const { zoom, fx, fy } = cameraAt(frame, clicksForCam, camera);

  const focalX = fx * width;
  const focalY = fy * height;
  const tx = width / 2 - focalX * zoom;
  const ty = height / 2 - focalY * zoom;

  const cur = cursorAt(frame, targets);
  const curScreenX = cur ? cur.x * zoom + tx : 0;
  const curScreenY = cur ? cur.y * zoom + ty : 0;
  const press = cur?.pressing ? 0.82 : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: camera.background }}>
      <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${zoom})`, transformOrigin: "0 0" }}>
        <OffthreadVideo src={videoSrc(props.video)} style={{ width, height, objectFit: "fill" }} />
      </AbsoluteFill>
      {cur && (
        <div
          style={{
            position: "absolute",
            left: curScreenX,
            top: curScreenY,
            width: 26,
            height: 26,
            transform: `translate(-4px, -2px) scale(${press})`,
            transformOrigin: "0 0",
            pointerEvents: "none",
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
          }}
        >
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path
              d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z"
              fill="#fff"
              stroke="#111"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </AbsoluteFill>
  );
};

export const DemoComposition: React.FC<DemoProps> = (props) => {
  const { introFrames, bodyFrames, outroFrames, brand, mode } = props;
  const Body = mode === "cli" ? CliBody : WebBody;

  return (
    <AbsoluteFill style={{ backgroundColor: props.camera.background }}>
      {introFrames > 0 && brand && (
        <Sequence durationInFrames={introFrames} name="Intro">
          <Intro brand={brand} />
        </Sequence>
      )}

      <Sequence from={introFrames} durationInFrames={bodyFrames} name="Demo body">
        <Body {...props} />
      </Sequence>

      {outroFrames > 0 && brand && (
        <Sequence from={introFrames + bodyFrames} durationInFrames={outroFrames} name="Outro">
          <Outro brand={brand} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
