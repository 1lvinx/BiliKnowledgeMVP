"""Tests for update_processing_status.py — status scanning and writing."""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from update_processing_status import build_status, update_processing_status


def test_empty_state():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        status = build_status(root, validated=False)
        assert status["total_videos"] == 0
        assert status["pending"] == 0
        assert status["note_created"] == 0
        assert status["projects_extracted"] == 0
        assert status["pipeline"]["manifest_generated"] is False
        assert status["pipeline"]["notes_generated"] is False
        assert status["pipeline"]["projects_extracted"] is False
        assert status["pipeline"]["index_built"] is False
        assert status["pipeline"]["validated"] is False


def test_full_state():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        # manifest
        (root / "manifest").mkdir()
        videos = [
            {"id": "BV1", "status": "reviewed"},
            {"id": "BV2", "status": "pending"},
            {"id": "BV3", "status": "reviewed"},
        ]
        (root / "manifest" / "videos.json").write_text(json.dumps(videos))
        # notes
        (root / "notes" / "raw").mkdir(parents=True)
        for i in range(3):
            (root / "notes" / "raw" / f"note{i}.md").write_text(f"# Note {i}")
        # projects
        (root / "projects").mkdir()
        projects = [{"name": "p1"}, {"name": "p2"}]
        (root / "projects" / "project_candidates.json").write_text(json.dumps(projects))
        # index
        (root / "index.md").write_text("# Index")

        status = build_status(root, validated=True)
        assert status["total_videos"] == 3
        assert status["pending"] == 1
        assert status["note_created"] == 3
        assert status["projects_extracted"] == 2
        assert status["reviewed"] == 2
        assert status["pipeline"]["manifest_generated"] is True
        assert status["pipeline"]["notes_generated"] is True
        assert status["pipeline"]["projects_extracted"] is True
        assert status["pipeline"]["index_built"] is True
        assert status["pipeline"]["validated"] is True


def test_partial_state():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "manifest").mkdir()
        videos = [{"id": "BV1", "status": "pending"}]
        (root / "manifest" / "videos.json").write_text(json.dumps(videos))

        status = build_status(root, validated=False)
        assert status["total_videos"] == 1
        assert status["pending"] == 1
        assert status["pipeline"]["manifest_generated"] is True
        assert status["pipeline"]["notes_generated"] is False
        assert status["pipeline"]["validated"] is False


def test_write_creates_file():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "manifest").mkdir()
        (root / "manifest" / "videos.json").write_text("[]")

        update_processing_status(root, validated=True)
        out = root / "manifest" / "processing_status.json"
        assert out.exists()
        data = json.loads(out.read_text())
        assert data["pipeline"]["validated"] is True


def test_malformed_manifest():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "manifest").mkdir()
        (root / "manifest" / "videos.json").write_text("not json")

        status = build_status(root)
        assert status["total_videos"] == 0
        assert status["pending"] == 0


def run_all():
    tests = [
        test_empty_state,
        test_full_state,
        test_partial_state,
        test_write_creates_file,
        test_malformed_manifest,
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
