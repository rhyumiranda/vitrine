# Vitrine — agent notes

- VHS `Wait`/`Wait+Screen` only inspects the **visible viewport**, not scrollback. If matched output scrolls off-screen the Wait never fires and the render aborts. Size the tape's `height` to fit the whole demo's output, or match on text that stays on screen.
- `render_tape.py`: `wait` → `Wait+Screen` (anywhere on screen), `wait_line` → `Wait+Line` (current line only). Use `wait` for multi-line command output.
- VHS Docker image (`ghcr.io/charmbracelet/vhs`) ships bash + python3 (3.13), but NOT jq/go. Don't assume other tools in tape commands.
- `optimize.sh` palette temp file uses `mktemp -d` + fixed `palette.png` name — a `.png` suffix on `mktemp -t` template is invalid on GNU mktemp and misplaced on macOS.
- Give the VHS container enough CPU (`--cpus=4`) — under contention, `python3` cold-start can lag past a short WaitTimeout.
- VHS `Type` breaks on escaped double-quotes (`\"`) — the parser errors. Write demo commands with single quotes (`canopy task add 'x'`), never inner double quotes.
- Demoing a CLI in the container needs its deps IN the image. Base VHS image lacks git/jq/go. For git/jq CLIs, build a derived image (`FROM ghcr.io/charmbracelet/vhs; apt-get install git jq`). For Go tools, cross-compile on host (`GOOS=linux GOARCH=arm64`).
- Web capture: driving a Lavish/Readout-*served* artifact injects review chrome (a `/sdk.js` adds click-to-annotate popups). To capture a clean page, fetch the raw artifact HTML, strip the `/sdk.js` script, and serve it yourself (`python3 -m http.server`). CDN CSS/JS (daisyui/tailwind) still load since capture runs on the host with network.
- `capture_web.mjs` sometimes exits non-zero and skips the `raw.webm` rename; the video is still there under its `page@<hash>.webm` name — copy it to `raw.webm` and proceed.
- Cinematic (web) GIFs are motion-heavy → GIF-hostile. Expect ~600px/11fps to land under 2MB; prefer the MP4 for the README embed.

## Cinematic web camera (compositor/src/motion.ts)
- The Screen-Studio/Recordly smoothness comes from: cluster clicks within 2.5s into ONE held zoom (pan between them, don't zoom out each click); ramp strength on `cubic-bezier(.16,1,.3,1)`; then run scale/pan/cursor through an analytic damped-spring so they glide. Cursor uses a dead-zone focal follow + click "bounce".
- Springs are stateful → integrate the WHOLE timeline once (fixed dt = 1000/fps) and index by frame; Remotion re-renders each frame independently, so don't try to spring "live" per frame.
- The follow-cursor needs a continuous path: capture_web records throttled `mousemove` (type:"move"), not just click targets. Re-capture after changing capture_web or the path will be sparse.
- Verify motion numerically before rendering: bundle motion.ts with `npx esbuild --loader:.ts=ts` and assert max per-frame scale jump «0.05 and that zoom HOLDS (stays at depth) across the click cluster.

## Branding (compositor/src/Brand.tsx)
- Brand mark = the repo's 🪟 emoji (window = *vitrine*), set via brand.json `emoji`. Headless Chromium renders color emoji, but the Apple glyph is brown — sit it on an accent radial glow so it reads intentional on the dark ground.
- Type carries personality: Fraunces (display serif) wordmark + JetBrains Mono (tagline/CTA), loaded via `@remotion/google-fonts` (network at bundle time). For the standalone showcase artifact (CSP blocks font CDNs) embed the `/* latin */` woff2 subset as a @font-face data URI.
