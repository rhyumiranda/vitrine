---
name: vitrine
description: >-
  Analyzes a software project, infers how it is actually used, drives the real
  running product, and records an animated demo (MP4 + optimized GIF) that looks
  like a real person using it. CLI tools get a real animated terminal (typing,
  commands running, output streaming) via VHS. Web apps get a cinematic
  zoom-on-click / eased-cursor video (Screen Studio / Recordly look) via
  Playwright + Remotion. The UI in the output is the real product's own UI —
  nothing is mocked or restyled. Use when the user wants a terminal demo, a
  product demo video, a README GIF, an asciinema/VHS-style showcase, or a
  "record a demo of this project" of a CLI or web app.
---

# Generating Demo Videos

Produce a realistic, animated demo of a project by **running its REAL code** and
recording the terminal (CLI) or the real browser UI (web app). The pixels in the
output are the genuine product — its own design system, exactly as shipped. The
only thing this skill styles is the outer *camera* (background, window frame,
zoom + cursor motion), never the app itself.

## The core idea

Renderers (VHS, Remotion) are mature but dumb — they render steps you feed them.
The value this skill adds is the **brain**: it figures out, for *this specific
repo*, what a compelling real demo is, then drives the product to perform it.

```
detect → understand → infer storyline → capture (real run) → composite → optimize
```

## Dependencies

Everything runs inside Docker (chosen runtime) so deps are bundled and untrusted
project code is contained.

- **CLI path:** `ghcr.io/charmbracelet/vhs` (bundles vhs + ttyd + ffmpeg +
  headless Chromium + fonts). Also `gifsicle` for GIF shrink.
- **Web path:** Node + `playwright` (headless Chromium, `recordVideo`) for
  capture; the bundled `compositor/` Remotion project for the cinematic layer;
  `ffmpeg` + `gifsicle` for output.

Run `scripts/check_deps.sh` first. If a dep is missing, tell the user the single
install/pull command and stop — do not silently degrade.

## Safety (MUST)

This skill executes untrusted third-party code (build scripts, the tool itself).

- Run capture + render **inside the container**, on a **copy** of the repo, with
  CPU/memory/time limits. Use `--network=none` for the capture step wherever the
  demo doesn't genuinely need the network.
- **Never auto-run destructive commands.** Only auto-run help/version/read-only/
  idempotent subcommands. Get explicit user confirmation before running
  build/install or anything with side effects.
- Every command and every `Wait` gets a timeout so a hanging tool can't stall.

## Workflow

Copy this checklist and track progress as you go:

```
- [ ] 1. Detect      scripts/detect.py . > project.json
- [ ] 2. Understand   read --help / README; capture real output (sandboxed)
- [ ] 3. Infer        write steps.json — a 15-30s storyline of REAL actions
- [ ] 4. Brand        write brand.json (intro logo/title + outro CTA); optional
- [ ] 5. Confirm      show the plan; get OK before any side-effecting command
- [ ] 6. Capture      CLI: emit .tape   |   Web: run capture_web.mjs
- [ ] 7. Composite    CLI: vhs → wrap w/ intro/outro | Web: compositor render
- [ ] 8. Optimize     scripts/optimize.sh demo.mp4 demo.gif
- [ ] 9. Verify       output exists, plays, GIF < ~2MB; report paths
```

### 1. Detect

`python3 scripts/detect.py <repo> > project.json`

It classifies the project as `cli`, `web`, or `unknown` and extracts entrypoints,
install/build/run commands, and the README usage block. Read `project.json`.
If `unknown`, ask the user which path to take.

### 2. Understand (capture real behavior, sandboxed)

Ground the demo in what the tool *actually* does, never in invented output.

- CLI: run the entrypoint's `--help` / `--version` and any obviously safe
  subcommands inside the container; read the README "usage"/"getting started".
- Web: read routes/pages and the primary user flow; note the dev-server command
  and the URL/port it serves on.

### 3. Infer the storyline

Compose an ordered, story-like sequence (keep it 15-30s). Prefer steps whose real
output/UI is visually compelling and free of destructive side effects. Write it to
`steps.json` — see `references/steps-schema.md` for the exact shape (it drives both
the CLI tape generator and the web capture script).

### 4. Confirm

Show the user the storyline and the exact commands. Get an explicit OK before
running anything that builds, installs, writes, or mutates state.

### 5-6. Capture + composite (+ animated intro/outro)

Both paths get an **animated intro (logo/title) and outro (title + CTA)** when a
`brand.json` is supplied — the Remotion compositor renders them as bookends around
the demo body. Omit `brand.json` (or set `intro_ms`/`outro_ms` to 0) to skip them.
See `references/steps-schema.md` for the brand shape and `examples/brand.json`.

- **CLI:** `python3 scripts/render_tape.py steps.json project.json > demo.tape`,
  then render: `vhs demo.tape` (in the VHS container). Wrap install/build in
  `Hide … Show`; sync on real output with `Wait /regex/` instead of guessed
  `Sleep`. See `references/vhs.md`. To add the intro/outro, wrap the VHS output:
  `node compositor/render.mjs demo.mp4 branded.mp4 --mode cli --brand brand.json`.
- **Web:** `node scripts/capture_web.mjs steps.json` drives the real app headless,
  records `raw.webm` (oversampled, e.g. 2560-wide) and logs `events.json` (exact
  click coords + timing). Then composite the cinematic layer + intro/outro:
  `node compositor/render.mjs raw.webm events.json demo.mp4 --brand brand.json`.
  See `references/web-cinematic.md`.

### 7. Optimize

`bash scripts/optimize.sh demo.mp4 demo.gif` — two-pass ffmpeg palette + gifsicle.
Targets fps 12-15, width ≤ ~1000, GIF < ~2MB. See `references/optimize.md`.

### 8. Verify + report

Confirm the MP4 plays and the GIF is under budget. Report the output paths and a
one-line summary of the storyline. If a `Wait` timed out or output looked broken,
inspect, fix the step, and re-render — don't ship a broken demo.

## Fallback modes

- Tool won't build/run cleanly → **help-only mode**: demo just `--help` and
  `--version`, clearly lower fidelity; tell the user.
- Web app needs auth/secret data → ask the user for a seeded/test account or a
  safe route; never invent credentials.
