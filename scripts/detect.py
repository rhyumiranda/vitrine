#!/usr/bin/env python3
"""Detect project type + usage signals for the Vitrine skill.

Usage:  python3 detect.py <repo-dir>   ->  prints project.json to stdout

Classifies a repo as "cli", "web", or "unknown" and pulls out the entrypoints,
install/build/run commands, and README usage block the skill needs to infer a
demo storyline. Read-only: it never runs project code, only parses manifests.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import tomllib  # py3.11+
except ModuleNotFoundError:  # pragma: no cover
    tomllib = None


def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def load_json(p: Path) -> dict:
    try:
        return json.loads(read(p) or "{}")
    except json.JSONDecodeError:
        return {}


def load_toml(p: Path) -> dict:
    if not tomllib:
        return {}
    try:
        with p.open("rb") as fh:
            return tomllib.load(fh)
    except (OSError, ValueError):
        return {}


# Deps that strongly imply a web app with a dev server.
WEB_DEPS = {
    "next", "react", "react-dom", "vue", "@angular/core", "svelte",
    "@sveltejs/kit", "vite", "react-scripts", "nuxt", "astro", "remix",
    "@remix-run/react", "solid-js", "gatsby",
}
# Scripts whose presence implies a runnable dev server.
WEB_SCRIPT_KEYS = ("dev", "start", "serve", "preview")


def find_readme(repo: Path) -> Path | None:
    for name in ("README.md", "README.rst", "README.txt", "readme.md", "README"):
        p = repo / name
        if p.is_file():
            return p
    return None


def readme_usage(text: str) -> str:
    """Return the first fenced code block after a usage-ish heading, else the
    first fenced block in the file. Kept short — it's a hint, not gospel."""
    if not text:
        return ""
    # Prefer a block under a "usage"/"getting started"/"quick start" heading.
    m = re.search(
        r"^#+\s*(usage|getting started|quick ?start|examples?)\b.*?\n(.*?)(?=^#+\s|\Z)",
        text, re.I | re.M | re.S,
    )
    scope = m.group(2) if m else text
    fence = re.search(r"```[a-zA-Z0-9]*\n(.*?)```", scope, re.S)
    if not fence:
        fence = re.search(r"```[a-zA-Z0-9]*\n(.*?)```", text, re.S)
    return fence.group(1).strip() if fence else ""


def detect(repo: Path) -> dict:
    out: dict = {
        "type": "unknown",
        "confidence": 0.0,
        "language": None,
        "entrypoints": [],   # commands the user actually types, e.g. "mytool"
        "install": [],       # e.g. "npm install"
        "build": [],         # e.g. "npm run build"
        "run": [],           # e.g. "npm run dev"
        "web": {"dev_command": None, "port": None},
        "readme_usage": "",
        "signals": [],
    }

    pkg = repo / "package.json"
    pyproject = repo / "pyproject.toml"
    setup_py = repo / "setup.py"
    cargo = repo / "Cargo.toml"
    gomod = repo / "go.mod"

    web_score = 0
    cli_score = 0

    # ---- Node / JS ----
    if pkg.is_file():
        out["language"] = "javascript"
        data = load_json(pkg)
        scripts = data.get("scripts", {}) or {}
        bins = data.get("bin")
        deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}

        out["install"].append("npm install")
        out["signals"].append("package.json")

        if bins:
            names = list(bins.keys()) if isinstance(bins, dict) else [data.get("name", "cli")]
            out["entrypoints"] += [n for n in names if n]
            cli_score += 2
            out["signals"].append("package.json:bin")

        if deps.keys() & WEB_DEPS:
            web_score += 3
            out["signals"].append("web framework dep")
        for key in WEB_SCRIPT_KEYS:
            if key in scripts:
                web_score += 1
                out["web"]["dev_command"] = f"npm run {key}"
                out["run"].append(f"npm run {key}")
                break
        if "build" in scripts:
            out["build"].append("npm run build")

    # ---- Python ----
    if pyproject.is_file() or setup_py.is_file():
        out["language"] = out["language"] or "python"
        out["signals"].append("pyproject.toml" if pyproject.is_file() else "setup.py")
        data = load_toml(pyproject)
        scripts = (data.get("project", {}) or {}).get("scripts", {}) or {}
        # poetry-style
        scripts = scripts or (
            (data.get("tool", {}).get("poetry", {}) or {}).get("scripts", {}) or {}
        )
        if scripts:
            out["entrypoints"] += list(scripts.keys())
            cli_score += 2
            out["signals"].append("console_scripts")
        deps_blob = read(pyproject) + read(setup_py)
        if re.search(r"\b(fastapi|flask|django|starlette|streamlit|gradio)\b", deps_blob, re.I):
            web_score += 2
            out["signals"].append("python web framework")
        out["install"].append("pip install -e .")

    # ---- Rust ----
    if cargo.is_file():
        out["language"] = out["language"] or "rust"
        out["signals"].append("Cargo.toml")
        data = load_toml(cargo)
        name = (data.get("package", {}) or {}).get("name")
        bins = data.get("bin") or []
        bin_names = [b.get("name") for b in bins if isinstance(b, dict) and b.get("name")]
        if not bin_names and (repo / "src" / "main.rs").is_file() and name:
            bin_names = [name]
        out["entrypoints"] += bin_names
        if bin_names:
            cli_score += 2
        out["build"].append("cargo build --release")

    # ---- Go ----
    if gomod.is_file():
        out["language"] = out["language"] or "go"
        out["signals"].append("go.mod")
        if (repo / "main.go").is_file() or list(repo.glob("cmd/*/main.go")):
            cli_score += 2
            out["build"].append("go build -o app .")
            out["entrypoints"].append("./app")

    # ---- README ----
    rp = find_readme(repo)
    if rp:
        out["readme_usage"] = readme_usage(read(rp))

    # ---- Decide ----
    if web_score == 0 and cli_score == 0:
        out["type"] = "unknown"
    elif web_score > cli_score:
        out["type"] = "web"
    else:
        out["type"] = "cli"
    total = web_score + cli_score
    out["confidence"] = round(max(web_score, cli_score) / total, 2) if total else 0.0

    # de-dup, keep order
    for k in ("entrypoints", "install", "build", "run"):
        seen = set()
        out[k] = [x for x in out[k] if not (x in seen or seen.add(x))]

    return out


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: detect.py <repo-dir>", file=sys.stderr)
        return 2
    repo = Path(sys.argv[1]).resolve()
    if not repo.is_dir():
        print(f"not a directory: {repo}", file=sys.stderr)
        return 2
    print(json.dumps(detect(repo), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
