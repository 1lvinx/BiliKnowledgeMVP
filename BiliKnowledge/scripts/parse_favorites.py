#!/usr/bin/env python3
"""Parse bilibili-favorites output into unified manifest (videos.json + videos.csv)."""

import argparse
import csv
import json
import sys
from pathlib import Path


HIGH_VALUE_KEYWORDS = [
    "AI", "Agent", "RAG", "知识库", "自动化", "Claude", "Codex", "OpenClaw",
    "开源", "GitHub", "项目", "工具", "部署", "API", "模型", "工作流",
    "副业", "赚钱", "SaaS", "剪辑", "短视频", "UI", "设计", "全栈",
    "Python", "FastAPI", "Next.js", "Docker",
]


def scan_source_files(source_dir: str) -> list[dict]:
    source = Path(source_dir)
    if not source.exists():
        print(f"[ERROR] Source directory not found: {source_dir}")
        sys.exit(1)

    all_videos = []
    for f in sorted(source.glob("*.json")):
        try:
            with open(f, encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, list):
                for item in data:
                    item["_source_file"] = str(f.name)
                all_videos.extend(data)
                print(f"[OK] {f.name}: {len(data)} records")
            elif isinstance(data, dict):
                data["_source_file"] = str(f.name)
                all_videos.append(data)
                print(f"[OK] {f.name}: 1 record")
        except json.JSONDecodeError as e:
            print(f"[WARN] {f.name}: invalid JSON - {e}")
    return all_videos


def merge_video_records(raw_videos: list[dict]) -> list[dict]:
    by_bvid: dict[str, dict] = {}
    for v in raw_videos:
        bvid = v.get("bvid", "")
        if not bvid:
            continue
        if bvid in by_bvid:
            existing = by_bvid[bvid]
            for key, val in v.items():
                if val and not existing.get(key):
                    existing[key] = val
        else:
            by_bvid[bvid] = dict(v)
    return list(by_bvid.values())


def classify_priority(video: dict) -> str:
    text = " ".join([
        video.get("title", ""),
        " ".join(video.get("tags", [])),
        video.get("category", ""),
    ]).lower()
    hits = sum(1 for kw in HIGH_VALUE_KEYWORDS if kw.lower() in text)
    if hits >= 3:
        return "P0"
    if hits >= 1:
        return "P1"
    return "P2"


def build_manifest_entry(video: dict) -> dict:
    return {
        "id": video.get("bvid", ""),
        "title": video.get("title", ""),
        "url": video.get("url", f"https://www.bilibili.com/video/{video.get('bvid', '')}"),
        "uploader": video.get("uploader", ""),
        "favorite_folder": video.get("favorite_folder", ""),
        "category": video.get("category", ""),
        "tags": video.get("tags", []),
        "duration": video.get("duration", ""),
        "pubdate": video.get("pubdate", ""),
        "priority": classify_priority(video),
        "status": "pending",
        "note_path": "",
        "project_extracted": False,
        "remarks": "",
    }


def write_json(entries: list[dict], output_path: Path):
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"[WRITE] {output_path} ({len(entries)} entries)")


def write_csv(entries: list[dict], output_path: Path):
    if not entries:
        print("[SKIP] No entries to write CSV")
        return
    fields = list(entries[0].keys())
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for entry in entries:
            row = dict(entry)
            row["tags"] = "|".join(row.get("tags", []))
            writer.writerow(row)
    print(f"[WRITE] {output_path} ({len(entries)} rows)")


def main():
    parser = argparse.ArgumentParser(description="Parse bilibili-favorites to manifest")
    parser.add_argument("--input", default="manifest/source", help="Source data directory")
    parser.add_argument("--output", default="manifest", help="Output manifest directory")
    parser.add_argument("--limit", type=int, default=50, help="Max videos to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no file write")
    args = parser.parse_args()

    raw = scan_source_files(args.input)
    if not raw:
        print("[ERROR] No video data found in source directory")
        sys.exit(1)

    merged = merge_video_records(raw)
    print(f"\n[MERGE] {len(raw)} raw -> {len(merged)} unique (by bvid)")

    limited = merged[: args.limit]
    print(f"[LIMIT] Processing {len(limited)} of {len(merged)} (limit={args.limit})")

    entries = [build_manifest_entry(v) for v in limited]

    p_counts = {}
    for e in entries:
        p = e["priority"]
        p_counts[p] = p_counts.get(p, 0) + 1
    print(f"[PRIORITY] {p_counts}")

    if args.dry_run:
        print("\n[DRY-RUN] Preview of first 3 entries:")
        for e in entries[:3]:
            print(json.dumps(e, ensure_ascii=False, indent=2))
        print("\n[DRY-RUN] No files written.")
        return

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    write_json(entries, out / "videos.json")
    write_csv(entries, out / "videos.csv")
    print(f"\n[DONE] Manifest generated in {out}/")


if __name__ == "__main__":
    main()
