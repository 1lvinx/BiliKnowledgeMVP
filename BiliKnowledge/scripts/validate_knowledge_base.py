#!/usr/bin/env python3
"""Validate knowledge base structure, links, and scan for sensitive data."""

import argparse
import json
import re
import sys
from pathlib import Path

SENSITIVE_PATTERNS = [
    (r"SESSDATA\s*[=:]\s*\S+", "B站 SESSDATA cookie"),
    (r"bili_jct\s*[=:]\s*\S+", "B站 bili_jct cookie"),
    (r"buvid3\s*[=:]\s*\S+", "B站 buvid3 cookie"),
    (r"DedeUserID\s*[=:]\s*\S+", "B站 DedeUserID"),
    (r"sk-[A-Za-z0-9]{20,}", "OpenAI API key"),
    (r"anthropic.*api[_-]?key\s*[=:]\s*\S+", "Anthropic API key"),
    (r"password\s*[=:]\s*[\"'][^\"']+[\"']", "Hardcoded password"),
    (r"token\s*[=:]\s*[\"'][^\"']+[\"']", "Hardcoded token"),
    (r"api[_-]?key\s*[=:]\s*[\"'][^\"']+[\"']", "Hardcoded API key"),
]

REQUIRED_DIRS = [
    "manifest",
    "notes/raw",
    "notes/reviewed",
    "projects",
    "thoughts",
    "scripts",
    "reports",
    "config",
]

REQUIRED_FILES = [
    "README.md",
    "index.md",
    "manifest/videos.json",
    "notes/templates/video_note_template.md",
]


def check_structure(root):
    issues = []
    root = Path(root)

    for d in REQUIRED_DIRS:
        path = root / d
        if not path.exists():
            issues.append(f"[MISSING DIR] {d}")

    for f in REQUIRED_FILES:
        path = root / f
        if not path.exists():
            issues.append(f"[MISSING FILE] {f}")

    return issues


def check_links(root):
    issues = []
    root = Path(root)

    for md_file in root.rglob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        links = re.findall(r"\[.*?\]\(([^)]+)\)", content)
        for link in links:
            if link.startswith("http"):
                continue
            if link.startswith("#"):
                continue
            target = (md_file.parent / link).resolve()
            if not target.exists():
                issues.append(f"[BROKEN LINK] {md_file.name} -> {link}")

    return issues


def scan_sensitive(root):
    findings = []
    root = Path(root)

    scan_dirs = ["notes", "projects", "thoughts", "manifest"]
    for d in scan_dirs:
        dir_path = root / d
        if not dir_path.exists():
            continue
        for f in dir_path.rglob("*"):
            if f.is_dir():
                continue
            if f.suffix in (".json", ".md", ".csv", ".txt", ".py"):
                try:
                    content = f.read_text(encoding="utf-8")
                except Exception:
                    continue
                for pattern, desc in SENSITIVE_PATTERNS:
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    if matches:
                        for match in matches:
                            # Redact the actual value
                            redacted = match[:10] + "..." if len(match) > 10 else match
                            findings.append(f"[SENSITIVE] {f.relative_to(root)}: {desc} ({redacted})")

    return findings


def main():
    parser = argparse.ArgumentParser(description="Validate knowledge base")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    print(f"[VALIDATE] Root: {root}\n")

    all_issues = []

    # 1. Structure check
    print("--- Structure Check ---")
    structure_issues = check_structure(root)
    if structure_issues:
        for issue in structure_issues:
            print(f"  {issue}")
        all_issues.extend(structure_issues)
    else:
        print("  All required dirs and files present.")

    # 2. Link check
    print("\n--- Link Check ---")
    link_issues = check_links(root)
    if link_issues:
        for issue in link_issues:
            print(f"  {issue}")
        all_issues.extend(link_issues)
    else:
        print("  All internal links valid.")

    # 3. Sensitive data scan
    print("\n--- Sensitive Data Scan ---")
    sensitive_findings = scan_sensitive(root)
    if sensitive_findings:
        for finding in sensitive_findings:
            print(f"  {finding}")
        all_issues.extend(sensitive_findings)
    else:
        print("  No sensitive data found.")

    # Summary
    print(f"\n--- Summary ---")
    print(f"  Total issues: {len(all_issues)}")

    from update_processing_status import update_processing_status

    if all_issues:
        print(f"  Status: NEEDS ATTENTION")
        update_processing_status(root, validated=False)
        sys.exit(1)
    else:
        print(f"  Status: PASS")
        update_processing_status(root, validated=True)
        sys.exit(0)


if __name__ == "__main__":
    main()
