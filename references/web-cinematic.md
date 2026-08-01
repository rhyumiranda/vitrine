# Web cinematic path (Playwright → Remotion)

Goal: the Screen Studio / Recordly look — camera pushes into each click, cursor
eases between targets — but generated **as code, headlessly**, over the **real app
UI**. Two decoupled stages joined by `events.json`.

## Stage 1 — capture (real run)

`node scripts/capture_web.mjs steps.json out`

- Drives the real app in headless Chromium (no display server needed).
- Records `out/raw.webm` at the **oversampled** viewport (e.g. 2560×1440) so
  zoomed-in frames stay crisp.
- Logs `out/events.json`: exact click coords + timestamps + scroll, anchored to a
  `t0` so times map onto the video timeline.

Never zoom the live page — that reflows the real UI. Zoom happens in post.

## Stage 2 — composite (cinematic layer)

`node compositor/render.mjs out/raw.webm out/events.json demo.mp4 --zoom 1.6`

The Remotion comp (`compositor/src/DemoComposition.tsx`):

- `<OffthreadVideo>` draws the real capture as the base layer.
- **Camera**: for each click it eases zoom `1 → peak → hold → 1` and translates so
  the click maps to screen center (`cameraAt`).
- **Cursor**: a constant-size synthetic cursor eases between click targets with a
  press-pop, its coords projected through the same camera transform (`cursorAt`).
- Duration is derived from `meta.durationMs` in `calculateMetadata`.

Tunables live in `render.mjs` inputProps.camera: `zoom`, `zoomInFrames`,
`holdFrames`, `zoomOutFrames`, `background`.

## Runtime notes

- Install once: `(cd compositor && npm install)` and
  `npm i playwright && npx playwright install chromium` at the skill root.
- No GPU in the container → Remotion uses `gl: "angle"` (software). The comp is
  pure CSS transforms, so it renders fine on CPU.
- Output MP4 is the source of truth; run `scripts/optimize.sh` for the README GIF.

## Known risks

- **Time remapping**: if you speed-ramp idle gaps, warp event times through the
  same function. Default path does no ramping, so times map linearly.
- **Scroll**: click Y shifts between viewport and page space; `events.json`
  records `scrollY` if you need to correct focal points after a scroll.
- **Auth/seed data**: ask the user for a test account or safe route; never invent
  credentials.
