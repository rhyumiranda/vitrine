#!/usr/bin/env node

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDir);
const compositor = join(root, "compositor");
const playwright = join(root, "node_modules", ".bin", "playwright");
const args = new Set(process.argv.slice(2));

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function check() {
  const missing = [];
  if (!existsSync(join(root, "node_modules", "playwright"))) missing.push("playwright package");
  if (!existsSync(join(compositor, "node_modules"))) missing.push("compositor packages");

  if (missing.length) {
    console.log(`missing: ${missing.join(", ")}`);
    console.log("run: node scripts/bootstrap.mjs");
    process.exitCode = 1;
    return;
  }

  const listed = spawnSync(playwright, ["install", "--list"], { encoding: "utf8" });
  if (listed.status !== 0 || !/chromium/.test(listed.stdout)) {
    console.log("missing: Playwright Chromium");
    console.log("run: node scripts/bootstrap.mjs");
    process.exitCode = 1;
    return;
  }

  console.log("runtime: ready");
}

if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node scripts/bootstrap.mjs [--check]");
  console.log("Installs Playwright, Chromium, and compositor packages for Vitrine.");
  process.exit(0);
}

if (args.has("--check")) {
  check();
  process.exit(process.exitCode ?? 0);
}

if (!existsSync(join(root, "node_modules", "playwright"))) {
  run("npm", ["install", "--no-audit", "--no-fund"], root);
}

if (!existsSync(join(compositor, "node_modules"))) {
  run("npm", ["install", "--no-audit", "--no-fund"], compositor);
}

run(playwright, ["install", "chromium"], root);
console.log("Vitrine runtime is ready.");
