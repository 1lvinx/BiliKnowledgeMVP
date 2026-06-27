#!/usr/bin/env python3
"""Generate basic Markdown notes from videos, subtitles, and insights."""

import argparse
from datetime import datetime, timezone
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional


GITHUB_RE = re.compile(r"https?://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")

GENERIC_PROJECT_TERMS = {
    "github", "项目", "仓库", "开源", "工具", "插件", "agent", "agents", "skill", "skills",
    "claude", "claude code", "codex", "ai", "教程", "分享", "视频", "自动化", "代码", "开发",
}


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


def make_local_token_usage(prompt_text: str, completion_text: str, *, mode: str, model: str = "local-template") -> dict:
    return normalize_token_usage(
        None,
        prompt_text,
        completion_text,
        mode=mode,
        provider="local",
        model=model,
    )


def append_token_usage(root: Path, video_id: str, usage: dict) -> None:
    if not usage:
        return
    ledger_path = root / "manifest" / "token_usage.json"
    ledger = load_json(ledger_path, [])
    if not isinstance(ledger, list):
        ledger = []
    ledger.append({"video_id": video_id, **usage})
    save_json(ledger_path, ledger[-1000:])


def build_note_token_prompt(video: dict, insight: Optional[dict], subtitle: Optional[dict]) -> str:
    insight_payload = dict(insight or {})
    insight_payload.pop("token_usage", None)
    return json.dumps(
        {
            "video": {
                "id": video.get("id", ""),
                "title": video.get("title", ""),
                "uploader": video.get("uploader", ""),
                "favorite_folder": video.get("favorite_folder", ""),
            },
            "insight": insight_payload,
            "subtitle_excerpt": str((subtitle or {}).get("raw_text") or "")[:4500],
        },
        ensure_ascii=False,
    )


def call_chat_completion(base_url: str, api_key: str, model: str, prompt: str, provider: str = "") -> tuple[str, dict]:
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {
                "role": "system",
                "content": "你是 GitHub 仓库匹配助手。只做证据充分的精确匹配，严格返回 JSON。",
            },
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        body = json.loads(response.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    usage = normalize_token_usage(
        body.get("usage"),
        prompt,
        content,
        mode="github_repo_match",
        provider=provider,
        model=model,
    )
    return content, usage



def infer_name_from_url(url: str) -> str:
    parts = url.rstrip("/").split("/")
    return f"{parts[-2]}/{parts[-1]}" if len(parts) >= 2 else url


def fetch_github_repo_metadata(url: str) -> dict:
    parts = url.rstrip("/").split("/")
    if len(parts) < 5:
        return {}
    owner, repo = parts[3], parts[4]
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    request = urllib.request.Request(
        api_url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "BiliKnowledgeLocal/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return {}
    return {
        "repo_full_name": payload.get("full_name", ""),
        "description": payload.get("description") or "",
        "homepage": payload.get("homepage") or "",
        "stars": int(payload.get("stargazers_count") or 0),
        "forks": int(payload.get("forks_count") or 0),
        "watchers": int(payload.get("subscribers_count") or payload.get("watchers_count") or 0),
        "open_issues": int(payload.get("open_issues_count") or 0),
        "language": payload.get("language") or "",
        "license": ((payload.get("license") or {}).get("spdx_id") or ""),
        "topics": payload.get("topics") or [],
        "archived": bool(payload.get("archived") or False),
        "default_branch": payload.get("default_branch") or "",
        "pushed_at": payload.get("pushed_at") or "",
        "html_url": payload.get("html_url") or url,
    }




def normalize_search_term(raw: str) -> str:
    term = re.sub(r"[`*_#>\[\]（）(){}:：，。！？!?,;；]+", " ", str(raw or ""))
    term = re.sub(r"\s+", " ", term).strip()
    return term


def collect_project_search_terms(video: dict, insight: Optional[dict], note_text: str) -> list[str]:
    terms: list[str] = []
    for asset in (insight or {}).get("core_assets", []) or []:
        if not isinstance(asset, dict):
            continue
        name = normalize_search_term(asset.get("name") or "")
        url = str(asset.get("url") or "").strip()
        asset_type = str(asset.get("asset_type") or "").lower()
        role = normalize_search_term(asset.get("role") or asset.get("solves") or "")
        if url.startswith("https://github.com/"):
            continue
        if name and name.lower() not in GENERIC_PROJECT_TERMS:
            terms.append(" ".join(x for x in [name, role] if x)[:96])
        if name and any(key in asset_type for key in ["github", "repo", "repository", "仓库", "开源"]):
            terms.append(name[:96])

    # Pick quoted/backtick terms from generated note that look like concrete repo/tool names.
    for raw in re.findall(r"`([^`]{3,80})`|《([^》]{3,80})》|([A-Za-z][A-Za-z0-9_.-]{3,40})", note_text or ""):
        candidate = normalize_search_term(next((x for x in raw if x), ""))
        if candidate and candidate.lower() not in GENERIC_PROJECT_TERMS:
            terms.append(candidate)

    title = normalize_search_term(video.get("title") or "")
    # Titles often contain the actual project name near GitHub/开源 keywords; keep a compact title query as fallback.
    if any(key.lower() in title.lower() for key in ["github", "开源", "项目", "repo", "仓库"]):
        terms.append(title[:120])

    seen = set()
    results = []
    for term in terms:
        key = term.lower()
        if key in seen or len(key) < 3:
            continue
        seen.add(key)
        results.append(term)
    return results[:8]


def search_github_repositories(query: str, limit: int = 5) -> list[dict]:
    q = f"{query} in:name,description,readme"
    api_url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode(
        {"q": q, "sort": "stars", "order": "desc", "per_page": str(limit)}
    )
    request = urllib.request.Request(
        api_url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "BiliKnowledgeLocal/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return []
    repos = []
    for item in payload.get("items", [])[:limit]:
        if not isinstance(item, dict):
            continue
        repos.append(
            {
                "full_name": item.get("full_name") or "",
                "html_url": item.get("html_url") or "",
                "description": item.get("description") or "",
                "stars": int(item.get("stargazers_count") or 0),
                "language": item.get("language") or "",
                "topics": item.get("topics") or [],
                "homepage": item.get("homepage") or "",
                "archived": bool(item.get("archived") or False),
                "pushed_at": item.get("pushed_at") or "",
            }
        )
    return repos


def build_repo_match_prompt(video: dict, insight: Optional[dict], search_terms: list[str], candidates: list[dict]) -> str:
    return json.dumps(
        {
            "task": "判断 GitHub 搜索结果中哪一个仓库最可能是视频真正提到的项目。",
            "video": {
                "bvid": video.get("id", ""),
                "title": video.get("title", ""),
                "uploader": video.get("uploader", ""),
            },
            "insight": {
                "summary": (insight or {}).get("summary", ""),
                "key_points": (insight or {}).get("key_points", [])[:6],
                "core_assets": (insight or {}).get("core_assets", [])[:8],
                "evidence": (insight or {}).get("evidence", [])[:5],
            },
            "search_terms": search_terms,
            "github_candidates": candidates[:12],
            "rules": [
                "只有当仓库名/描述/主题与视频标题、洞察中的具体项目高度一致时才选择。",
                "不要因为 stars 高就选择；不要选择通用框架、教程集合或不相关热门仓库。",
                "如果无法确定，selected_url 返回空字符串，confidence 不超过 0.5。",
                "confidence 范围 0-1；0.75 以上代表可自动加入开源候选。",
            ],
            "output_schema": {
                "selected_url": "string",
                "repo_full_name": "string",
                "confidence": 0.0,
                "reason": "string",
                "matched_terms": ["string"],
            },
        },
        ensure_ascii=False,
    )


def heuristic_rank_repo(video: dict, insight: Optional[dict], search_terms: list[str], candidates: list[dict]) -> dict:
    haystack_base = " ".join([
        str(video.get("title") or ""),
        str((insight or {}).get("summary") or ""),
        " ".join((insight or {}).get("key_points", [])[:6]),
    ]).lower()
    best = {"selected_url": "", "repo_full_name": "", "confidence": 0.0, "reason": "未找到足够明确的仓库匹配。", "matched_terms": []}
    for repo in candidates:
        full_name = str(repo.get("full_name") or "")
        repo_name = full_name.split("/")[-1].lower() if "/" in full_name else full_name.lower()
        repo_text = " ".join([full_name, str(repo.get("description") or ""), " ".join(repo.get("topics") or [])]).lower()
        matched = [term for term in search_terms if normalize_search_term(term).lower() and normalize_search_term(term).lower() in repo_text]
        score = 0.0
        if repo_name and repo_name in haystack_base:
            score += 0.45
        if full_name.lower() and full_name.lower() in haystack_base:
            score += 0.35
        score += min(0.35, 0.08 * len(matched))
        if int(repo.get("stars") or 0) >= 100:
            score += 0.05
        if repo.get("archived"):
            score -= 0.15
        score = max(0.0, min(0.95, score))
        if score > float(best["confidence"]):
            best = {
                "selected_url": repo.get("html_url") or "",
                "repo_full_name": full_name,
                "confidence": score,
                "reason": "仓库名称/描述与视频标题或洞察关键词匹配。",
                "matched_terms": matched[:5],
            }
    if float(best["confidence"]) < 0.75:
        best["selected_url"] = ""
    return best


def precise_match_github_repos(root: Path, video: dict, insight: Optional[dict], note_text: str) -> list[dict]:
    search_terms = collect_project_search_terms(video, insight, note_text)
    if not search_terms:
        return []
    candidates_by_url: dict[str, dict] = {}
    for query in search_terms[:5]:
        for repo in search_github_repositories(query, limit=5):
            url = str(repo.get("html_url") or "")
            if url and url not in candidates_by_url:
                candidates_by_url[url] = repo
    candidates = list(candidates_by_url.values())
    if not candidates:
        return []

    config = load_config(root)
    ai = config.get("ai") or {}
    api_key = str(ai.get("api_key") or "").strip()
    base_url = str(ai.get("base_url") or "https://api.deepseek.com").strip()
    model = str(ai.get("model") or "deepseek-chat").strip()
    provider = str(ai.get("provider") or "openai-compatible").strip()
    selection = {}
    if api_key:
        try:
            prompt = build_repo_match_prompt(video, insight, search_terms, candidates)
            raw, token_usage = call_chat_completion(base_url, api_key, model, prompt, provider=provider)
            append_token_usage(root, str(video.get("id") or ""), token_usage)
            usage_label = "估算" if token_usage.get("estimated") else "实际"
            print(f"[Token] GitHub 匹配 {video.get('id', '')}: {token_usage.get('total_tokens', 0)} tokens（{usage_label}）")
            selection = json.loads(raw)
        except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError):
            selection = {}
    if not selection:
        selection = heuristic_rank_repo(video, insight, search_terms, candidates)

    selected_url = str(selection.get("selected_url") or "").strip()
    confidence = float(selection.get("confidence") or 0)
    if not selected_url or confidence < 0.75:
        return []
    matched_repo = next((repo for repo in candidates if repo.get("html_url") == selected_url), {})
    metadata = fetch_github_repo_metadata(selected_url) or matched_repo
    return [
        {
            "url": metadata.get("html_url") or selected_url,
            "metadata": metadata,
            "match_confidence": round(confidence, 2),
            "match_reason": str(selection.get("reason") or "AI 精准搜索匹配。"),
            "matched_terms": selection.get("matched_terms") or search_terms[:3],
        }
    ]

def collect_github_urls(insight: Optional[dict], note_text: str) -> list[str]:
    urls = set(GITHUB_RE.findall(note_text or ""))
    for asset in (insight or {}).get("core_assets", []) or []:
        if not isinstance(asset, dict):
            continue
        url = str(asset.get("url") or "").strip()
        if GITHUB_RE.fullmatch(url):
            urls.add(url)
    return sorted(urls)


def sync_open_source_candidates(root: Path, video: dict, insight: Optional[dict], note_text: str) -> int:
    urls = collect_github_urls(insight, note_text)
    precise_matches = precise_match_github_repos(root, video, insight, note_text)
    for match in precise_matches:
        url = str(match.get("url") or "").strip()
        if url and url not in urls:
            urls.append(url)
    if not urls:
        return 0
    candidates_path = root / "projects" / "project_candidates.json"
    candidates = load_json(candidates_path, [])
    if not isinstance(candidates, list):
        candidates = []
    by_url = {str(item.get("url") or ""): item for item in candidates if isinstance(item, dict)}
    added = 0
    precise_by_url = {str(match.get("url") or ""): match for match in precise_matches}
    for url in urls:
        precise_match = precise_by_url.get(url) or {}
        metadata = precise_match.get("metadata") or fetch_github_repo_metadata(url)
        existing = by_url.get(url) or {}
        item = {
            **existing,
            "name": existing.get("name") or metadata.get("repo_full_name") or infer_name_from_url(url),
            "url": metadata.get("html_url") or url,
            "source_note": f"{video.get('id', '')}.md",
            "source_video": video.get("url", ""),
            "type": "github",
            "tech_stack": existing.get("tech_stack") or metadata.get("topics") or [],
            "description": existing.get("description") or metadata.get("description") or "",
            "mentioned_context": existing.get("mentioned_context") or str((insight or {}).get("summary") or ""),
            "reusable_value": existing.get("reusable_value") or "；".join(str(x) for x in (insight or {}).get("reusable_value", [])[:3]),
            "commercial_value": existing.get("commercial_value") or "",
            "risk": existing.get("risk") or "",
            "priority": existing.get("priority") or video.get("priority") or "P1",
            "status": existing.get("status") or "candidate",
            "need_verify": False if precise_match.get("match_confidence", 0) >= 0.85 else True,
            "match_source": existing.get("match_source") or ("ai_github_search" if precise_match else "explicit_url"),
            "match_confidence": existing.get("match_confidence") or precise_match.get("match_confidence", 1.0 if not precise_match else 0),
            "match_reason": existing.get("match_reason") or precise_match.get("match_reason", "笔记或洞察中出现明确 GitHub URL。"),
            "matched_terms": existing.get("matched_terms") or precise_match.get("matched_terms", []),
            "homepage": existing.get("homepage") or metadata.get("homepage") or "",
            "stars": existing.get("stars") or metadata.get("stars") or 0,
            "forks": existing.get("forks") or metadata.get("forks") or 0,
            "watchers": existing.get("watchers") or metadata.get("watchers") or 0,
            "open_issues": existing.get("open_issues") or metadata.get("open_issues") or 0,
            "language": existing.get("language") or metadata.get("language") or "",
            "license": existing.get("license") or metadata.get("license") or "",
            "archived": existing.get("archived") if "archived" in existing else metadata.get("archived", False),
            "default_branch": existing.get("default_branch") or metadata.get("default_branch") or "",
            "pushed_at": existing.get("pushed_at") or metadata.get("pushed_at") or "",
        }
        if url not in by_url:
            candidates.append(item)
            added += 1
        else:
            idx = candidates.index(by_url[url])
            candidates[idx] = item
        by_url[url] = item
    save_json(candidates_path, candidates)
    return added

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



def parse_loose_datetime(value: str) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    candidates = [raw, raw.replace("Z", "+00:00")]
    for candidate in candidates:
        try:
            return datetime.fromisoformat(candidate)
        except ValueError:
            pass
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    return None


def is_insight_stale(insight: Optional[dict], subtitle: Optional[dict]) -> bool:
    if not insight or not subtitle:
        return True
    insight_time = parse_loose_datetime(str(insight.get("updated_at") or insight.get("created_at") or ""))
    subtitle_time = parse_loose_datetime(str(subtitle.get("created_at") or ""))
    if not insight_time or not subtitle_time:
        return False
    if insight_time.tzinfo is not None:
        insight_time = insight_time.replace(tzinfo=None)
    if subtitle_time.tzinfo is not None:
        subtitle_time = subtitle_time.replace(tzinfo=None)
    return insight_time < subtitle_time


def insight_has_value(insight: Optional[dict]) -> bool:
    if not insight:
        return False
    quality = str(insight.get("evidence_quality") or "").lower().strip()
    if quality == "low":
        return False
    reusable = [x for x in insight.get("reusable_value", []) if str(x).strip()]
    evidence = [x for x in insight.get("evidence", []) if str(x).strip()]
    key_points = [x for x in insight.get("key_points", []) if str(x).strip()]
    low_signal = " ".join(key_points + reusable + evidence)
    if "信息不足" in low_signal or "人工复核" in low_signal:
        return False
    return len(key_points) >= 2 and len(evidence) >= 1


def format_open_source_assets(insight: Optional[dict]) -> str:
    assets = []
    for asset in (insight or {}).get("core_assets", []) or []:
        if not isinstance(asset, dict):
            continue
        name = str(asset.get("name") or "").strip()
        asset_type = str(asset.get("asset_type") or "").strip()
        url = str(asset.get("url") or "").strip()
        role = str(asset.get("role") or asset.get("solves") or "").strip()
        if not name:
            continue
        normalized_type = asset_type.lower()
        is_repo_like = bool(url.startswith("https://github.com/")) or any(kw in normalized_type for kw in ["github", "repo", "repository", "仓库", "开源项目"])
        if not is_repo_like:
            continue
        label = f"`{name}`"
        if asset_type:
            label += f"（{asset_type}）"
        if url:
            label += f"：{url}"
        else:
            label += "：仓库地址待确认"
        if role:
            label += f" — {role}"
        assets.append(f"- {label}")
    return "\n".join(assets) if assets else "- 未提取到明确开源仓库或项目地址。"

def take_items(items: list[str], limit: int) -> list[str]:
    return [str(item).strip() for item in items if str(item).strip()][:limit]


def format_numbered(items: list[str], fallback: str = "信息不足，需人工复核原视频。", limit: int = 4) -> str:
    cleaned = take_items(items, limit)
    if not cleaned:
        cleaned = [fallback]
    return "\n".join(f"{index}. {item}" for index, item in enumerate(cleaned, 1))


def build_note(video: dict, insight: Optional[dict], subtitle: Optional[dict]) -> str:
    summary = (insight or {}).get("summary") or "待补充。"
    key_points = take_items((insight or {}).get("key_points") or [], 4)
    tags = (insight or {}).get("insight_tags") or video.get("tags", [])
    use_cases = take_items((insight or {}).get("use_cases") or [], 3)
    reusable_value = take_items((insight or {}).get("reusable_value") or [], 3)
    workflow_steps = take_items((insight or {}).get("workflow_steps") or [], 5)
    evidence = take_items((insight or {}).get("evidence") or [], 3)
    limitations = take_items((insight or {}).get("limitations") or [], 3)
    evidence_quality = str((insight or {}).get("evidence_quality") or "medium").strip() or "medium"
    problem_statements = take_items((insight or {}).get("problem_statements") or [], 2)
    category_paths = take_items((insight or {}).get("category_paths") or [video.get("category", "未分类") or "未分类"], 3)
    core_assets = (insight or {}).get("core_assets") or []
    subtitle_text = (subtitle or {}).get("raw_text") or "暂无字幕。"
    subtitle_ok = subtitle_matches_video(video, subtitle)
    if subtitle_ok:
        subtitle_excerpt = "\n".join(subtitle_text.splitlines()[:8]).strip() or "暂无字幕。"
    else:
        subtitle_excerpt = "字幕内容疑似与当前视频不匹配，建议人工复核。"

    one_line_value = reusable_value[0] if reusable_value else summary
    key_points_md = format_bullets(key_points, fallback="信息不足，需人工复核原视频。")
    use_cases_md = format_bullets(use_cases, fallback="信息不足，需人工复核原视频。")
    workflow_steps_md = format_numbered(workflow_steps, limit=5)
    evidence_md = format_bullets(evidence, fallback="证据不足，需人工复核原视频。")
    limitations_md = format_bullets(limitations, fallback="限制信息不足，需人工复核。")
    evidence_quality_label = {"high": "高", "medium": "中", "low": "低"}.get(evidence_quality.lower(), evidence_quality)
    problem_md = "\n".join(f"- {professionalize_problem_statement(item)}" for item in problem_statements) or "- 待补充。"
    category_md = " / ".join(f"`{item}`" for item in category_paths) if category_paths else "`未分类`"
    open_source_assets_md = format_open_source_assets(insight)

    named_assets = []
    for asset in core_assets:
        name = str(asset.get("name", "")).strip()
        if name:
            asset_type = str(asset.get("asset_type", "")).strip()
            role = str(asset.get("role") or asset.get("solves") or "").strip()
            label = f"`{name}`"
            if asset_type:
                label += f"（{asset_type}）"
            if role:
                label += f"：{role}"
            named_assets.append(f"- {label}")
    if not named_assets:
        fallback_terms = infer_named_terms(video, insight)
        named_assets = [f"- `{item}`" for item in fallback_terms]
    core_terms_md = "\n".join(named_assets[:8]) if named_assets else "- 待补充"

    return f"""## 一句话价值

{one_line_value}

## 一手资源

{open_source_assets_md}

## 关键判断

{key_points_md}

## 怎么用

{workflow_steps_md}

## 适用场景

{use_cases_md}

## 解决的问题

{problem_md}

## 注意事项

{limitations_md}

## 来源证据

证据质量：**{evidence_quality_label}**

{evidence_md}

```text
{subtitle_excerpt}
```

## 关键名词

{core_terms_md}

## 归类 / 标签

{category_md}

{format_tags(tags)}
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
        insight = insight_by_id.get(video.get("id"))
        if is_insight_stale(insight, subtitle):
            print(f"[错误] 洞察早于当前字幕或不存在，已阻止生成笔记：{video.get('id', '')}。请先重新生成视频洞察。")
            if args.video_id:
                sys.exit(1)
            updated_videos.append(video)
            continue
        if not insight_has_value(insight):
            print(f"[错误] 洞察价值不足，已阻止生成笔记：{video.get('id', '')}。请先基于有效字幕重新生成洞察。")
            if args.video_id:
                sys.exit(1)
            updated_videos.append(video)
            continue
        note_path = notes_dir / f"{video.get('id', '')}.md"
        note_text = build_note(
            video,
            insight,
            subtitle,
        )
        note_token_usage = make_local_token_usage(
            build_note_token_prompt(video, insight, subtitle),
            note_text,
            mode="note",
        )
        note_path.write_text(note_text, encoding="utf-8")
        synced_projects = sync_open_source_candidates(root, video, insight, note_text)
        if synced_projects:
            print(f"[开源候选] 已同步 {synced_projects} 个 GitHub 项目")
        next_video = dict(video)
        next_video["note_path"] = note_path.name
        next_video["note_ready"] = True
        next_video["note_generated_at"] = datetime.now(timezone.utc).isoformat()
        next_video["note_generation_mode"] = "single" if args.video_id else "batch"
        token_usage_map = next_video.get("token_usage") if isinstance(next_video.get("token_usage"), dict) else {}
        token_usage_map["note"] = note_token_usage
        next_video["token_usage"] = token_usage_map
        next_video["note_token_usage"] = note_token_usage
        append_token_usage(root, str(video.get("id") or ""), note_token_usage)
        updated_videos.append(next_video)
        generated += 1
        print(f"[笔记] 已生成 {note_path.name}")
        print(f"[Token] 笔记 {video.get('id', '')}: {note_token_usage.get('total_tokens', 0)} tokens（估算，本地模板无 API 计费）")

    save_json(videos_path, updated_videos)
    print(f"[已写入] {videos_path}（已更新 {len(updated_videos)} 条）")


if __name__ == "__main__":
    main()
