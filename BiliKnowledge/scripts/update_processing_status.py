#!/usr/bin/env python3
"""Scan knowledge base data files and update processing_status.json."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


def count_json_array(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return len(data) if isinstance(data, list) else 0
    except (json.JSONDecodeError, OSError):
        return 0


def count_glob(directory: Path, pattern: str) -> int:
    if not directory.exists():
        return 0
    return len(list(directory.glob(pattern)))


def build_status(root: Path, validated: bool = False) -> dict:
    manifest_path = root / "manifest" / "videos.json"
    notes_dir = root / "notes" / "raw"
    projects_path = root / "projects" / "project_candidates.json"
    index_path = root / "index.md"

    total_videos = count_json_array(manifest_path)
    note_created = count_glob(notes_dir, "*.md")
    projects_extracted = count_json_array(projects_path)
    index_built = index_path.exists()

    # pending = videos whose status is still "pending"
    pending = 0
    if manifest_path.exists():
        try:
            videos = json.loads(manifest_path.read_text(encoding="utf-8"))
            pending = sum(1 for v in videos if v.get("status") == "pending")
        except (json.JSONDecodeError, OSError):
            pass

    return {
        "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "total_videos": total_videos,
        "pending": pending,
        "note_created": note_created,
        "projects_extracted": projects_extracted,
        "reviewed": total_videos - pending,
        "sample_limit": total_videos,
        "pipeline": {
            "manifest_generated": total_videos > 0,
            "notes_generated": note_created > 0,
            "projects_extracted": projects_extracted > 0,
            "index_built": index_built,
            "validated": validated,
        },
    }


def write_status(root: Path, status: dict):
    path = root / "manifest" / "processing_status.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(status, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    print(f"[WRITE] {path}")


def update_processing_status(root: Path, validated: bool = False):
    status = build_status(root, validated)
    write_status(root, status)
    return status


def main():
    parser = argparse.ArgumentParser(description="Update processing_status.json")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--validated", action="store_true", help="Mark validation as passed")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    status = update_processing_status(root, validated=args.validated)

    print(f"[STATUS] videos={status['total_videos']}, pending={status['pending']}, "
          f"notes={status['note_created']}, projects={status['projects_extracted']}")
    print(f"[PIPELINE] {json.dumps(status['pipeline'])}")


if __name__ == "__main__":
    main()
