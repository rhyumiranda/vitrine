#!/usr/bin/env node
/**
 * vitrine installer — makes the skill install correctly, every time.
 *
 *   npx vitrine-skill            # install globally for all projects
 *   npx vitrine-skill --project # install into ./.claude/skills
 *   npx github:rhyumiranda/vitrine   # same, straight from the repo (no publish needed)
 *
 * The manual install is a six-step dance (clone, symlink into the right dir,
 * npm install the compositor, install playwright + a chromium build, install
 * ffmpeg/gifsicle, docker for the CLI path). Every step is a place to get it
 * wrong. This script does all of it and tells you exactly what's still missing.
 *
 * It is intentionally dependency-free (Node built-ins only) so `npx` can run it
 * before anything is installed.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const PROJECT = has("--project");
const FORCE = has("--force");
const SKIP_DEPS = has("--skip-deps");
if (has("-h") || has("--help")) {
  console.log(`vitrine installer
  npx vitrine-skill [--project] [--dir <path>] [--skip-deps] [--force]
  (or: npx github:rhyumiranda/vitrine — straight from the repo)

  --project    install into ./.claude/skills/vitrine (default: ~/.claude/skills/vitrine)
  --dir <path> install into an explicit directory
  --skip-deps  copy the skill only; don't run npm/playwright installs
  --force      overwrite an existing install without asking`);
  process.exit(0);
}

// green/red/dim without a dependency
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
const ok = (s) => console.log(`${c.g("✓")} ${s}`);
const miss = (s) => console.log(`${c.r("✗")} ${s}`);
const step = (s) => console.log(`\n${c.b(s)}`);

// The skill source is this package's own root (…/vitrine), one level up from scripts/.
const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TARGET = val("--dir")
  ? path.resolve(val("--dir"))
  : PROJECT
    ? path.resolve(process.cwd(), ".claude/skills/vitrine")
    : path.join(os.homedir(), ".claude/skills/vitrine");

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}
function which(cmd) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
    return true;
  } catch { return false; }
}

console.log(c.b("\nvitrine — installing the demo-recording skill\n"));
console.log(`  source → ${c.d(SRC)}`);
console.log(`  target → ${c.d(TARGET)}`);

// ---- 1. copy the skill into place -------------------------------------------
step("1. Copy skill files");
if (existsSync(TARGET) && !FORCE) {
  console.log(`${c.r("!")} ${TARGET} already exists. Re-run with ${c.b("--force")} to overwrite.`);
  process.exit(1);
}
// Whitelist the runtime pieces; never copy node_modules, .git, or demo media.
const INCLUDE = ["SKILL.md", "AGENTS.md", "LICENSE", "scripts", "compositor", "references", "examples"];
mkdirSync(TARGET, { recursive: true });
for (const name of INCLUDE) {
  const from = path.join(SRC, name);
  if (!existsSync(from)) continue;
  cpSync(from, path.join(TARGET, name), {
    recursive: true,
    filter: (s) => !/(^|\/)node_modules(\/|$)|(^|\/)\.git(\/|$)/.test(s),
  });
}
ok(`copied ${INCLUDE.length} entries`);

if (SKIP_DEPS) {
  console.log(c.d("\n--skip-deps set; skipping npm/playwright installs."));
} else {
  // ---- 2. web capture deps: playwright + a chromium build -------------------
  step("2. Web capture — Playwright + Chromium");
  writeFileSync(
    path.join(TARGET, "package.json"),
    JSON.stringify({ name: "vitrine-runtime", private: true, dependencies: { playwright: "^1.55.0" } }, null, 2) + "\n",
  );
  try {
    run("npm", ["install", "--no-audit", "--no-fund"], TARGET);
    run("npx", ["--yes", "playwright", "install", "chromium"], TARGET);
    ok("Playwright + Chromium ready");
  } catch {
    miss("Playwright/Chromium install failed — run it by hand in " + TARGET);
  }

  // ---- 3. compositor (Remotion) --------------------------------------------
  step("3. Compositor (Remotion)");
  try {
    run("npm", ["install", "--no-audit", "--no-fund"], path.join(TARGET, "compositor"));
    ok("compositor deps installed");
  } catch {
    miss("compositor npm install failed — run `npm install` in " + path.join(TARGET, "compositor"));
  }
}

// ---- 4. system tools (report only — never auto-install system packages) -----
step("4. System tools");
const brew = process.platform === "darwin";
const tools = [
  { cmd: "ffmpeg", why: "video + GIF encoding (both paths)", get: brew ? "brew install ffmpeg" : "apt-get install ffmpeg" },
  { cmd: "gifsicle", why: "GIF shrink", get: brew ? "brew install gifsicle" : "apt-get install gifsicle" },
  { cmd: "docker", why: "CLI/terminal demos (VHS runs in Docker)", get: "https://docs.docker.com/get-docker/" },
];
const missing = [];
for (const t of tools) {
  if (which(t.cmd)) ok(`${t.cmd} — ${t.why}`);
  else { miss(`${t.cmd} — ${t.why}`); missing.push(t); }
}

// ---- done -------------------------------------------------------------------
step("Done");
console.log(`Skill installed at ${c.b(TARGET)}.`);
if (missing.length) {
  console.log(`\n${c.b("Still missing")} (install these yourself):`);
  for (const t of missing) console.log(`  ${t.cmd}: ${c.d(t.get)}`);
  console.log(c.d("\nffmpeg + gifsicle are needed for output; docker is only needed for CLI/terminal demos."));
}
console.log(`\nNext: open Claude Code in any repo and ask it to ${c.b('"record a demo of this project"')}.`);
