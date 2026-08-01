#!/usr/bin/env bash
# Verify the tools each path needs. Prints one install hint per missing dep.
# Usage:  check_deps.sh [cli|web|all]   (default: all)
set -uo pipefail

want="${1:-all}"
missing=0

have() { command -v "$1" >/dev/null 2>&1; }

need() {  # need <bin> <hint>
  if have "$1"; then
    echo "ok   $1"
  else
    echo "MISS $1 — $2"
    missing=1
  fi
}

if [ "$want" = "cli" ] || [ "$want" = "all" ]; then
  echo "# CLI path (VHS)"
  need docker  "install Docker, then: docker pull ghcr.io/charmbracelet/vhs"
  need ffmpeg  "brew install ffmpeg (bundled in the vhs Docker image)"
  need gifsicle "brew install gifsicle"
fi

if [ "$want" = "web" ] || [ "$want" = "all" ]; then
  echo "# Web path (Playwright + Remotion)"
  need node    "install Node 18+ (nodejs.org)"
  need ffmpeg  "brew install ffmpeg"
  need gifsicle "brew install gifsicle"
  # Playwright browsers are installed via: npx playwright install chromium
  if have node; then
    if [ -d compositor/node_modules ] && [ -d node_modules/playwright ]; then
      echo "ok   node deps (compositor + playwright installed)"
    else
      echo "MISS node deps — run: (cd compositor && npm install) && npm i playwright && npx playwright install chromium"
      missing=1
    fi
  fi
fi

exit $missing
