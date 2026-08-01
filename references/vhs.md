# VHS reference (CLI path)

[charmbracelet/vhs](https://github.com/charmbracelet/vhs) renders a `.tape` script
to GIF/MP4/WebM. It types into a **real shell** (via ttyd + headless Chromium), so
`Type "cmd"` + `Enter` executes the real binary and captures genuine output.

## Run it (Docker — chosen runtime)

```bash
# from the dir containing demo.tape and the project
docker run --rm \
  -v "$PWD":/vhs -w /vhs \
  --network=none \
  ghcr.io/charmbracelet/vhs demo.tape
```

The image bundles vhs + ttyd + ffmpeg + headless Chromium + fonts — this avoids
the #1 failure mode (headless Chromium can't launch in a bare sandbox). Drop
`--network=none` only if the demo genuinely needs the network.

## Tape commands used by the generator

| Command | Meaning |
|---|---|
| `Output demo.gif` / `demo.mp4` | one line per target |
| `Require mytool` | fail fast if a binary is missing (put at top) |
| `Set FontSize/Width/Height/Theme/Padding/WindowBar` | outer camera styling |
| `Set TypingSpeed 60ms` | per-char typing speed = visible, human typing |
| `Type "…"` | type a string (real keystrokes) |
| `Enter` / `Backspace` / `Ctrl+C` | keys |
| `Sleep 1.5s` / `500ms` | pause |
| `Wait /regex/` | block until regex appears on screen |
| `Wait+Line /regex/` | block until it appears on the current line |
| `Hide` / `Show` | run setup/cleanup off-camera |

## Gotchas

- `Type` handles most text, but `$`, backticks and quotes can be finicky. If a
  command misbehaves, move it into `setup` as a small script and run that script
  on-camera instead of typing the raw one-liner.
- Always prefer `Wait /…/` over a guessed `Sleep` — the recording then adapts to
  the tool's real runtime instead of racing it.
- Every step should have a bounded wait; a hanging command otherwise stalls the
  whole render.
