"""Tests for validate_knowledge_base.py — structure, links, and sensitive data scanning."""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from validate_knowledge_base import (
    check_structure,
    check_links,
    scan_sensitive,
    REQUIRED_DIRS,
    REQUIRED_FILES,
)


def test_check_structure_all_present():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for d in REQUIRED_DIRS:
            (root / d).mkdir(parents=True, exist_ok=True)
        for f in REQUIRED_FILES:
            (root / f).parent.mkdir(parents=True, exist_ok=True)
            (root / f).write_text("placeholder")
        issues = check_structure(root)
        assert issues == [], f"Expected no issues, got: {issues}"


def test_check_structure_missing_dir():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        # Create everything except one dir
        for d in REQUIRED_DIRS:
            if d == "manifest":
                continue
            (root / d).mkdir(parents=True, exist_ok=True)
        for f in REQUIRED_FILES:
            if f.startswith("manifest/"):
                continue  # skip manifest files so the dir stays missing
            (root / f).parent.mkdir(parents=True, exist_ok=True)
            (root / f).write_text("placeholder")
        issues = check_structure(root)
        assert any("manifest" in issue for issue in issues), f"Expected missing dir issue, got: {issues}"


def test_check_structure_missing_file():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for d in REQUIRED_DIRS:
            (root / d).mkdir(parents=True, exist_ok=True)
        for f in REQUIRED_FILES:
            if f == "manifest/videos.json":
                continue
            (root / f).parent.mkdir(parents=True, exist_ok=True)
            (root / f).write_text("placeholder")
        issues = check_structure(root)
        assert any("videos.json" in issue for issue in issues), f"Expected missing file issue, got: {issues}"


def test_check_links_valid():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "notes").mkdir(parents=True, exist_ok=True)
        # Create two notes with a valid relative link between them
        (root / "notes/a.md").write_text("[link to b](./b.md)")
        (root / "notes/b.md").write_text("target")
        issues = check_links(root)
        assert issues == [], f"Expected no broken links, got: {issues}"


def test_check_links_broken():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "notes").mkdir(parents=True, exist_ok=True)
        (root / "notes/a.md").write_text("[broken link](./nonexistent.md)")
        issues = check_links(root)
        assert len(issues) == 1, f"Expected 1 broken link, got: {issues}"
        assert "nonexistent.md" in issues[0]


def test_check_links_skips_external():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "notes").mkdir(parents=True, exist_ok=True)
        (root / "notes/a.md").write_text("[github](https://github.com/foo/bar)")
        issues = check_links(root)
        assert issues == [], f"External links should be skipped, got: {issues}"


def test_check_links_skips_anchor():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "notes").mkdir(parents=True, exist_ok=True)
        (root / "notes/a.md").write_text("[section](#heading)")
        issues = check_links(root)
        assert issues == [], f"Anchor links should be skipped, got: {issues}"


def test_scan_sensitive_no_false_positive():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "notes").mkdir(parents=True, exist_ok=True)
        (root / "notes/safe.md").write_text("# Hello\n\nThis is a normal note about Kubernetes.\n\nNo secrets here.")
        findings = scan_sensitive(root)
        assert findings == [], f"Expected no findings, got: {findings}"


def test_scan_sensitive_detects_api_key():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "notes").mkdir(parents=True, exist_ok=True)
        (root / "notes/leaked.md").write_text('api_key = "sk-my-secret-key-12345"')
        findings = scan_sensitive(root)
        assert len(findings) >= 1, f"Expected findings, got: {findings}"
        assert any("API key" in f for f in findings)


def test_scan_sensitive_detects_sessdata():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "notes").mkdir(parents=True, exist_ok=True)
        (root / "notes/leaked.md").write_text("set your SESSDATA = abc123secret here")
        findings = scan_sensitive(root)
        assert len(findings) >= 1, f"Expected SESSDATA finding, got: {findings}"


def test_scan_sensitive_respects_scan_dirs():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        # Secret in a dir NOT in scan_dirs (e.g., scripts)
        (root / "scripts").mkdir(parents=True, exist_ok=True)
        (root / "scripts/setup.sh").write_text('export API_KEY="sk-abcdefghij1234567890"')
        # scripts is not in scan_dirs
        findings = scan_sensitive(root)
        assert findings == [], f"Scripts dir should not be scanned, got: {findings}"


def run_all():
    tests = [
        test_check_structure_all_present,
        test_check_structure_missing_dir,
        test_check_structure_missing_file,
        test_check_links_valid,
        test_check_links_broken,
        test_check_links_skips_external,
        test_check_links_skips_anchor,
        test_scan_sensitive_no_false_positive,
        test_scan_sensitive_detects_api_key,
        test_scan_sensitive_detects_sessdata,
        test_scan_sensitive_respects_scan_dirs,
    ]
    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            print(f"  PASS: {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL: {test.__name__} — {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {test.__name__} — {e}")
            failed += 1
    print(f"\n[RESULT] {passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)
