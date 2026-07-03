#!/usr/bin/env python3
"""Lightweight repository secret scanner for CI and pre-release checks.

This is not a replacement for dedicated secret scanning. It catches the most
common accidental leaks in this repository: Bilibili cookies, AI API keys,
WeChat secrets, and private runtime config.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("OpenAI-style API key", re.compile(r"sk-[A-Za-z0-9_-]{24,}")),
    ("Bilibili SESSDATA literal", re.compile(r"SESSDATA\s*=\s*([A-Za-z0-9%_\-*,.]{30,})", re.I)),
    ("Bilibili bili_jct literal", re.compile(r"bili_jct\s*=\s*([A-Za-z0-9_\-]{20,})", re.I)),
    ("WeChat secret literal", re.compile(r"WECHAT_SECRET\s*=\s*([A-Za-z0-9_\-]{24,})", re.I)),
    ("Generic API key literal", re.compile(r"api[_-]?key\s*[=:]\s*[\"']?([A-Za-z0-9_\-]{28,})", re.I)),
]

ALLOWLIST_FILES = {
    "BiliKnowledge/scripts/test_validate_knowledge_base.py",
    "tools/scan_sensitive.py",
}


BLOCKED_TRACKED_PATH_PREFIXES = {
    "docs/research/": "private research notes must not be committed",
    "BiliKnowledge/projects/": "generated project analysis artifacts must not be committed",
    "BiliKnowledge/reports/": "generated execution reports must not be committed",
    "BiliKnowledge/manifest/source/": "raw imported source manifests must not be committed",
}

BLOCKED_TRACKED_FILES = {
    "BiliKnowledge/manifest/videos.json": "generated video manifest must not be committed",
    "BiliKnowledge/manifest/videos.csv": "generated video manifest must not be committed",
    "BiliKnowledge/manifest/processing_status.json": "generated processing status must not be committed",
    "BiliKnowledge/manifest/favorite_folders.json": "generated favorite-folder manifest must not be committed",
    "BiliKnowledge/manifest/insights.json": "generated insight analysis must not be committed",
    "BiliKnowledge/manifest/subtitles.json": "generated subtitles must not be committed",
    "BiliKnowledge/manifest/token_usage.json": "generated token usage must not be committed",
}

ALLOWLIST_SNIPPETS = [
    "SESSDATA=...",
    "bili_jct=...",
    "DedeUserID=...",
    "sk-abcdefghij1234567890",
    "sk-my-secret-key-12345",
    "api_key = \"sk-my-secret-key-12345\"",
    "WECHAT_SECRET=",
]

TEXT_SUFFIXES = {
    ".md", ".txt", ".json", ".toml", ".yml", ".yaml", ".js", ".jsx", ".ts", ".tsx",
    ".rs", ".py", ".html", ".css", ".sh", ".lock", ".conf", ".example",
}


def tracked_files() -> list[Path]:
    result = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, stdout=subprocess.PIPE, check=True)
    return [ROOT / line for line in result.stdout.splitlines() if line.strip()]


def is_text_file(path: Path) -> bool:
    if path.suffix in TEXT_SUFFIXES:
        return True
    if path.name in {"LICENSE", "NOTICE", "README", "SECURITY", "CONTRIBUTING"}:
        return True
    return False


def main() -> int:
    findings: list[str] = []
    for path in tracked_files():
        rel = path.relative_to(ROOT).as_posix()
        if not path.exists():
            continue
        blocked_reason = BLOCKED_TRACKED_FILES.get(rel)
        if blocked_reason:
            findings.append(f"{rel}: {blocked_reason}")
            continue
        for prefix, reason in BLOCKED_TRACKED_PATH_PREFIXES.items():
            if rel.startswith(prefix):
                findings.append(f"{rel}: {reason}")
                blocked_reason = reason
                break
        if blocked_reason:
            continue
        if rel in ALLOWLIST_FILES:
            continue
        if not is_text_file(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if any(snippet in line for snippet in ALLOWLIST_SNIPPETS):
                continue
            for label, pattern in PATTERNS:
                match = pattern.search(line)
                if not match:
                    continue
                value = match.group(1) if match.groups() else match.group(0)
                # Avoid flagging source-code templates such as f"SESSDATA={sessdata}".
                if any(ch in value for ch in "{}$()"):
                    continue
                if value.lower() in {"sessdata", "bili_jct", "api_key", "value", "token"}:
                    continue
                findings.append(f"{rel}:{lineno}: {label}")
                break
    if findings:
        print("Potential sensitive data found:")
        for item in findings:
            print(f"  - {item}")
        return 1
    print("No obvious sensitive data found in tracked files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
