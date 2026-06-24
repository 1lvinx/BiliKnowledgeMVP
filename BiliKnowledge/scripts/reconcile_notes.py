#!/usr/bin/env python3
"""Reconcile materialized note files with manifest video note fields.

`note_path` means a Markdown file exists and can be opened.
`note_ready` is aligned with `note_path` materialization for app routing/status.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_existing_note(notes_dir: Path, video: dict[str, Any]) -> Path | None:
    video_id = str(video.get("id") or "").strip()
    raw_note_path = str(video.get("note_path") or "").strip()
    candidates: list[Path] = []
    if raw_note_path:
        raw_path = Path(raw_note_path)
        if raw_path.is_absolute():
            candidates.append(raw_path)
        else:
            candidates.append(notes_dir / raw_path.name)
    if video_id:
        candidates.append(notes_dir / f"{video_id}.md")

    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.is_file():
            return candidate
    return None


def reconcile_videos(root: Path) -> tuple[list[dict[str, Any]], dict[str, int]]:
    manifest_path = root / "manifest" / "videos.json"
    notes_dir = root / "notes" / "raw"
    videos = load_json(manifest_path, [])
    if not isinstance(videos, list):
        raise ValueError(f"Invalid manifest: {manifest_path} must contain a list")

    metrics = {
        "total": 0,
        "materialized": 0,
        "note_path_added": 0,
        "note_path_cleared": 0,
        "note_ready_changed": 0,
    }
    reconciled: list[dict[str, Any]] = []
    for item in videos:
        if not isinstance(item, dict):
            continue
        metrics["total"] += 1
        video = dict(item)
        previous_note_path = str(video.get("note_path") or "").strip()
        previous_note_ready = bool(video.get("note_ready"))
        note = resolve_existing_note(notes_dir, video)
        if note:
            note_name = note.name
            video["note_path"] = note_name
            metrics["materialized"] += 1
            if not previous_note_path:
                metrics["note_path_added"] += 1
            video["note_ready"] = True
        else:
            if previous_note_path:
                metrics["note_path_cleared"] += 1
            video["note_path"] = ""
            video["note_ready"] = False
        if previous_note_ready != bool(video.get("note_ready")):
            metrics["note_ready_changed"] += 1
        reconciled.append(video)
    return reconciled, metrics



def write_csv(entries: list[dict[str, Any]], output_path: Path) -> None:
    if not entries:
        return
    fieldnames: list[str] = []
    for entry in entries:
        for key in entry.keys():
            if key not in fieldnames:
                fieldnames.append(key)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for entry in entries:
            row = dict(entry)
            if isinstance(row.get("tags"), list):
                row["tags"] = "|".join(str(tag) for tag in row["tags"])
            writer.writerow(row)

def main() -> int:
    parser = argparse.ArgumentParser(description="Reconcile manifest note_path/note_ready fields with notes/raw/*.md")
    parser.add_argument("--root", default="BiliKnowledge", help="Knowledge base root directory")
    parser.add_argument("--dry-run", action="store_true", help="Report only, do not write manifest")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    manifest_path = root / "manifest" / "videos.json"
    reconciled, metrics = reconcile_videos(root)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    if args.dry_run:
        print("[预览] 未写入 manifest。")
        return 0
    manifest_path.write_text(json.dumps(reconciled, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(reconciled, root / "manifest" / "videos.csv")
    print(f"[已写入] {manifest_path}")
    print(f"[已写入] {root / 'manifest' / 'videos.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
