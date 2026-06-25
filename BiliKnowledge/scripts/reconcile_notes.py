#!/usr/bin/env python3
"""Reconcile materialized note files with manifest video note fields.

`note_path` means a Markdown file exists and can be opened.
`note_ready` is aligned with `note_path` materialization for app routing/status.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any

def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def is_invalid_video(video: dict[str, Any]) -> bool:
    title = str(video.get("title") or "").strip()
    video_id = str(video.get("id") or "").strip()
    return title == "已失效视频" or "已失效" in title or not video_id.startswith("BV")


def is_single_generated_note(video: dict[str, Any]) -> bool:
    return str(video.get("note_generation_mode") or "").strip() == "single"


STOPWORDS = {
    "什么", "如何", "一个", "我们", "你们", "他们", "这个", "那个", "就是", "然后", "因为",
    "可以", "视频", "教程", "分享", "实战", "方法", "使用", "入门", "完整", "最新", "真的",
}


def extract_keywords(text: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z0-9.+#_-]{2,}|[\u4e00-\u9fff]{2,}", text or "")
    results: list[str] = []
    for raw in candidates:
        token = raw.strip().lower()
        if len(token) < 2 or token in STOPWORDS:
            continue
        results.append(token)
    return list(dict.fromkeys(results))


def subtitle_matches_video(video: dict[str, Any], subtitle: dict[str, Any] | None) -> bool:
    if not subtitle:
        return False
    validation = subtitle.get("validation") if isinstance(subtitle.get("validation"), dict) else {}
    if validation.get("status") == "mismatch":
        return False
    if validation.get("status") == "valid":
        return True
    raw_text = str(subtitle.get("raw_text") or "").strip().lower()
    if len(raw_text) < 40:
        return False
    title_keywords = extract_keywords(str(video.get("title") or ""))
    metadata_keywords = extract_keywords(" ".join([
        str(video.get("uploader") or ""),
        str(video.get("favorite_folder") or ""),
        str(video.get("category") or ""),
    ]))
    if any(keyword in raw_text for keyword in title_keywords):
        return True
    metadata_hits = [keyword for keyword in metadata_keywords if keyword in raw_text]
    return len(title_keywords) <= 1 and len(metadata_hits) >= 2


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
    subtitles = load_json(root / "manifest" / "subtitles.json", [])
    subtitle_by_id = {item.get("video_id"): item for item in subtitles if isinstance(item, dict) and item.get("video_id")}
    if not isinstance(videos, list):
        raise ValueError(f"Invalid manifest: {manifest_path} must contain a list")

    metrics = {
        "total": 0,
        "materialized": 0,
        "note_path_added": 0,
        "note_path_cleared": 0,
        "note_ready_changed": 0,
        "invalid_removed": 0,
        "note_blocked_by_subtitle": 0,
    }
    reconciled: list[dict[str, Any]] = []
    for item in videos:
        if not isinstance(item, dict):
            continue
        metrics["total"] += 1
        video = dict(item)
        if is_invalid_video(video):
            metrics["invalid_removed"] += 1
            continue
        previous_note_path = str(video.get("note_path") or "").strip()
        previous_note_ready = bool(video.get("note_ready"))
        note = resolve_existing_note(notes_dir, video)
        if note:
            note_name = note.name
            video["note_path"] = note_name
            metrics["materialized"] += 1
            if not previous_note_path:
                metrics["note_path_added"] += 1
            has_valid_subtitle = subtitle_matches_video(video, subtitle_by_id.get(str(video.get("id") or "")))
            video["note_ready"] = is_single_generated_note(video) and has_valid_subtitle
            if not video["note_ready"]:
                if is_single_generated_note(video) and not has_valid_subtitle:
                    metrics["note_blocked_by_subtitle"] += 1
                video["note_path"] = ""
        else:
            if previous_note_path:
                metrics["note_path_cleared"] += 1
            video["note_path"] = ""
            video["note_ready"] = False
        if previous_note_ready != bool(video.get("note_ready")):
            metrics["note_ready_changed"] += 1
        reconciled.append(video)
    return reconciled, metrics





def write_favorite_folders(entries: list[dict[str, Any]], output_path: Path) -> None:
    folders: dict[str, dict[str, Any]] = {}
    for entry in entries:
        title = str(entry.get("favorite_folder") or "默认收藏夹")
        current = folders.setdefault(
            title,
            {
                "id": title,
                "title": title,
                "media_count": 0,
                "latest_ts": 0,
                "latest_collected_at": "",
            },
        )
        current["media_count"] += 1
        pubdate = str(entry.get("pubdate") or "").strip()
        latest_ts = int(pubdate) if pubdate.isdigit() else 0
        if latest_ts >= int(current.get("latest_ts") or 0):
            current["latest_ts"] = latest_ts
            current["latest_collected_at"] = str(entry.get("collected_at") or entry.get("pubdate") or "")
    payload = sorted(
        folders.values(),
        key=lambda item: (int(item.get("latest_ts") or 0), int(item.get("media_count") or 0), str(item.get("title") or "")),
        reverse=True,
    )
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

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
    write_favorite_folders(reconciled, root / "manifest" / "favorite_folders.json")
    print(f"[已写入] {manifest_path}")
    print(f"[已写入] {root / 'manifest' / 'videos.csv'}")
    print(f"[已写入] {root / 'manifest' / 'favorite_folders.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
