#!/usr/bin/env python3
"""Generate per-video AI insights from imported favorites using the configured AI provider."""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
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


def load_config(root: Path) -> dict:
    return load_json(root / "config" / "config.json", {})


def estimate_tokens(text: str) -> int:
    """Rough local estimate used only when the model provider does not return usage."""
    source = str(text or "")
    if not source:
        return 0
    cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", source))
    non_cjk = re.sub(r"[\u4e00-\u9fff]", " ", source)
    ascii_estimate = max(0, len(non_cjk) // 4)
    return max(1, cjk_chars + ascii_estimate)


def normalize_token_usage(
    raw_usage: Optional[dict],
    prompt_text: str,
    completion_text: str,
    *,
    mode: str,
    provider: str,
    model: str,
) -> dict:
    usage = raw_usage if isinstance(raw_usage, dict) else {}
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    total_tokens = usage.get("total_tokens")
    measured = all(isinstance(value, int) for value in [prompt_tokens, completion_tokens, total_tokens])
    if not measured:
        prompt_tokens = estimate_tokens(prompt_text)
        completion_tokens = estimate_tokens(completion_text)
        total_tokens = prompt_tokens + completion_tokens
    return {
        "mode": mode,
        "provider": provider or "openai-compatible",
        "model": model,
        "estimated": not measured,
        "prompt_tokens": int(prompt_tokens or 0),
        "completion_tokens": int(completion_tokens or 0),
        "total_tokens": int(total_tokens or 0),
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "source": "api_usage" if measured else "local_estimate",
    }


def append_token_usage(root: Path, video_id: str, usage: dict) -> None:
    if not usage:
        return
    ledger_path = root / "manifest" / "token_usage.json"
    ledger = load_json(ledger_path, [])
    if not isinstance(ledger, list):
        ledger = []
    ledger.append({"video_id": video_id, **usage})
    save_json(ledger_path, ledger[-1000:])


def call_chat_completion(base_url: str, api_key: str, model: str, prompt: str, provider: str = "") -> tuple[str, dict]:
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一个中文视频知识分析助手。"
                    "请严格返回 JSON，对视频做真实、克制、可落地的分析。"
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        body = json.loads(response.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    usage = normalize_token_usage(
        body.get("usage"),
        prompt,
        content,
        mode="insight",
        provider=provider,
        model=model,
    )
    return content, usage



def build_subtitle_lookup(root: Path) -> dict:
    items = load_json(root / "manifest" / "subtitles.json", [])
    if not isinstance(items, list):
        return {}
    return {item.get("video_id"): item for item in items if isinstance(item, dict) and item.get("video_id")}


def build_comment_lookup(root: Path) -> dict:
    items = load_json(root / "manifest" / "comments.json", [])
    if not isinstance(items, list):
        return {}
    return {item.get("video_id"): item for item in items if isinstance(item, dict) and item.get("video_id")}


def build_danmaku_lookup(root: Path) -> dict:
    items = load_json(root / "manifest" / "danmaku.json", [])
    if not isinstance(items, list):
        return {}
    return {item.get("video_id"): item for item in items if isinstance(item, dict) and item.get("video_id")}


def compact_danmaku(danmaku: Optional[dict], max_hotspots: int = 6) -> list[dict]:
    if not danmaku or not isinstance(danmaku, dict):
        return []
    hotspots = danmaku.get("hotspots") or []
    if not isinstance(hotspots, list):
        return []
    return [
        {
            "minute": item.get("minute"),
            "count": item.get("count"),
            "samples": [str(sample)[:120] for sample in (item.get("samples") or [])[:3]],
        }
        for item in hotspots[:max_hotspots]
        if isinstance(item, dict)
    ]


def compact_comments(comments: Optional[dict], max_items: int = 20) -> list[dict]:
    if not comments or not isinstance(comments, dict):
        return []
    items = comments.get("comments") or []
    if not isinstance(items, list):
        return []
    ranked = sorted(
        [item for item in items if isinstance(item, dict) and str(item.get("message") or "").strip()],
        key=lambda item: (int(item.get("like") or 0), int(item.get("ctime") or 0)),
        reverse=True,
    )
    return [
        {
            "message": str(item.get("message") or "")[:300],
            "like": item.get("like") or 0,
            "ctime": item.get("ctime"),
        }
        for item in ranked[:max_items]
    ]


def compact_subtitle_text(subtitle: dict, max_chars: int = 4500) -> str:
    raw = str((subtitle or {}).get("raw_text") or "").strip()
    if not raw:
        segments = (subtitle or {}).get("segments") or []
        raw = "\n".join(str(segment.get("text", "")).strip() for segment in segments if isinstance(segment, dict))
    raw = "\n".join(line.strip() for line in raw.splitlines() if line.strip())
    return raw[:max_chars]


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


def subtitle_matches_video(video: dict, subtitle: Optional[dict]) -> bool:
    if not subtitle or not isinstance(subtitle, dict):
        return False
    validation = subtitle.get("validation") if isinstance(subtitle.get("validation"), dict) else {}
    if validation.get("status") == "mismatch":
        return False
    raw_text = compact_subtitle_text(subtitle, max_chars=1600).lower()
    if len(raw_text) < 40:
        return False
    title_keywords = extract_keywords(str(video.get("title") or ""))
    metadata_keywords = extract_keywords(" ".join([
        str(video.get("uploader") or ""),
        str(video.get("favorite_folder") or ""),
        str(video.get("category") or ""),
    ]))
    if any(kw in raw_text for kw in title_keywords):
        return True
    return len([kw for kw in metadata_keywords if kw in raw_text]) >= 2 and len(title_keywords) <= 1


def build_prompt(video: dict, source_item: dict, subtitle: Optional[dict] = None, comments: Optional[dict] = None, danmaku: Optional[dict] = None) -> str:
    return json.dumps(
        {
            "task": "从这个 Bilibili 收藏视频中抽取可复用的真实价值信息，而不是泛泛摘要。",
            "requirements": {
                "summary": "1-2句，只写视频真正提供的信息价值；不要复述标题",
                "key_points": "3-6条，必须是具体观点、方法、参数、判断或步骤，不要泛泛概括",
                "reusable_value": "2-5条，说明这条内容能被复用到哪个工作流/决策/工具链，具体怎么复用",
                "workflow_steps": "3-8条，如果视频包含操作流程，抽取为可执行步骤；没有就写信息不足",
                "evidence": "2-5条，引用字幕/标题/描述中的依据，说明为什么这样判断",
                "limitations": "1-4条，说明适用前提、风险、缺失信息或需要人工复核的点",
                "evidence_quality": "high/medium/low 之一。high=字幕证据充分且有元数据/评论辅助；medium=字幕可用但辅助材料少；low=信息少，只能保守记录",
                "action_items": "2-4条，后续值得跟进的具体动作",
                "insight_tags": "3-6个简短标签，适合本地知识库检索",
                "use_cases": "2-4条，说明在什么场景使用会提升效率或解决什么问题",
                "core_assets": "1-6个对象，列出视频中最核心的仓库、插件、Agent、Skill、工具、框架或方法",
                "category_paths": "1-3条，给这条笔记归类，如 AI开发/Agent/Codex",
                "problem_statements": "1-3条，说明视频主要解决什么痛点",
            },
            "video": {
                "bvid": video.get("id", ""),
                "title": video.get("title", ""),
                "uploader": video.get("uploader", ""),
                "favorite_folder": video.get("favorite_folder", ""),
                "category": video.get("category", ""),
                "duration": video.get("duration", ""),
                "pubdate": video.get("pubdate", ""),
                "description": source_item.get("desc", ""),
                "tags": source_item.get("tags", []),
                "subtitle_excerpt": compact_subtitle_text(subtitle or {}),
                "comment_signals": compact_comments(comments),
                "danmaku_hotspots": compact_danmaku(danmaku),
            },
            "output_schema": {
                "summary": "string",
                "key_points": ["string"],
                "action_items": ["string"],
                "insight_tags": ["string"],
                "use_cases": ["string"],
                "problem_statements": ["string"],
                "category_paths": ["string"],
                "reusable_value": ["string"],
                "workflow_steps": ["string"],
                "evidence": ["string"],
                "limitations": ["string"],
                "evidence_quality": "string",
                "core_assets": [
                    {
                        "name": "string",
                        "asset_type": "string",
                        "url": "string",
                        "role": "string",
                        "solves": "string",
                        "notes": ["string"],
                    }
                ],
            },
            "rules": [
                "不要空话，不要写'提升效率'这类泛泛描述，必须点明在哪种工作场景下、用什么方法、产出什么变化。",
                "如果只有标题和很少上下文，不要装作看过完整视频；workflow_steps/evidence/limitations 必须写明信息不足。",
                "优先从 subtitle_excerpt 中抽取事实、步骤、命令、工具名、配置项、约束和经验判断。",
                "comment_signals 只能作为受众反馈/坑点/补充线索，不能替代视频事实；评论观点必须标为评论区反馈。",
                "danmaku_hotspots 只能作为观众集中反应和关键时间点线索；不能把弹幕当成视频事实。",
                "evidence_quality 必须根据输入证据诚实评估；证据不足时写 low，并在 limitations 中说明缺口。",
                "每条 key_points/reusable_value/action_items 都必须包含一个具体名词或动作，避免'了解/学习/提升'这类空泛动词。",
                "如果 subtitle_excerpt 足够长，必须优先基于字幕内容输出具体流程、适用边界和可复用步骤，不要停留在标题摘要。",
                "如果无法从字幕中提取具体操作、配置、步骤或判断，evidence_quality 必须为 low，且不要编造可复用价值。",
                "如果视频提到 GitHub 仓库、插件、Agent、Skill、工具或框架，优先识别出来放入 core_assets。",
                "core_assets.name 必须优先使用视频中出现的真实名称、原始产品名或英文名，例如 Codex、Claude Code、Skill、Agent、Prettier、Black。",
                "不要自己发明泛化名称，例如'调试助手插件'、'自动补全插件'，除非视频里就是这么称呼它。",
                "如果无法确认具体名称，就不要输出这条 core_assets。",
                "如果视频明确提到 GitHub 仓库，必须尽力从字幕、标题、描述、评论或弹幕中识别 owner/repo，并在 core_assets.url 输出 https://github.com/owner/repo。",
                "如果只提到项目名但无法确认 owner/repo，不要编造 URL，url 填空字符串，并在 limitations 中说明仓库地址待人工确认。",
                "category_paths 要体现归属范畴，比如：AI开发/代码助手/Codex，或 知识管理/本地知识库/Bilibili。",
                "所有输出必须是中文，且严格返回 JSON。",
            ],
        },
        ensure_ascii=False,
    )


def normalize_insight(video_id: str, raw_text: str) -> dict:
    payload = json.loads(raw_text)
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    core_assets = []
    for asset in payload.get("core_assets", []):
        if not isinstance(asset, dict):
            continue
        core_assets.append(
            {
                "name": str(asset.get("name", "")).strip(),
                "asset_type": str(asset.get("asset_type", "")).strip(),
                "url": str(asset.get("url", "")).strip(),
                "role": str(asset.get("role", "")).strip(),
                "solves": str(asset.get("solves", "")).strip(),
                "notes": [str(x).strip() for x in asset.get("notes", []) if str(x).strip()],
            }
        )
    return {
        "video_id": video_id,
        "summary": str(payload.get("summary", "")).strip(),
        "key_points": [str(x).strip() for x in payload.get("key_points", []) if str(x).strip()],
        "action_items": [str(x).strip() for x in payload.get("action_items", []) if str(x).strip()],
        "insight_tags": [str(x).strip() for x in payload.get("insight_tags", []) if str(x).strip()],
        "use_cases": [str(x).strip() for x in payload.get("use_cases", []) if str(x).strip()],
        "problem_statements": [str(x).strip() for x in payload.get("problem_statements", []) if str(x).strip()],
        "category_paths": [str(x).strip() for x in payload.get("category_paths", []) if str(x).strip()],
        "reusable_value": [str(x).strip() for x in payload.get("reusable_value", []) if str(x).strip()],
        "workflow_steps": [str(x).strip() for x in payload.get("workflow_steps", []) if str(x).strip()],
        "evidence": [str(x).strip() for x in payload.get("evidence", []) if str(x).strip()],
        "limitations": [str(x).strip() for x in payload.get("limitations", []) if str(x).strip()],
        "evidence_quality": str(payload.get("evidence_quality", "medium")).strip() or "medium",
        "core_assets": [asset for asset in core_assets if asset.get("name")],
        "token_usage": {},
        "created_at": now,
        "updated_at": now,
    }


def upgrade_existing_insight(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {}
    return {
        "video_id": str(payload.get("video_id", "")).strip(),
        "summary": str(payload.get("summary", "")).strip(),
        "key_points": [str(x).strip() for x in payload.get("key_points", []) if str(x).strip()],
        "action_items": [str(x).strip() for x in payload.get("action_items", []) if str(x).strip()],
        "insight_tags": [str(x).strip() for x in payload.get("insight_tags", []) if str(x).strip()],
        "use_cases": [str(x).strip() for x in payload.get("use_cases", []) if str(x).strip()],
        "problem_statements": [str(x).strip() for x in payload.get("problem_statements", []) if str(x).strip()],
        "category_paths": [str(x).strip() for x in payload.get("category_paths", []) if str(x).strip()],
        "reusable_value": [str(x).strip() for x in payload.get("reusable_value", []) if str(x).strip()],
        "workflow_steps": [str(x).strip() for x in payload.get("workflow_steps", []) if str(x).strip()],
        "evidence": [str(x).strip() for x in payload.get("evidence", []) if str(x).strip()],
        "limitations": [str(x).strip() for x in payload.get("limitations", []) if str(x).strip()],
        "evidence_quality": str(payload.get("evidence_quality", "")).strip() or "medium",
        "core_assets": [
            {
                "name": str(asset.get("name", "")).strip(),
                "asset_type": str(asset.get("asset_type", "")).strip(),
                "url": str(asset.get("url", "")).strip(),
                "role": str(asset.get("role", "")).strip(),
                "solves": str(asset.get("solves", "")).strip(),
                "notes": [str(x).strip() for x in asset.get("notes", []) if str(x).strip()],
            }
            for asset in payload.get("core_assets", [])
            if isinstance(asset, dict) and str(asset.get("name", "")).strip()
        ],
        "token_usage": payload.get("token_usage") if isinstance(payload.get("token_usage"), dict) else {},
        "created_at": str(payload.get("created_at", "")).strip(),
        "updated_at": str(payload.get("updated_at", "")).strip(),
    }


def build_source_lookup(source_dir: Path) -> dict:
    lookup = {}
    for source_file in sorted(source_dir.glob("*.json")):
        data = load_json(source_file, [])
        if not isinstance(data, list):
            continue
        for item in data:
            bvid = item.get("bvid")
            if bvid and bvid not in lookup:
                lookup[bvid] = item
    return lookup


def main():
    parser = argparse.ArgumentParser(description="生成视频洞察")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--video-id", help="Specific BVID to analyze")
    parser.add_argument("--limit", type=int, default=30, help="Max videos to analyze")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    config = load_config(root)
    ai = config.get("ai") or {}
    api_key = (ai.get("api_key") or "").strip()
    base_url = (ai.get("base_url") or "https://api.deepseek.com").strip()
    model = (ai.get("model") or "deepseek-chat").strip()
    provider = str(ai.get("provider") or "openai-compatible").strip()

    if not api_key:
        print("[错误] 未配置 AI 密钥。")
        sys.exit(1)

    videos_path = root / "manifest" / "videos.json"
    videos = load_json(videos_path, [])
    if not isinstance(videos, list) or not videos:
        print("[错误] 未找到视频，请先导入收藏。")
        sys.exit(1)

    source_lookup = build_source_lookup(root / "manifest" / "source")
    subtitle_lookup = build_subtitle_lookup(root)
    comment_lookup = build_comment_lookup(root)
    danmaku_lookup = build_danmaku_lookup(root)
    existing_insights = load_json(root / "manifest" / "insights.json", [])
    existing_insights = [upgrade_existing_insight(item) for item in existing_insights if isinstance(item, dict)]
    existing_by_id = {
        item.get("video_id"): item for item in existing_insights if isinstance(item, dict) and item.get("video_id")
    }

    target_ids = {args.video_id} if args.video_id else None
    target_videos = [video for video in videos if not target_ids or video.get("id") in target_ids][: args.limit]

    results = [item for item in existing_insights if item.get("video_id") not in {video.get("id") for video in target_videos}]
    for video in target_videos:
        video_id = video.get("id", "")
        source_item = source_lookup.get(video_id, {})
        subtitle = subtitle_lookup.get(video_id)
        if not subtitle_matches_video(video, subtitle):
            print(f"[错误] 字幕缺失或疑似错配，已阻止生成洞察：{video_id} {video.get('title', '')}")
            if args.video_id:
                sys.exit(1)
            continue
        print(f"[视频洞察] 正在分析 {video_id} {video.get('title', '')}")
        try:
            prompt = build_prompt(video, source_item, subtitle, comment_lookup.get(video_id), danmaku_lookup.get(video_id))
            raw_text, token_usage = call_chat_completion(
                base_url=base_url,
                api_key=api_key,
                model=model,
                prompt=prompt,
                provider=provider,
            )
            insight = normalize_insight(video_id, raw_text)
            insight["token_usage"] = token_usage
            append_token_usage(root, video_id, token_usage)
            usage_label = "估算" if token_usage.get("estimated") else "实际"
            print(f"[Token] 洞察 {video_id}: {token_usage.get('total_tokens', 0)} tokens（{usage_label}）")
        except (urllib.error.URLError, KeyError, json.JSONDecodeError) as exc:
            print(f"[错误] 视频洞察生成失败 {video_id}：{exc}")
            if args.video_id:
                sys.exit(1)
            insight = existing_by_id.get(video_id) or {
                "video_id": video_id,
                "summary": "",
                "key_points": [],
                "action_items": [],
                "insight_tags": [],
                "use_cases": [],
                "problem_statements": [],
                "category_paths": [],
                "core_assets": [],
                "created_at": "",
                "updated_at": "",
            }
        results.append(insight)

    save_json(root / "manifest" / "insights.json", results)
    print(f"[已写入] {root / 'manifest' / 'insights.json'}（共 {len(results)} 条）")


if __name__ == "__main__":
    main()
