#!/usr/bin/env bash
# Turn a demo video into a README-weight GIF: two-pass ffmpeg palette + gifsicle.
#
# Usage:  optimize.sh <input.(mp4|webm)> <output.gif> [fps] [width]
# Defaults: fps=15, width=1000. Aim: GIF < ~2MB.
set -euo pipefail

in="${1:?usage: optimize.sh <input> <output.gif> [fps] [width]}"
out="${2:?usage: optimize.sh <input> <output.gif> [fps] [width]}"
fps="${3:-15}"
width="${4:-1000}"

command -v ffmpeg  >/dev/null || { echo "ffmpeg not found on PATH"  >&2; exit 1; }

palette="$(mktemp -t demo-palette-XXXXXX.png)"
trap 'rm -f "$palette"' EXIT

# stats_mode=diff favors moving regions (typing/scrolling) for a sharper palette.
ffmpeg -y -i "$in" \
  -vf "fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$palette"

ffmpeg -y -i "$in" -i "$palette" \
  -lavfi "fps=${fps},scale=${width}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3" \
  "$out"

if command -v gifsicle >/dev/null; then
  gifsicle -O3 --lossy=40 --colors 200 "$out" -o "$out"
else
  echo "note: gifsicle not found — skipping final shrink pass" >&2
fi

bytes=$(wc -c < "$out" | tr -d ' ')
echo "wrote $out (${bytes} bytes, ${fps}fps, ${width}px wide)"
if [ "$bytes" -gt 2097152 ]; then
  echo "warning: GIF > 2MB — lower fps (e.g. 12) or width (e.g. 800) and re-run" >&2
fi
