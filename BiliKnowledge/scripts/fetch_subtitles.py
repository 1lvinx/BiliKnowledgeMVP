#!/usr/bin/env python3
"""Fetch Bilibili subtitles for one or more imported videos."""

import argparse
import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_bilibili_auth(root: Path) -> tuple[str, str]:
    config = load_json(root / "config" / "config.json", {})
    bilibili = config.get("bilibili") or {}
    raw_cookie = str(bilibili.get("cookie") or "").strip()
    sessdata = str(bilibili.get("sessdata") or "").strip()
    return raw_cookie, sessdata


def api_get_json(url: str, cookie_header: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Cookie": cookie_header,
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.bilibili.com/",
            "Accept": "application/json, text/plain, */*",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_cid(bvid: str, cookie_header: str) -> int:
    payload = api_get_json(
        f"https://api.bilibili.com/x/player/pagelist?bvid={bvid}",
        cookie_header,
    )
    data = payload.get("data") or []
    if not data:
        raise RuntimeError(f"No pagelist data found for {bvid}")
    return int(data[0]["cid"])


def fetch_subtitle_meta(bvid: str, cid: int, cookie_header: str) -> tuple[dict, dict]:
    payload = api_get_json(
        f"https://api.bilibili.com/x/player/v2?cid={cid}&bvid={bvid}",
        cookie_header,
    )
    data = payload.get("data") or {}
    subtitle = data.get("subtitle") or {}
    subtitles = subtitle.get("subtitles") or []
    if not subtitles:
        raise RuntimeError(f"No subtitles available for {bvid}")
    return subtitles[0], data


def fetch_ai_subtitle_url(aid: int, cid: int, cookie_header: str) -> str:
    payload = api_get_json(
        f"https://api.bilibili.com/x/player/v2/ai/subtitle/search/stat?aid={aid}&cid={cid}",
        cookie_header,
    )
    data = payload.get("data") or {}
    subtitle_url = data.get("subtitle_url") or ""
    if not subtitle_url:
        raise RuntimeError("AI subtitle URL is empty")
    return subtitle_url


def fetch_subtitle_body(url: str) -> dict:
    subtitle_url = f"https:{url}" if url.startswith("//") else url
    with urllib.request.urlopen(subtitle_url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def build_subtitle_entry(video_id: str, meta: dict, body: dict) -> dict:
    segments = [
        {
            "start": float(item.get("from", 0)),
            "end": float(item.get("to", 0)),
            "text": str(item.get("content", "")).strip(),
        }
        for item in body.get("body", [])
        if str(item.get("content", "")).strip()
    ]
    raw_text = "\n".join(segment["text"] for segment in segments)
    return {
        "video_id": video_id,
        "language": meta.get("lan", body.get("lang", "zh")),
        "source": "ai" if body.get("type") == "AIsubtitle" else "cc",
        "segments": segments,
        "raw_text": raw_text,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }


def main():
    parser = argparse.ArgumentParser(description="抓取字幕")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--video-id", help="Specific BVID to fetch")
    parser.add_argument("--limit", type=int, default=5, help="Max videos to fetch when video-id is omitted")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    raw_cookie, sessdata = load_bilibili_auth(root)
    cookie_header = raw_cookie or (f"SESSDATA={sessdata}" if sessdata else "")
    if not cookie_header:
        print("[错误] 未配置登录凭证。")
        sys.exit(1)

    videos = load_json(root / "manifest" / "videos.json", [])
    if not isinstance(videos, list) or not videos:
        print("[错误] 未找到视频，请先导入收藏。")
        sys.exit(1)

    targets = [video for video in videos if video.get("id") == args.video_id] if args.video_id else videos[: args.limit]
    if not targets:
        print("[错误] 没有可用于抓取字幕的匹配视频。")
        sys.exit(1)

    existing = load_json(root / "manifest" / "subtitles.json", [])
    existing_by_id = {item.get("video_id"): item for item in existing if isinstance(item, dict)}
    results = [item for item in existing if item.get("video_id") not in {video.get("id") for video in targets}]

    for video in targets:
        bvid = video.get("id", "")
        print(f"[字幕] 正在处理 {bvid} {video.get('title', '')}")
        try:
            cid = fetch_cid(bvid, cookie_header)
            meta, player_data = fetch_subtitle_meta(bvid, cid, cookie_header)
            subtitle_url = meta.get("subtitle_url") or ""
            if not subtitle_url and str(meta.get("lan", "")).startswith("ai-"):
                subtitle_url = fetch_ai_subtitle_url(int(player_data.get("aid", 0)), cid, cookie_header)
                meta = {**meta, "subtitle_url": subtitle_url}
            body = fetch_subtitle_body(meta["subtitle_url"])
            results.append(build_subtitle_entry(bvid, meta, body))
        except Exception as exc:
            print(f"[警告] 字幕抓取失败 {bvid}：{exc}")
            if bvid in existing_by_id:
                results.append(existing_by_id[bvid])

    save_json(root / "manifest" / "subtitles.json", results)
    print(f"[已写入] {root / 'manifest' / 'subtitles.json'}（共 {len(results)} 条）")


if __name__ == "__main__":
    main()
