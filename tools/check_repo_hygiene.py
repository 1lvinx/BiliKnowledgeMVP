#!/usr/bin/env python3
"""Repository hygiene checks for tracked text files.

Catches small public-repo regressions that are easy to miss locally:
- trailing whitespace in tracked text files;
- broken local Markdown/HTML-style links in tracked Markdown files.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

BINARY_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".icns",
    ".dmg",
    ".zip",
    ".gz",
    ".exe",
    ".AppImage",
    ".deb",
    ".rpm",
}

MARKDOWN_SUFFIXES = {".md", ".markdown", ".html"}

LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        check=True,
    )
    return [ROOT / line for line in result.stdout.splitlines() if line.strip()]


def is_probably_text(path: Path) -> bool:
    if path.suffix in BINARY_SUFFIXES:
        return False
    try:
        path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False
    except OSError:
        return False
    return True


def check_trailing_whitespace(paths: list[Path]) -> list[str]:
    findings: list[str] = []
    for path in paths:
        if not path.exists() or not is_probably_text(path):
            continue
        rel = path.relative_to(ROOT).as_posix()
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(True), 1):
            if line.rstrip("\n\r").endswith((" ", "\t")):
                findings.append(f"{rel}:{lineno}: trailing whitespace")
                break
    return findings


def check_markdown_links(paths: list[Path]) -> list[str]:
    findings: list[str] = []
    for path in paths:
        if not path.exists() or path.suffix.lower() not in MARKDOWN_SUFFIXES:
            continue
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in LINK_RE.finditer(text):
            raw_url = match.group(1).strip()
            url = raw_url.split("#", 1)[0]
            if (
                not url
                or url.startswith("#")
                or url.startswith("mailto:")
                or re.match(r"^[a-z][a-z0-9+.-]*:", url)
            ):
                continue
            target = (path.parent / url).resolve()
            try:
                target.relative_to(ROOT)
            except ValueError:
                findings.append(f"{rel}: local link escapes repository: {raw_url}")
                continue
            if not target.exists():
                findings.append(f"{rel}: missing local link target: {raw_url}")
    return findings


def main() -> int:
    paths = tracked_files()
    findings = check_trailing_whitespace(paths) + check_markdown_links(paths)
    if findings:
        print("Repository hygiene issues found:")
        for finding in findings:
            print(f"  - {finding}")
        return 1
    print("Repository hygiene checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
