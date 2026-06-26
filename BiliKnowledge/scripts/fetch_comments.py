#!/usr/bin/env python3
"""Fetch Bilibili comments for selected videos as value signals.

Uses /x/v2/reply paged endpoint. Comments are stored as source material,
not as final knowledge; insight generation can distill them later.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
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


def fetch_view_aid(bvid: str, cookie_header: str) -> int:
    payload = api_get_json("/x/web-interface/view", {"bvid": bvid}, cookie_header)
    if payload.get("code") != 0:
        raise RuntimeError(f"view 接口失败: code={payload.get('code')} {payload.get('message')}")
    return int((payload.get("data") or {}).get("aid") or 0)


def extract_reply(reply: dict[str, Any]) -> dict[str, Any]:
    member = reply.get("member") or {}
    content = reply.get("content") or {}
    return {
        "rpid": reply.get("rpid"),
        "uname": member.get("uname") or "",
        "mid": member.get("mid"),
        "message": str(content.get("message") or "").strip(),
        "like": int(reply.get("like") or 0),
        "ctime": reply.get("ctime"),
        "rcount": reply.get("rcount") or 0,
    }


def fetch_comments_for_video(video: dict[str, Any], cookie_header: str, max_pages: int) -> dict[str, Any]:
    bvid = str(video.get("id") or "")
    aid = int(video.get("aid") or 0) or fetch_view_aid(bvid, cookie_header)
    seen_messages: set[str] = set()
    comments: list[dict[str, Any]] = []
    total = 0
    pages = 0
    for page in range(1, max_pages + 1):
        payload = api_get_json(
            "/x/v2/reply",
            {"type": 1, "oid": aid, "sort": 0, "nohot": 1, "ps": 49, "pn": page},
            cookie_header,
        )
        if payload.get("code") != 0:
            raise RuntimeError(f"reply 接口失败: code={payload.get('code')} {payload.get('message')}")
        data = payload.get("data") or {}
        page_info = data.get("page") or {}
        total = int(page_info.get("count") or total or 0)
        replies = data.get("replies") or []
        if not replies:
            break
        pages = page
        for reply in replies:
            item = extract_reply(reply)
            message = item["message"]
            if not message or message in seen_messages:
                continue
            seen_messages.add(message)
            comments.append(item)
        time.sleep(0.25)
    return {
        "video_id": bvid,
        "aid": aid,
        "total": total,
        "fetched": len(comments),
        "pages": pages,
        "comments": comments,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取 Bilibili 评论")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--video-id", help="Specific BVID to fetch")
    parser.add_argument("--limit", type=int, default=5, help="Max videos when video-id is omitted")
    parser.add_argument("--max-pages", type=int, default=3, help="Max comment pages per video")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    raw_cookie, sessdata = load_bilibili_auth(root)
    cookie_header = raw_cookie or (f"SESSDATA={sessdata}" if sessdata else "")
    videos = load_json(root / "manifest" / "videos.json", [])
    if not isinstance(videos, list) or not videos:
        print("[错误] 未找到视频，请先导入收藏。")
        return 1
    targets = [video for video in videos if video.get("id") == args.video_id] if args.video_id else videos[: args.limit]
    if not targets:
        print("[错误] 没有匹配视频。")
        return 1

    comments_path = root / "manifest" / "comments.json"
    existing = load_json(comments_path, [])
    target_ids = {video.get("id") for video in targets}
    results = [item for item in existing if item.get("video_id") not in target_ids]
    failed = 0
    for video in targets:
        print(f"[评论] 正在抓取 {video.get('id')} {video.get('title', '')}")
        try:
            results.append(fetch_comments_for_video(video, cookie_header, max(1, args.max_pages)))
        except Exception as exc:
            failed += 1
            print(f"[警告] 评论抓取失败 {video.get('id')}：{exc}")
    save_json(comments_path, results)
    print(f"[已写入] {comments_path}（共 {len(results)} 条视频评论）")
    if failed and args.video_id:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
