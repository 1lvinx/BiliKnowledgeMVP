#!/usr/bin/env python3
"""Optional local ASR fallback for videos without reliable Bilibili subtitles.

Pipeline:
- yt-dlp downloads audio for one selected BVID
- ffmpeg converts to 16k mono wav
- FunASR SenseVoiceSmall transcribes with timestamps when available
- subtitle validation blocks mismatched/too-short output

This script is intentionally opt-in because ASR dependencies are heavy.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

STOPWORDS = {
    "什么", "如何", "一个", "我们", "你们", "他们", "这个", "那个", "就是", "然后", "因为",
    "可以", "视频", "教程", "分享", "实战", "方法", "使用", "入门", "完整", "最新", "真的",
}


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


def write_cookies_file(cookie_header: str, path: Path) -> bool:
    pairs = []
    for part in cookie_header.split(";"):
        if "=" not in part:
            continue
        name, value = part.strip().split("=", 1)
        if name and value:
            pairs.append((name, value))
    if not pairs:
        return False
    lines = ["# Netscape HTTP Cookie File"]
    for name, value in pairs:
        lines.append(f".bilibili.com\tTRUE\t/\tFALSE\t0\t{name}\t{value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return True


def require_command(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"缺少系统依赖：{name}")


def download_audio(bvid: str, work_dir: Path, cookie_header: str = "") -> Path:
    require_command("ffmpeg")
    out_tpl = str(work_dir / f"{bvid}.%(ext)s")
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "-f",
        "bestaudio[ext=m4a]/bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "-o",
        out_tpl,
        f"https://www.bilibili.com/video/{bvid}",
    ]
    cookie_path = work_dir / "cookies.txt"
    if cookie_header and write_cookies_file(cookie_header, cookie_path):
        cmd += ["--cookies", str(cookie_path), "--add-header", "Referer:https://www.bilibili.com"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp 下载音频失败：{result.stderr[-500:]}")
    for path in sorted(work_dir.glob(f"{bvid}.*")):
        if path.suffix.lower() in {".m4a", ".opus", ".webm", ".mp3", ".aac"}:
            return path
    raise RuntimeError("yt-dlp 未产出音频文件")


def convert_to_wav(audio_path: Path, wav_path: Path) -> None:
    cmd = ["ffmpeg", "-y", "-i", str(audio_path), "-vn", "-ac", "1", "-ar", "16000", str(wav_path)]
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0 or not wav_path.exists():
        raise RuntimeError(f"ffmpeg 转码失败：{result.stderr[-500:]}")


def transcribe_wav(wav_path: Path) -> list[dict[str, Any]]:
    try:
        from funasr import AutoModel
        from funasr.utils.postprocess_utils import rich_transcription_postprocess
    except ImportError as exc:
        raise RuntimeError(f"缺少 ASR 依赖：请安装 funasr modelscope torch torchaudio pydub yt-dlp，并确保 numpy<2；当前 Python：{sys.executable}") from exc

    print("[ASR] 加载 SenseVoiceSmall 模型；首次运行会下载到 ~/.cache/modelscope", flush=True)
    model = AutoModel(model="iic/SenseVoiceSmall")
    result = model.generate(input=str(wav_path), use_itn=True)
    segments: list[dict[str, Any]] = []
    cursor = 0.0
    for item in result or []:
        raw_text = str(item.get("text") or "").strip()
        text = rich_transcription_postprocess(raw_text).strip() if raw_text else ""
        if not text:
            continue
        timestamps = item.get("timestamp") or []
        if timestamps:
            start = float(timestamps[0][0]) / 1000.0
            end = float(timestamps[-1][1]) / 1000.0
        else:
            start = cursor
            end = cursor + max(len(text) / 5.0, 1.0)
        cursor = max(cursor, end)
        segments.append({"start": start, "end": end, "text": text})
    if not segments:
        raise RuntimeError("ASR 未产出有效文本")
    return segments


def extract_keywords(text: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z0-9.+#_-]{2,}|[\u4e00-\u9fff]{2,}", text or "")
    results: list[str] = []
    for raw in candidates:
        token = raw.strip().lower()
        if len(token) < 2 or token in STOPWORDS:
            continue
        results.append(token)
    return list(dict.fromkeys(results))


def validate_subtitle_against_video(video: dict[str, Any], raw_text: str) -> tuple[bool, str, list[str]]:
    text = raw_text.strip().lower()
    if len(text) < 40:
        return False, "ASR 文本过短，无法支撑笔记生成", []
    title_keywords = extract_keywords(str(video.get("title") or ""))
    metadata_keywords = extract_keywords(" ".join([
        str(video.get("uploader") or ""),
        str(video.get("favorite_folder") or ""),
        str(video.get("category") or ""),
        str(video.get("desc") or ""),
    ]))
    title_hits = [kw for kw in title_keywords if kw in text]
    meta_hits = [kw for kw in metadata_keywords if kw in text]
    if title_hits:
        return True, "标题关键词命中 ASR 文本", title_hits[:8]
    if len(meta_hits) >= 2 and len(title_keywords) <= 1:
        return True, "元数据关键词命中 ASR 文本", meta_hits[:8]
    return False, "ASR 文本疑似与视频不匹配", (title_keywords + metadata_keywords)[:8]


def main() -> int:
    parser = argparse.ArgumentParser(description="本地 ASR 转写字幕")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--video-id", required=True, help="Specific BVID to transcribe")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    videos = load_json(root / "manifest" / "videos.json", [])
    video = next((item for item in videos if item.get("id") == args.video_id), None)
    if not video:
        print(f"[错误] 未找到视频：{args.video_id}")
        return 1

    raw_cookie, sessdata = load_bilibili_auth(root)
    cookie_header = raw_cookie or (f"SESSDATA={sessdata}" if sessdata else "")
    try:
        with tempfile.TemporaryDirectory(prefix="bili_asr_") as tmp:
            work_dir = Path(tmp)
            print(f"[ASR] 下载音频：{args.video_id}")
            audio_path = download_audio(args.video_id, work_dir, cookie_header)
            wav_path = work_dir / f"{args.video_id}.wav"
            print("[ASR] 转换 16kHz wav")
            convert_to_wav(audio_path, wav_path)
            print("[ASR] 开始本地转写")
            segments = transcribe_wav(wav_path)
    except Exception as exc:
        print(f"[错误] ASR 转写失败：{exc}")
        return 1

    raw_text = "\n".join(segment["text"] for segment in segments)
    is_valid, reason, matched_keywords = validate_subtitle_against_video(video, raw_text)
    if not is_valid:
        print(f"[错误] ASR 校验失败：{reason}")
        return 1

    entry = {
        "video_id": args.video_id,
        "language": "zh",
        "source": "asr",
        "segments": segments,
        "raw_text": raw_text,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "validation": {
            "status": "valid",
            "reason": reason,
            "matched_keywords": matched_keywords,
        },
    }
    subtitles_path = root / "manifest" / "subtitles.json"
    subtitles = load_json(subtitles_path, [])
    subtitles = [item for item in subtitles if item.get("video_id") != args.video_id]
    subtitles.append(entry)
    save_json(subtitles_path, subtitles)
    print(f"[已写入] {subtitles_path}（ASR 字幕：{len(segments)} 段）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
