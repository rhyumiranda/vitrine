import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Intro, Outro, type BrandConfig } from "./Brand";
import { buildMotion, type MotionEvent } from "./motion";

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

/** Web body: real capture + Screen-Studio-style held zoom, gliding pan, and a
 *  cursor that truly follows the pointer (all via the spring track in motion.ts). */
const WebBody: React.FC<DemoProps> = (props) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const { events, meta, camera } = props;

  // Integrate the whole camera + cursor track once, then index by frame.
  const track = React.useMemo(
    () =>
      buildMotion({
        events: events as MotionEvent[],
        viewport: meta.viewport,
        outWidth: width,
        outHeight: height,
        fps,
        frames: durationInFrames,
        depth: camera.zoom,
      }),
    [events, meta.viewport, width, height, fps, durationInFrames, camera.zoom],
  );

  const m = track[Math.min(frame, track.length - 1)];
  if (!m) {
    return (
      <AbsoluteFill style={{ backgroundColor: camera.background }}>
        <OffthreadVideo src={videoSrc(props.video)} style={{ width, height, objectFit: "fill" }} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: camera.background }}>
      <AbsoluteFill
        style={{ transform: `translate(${m.tx}px, ${m.ty}px) scale(${m.scale})`, transformOrigin: "0 0" }}
      >
        <OffthreadVideo src={videoSrc(props.video)} style={{ width, height, objectFit: "fill" }} />
      </AbsoluteFill>
      {m.cursorVisible && (
        <div
          style={{
            position: "absolute",
            left: m.cursorX,
            top: m.cursorY,
            width: 30,
            height: 30,
            transform: `translate(-5px, -3px) scale(${m.bounce})`,
            transformOrigin: "6px 4px",
            pointerEvents: "none",
            filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.4))",
          }}
        >
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path
              d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z"
              fill="#fff"
              stroke="#141414"
              strokeWidth="1.4"
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
