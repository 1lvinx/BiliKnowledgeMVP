#!/usr/bin/env python3
"""Generate basic Markdown notes from videos, subtitles, and insights."""

import argparse
from datetime import datetime, timezone
import json
import re
import sys
from pathlib import Path
from typing import Optional


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


def format_tags(tags: list[str]) -> str:
    if not tags:
        return "`#B站` `#视频笔记`"
    return " ".join(f"`#{tag}`" for tag in tags)


def format_bullets(items: list[str], fallback: str = "信息不足，需人工复核原视频。") -> str:
    cleaned = [str(item).strip() for item in items if str(item).strip()]
    if not cleaned:
        cleaned = [fallback]
    return "\n".join(f"- {item}" for item in cleaned)


STOPWORDS = {
    "什么", "如何", "一个", "我们", "你们", "他们", "这个", "那个", "就是", "然后", "因为",
    "可以", "视频", "教程", "分享", "实战", "方法", "使用", "入门", "完整", "最新", "真的",
}

NOISY_TERMS = {
    "top10", "top", "bug", "code", "vs", "video", "bilibili", "github", "markdown",
}


def extract_keywords(text: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z0-9.+#_-]{2,}|[\u4e00-\u9fff]{2,}", text or "")
    keywords = []
    for item in candidates:
        token = item.strip().lower()
        if len(token) < 2 or token in STOPWORDS:
            continue
        keywords.append(token)
    return keywords


def infer_named_terms(video: dict, insight: Optional[dict]) -> list[str]:
    text_parts = [
        video.get("title", ""),
        (insight or {}).get("summary", ""),
        " ".join((insight or {}).get("key_points", [])),
        " ".join((insight or {}).get("insight_tags", [])),
    ]
    text = "\n".join(part for part in text_parts if part)
    multi_word_patterns = [
        r"\bVS\s+Code\b",
        r"\bVisual\s+Studio\s+Code\b",
        r"\bClaude\s+Code\b",
        r"\bCursor\b",
        r"\bCodex\b",
        r"\bPrettier\b",
        r"\bBlack\b",
        r"\bJSDoc\b",
        r"\bReST\b",
        r"\bAST\b",
        r"\bGit\b",
        r"\bPython\b",
        r"\bJavaScript\b",
        r"\bTypeScript\b",
        r"\bSkill[s]?\b",
        r"\bAgent[s]?\b",
    ]
    candidates = []
    for pattern in multi_word_patterns:
        candidates.extend(re.findall(pattern, text, flags=re.IGNORECASE))
    candidates.extend(re.findall(r"[A-Z][A-Za-z0-9.+#_-]{2,}|[A-Za-z][A-Za-z0-9.+#_-]{3,}", text))
    seen = set()
    results = []
    for raw in candidates:
        item = raw.strip().strip(".,:;()[]{}")
        key = item.lower().replace("visual studio code", "vs code")
        if len(item) < 2 or key in seen or key in NOISY_TERMS or item.isdigit():
            continue
        seen.add(key)
        normalized = {
            "visual studio code": "VS Code",
            "vs code": "VS Code",
            "claude code": "Claude Code",
            "skills": "Skills",
            "skill": "Skill",
            "agents": "Agents",
            "agent": "Agent",
        }.get(key, item)
        if normalized.lower() in NOISY_TERMS:
            continue
        results.append(normalized)
    return results[:8]


def subtitle_matches_video(video: dict, subtitle: Optional[dict]) -> bool:
    if not subtitle or not isinstance(subtitle, dict):
        return False
    validation = subtitle.get("validation") if isinstance(subtitle.get("validation"), dict) else {}
    if validation.get("status") == "mismatch":
        return False
    raw_text = str(subtitle.get("raw_text", "")).strip()
    if not raw_text:
        return False

    title_keywords = extract_keywords(video.get("title", ""))
    meta_keywords = extract_keywords(
        " ".join(
            [
                video.get("uploader", ""),
                video.get("category", ""),
                video.get("favorite_folder", ""),
                " ".join(video.get("tags", [])),
            ]
        )
    )
    expected_keywords = list(dict.fromkeys(title_keywords + meta_keywords))
    if not expected_keywords:
        return True

    sample_text = raw_text[:1200].lower()
    overlap = [kw for kw in expected_keywords if kw in sample_text]

    # Title keywords are stronger than generic metadata keywords.
    title_overlap = [kw for kw in title_keywords if kw in sample_text]
    if title_overlap:
        return True

    # If nothing from title hits, require at least 2 metadata overlaps to avoid obvious mismatch.
    return len(overlap) >= 2


def professionalize_problem_statement(text: str) -> str:
    source = (text or "").strip()
    if not source or source == "待补充":
        return "问题定义待补充。"

    replacements = [
        ("程序员手动编写重复代码效率低，易出错。", "重复性编码负担较高，导致开发吞吐下降并增加人为失误风险。"),
        ("传统调试方式（如打印日志）费时且不直观。", "基于日志打印的排障路径可观测性不足，导致问题定位时延偏高。"),
        ("多人协作时代码风格混乱，合并冲突频发。", "协作开发中的代码规范不一致，易引发样式漂移与合并冲突。"),
        ("开发者不知道如何扩展Codex功能，导致部分任务仍需手动完成。", "能力扩展路径不清晰，导致自动化覆盖率不足与人工操作残留。"),
        ("插件选择困难，误装不兼容或低效插件反而降低效率。", "插件选型决策成本较高，且存在兼容性风险与效率折损。"),
        ("缺乏插件管理意识，插件冲突或性能下降影响开发体验。", "插件治理机制缺失，易引发依赖冲突、性能回退与环境稳定性下降。"),
        ("手动输入", "手工输入成本"),
        ("快速定位异常", "缩短异常定位路径"),
        ("代码风格混乱", "代码规范一致性不足"),
        ("易出错", "错误注入风险较高"),
        ("费时", "处理时延较高"),
        ("不直观", "可观测性不足"),
    ]

    result = source
    for old, new in replacements:
        result = result.replace(old, new)

    normalized_source = source.replace("。", "").replace("，", "")
    if "扩展Codex功能" in normalized_source or ("扩展" in normalized_source and "手动完成" in normalized_source):
        result = "能力扩展路径不清晰，导致自动化覆盖率不足与人工操作残留。"
    elif "插件选择" in normalized_source or ("误装" in normalized_source and "降低效率" in normalized_source):
        result = "插件选型决策成本较高，且存在兼容性风险与效率折损。"
    elif "插件管理" in normalized_source or ("插件冲突" in normalized_source and "性能下降" in normalized_source):
        result = "插件治理机制缺失，易引发依赖冲突、性能回退与环境稳定性下降。"

    if result == source:
        result = result.rstrip("。")
        result = re.sub(r"^解决", "", result)
        result = result.replace("不知道如何", "路径不清晰")
        result = result.replace("不会", "能力缺失")
        result = result.replace("困难", "成本较高")
        result = result.replace("冲突", "兼容性冲突")
        if not any(term in result for term in ["风险", "成本", "瓶颈", "一致性", "时延", "负担", "效率", "可观测性"]):
            result = f"{result}，属于待优化的工程效率或质量问题"
        result = result.rstrip("，")
        if not result.endswith("。"):
            result += "。"

    return result


def build_note(video: dict, insight: Optional[dict], subtitle: Optional[dict]) -> str:
    summary = (insight or {}).get("summary") or "待补充。"
    key_points = (insight or {}).get("key_points") or ["待补充"]
    tags = (insight or {}).get("insight_tags") or video.get("tags", [])
    use_cases = (insight or {}).get("use_cases") or ["信息不足，需人工复核原视频。"]
    reusable_value = (insight or {}).get("reusable_value") or []
    workflow_steps = (insight or {}).get("workflow_steps") or []
    evidence = (insight or {}).get("evidence") or []
    limitations = (insight or {}).get("limitations") or []
    problem_statements = (insight or {}).get("problem_statements") or ["待补充"]
    category_paths = (insight or {}).get("category_paths") or [video.get("category", "未分类") or "未分类"]
    core_assets = (insight or {}).get("core_assets") or []
    subtitle_text = (subtitle or {}).get("raw_text") or "暂无字幕。"
    subtitle_ok = subtitle_matches_video(video, subtitle)
    subtitle_warning = ""
    if subtitle_ok:
        subtitle_excerpt = "\n".join(subtitle_text.splitlines()[:20]).strip()
        if not subtitle_excerpt:
            subtitle_excerpt = "暂无字幕。"
    else:
        subtitle_excerpt = "字幕内容疑似与当前视频不匹配，已跳过自动引用，建议人工复核后再使用。"
        if subtitle and str(subtitle.get("raw_text", "")).strip():
            subtitle_warning = "> 注意：当前抓取到的字幕与视频标题/上下文疑似不一致，已自动降级处理。\n"

    key_points_md = "\n".join(f"- {point}" for point in key_points)
    use_cases_md = format_bullets(use_cases)
    reusable_value_md = format_bullets(reusable_value)
    workflow_steps_md = format_bullets(workflow_steps)
    evidence_md = format_bullets(evidence)
    limitations_md = format_bullets(limitations)
    problem_md = "\n".join(f"- {professionalize_problem_statement(item)}" for item in problem_statements)
    category_md = "\n".join(f"- `{item}`" for item in category_paths)
    named_assets = []
    for asset in core_assets:
        name = str(asset.get("name", "")).strip()
        if name:
            asset_type = str(asset.get("asset_type", "")).strip()
            if asset_type:
                named_assets.append(f"- `{name}` ({asset_type})")
            else:
                named_assets.append(f"- `{name}`")
    if not named_assets:
        fallback_terms = infer_named_terms(video, insight)
        named_assets = [f"- `{item}`" for item in fallback_terms]
    core_terms_md = "\n".join(named_assets) if named_assets else "- 待补充"

    return f"""## 内容概述

> {summary}

---

## 核心观点

{key_points_md}

---

## 可复用价值

{reusable_value_md}

---

## 操作流程 / 方法

{workflow_steps_md}

---

## 适用场景

{use_cases_md}

---

## 解决的问题

{problem_md}

---

## 判断依据

{evidence_md}

---

## 限制与风险

{limitations_md}

---

## 关键名词

{core_terms_md}

---

## 归类路径

{category_md}

---

## 检索标签

{format_tags(tags)}

---

## 字幕参考

{subtitle_warning}

```text
{subtitle_excerpt}
```
"""


def main():
    parser = argparse.ArgumentParser(description="生成基础笔记")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--video-id", help="Specific BVID to generate")
    parser.add_argument("--limit", type=int, default=30, help="Max videos to generate notes for")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    videos_path = root / "manifest" / "videos.json"
    videos = load_json(videos_path, [])
    insights = load_json(root / "manifest" / "insights.json", [])
    subtitles = load_json(root / "manifest" / "subtitles.json", [])
    template_path = root / "notes" / "templates" / "video_note_template.md"
    _ = template_path.exists()

    insight_by_id = {item.get("video_id"): item for item in insights if isinstance(item, dict)}
    subtitle_by_id = {item.get("video_id"): item for item in subtitles if isinstance(item, dict)}

    notes_dir = root / "notes" / "raw"
    notes_dir.mkdir(parents=True, exist_ok=True)

    target_ids = {args.video_id} if args.video_id else None
    updated_videos = []
    generated = 0
    for video in videos:
        should_generate = not target_ids or video.get("id") in target_ids
        if not should_generate or generated >= args.limit:
            updated_videos.append(video)
            continue
        subtitle = subtitle_by_id.get(video.get("id"))
        if not subtitle_matches_video(video, subtitle):
            print(f"[错误] 字幕缺失或疑似错配，已阻止生成笔记：{video.get('id', '')} {video.get('title', '')}")
            if args.video_id:
                sys.exit(1)
            updated_videos.append(video)
            continue
        note_path = notes_dir / f"{video.get('id', '')}.md"
        note_text = build_note(
            video,
            insight_by_id.get(video.get("id")),
            subtitle,
        )
        note_path.write_text(note_text, encoding="utf-8")
        next_video = dict(video)
        next_video["note_path"] = note_path.name
        next_video["note_ready"] = True
        next_video["note_generated_at"] = datetime.now(timezone.utc).isoformat()
        next_video["note_generation_mode"] = "single" if args.video_id else "batch"
        updated_videos.append(next_video)
        generated += 1
        print(f"[笔记] 已生成 {note_path.name}")

    save_json(videos_path, updated_videos)
    print(f"[已写入] {videos_path}（已更新 {len(updated_videos)} 条）")


if __name__ == "__main__":
    main()
