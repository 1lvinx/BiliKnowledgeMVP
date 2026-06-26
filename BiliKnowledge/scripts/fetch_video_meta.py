#!/usr/bin/env python3
"""Fetch reliable Bilibili video metadata via /x/web-interface/view.

This is the source-of-truth collector before subtitles/insights/notes:
- bvid -> aid/cid
- title/desc/owner/category/stat/duration/pubdate
- subtitle.list with concrete subtitle_url

It updates manifest/videos.json in-place for selected videos.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
)
BASE = "https://api.bilibili.com"


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


def load_bilibili_auth(root: Path) -> tuple[str, str]:
    config = load_json(root / "config" / "config.json", {})
    bilibili = config.get("bilibili") or {}
    raw_cookie = str(bilibili.get("cookie") or "").strip()
    sessdata = str(bilibili.get("sessdata") or "").strip()
    return raw_cookie, sessdata


def api_get_json(path: str, params: dict[str, Any], cookie_header: str = "") -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{BASE}{path}?{query}",
        headers={
            "Cookie": cookie_header,
            "User-Agent": UA,
            "Referer": "https://www.bilibili.com/",
            "Accept": "application/json, text/plain, */*",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_video_meta(bvid: str, cookie_header: str = "") -> dict[str, Any]:
    payload = api_get_json("/x/web-interface/view", {"bvid": bvid}, cookie_header)
    if payload.get("code") != 0:
        raise RuntimeError(f"view 接口失败: code={payload.get('code')} {payload.get('message')}")
    data = payload.get("data") or {}
    owner = data.get("owner") or {}
    stat = data.get("stat") or {}
    subtitle = data.get("subtitle") or {}
    subtitle_list = []
    for item in subtitle.get("list") or []:
        if not isinstance(item, dict):
            continue
        subtitle_list.append(
            {
                "id": item.get("id"),
                "lan": item.get("lan"),
                "lan_doc": item.get("lan_doc"),
                "is_lock": item.get("is_lock"),
                "subtitle_url": str(item.get("subtitle_url") or "").strip(),
            }
        )
    pages = data.get("pages") or []
    first_page = pages[0] if pages and isinstance(pages[0], dict) else {}
    return {
        "bvid": bvid,
        "aid": data.get("aid"),
        "cid": data.get("cid") or first_page.get("cid"),
        "title": data.get("title") or "",
        "desc": data.get("desc") or "",
        "owner_name": owner.get("name") or "",
        "owner_mid": owner.get("mid"),
        "duration": data.get("duration"),
        "pubdate": data.get("pubdate"),
        "tname": data.get("tname") or "",
        "tid": data.get("tid"),
        "stat": {
            "view": stat.get("view"),
            "danmaku": stat.get("danmaku"),
            "reply": stat.get("reply"),
            "favorite": stat.get("favorite"),
            "coin": stat.get("coin"),
            "share": stat.get("share"),
            "like": stat.get("like"),
        },
        "subtitle_available": bool(subtitle_list),
        "subtitle_list": subtitle_list,
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }


def merge_video_meta(video: dict[str, Any], meta: dict[str, Any]) -> dict[str, Any]:
    next_video = dict(video)
    next_video["aid"] = meta.get("aid")
    next_video["cid"] = meta.get("cid")
    next_video["desc"] = meta.get("desc", "")
    next_video["stat"] = meta.get("stat", {})
    next_video["subtitle_available"] = meta.get("subtitle_available", False)
    next_video["subtitle_list"] = meta.get("subtitle_list", [])
    next_video["meta_fetched_at"] = meta.get("fetched_at", "")
    if meta.get("title"):
        next_video["title"] = meta["title"]
    if meta.get("owner_name"):
        next_video["uploader"] = meta["owner_name"]
    if meta.get("duration"):
        next_video["duration"] = str(meta["duration"])
    if meta.get("pubdate"):
        next_video["pubdate"] = str(meta["pubdate"])
    if meta.get("tname"):
        next_video["category"] = meta["tname"]
    return next_video


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取 Bilibili 视频元数据")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--video-id", help="Specific BVID to fetch")
    parser.add_argument("--limit", type=int, default=20, help="Max videos when video-id is omitted")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    raw_cookie, sessdata = load_bilibili_auth(root)
    cookie_header = raw_cookie or (f"SESSDATA={sessdata}" if sessdata else "")
    videos_path = root / "manifest" / "videos.json"
    videos = load_json(videos_path, [])
    if not isinstance(videos, list) or not videos:
        print("[错误] 未找到视频，请先导入收藏。")
        return 1

    target_ids = {args.video_id} if args.video_id else None
    updated: list[dict[str, Any]] = []
    processed = 0
    failed = 0
    for video in videos:
        bvid = str(video.get("id") or "").strip()
        should_fetch = bool(bvid) and (not target_ids or bvid in target_ids) and processed < args.limit
        if not should_fetch:
            updated.append(video)
            continue
        print(f"[元数据] 正在抓取 {bvid} {video.get('title', '')}")
        try:
            meta = fetch_video_meta(bvid, cookie_header)
            updated.append(merge_video_meta(video, meta))
            processed += 1
        except Exception as exc:
            failed += 1
            print(f"[警告] 元数据抓取失败 {bvid}：{exc}")
            updated.append(video)

    save_json(videos_path, updated)
    print(f"[已写入] {videos_path}（处理 {processed} 条，失败 {failed} 条）")
    if failed and args.video_id:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
