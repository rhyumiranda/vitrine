# GIF optimization

Goal: a README-weight GIF (< ~2MB) that still reads clearly.

`bash scripts/optimize.sh demo.mp4 demo.gif [fps=15] [width=1000]`

Pipeline:

1. **Two-pass palette** (ffmpeg) — `palettegen=stats_mode=diff` builds a palette
   biased toward the moving regions (typing, scrolling), then `paletteuse` with a
   light bayer dither. Far better than a naive single-pass GIF.
2. **gifsicle** — `-O3 --lossy=40 --colors 200` shrinks the file with little
   visible loss.

Biggest size levers, in order:

1. **fps** — 12–15 is plenty for a demo. Halving fps ~halves size.
2. **width** — cap at ~800–1000px for READMEs.
3. palette + gifsicle lossy.

If text looks fuzzy, drop `--lossy` or raise `--colors`. If the file is still too
big, lower fps to 12 and width to 800 and re-run. Keep the MP4 for anywhere that
accepts video — it's smaller and sharper than any GIF.
