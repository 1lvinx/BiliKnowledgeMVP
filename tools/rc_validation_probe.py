#!/usr/bin/env python3
"""RC validation probe for BiliKnowledgeMVP.

This script is intentionally read-mostly. It measures the current local knowledge
base and writes a JSON result that can be pasted into reports/RC_VALIDATION_REPORT.md.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import statistics
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

DEFAULT_KEYWORDS = ["ComfyUI", "Claude", "Agent", "OpenWrt", "MCP"]


@dataclass
class CheckResult:
    name: str
    status: str
    summary: str
    metrics: dict[str, Any]
    issues: list[str]


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def resolve_note_path(root: Path, video: dict[str, Any]) -> Path:
    raw = str(video.get("note_path") or "").strip()
    if raw:
        candidate = Path(raw)
        if candidate.is_absolute():
            return candidate
        if candidate.parts and candidate.parts[0] == root.name:
            return Path(*candidate.parts)
        return root / candidate
    video_id = str(video.get("id") or "").strip()
    return root / "notes" / "raw" / f"{video_id}.md"


def check_import_manifest(root: Path) -> CheckResult:
    started = time.perf_counter()
    videos_json = root / "manifest" / "videos.json"
    videos_csv = root / "manifest" / "videos.csv"
    folders_json = root / "manifest" / "favorite_folders.json"
    videos = load_json(videos_json, [])
    folders = load_json(folders_json, [])
    issues: list[str] = []
    csv_rows = 0
    if videos_csv.exists():
        with videos_csv.open("r", encoding="utf-8-sig", newline="") as f:
            csv_rows = sum(1 for _ in csv.DictReader(f))
    else:
        issues.append("manifest/videos.csv missing")
    ids = [str(item.get("id") or "") for item in videos if isinstance(item, dict)]
    unique_ids = set(ids)
    duplicate_count = max(0, len(ids) - len(unique_ids))
    failed_folders = [f for f in folders if isinstance(f, dict) and f.get("sync_status") == "failed"]
    partial_folders = [f for f in folders if isinstance(f, dict) and f.get("sync_status") == "partial"]
    if not videos:
        issues.append("manifest/videos.json is empty or missing")
    if csv_rows and len(videos) != csv_rows:
        issues.append(f"videos.json count ({len(videos)}) != videos.csv rows ({csv_rows})")
    duration_ms = (time.perf_counter() - started) * 1000
    status = "PASS" if not issues else "WARN"
    return CheckResult(
        name="收藏夹导入清单",
        status=status,
        summary=f"检测到 {len(videos)} 条视频、{len(folders)} 个收藏夹、重复 {duplicate_count} 条。",
        metrics={
            "videos_json_count": len(videos),
            "videos_csv_rows": csv_rows,
            "favorite_folder_count": len(folders),
            "unique_video_ids": len(unique_ids),
            "duplicate_count": duplicate_count,
            "failed_folder_count": len(failed_folders),
            "partial_folder_count": len(partial_folders),
            "probe_ms": round(duration_ms, 2),
        },
        issues=issues,
    )


def check_note_path(root: Path, sample_size: int, seed: int) -> CheckResult:
    videos = [v for v in load_json(root / "manifest" / "videos.json", []) if isinstance(v, dict)]
    rng = random.Random(seed)
    sample = rng.sample(videos, min(sample_size, len(videos))) if videos else []
    issues: list[str] = []
    opened = 0
    bytes_read = 0
    timings: list[float] = []
    missing_examples: list[str] = []
    for video in sample:
        started = time.perf_counter()
        note_path = resolve_note_path(root, video)
        try:
            text = note_path.read_text(encoding="utf-8")
            if text.strip():
                opened += 1
                bytes_read += len(text.encode("utf-8"))
            else:
                issues.append(f"empty note: {video.get('id')} -> {note_path}")
        except Exception as exc:  # noqa: BLE001 - report probe errors verbatim
            missing_examples.append(f"{video.get('id')} -> {note_path}: {exc}")
        timings.append((time.perf_counter() - started) * 1000)
    if missing_examples:
        issues.extend(missing_examples[:10])
    success_rate = (opened / len(sample) * 100) if sample else 0.0
    status = "PASS" if sample and opened == len(sample) else "FAIL"
    return CheckResult(
        name="笔记链路 note_path 打开",
        status=status,
        summary=f"抽样 {len(sample)} 条，成功打开 {opened}/{len(sample)}，成功率 {success_rate:.1f}%。",
        metrics={
            "sample_size": len(sample),
            "opened": opened,
            "success_rate_percent": round(success_rate, 2),
            "bytes_read": bytes_read,
            "avg_open_ms": round(statistics.mean(timings), 2) if timings else 0,
            "p95_open_ms": round(statistics.quantiles(timings, n=20)[18], 2) if len(timings) >= 20 else (round(max(timings), 2) if timings else 0),
            "seed": seed,
        },
        issues=issues,
    )


def collect_search_docs(root: Path, external_knowledge: Path | None) -> list[tuple[str, str]]:
    docs: list[tuple[str, str]] = []
    videos = load_json(root / "manifest" / "videos.json", [])
    for item in videos if isinstance(videos, list) else []:
        if isinstance(item, dict):
            haystack = " ".join(str(item.get(k) or "") for k in ["id", "title", "uploader", "category", "favorite_folder", "tags", "description"])
            docs.append((f"video:{item.get('id')}", haystack))
    insights = load_json(root / "manifest" / "insights.json", [])
    for item in insights if isinstance(insights, list) else []:
        if isinstance(item, dict):
            docs.append((f"insight:{item.get('video_id')}", json.dumps(item, ensure_ascii=False)))
    for md in sorted((root / "notes").rglob("*.md")):
        try:
            docs.append((str(md), md.read_text(encoding="utf-8", errors="ignore")))
        except Exception:
            pass
    if external_knowledge and external_knowledge.exists():
        for md in sorted(external_knowledge.rglob("*.md")):
            try:
                docs.append((str(md), md.read_text(encoding="utf-8", errors="ignore")))
            except Exception:
                pass
    return docs


def check_search(root: Path, keywords: list[str], external_knowledge: Path | None) -> CheckResult:
    started_collect = time.perf_counter()
    docs = collect_search_docs(root, external_knowledge)
    collect_ms = (time.perf_counter() - started_collect) * 1000
    issues: list[str] = []
    results: dict[str, Any] = {}
    timings: list[float] = []
    for keyword in keywords:
        started = time.perf_counter()
        needle = keyword.casefold()
        hits = []
        for doc_id, text in docs:
            count = text.casefold().count(needle)
            if count:
                hits.append({"doc": doc_id, "count": count})
        hits.sort(key=lambda item: item["count"], reverse=True)
        elapsed = (time.perf_counter() - started) * 1000
        timings.append(elapsed)
        results[keyword] = {
            "hit_count": len(hits),
            "elapsed_ms": round(elapsed, 2),
            "top_hits": hits[:5],
        }
        if len(hits) == 0:
            issues.append(f"keyword has no hits: {keyword}")
    status = "PASS" if not issues else "WARN"
    return CheckResult(
        name="关键词搜索探测",
        status=status,
        summary=f"搜索 {len(keywords)} 个关键词，语料 {len(docs)} 篇，平均 {statistics.mean(timings):.2f} ms。",
        metrics={
            "keyword_count": len(keywords),
            "document_count": len(docs),
            "collect_ms": round(collect_ms, 2),
            "avg_search_ms": round(statistics.mean(timings), 2) if timings else 0,
            "max_search_ms": round(max(timings), 2) if timings else 0,
            "results": results,
        },
        issues=issues,
    )


def check_persistence(root: Path, cycles: int) -> CheckResult:
    config_path = root / "config" / "config.json"
    issues: list[str] = []
    timings: list[float] = []
    before = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    before_hash = sha256_text(before)
    parsed = None
    for idx in range(cycles):
        started = time.perf_counter()
        try:
            parsed = json.loads(config_path.read_text(encoding="utf-8"))
            serialized = json.dumps(parsed, ensure_ascii=False, sort_keys=True)
            json.loads(serialized)
        except Exception as exc:  # noqa: BLE001
            issues.append(f"cycle {idx + 1}: {exc}")
        timings.append((time.perf_counter() - started) * 1000)
    after = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    after_hash = sha256_text(after)
    if before_hash != after_hash:
        issues.append("config file changed during read-only persistence probe")
    preferences = parsed.get("preferences", {}) if isinstance(parsed, dict) else {}
    required_pref_keys = ["language", "appearance", "timezone", "fontFamily", "density"]
    missing_pref_keys = [key for key in required_pref_keys if key not in preferences]
    if missing_pref_keys:
        issues.append(f"missing preference keys: {', '.join(missing_pref_keys)}")
    status = "PASS" if not issues else "FAIL"
    return CheckResult(
        name="重启持久化配置探测",
        status=status,
        summary=f"模拟配置读写校验 {cycles} 次，文件哈希保持{'一致' if before_hash == after_hash else '变化'}。",
        metrics={
            "cycles": cycles,
            "config_path": str(config_path),
            "before_sha256": before_hash,
            "after_sha256": after_hash,
            "avg_cycle_ms": round(statistics.mean(timings), 2) if timings else 0,
            "preferences": preferences,
        },
        issues=issues,
    )


def check_large_knowledge(root: Path, external_knowledge: Path | None) -> CheckResult:
    started = time.perf_counter()
    internal_md = list(root.rglob("*.md"))
    external_md = list(external_knowledge.rglob("*.md")) if external_knowledge and external_knowledge.exists() else []
    total_bytes = 0
    for path in internal_md + external_md:
        try:
            total_bytes += path.stat().st_size
        except OSError:
            pass
    elapsed_ms = (time.perf_counter() - started) * 1000
    total_md = len(internal_md) + len(external_md)
    issues: list[str] = []
    if total_md < 1000:
        issues.append(f"markdown corpus below target 1000+: {total_md}")
    status = "PASS" if total_md >= 1000 else "WARN"
    return CheckResult(
        name="大知识库规模探测",
        status=status,
        summary=f"检测到 Markdown {total_md} 个，约 {total_bytes / 1024 / 1024:.2f} MiB。",
        metrics={
            "internal_markdown_count": len(internal_md),
            "external_knowledge_path": str(external_knowledge) if external_knowledge else "",
            "external_markdown_count": len(external_md),
            "total_markdown_count": total_md,
            "total_bytes": total_bytes,
            "probe_ms": round(elapsed_ms, 2),
        },
        issues=issues,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="BiliKnowledge", help="BiliKnowledge root directory")
    parser.add_argument("--external-knowledge", default=str(Path.home() / "Knowledge"), help="Optional external Markdown knowledge root")
    parser.add_argument("--sample-size", type=int, default=50)
    parser.add_argument("--seed", type=int, default=20260624)
    parser.add_argument("--cycles", type=int, default=20)
    parser.add_argument("--keywords", nargs="*", default=DEFAULT_KEYWORDS)
    parser.add_argument("--output", default="reports/rc-validation-probe-results.json")
    args = parser.parse_args()

    root = Path(args.root)
    external = Path(args.external_knowledge).expanduser() if args.external_knowledge else None
    started = time.perf_counter()
    checks = [
        check_import_manifest(root),
        check_note_path(root, args.sample_size, args.seed),
        check_search(root, args.keywords, external),
        check_persistence(root, args.cycles),
        check_large_knowledge(root, external),
    ]
    payload = {
        "probe": "Phase RC-Validation-1",
        "root": str(root.resolve()),
        "external_knowledge": str(external.resolve()) if external and external.exists() else str(external) if external else "",
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "checks": [asdict(check) for check in checks],
        "overall_status": "PASS" if all(check.status == "PASS" for check in checks) else "ACTION_REQUIRED",
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["overall_status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
