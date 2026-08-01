# steps.json — the storyline the skill infers

`steps.json` is the single artifact the inference step produces. It drives both
the CLI tape generator and the web capture script. Keep the whole demo 15–30s.

## CLI

```json
{
  "type": "cli",
  "theme": "Catppuccin Mocha",
  "font_size": 22,
  "width": 1200,
  "height": 640,
  "typing_speed_ms": 60,
  "output": { "gif": "demo.gif", "mp4": "demo.mp4" },
  "require": ["mytool"],
  "setup":   ["go build -o mytool . && export PATH=$PWD:$PATH", "clear"],
  "cleanup": ["rm -rf my-project"],
  "steps": [
    { "cmd": "mytool --help",       "wait": "Usage:",  "pause_ms": 1500 },
    { "cmd": "mytool init my-proj", "wait": "created", "pause_ms": 1500 },
    { "cmd": "mytool run --fast",   "wait_line": "done", "pause_ms": 2500 }
  ]
}
```

- `setup` / `cleanup` run **off-camera** (inside VHS `Hide … Show`). Put real
  build/install here so the recording opens on a clean prompt.
- `wait` → VHS `Wait /regex/` (whole screen). `wait_line` → `Wait+Line /regex/`.
  Prefer these over guessed sleeps; they sync on the tool's real output.
- `pause_ms` is the beat after output settles, before the next command.
- Styling keys (`theme`, `font_size`, …) are the outer **camera**, never the app.

## Web

```json
{
  "type": "web",
  "url": "http://localhost:3000",
  "viewport": { "width": 2560, "height": 1440 },
  "device_scale_factor": 2,
  "steps": [
    { "action": "goto",  "url": "/" },
    { "action": "click", "selector": "text=Get started", "pause_ms": 900 },
    { "action": "type",  "selector": "#email", "text": "demo@example.com", "delay_ms": 60 },
    { "action": "press", "key": "Enter" },
    { "action": "scroll","dy": 600, "pause_ms": 700 },
    { "action": "wait",  "selector": "text=Dashboard", "timeout_ms": 10000 }
  ]
}
```

Actions: `goto`, `click`, `type`, `press`, `scroll`, `wait`.

## brand.json — animated intro + outro (both paths)

Optional. When passed to the compositor (`--brand brand.json`), it adds an
animated intro (logo/title springs in) and outro (title + CTA with an accent
wipe) as bookends around the demo body. Works for CLI (wrap the VHS mp4) and web.

```json
{
  "title": "mytool",
  "subtitle": "ship demos in one command",
  "logo": "logo.png",
  "accent": "#7c5cff",
  "background": "#0b0d12",
  "intro_ms": 1600,
  "outro_ms": 2200,
  "outro_cta": "github.com/you/mytool"
}
```

- `logo` — optional path to a PNG/SVG; copied into the compositor's `public/`. If
  omitted, a monogram tile from the title's first letter is used.
- `intro_ms` / `outro_ms` — set either to `0` to skip that bookend. Omit the whole
  file for no branding.
- `accent` / `background` — the intro/outro palette (and the demo's letterbox bg).
  This is outer *camera* styling; the app UI inside is untouched.

- **Oversample**: capture at ~2560-wide even for a 1080p output — zooming a 1:1
  capture goes soft. This is the biggest quality lever.
- Prefer robust selectors (`text=`, roles, stable ids) so capture doesn't flake.
- The compositor adds zoom + cursor from the real click coords/timing logged
  during the run; you don't specify zoom here.
