import React from "react";
import { Composition } from "remotion";
import { DemoComposition, type DemoProps } from "./DemoComposition";

// 16:9 canvas. Event coords (in capture viewport px) are mapped to these dims
// inside the composition, so the video and the zoom/cursor stay aligned.
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

const defaultProps: DemoProps = {
  video: "raw.webm",
  mode: "web",
  fps: FPS,
  events: [],
  meta: { viewport: { width: 2560, height: 1440 }, durationMs: 8000, t0: 0, raw: "raw.webm" },
  camera: { zoom: 1.6, zoomInFrames: 14, zoomOutFrames: 20, holdFrames: 45, background: "#0b0d12" },
  brand: {
    title: "mytool",
    subtitle: "what it does, in five words",
    accent: "#7c5cff",
    background: "#0b0d12",
    intro_ms: 1600,
    outro_ms: 2200,
    outro_cta: "github.com/you/mytool",
  },
  introFrames: 0,
  bodyFrames: 240,
  outroFrames: 0,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Demo"
      component={DemoComposition}
      durationInFrames={240}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const fps = props.fps || FPS;
        const tail = 0.6; // breathing room after the last action
        const bodyFrames = Math.max(1, Math.ceil((props.meta.durationMs / 1000 + tail) * fps));
        const introFrames = props.brand?.intro_ms ? Math.round((props.brand.intro_ms / 1000) * fps) : 0;
        const outroFrames = props.brand?.outro_ms ? Math.round((props.brand.outro_ms / 1000) * fps) : 0;
        return {
          fps,
          durationInFrames: introFrames + bodyFrames + outroFrames,
          props: { ...props, introFrames, bodyFrames, outroFrames },
        };
      }}
    />
  );
};
