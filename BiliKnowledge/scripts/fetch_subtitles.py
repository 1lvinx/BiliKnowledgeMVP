#!/usr/bin/env python3
"""Fetch Bilibili subtitles for one or more imported videos."""

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

BASE = "https://api.bilibili.com"


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


def validate_subtitle_against_video(video: dict, entry: dict) -> tuple[bool, str, list[str]]:
    raw_text = str(entry.get("raw_text") or "").strip().lower()
    if len(raw_text) < 40:
        return False, "字幕文本过短，无法支撑笔记生成", []
    title_keywords = extract_keywords(str(video.get("title") or ""))
    metadata_keywords = extract_keywords(" ".join([
        str(video.get("uploader") or ""),
        str(video.get("favorite_folder") or ""),
        str(video.get("category") or ""),
    ]))
    title_hits = [kw for kw in title_keywords if kw in raw_text]
    meta_hits = [kw for kw in metadata_keywords if kw in raw_text]
    if title_hits:
        return True, "标题关键词命中字幕", title_hits[:8]
    if len(meta_hits) >= 2 and len(title_keywords) <= 1:
        return True, "元数据关键词命中字幕", meta_hits[:8]
    expected = "、".join(title_keywords[:6]) or "标题关键词"
    return False, f"字幕疑似错配：未命中 {expected}", (title_keywords + metadata_keywords)[:8]


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


def fetch_video_view(bvid: str, cookie_header: str) -> dict:
    query = urllib.parse.urlencode({"bvid": bvid})
    payload = api_get_json(f"{BASE}/x/web-interface/view?{query}", cookie_header)
    if payload.get("code") != 0:
        raise RuntimeError(f"view 接口失败: code={payload.get('code')} {payload.get('message')}")
    return payload.get("data") or {}


def update_video_with_view_meta(video: dict, data: dict) -> dict:
    owner = data.get("owner") or {}
    subtitle = data.get("subtitle") or {}
    subtitle_list = [
        {
            "id": item.get("id"),
            "lan": item.get("lan"),
            "lan_doc": item.get("lan_doc"),
            "is_lock": item.get("is_lock"),
            "subtitle_url": str(item.get("subtitle_url") or "").strip(),
        }
        for item in subtitle.get("list") or []
        if isinstance(item, dict)
    ]
    next_video = dict(video)
    next_video["aid"] = data.get("aid")
    next_video["cid"] = data.get("cid")
    next_video["desc"] = data.get("desc") or next_video.get("desc", "")
    next_video["subtitle_available"] = bool(subtitle_list)
    next_video["subtitle_list"] = subtitle_list
    if data.get("title"):
        next_video["title"] = data["title"]
    if owner.get("name"):
        next_video["uploader"] = owner["name"]
    if data.get("duration"):
        next_video["duration"] = str(data["duration"])
    if data.get("pubdate"):
        next_video["pubdate"] = str(data["pubdate"])
    if data.get("tname"):
        next_video["category"] = data["tname"]
    return next_video


def choose_subtitle_meta(video: dict, bvid: str, cookie_header: str) -> tuple[dict, dict]:
    subtitle_list = video.get("subtitle_list") if isinstance(video.get("subtitle_list"), list) else []
    cid = video.get("cid")
    aid = video.get("aid")
    refreshed_video = video
    if not subtitle_list or not cid:
        view_data = fetch_video_view(bvid, cookie_header)
        refreshed_video = update_video_with_view_meta(video, view_data)
        subtitle_list = refreshed_video.get("subtitle_list") or []
        cid = refreshed_video.get("cid")
        aid = refreshed_video.get("aid")
    if not subtitle_list:
        raise RuntimeError(f"No subtitles available for {bvid}")
    # Prefer human/CC Chinese, then any Chinese, then first usable subtitle.
    preferred = None
    for item in subtitle_list:
        lan = str(item.get("lan") or "").lower()
        if item.get("subtitle_url") and lan in {"zh-cn", "zh-hans", "zh", "zh-tw"}:
            preferred = item
            break
    if preferred is None:
        preferred = next((item for item in subtitle_list if item.get("subtitle_url")), subtitle_list[0])
    return {**preferred, "cid": cid, "aid": aid}, refreshed_video


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
        "source": "ai" if str(meta.get("lan", "")).startswith("ai-") or body.get("type") == "AIsubtitle" else "cc",
        "subtitle_url": meta.get("subtitle_url", ""),
        "cid": meta.get("cid"),
        "aid": meta.get("aid"),
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

    failed = 0
    refreshed_by_id = {}
    for video in targets:
        bvid = video.get("id", "")
        print(f"[字幕] 正在处理 {bvid} {video.get('title', '')}")
        try:
            meta, refreshed_video = choose_subtitle_meta(video, bvid, cookie_header)
            body = fetch_subtitle_body(meta["subtitle_url"])
            video = refreshed_video
            refreshed_by_id[bvid] = refreshed_video
            entry = build_subtitle_entry(bvid, meta, body)
            is_valid, reason, matched_keywords = validate_subtitle_against_video(video, entry)
            entry["validation"] = {
                "status": "valid" if is_valid else "mismatch",
                "reason": reason,
                "matched_keywords": matched_keywords,
            }
            if not is_valid:
                failed += 1
                print(f"[错误] 字幕校验失败 {bvid}：{reason}")
                continue
            results.append(entry)
        except Exception as exc:
            failed += 1
            print(f"[警告] 字幕抓取失败 {bvid}：{exc}")

    if refreshed_by_id:
        save_json(root / "manifest" / "videos.json", [refreshed_by_id.get(item.get("id"), item) for item in videos])
        print(f"[已写入] {root / 'manifest' / 'videos.json'}（已补齐元数据 {len(refreshed_by_id)} 条）")
    save_json(root / "manifest" / "subtitles.json", results)
    print(f"[已写入] {root / 'manifest' / 'subtitles.json'}（共 {len(results)} 条）")
    if failed and args.video_id:
        sys.exit(1)


if __name__ == "__main__":
    main()
