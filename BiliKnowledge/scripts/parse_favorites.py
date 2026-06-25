#!/usr/bin/env python3
"""Sync Bilibili favorites and parse them into unified manifest files."""

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import List, Optional, Tuple, Union


HIGH_VALUE_KEYWORDS = [
    "AI", "Agent", "RAG", "知识库", "自动化", "Claude", "Codex", "OpenClaw",
    "开源", "GitHub", "项目", "工具", "部署", "API", "模型", "工作流",
    "副业", "赚钱", "SaaS", "剪辑", "短视频", "UI", "设计", "全栈",
    "Python", "FastAPI", "Next.js", "Docker",
]

DEFAULT_SOURCE_FILE = "收藏视频数据.json"
DEFAULT_FOLDER_TITLE = "默认收藏夹"
DEFAULT_LIMIT = 0


def load_local_config(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"[警告] 配置文件格式无效：{config_path}，{exc}")
        return {}


def build_cookie_header(config: dict) -> str:
    bilibili = config.get("bilibili") or {}
    raw_cookie = str(bilibili.get("cookie") or "").strip()
    if raw_cookie:
        return raw_cookie

    segments = []
    mapping = [
        ("SESSDATA", bilibili.get("sessdata")),
        ("bili_jct", bilibili.get("bili_jct")),
        ("DedeUserID", bilibili.get("dedeuserid")),
        ("buvid3", bilibili.get("buvid3")),
    ]
    for key, value in mapping:
        normalized = str(value or "").strip()
        if normalized:
            segments.append(f"{key}={normalized}")
    return "; ".join(segments)


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
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_login_profile(cookie_header: str) -> dict:
    payload = api_get_json("https://api.bilibili.com/x/web-interface/nav", cookie_header)
    data = payload.get("data") or {}
    if not data.get("isLogin"):
        raise RuntimeError("SESSDATA is invalid or expired. Please log in again.")
    return data


def fetch_favorite_folders(cookie_header: str, mid: Union[int, str]) -> list[dict]:
    query = urllib.parse.urlencode({"up_mid": str(mid)})
    payload = api_get_json(
        f"https://api.bilibili.com/x/v3/fav/folder/created/list-all?{query}",
        cookie_header,
    )
    if payload.get("code") != 0:
        raise RuntimeError(payload.get("message") or "Failed to fetch favorite folders.")
    data = payload.get("data") or {}
    return data.get("list") or []


def fetch_folder_medias(
    cookie_header: str, media_id: Union[int, str], max_items: int
) -> Tuple[dict, list[dict]]:
    page = 1
    page_size = min(max(max_items, 1), 20)
    collected: list[dict] = []
    folder_info: dict = {}

    while len(collected) < max_items:
        query = urllib.parse.urlencode(
            {
                "media_id": str(media_id),
                "pn": str(page),
                "ps": str(page_size),
                "platform": "web",
            }
        )
        payload = api_get_json(
            f"https://api.bilibili.com/x/v3/fav/resource/list?{query}",
            cookie_header,
        )
        if payload.get("code") != 0:
            raise RuntimeError(payload.get("message") or "Failed to fetch favorite items.")

        data = payload.get("data") or {}
        folder_info = data.get("info") or folder_info
        medias = data.get("medias") or []
        if not medias:
            break

        collected.extend(medias)
        if not data.get("has_more"):
            break
        page += 1

    return folder_info, collected[:max_items]


def normalize_live_media_items(folder_info: dict, medias: list[dict]) -> list[dict]:
    favorite_folder = folder_info.get("title", "")
    normalized = []
    for media in medias:
        bvid = media.get("bvid") or media.get("bv_id") or ""
        if not bvid:
            continue
        upper = media.get("upper") or {}
        normalized.append(
            {
                "bvid": bvid,
                "title": media.get("title", ""),
                "url": f"https://www.bilibili.com/video/{bvid}",
                "uploader": upper.get("name", ""),
                "uploader_uid": str(upper.get("mid", "")),
                "favorite_folder": favorite_folder,
                "duration": str(media.get("duration", "")),
                "pubdate": str(media.get("pubtime", "")),
                "desc": media.get("intro", ""),
                "tags": [],
            }
        )
    return normalized


def write_folder_manifest(
    folders: list[dict],
    output_dir: Path,
    *,
    entries: Optional[list[dict]] = None,
    failed_folders: Optional[list[dict]] = None,
    partial_folders: Optional[list[dict]] = None,
) -> None:
    failed_map = {
        str(folder.get("id", "")): folder
        for folder in (failed_folders or [])
    }
    partial_map = {
        str(folder.get("id", "")): folder
        for folder in (partial_folders or [])
    }
    latest_map: dict[str, tuple[int, str]] = {}
    for entry in (entries or []):
        folder_title = str(entry.get("favorite_folder") or DEFAULT_FOLDER_TITLE)
        raw_latest = str(entry.get("collected_at") or entry.get("pubdate") or "").strip()
        latest_ts = 0
        pubdate = str(entry.get("pubdate") or "").strip()
        if pubdate.isdigit():
            latest_ts = int(pubdate)
        latest_title, latest_raw = latest_map.get(folder_title, (0, ""))
        if latest_ts >= latest_title:
            latest_map[folder_title] = (latest_ts, raw_latest or latest_raw)
    payload = []
    for folder in folders:
        folder_id = str(folder.get("id", ""))
        partial = partial_map.get(folder_id) or {}
        failed = failed_map.get(folder_id) or {}
        sync_status = "failed" if failed else "partial" if partial else "complete"
        latest_ts, latest_collected_at = latest_map.get(
            folder.get("title", DEFAULT_FOLDER_TITLE),
            (0, ""),
        )
        payload.append(
            {
                "id": folder_id,
                "title": folder.get("title", DEFAULT_FOLDER_TITLE),
                "media_count": int(folder.get("media_count") or folder.get("count") or 0),
                "latest_ts": latest_ts,
                "latest_collected_at": latest_collected_at,
                "sync_status": sync_status,
                "synced_count": int(partial.get("actual_count") or folder.get("media_count") or folder.get("count") or 0),
                "error": failed.get("error", ""),
            }
        )
    payload.sort(
        key=lambda item: (
            int(item.get("latest_ts") or 0),
            int(item.get("media_count") or 0),
            item.get("title", ""),
        ),
        reverse=True,
    )
    path = output_dir / "favorite_folders.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[已写入] {path}（共 {len(payload)} 个收藏夹）")


def project_root_from_source_dir(source_dir: Path) -> Path:
    return Path(__file__).resolve().parents[2]


def run_browser_sync(source_dir: Path) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    project_root = project_root_from_source_dir(source_dir)
    app_root = project_root / "BiliKnowledgeApp"
    script_path = app_root / "scripts" / "scrape_bilibili_favorites.mjs"
    config_path = project_root / "BiliKnowledge" / "config" / "config.json"
    node_bin = shutil.which("node")

    if not node_bin:
        raise RuntimeError("未找到 Node.js，无法执行浏览器态收藏夹同步。")
    if not script_path.exists():
        raise RuntimeError(f"未找到浏览器同步脚本：{script_path}")
    if not config_path.exists():
        raise RuntimeError(f"未找到配置文件：{config_path}")

    with tempfile.NamedTemporaryFile(prefix="bk-favorites-", suffix=".json", delete=False) as handle:
        output_path = Path(handle.name)

    command = [
        node_bin,
        str(script_path),
        "--config",
        str(config_path),
        "--output",
        str(output_path),
    ]
    max_items_per_folder = str(os.environ.get("BILIKNOWLEDGE_MAX_ITEMS_PER_FOLDER", "0")).strip()
    if max_items_per_folder.isdigit() and int(max_items_per_folder) > 0:
        command.extend(["--max-items-per-folder", max_items_per_folder])

    try:
        subprocess.run(
            command,
            cwd=project_root,
            check=True,
            text=True,
        )
        payload = json.loads(output_path.read_text(encoding="utf-8"))
        folders = payload.get("folders") or []
        items = payload.get("items") or []
        failed_folders = payload.get("failed_folders") or []
        partial_folders = payload.get("partial_folders") or []
        return folders, items, failed_folders, partial_folders
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"浏览器态同步失败（退出码 {exc.returncode}）。") from exc
    finally:
        output_path.unlink(missing_ok=True)


def maybe_sync_live_favorites(source_dir: Path, limit: int) -> list[dict]:
    config = load_local_config(Path("config/config.json"))
    cookie_header = build_cookie_header(config)
    if not cookie_header:
        raise RuntimeError("未配置完整的 Bilibili Cookie，请先在设置中粘贴并保存整段 Cookie Header。")
    try:
        folders, normalized, failed_folders, partial_folders = run_browser_sync(source_dir)
        if not folders:
            raise RuntimeError("No favorite folders found in this account.")
        normalized = merge_video_records(normalized)
        source_dir.mkdir(parents=True, exist_ok=True)
        output_path = source_dir / DEFAULT_SOURCE_FILE
        output_path.write_text(
            json.dumps(normalized, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[已写入] {output_path}（共 {len(normalized)} 条收藏）")
        if failed_folders:
            print(f"[警告] 有 {len(failed_folders)} 个收藏夹同步失败，将保留已成功同步的数据。")
            for folder in failed_folders[:10]:
                print(f"[警告] 收藏夹失败：{folder.get('title', '')} - {folder.get('error', '')}")
        if partial_folders:
            print(f"[警告] 有 {len(partial_folders)} 个收藏夹未完整抓取。")
            for folder in partial_folders[:10]:
                print(
                    f"[警告] 收藏夹未完整：{folder.get('title', '')} - "
                    f"{folder.get('actual_count', 0)} / {folder.get('expected_count', 0)}"
                )
        write_folder_manifest(
            folders,
            source_dir.parent,
            entries=normalized,
            failed_folders=failed_folders,
            partial_folders=partial_folders,
        )
        return folders
    except (RuntimeError, urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"在线同步失败：{exc}") from exc


def scan_source_files(source_dir: str, prioritized_files: Optional[List[str]] = None) -> list[dict]:
    source = Path(source_dir)
    if not source.exists():
        print(f"[错误] 未找到来源目录：{source_dir}")
        sys.exit(1)

    all_videos = []
    files = []
    if prioritized_files:
        for file_name in prioritized_files:
            candidate = source / file_name
            if candidate.exists():
                files.append(candidate)
    if not files:
        files = sorted(source.glob("*.json"))

    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, list):
                for item in data:
                    item["_source_file"] = str(f.name)
                all_videos.extend(data)
                print(f"[已读取] {f.name}：{len(data)} 条记录")
            elif isinstance(data, dict):
                data["_source_file"] = str(f.name)
                all_videos.append(data)
                print(f"[已读取] {f.name}：1 条记录")
        except json.JSONDecodeError as e:
            print(f"[警告] {f.name}：JSON 格式无效 - {e}")
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
        "collected_at": video.get("collected_at", ""),
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



def is_invalid_video(entry: dict) -> bool:
    title = str(entry.get("title") or "").strip()
    video_id = str(entry.get("id") or "").strip()
    return title == "已失效视频" or "已失效" in title or not video_id.startswith("BV")


def reconcile_note_materialization(entries: list[dict], notes_dir: Path) -> dict[str, int]:
    metrics = {
        "materialized": 0,
        "note_path_added": 0,
        "note_path_cleared": 0,
    }
    for entry in entries:
        if is_invalid_video(entry):
            entry["note_path"] = ""
            entry["note_ready"] = False
            continue
        video_id = str(entry.get("id") or "").strip()
        current_note_path = str(entry.get("note_path") or "").strip()
        candidates: list[Path] = []
        if current_note_path:
            candidates.append(notes_dir / Path(current_note_path).name)
        if video_id:
            candidates.append(notes_dir / f"{video_id}.md")

        note_path = next((candidate for candidate in candidates if candidate.is_file()), None)
        if note_path:
            if not current_note_path:
                metrics["note_path_added"] += 1
            entry["note_path"] = note_path.name
            entry["note_ready"] = False
            entry.pop("note_generation_mode", None)
            metrics["materialized"] += 1
        else:
            if current_note_path:
                metrics["note_path_cleared"] += 1
            entry["note_path"] = ""
            entry["note_ready"] = False
    return metrics

def write_json(entries: list[dict], output_path: Path):
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"[已写入] {output_path}（共 {len(entries)} 条）")


def write_csv(entries: list[dict], output_path: Path):
    if not entries:
        print("[跳过] 没有可写入 CSV 的内容")
        return
    fields = list(entries[0].keys())
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for entry in entries:
            row = dict(entry)
            row["tags"] = "|".join(row.get("tags", []))
            writer.writerow(row)
    print(f"[已写入] {output_path}（共 {len(entries)} 行）")


def write_favorite_folders(entries: list[dict], output_path: Path) -> None:
    folder_meta: dict[str, dict] = {}
    for entry in entries:
        title = entry.get("favorite_folder") or DEFAULT_FOLDER_TITLE
        latest_ts = 0
        pubdate = str(entry.get("pubdate") or "").strip()
        if pubdate.isdigit():
            latest_ts = int(pubdate)
        latest_collected_at = str(entry.get("collected_at") or entry.get("pubdate") or "").strip()
        current = folder_meta.setdefault(
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
        if latest_ts >= int(current.get("latest_ts") or 0):
            current["latest_ts"] = latest_ts
            current["latest_collected_at"] = latest_collected_at
    payload = [
        value
        for value in folder_meta.values()
    ]
    payload.sort(
        key=lambda item: (
            int(item.get("latest_ts") or 0),
            int(item.get("media_count") or 0),
            item.get("title", ""),
        ),
        reverse=True,
    )
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[已写入] {output_path}（共 {len(payload)} 个收藏夹）")


def main():
    parser = argparse.ArgumentParser(description="导入收藏并生成本地视频清单")
    parser.add_argument("--input", default="manifest/source", help="Source data directory")
    parser.add_argument("--output", default="manifest", help="Output manifest directory")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Max videos to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no file write")
    parser.add_argument(
        "--allow-local-fallback",
        action="store_true",
        help="Allow using existing local source files when live sync is unavailable",
    )
    args = parser.parse_args()

    live_folders: list[dict] = []
    live_sync_failed: Optional[str] = None
    try:
        live_folders = maybe_sync_live_favorites(Path(args.input), args.limit)
    except RuntimeError as exc:
        live_sync_failed = str(exc)
        if args.allow_local_fallback:
            print(f"[警告] {live_sync_failed}")
            print("[警告] 已启用本地回退，将改用现有来源文件。")
        else:
            print(f"[错误] {live_sync_failed}")
            sys.exit(1)

    prioritized_files = [DEFAULT_SOURCE_FILE]
    raw = scan_source_files(args.input, prioritized_files=prioritized_files)
    if not raw:
        print("[错误] 来源目录中未找到视频数据")
        sys.exit(1)

    merged = merge_video_records(raw)
    print(f"\n[整理] 原始 {len(raw)} 条，去重后 {len(merged)} 条")

    if args.limit and args.limit > 0:
        limited = merged[: args.limit]
        print(f"[处理] 本次处理 {len(limited)} / {len(merged)} 条（上限 {args.limit}）")
    else:
        limited = merged
        print(f"[处理] 本次处理全部 {len(limited)} 条")

    entries = [build_manifest_entry(v) for v in limited]
    before_invalid_filter = len(entries)
    entries = [entry for entry in entries if not is_invalid_video(entry)]
    removed_invalid = before_invalid_filter - len(entries)
    if removed_invalid:
        print(f"[整理] 已剔除失效视频 {removed_invalid} 条")
    out = Path(args.output)
    note_metrics = reconcile_note_materialization(entries, out.parent / "notes" / "raw")
    print(f"[笔记状态] {note_metrics}")

    p_counts = {}
    for e in entries:
        p = e["priority"]
        p_counts[p] = p_counts.get(p, 0) + 1
    print(f"[优先级] {p_counts}")

    if args.dry_run:
        print("\n[预览] 前 3 条内容：")
        for e in entries[:3]:
            print(json.dumps(e, ensure_ascii=False, indent=2))
        print("\n[预览] 本次未写入文件。")
        return

    out.mkdir(parents=True, exist_ok=True)
    write_json(entries, out / "videos.json")
    write_csv(entries, out / "videos.csv")
    if live_folders:
        if not (out / "favorite_folders.json").exists():
            write_folder_manifest(live_folders, out)
    else:
        write_favorite_folders(entries, out / "favorite_folders.json")
    print(f"\n[完成] 视频清单已生成到 {out}/")


if __name__ == "__main__":
    main()
