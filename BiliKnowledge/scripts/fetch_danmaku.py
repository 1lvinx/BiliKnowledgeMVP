#!/usr/bin/env python3
"""Fetch Bilibili danmaku XML as auxiliary audience-time signals."""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/137 Safari/537.36"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fetch_xml(cid: int) -> bytes:
    req = urllib.request.Request(
        f"https://comment.bilibili.com/{cid}.xml",
        headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def parse_danmaku(xml_bytes: bytes, max_items: int) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_bytes.decode("utf-8", errors="ignore"))
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in root.findall("d"):
        text = html.unescape("".join(node.itertext())).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        p = str(node.attrib.get("p") or "").split(",")
        try:
            offset = float(p[0]) if p else 0.0
        except ValueError:
            offset = 0.0
        items.append({"time": offset, "text": text[:160]})
        if len(items) >= max_items:
            break
    return items


def bucket_hotspots(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[int, list[str]] = {}
    for item in items:
        minute = int(float(item.get("time") or 0) // 60)
        buckets.setdefault(minute, []).append(str(item.get("text") or ""))
    hotspots = []
    for minute, texts in sorted(buckets.items(), key=lambda pair: len(pair[1]), reverse=True)[:8]:
        hotspots.append({"minute": minute, "count": len(texts), "samples": texts[:5]})
    return hotspots


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取 Bilibili 弹幕")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--video-id", help="Specific BVID to fetch")
    parser.add_argument("--limit", type=int, default=5, help="Max videos when video-id is omitted")
    parser.add_argument("--max-items", type=int, default=800, help="Max danmaku items per video")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    videos = load_json(root / "manifest" / "videos.json", [])
    targets = [video for video in videos if video.get("id") == args.video_id] if args.video_id else videos[: args.limit]
    if not targets:
        print("[错误] 没有匹配视频。")
        return 1
    existing = load_json(root / "manifest" / "danmaku.json", [])
    target_ids = {video.get("id") for video in targets}
    results = [item for item in existing if item.get("video_id") not in target_ids]
    failed = 0
    for video in targets:
        bvid = video.get("id")
        cid = video.get("cid")
        if not cid:
            print(f"[警告] 缺少 cid，先抓元数据：{bvid}")
            failed += 1
            continue
        print(f"[弹幕] 正在抓取 {bvid} cid={cid}")
        try:
            items = parse_danmaku(fetch_xml(int(cid)), args.max_items)
            results.append(
                {
                    "video_id": bvid,
                    "cid": cid,
                    "total": len(items),
                    "items": items,
                    "hotspots": bucket_hotspots(items),
                    "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
                }
            )
        except Exception as exc:
            failed += 1
            print(f"[警告] 弹幕抓取失败 {bvid}：{exc}")
    save_json(root / "manifest" / "danmaku.json", results)
    print(f"[已写入] {root / 'manifest' / 'danmaku.json'}（共 {len(results)} 条视频弹幕）")
    if failed and args.video_id:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
