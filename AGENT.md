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
