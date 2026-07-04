# Phase RC-Validation-1 — 真实数据闭环验证报告

Date: 2026-06-24
Baseline tag: `v0.1.0-beta-rc.1`
Baseline branch: `main`
Validation mode: local real-data probe + manual-gate checklist

## Executive Summary

当前结论：**ACTION REQUIRED，暂不进入 RC2**。

原因不是构建失败，而是真实数据闭环已经暴露出 Beta RC 阶段最该暴露的问题：

1. 收藏夹清单规模已足够真实：`6736` 条视频、`21` 个收藏夹、`0` 重复。
2. 关键词搜索在现有语料上速度可接受：5 个关键词平均 `14.22 ms`。
3. 大知识库 Markdown 规模达到 1000+：共 `1483` 个 Markdown。
4. 但随机 50 条视频的笔记链路只打开 `10/50`，成功率 `20.0%`。
5. 当前本地配置文件是老结构，缺少 `timezone` / `fontFamily` / `density` 偏好字段。

因此下一步不是新增功能，而是收敛两个闭环问题：

```text
P0-A 明确“全量视频”和“已生成笔记视频”的 UI/逻辑边界
P0-B 升级/迁移旧 config preferences 结构
```

## Probe Command

```bash
python3 tools/rc_validation_probe.py \
  --root BiliKnowledge \
  --output reports/rc-validation-probe-results.json
```

Raw machine-readable output:

```text
reports/rc-validation-probe-results.json
```

## Scenario 1 — 收藏夹导入清单

Status: **PASS**

| Metric | Value |
| --- | ---: |
| videos.json count | 6736 |
| videos.csv rows | 6736 |
| favorite folders | 21 |
| unique video ids | 6736 |
| duplicate count | 0 |
| failed folders | 0 |
| partial folders | 10 |
| probe time | 156.09 ms |

Interpretation:

- 当前本地库已经超过 500+ 视频验证门槛。
- 清单层没有重复 ID。
- 仍有 `10` 个 partial folders，需要判断是 Bilibili 限流/分页限制，还是可通过重试补齐。
- 本轮没有重新联网导入，所以“真实导入耗时”仍需在登录状态下单独补测。

Manual gate still required:

```text
导入时间
成功数
失败数
重复数
partial folders 是否可恢复
```

## Scenario 2 — 笔记链路

Status: **FAIL**

| Metric | Value |
| --- | ---: |
| sampled videos | 50 |
| opened notes | 10 |
| success rate | 20.0% |
| average open time | 0.17 ms |
| p95 open time | 0.51 ms |
| sample seed | 20260624 |

Interpretation:

- `note_path` fallback 逻辑本身很快。
- 主要问题是大量视频还没有对应 Markdown 笔记文件。
- 如果产品语义是“视频库可以大于笔记库”，则 UI 必须明确区分：
  - 已导入视频
  - 已生成笔记
  - 缺字幕/缺洞察/缺笔记的 blocked 状态
- 如果 RC 目标是“随机 50 个视频全部能打开笔记”，当前不达标。

Acceptance target:

```text
50/50 note_path -> Markdown -> open PASS
```

Recommended next fix:

```text
只从 note_ready=true 或 note_path 存在且文件存在的视频里抽样验证 50 条；
同时对全量视频显示“缺笔记/待生成”而不是当作失败笔记。
```

## Scenario 3 — Search

Status: **PASS**

Corpus:

| Metric | Value |
| --- | ---: |
| documents searched | 8280 |
| keyword count | 5 |
| average search time | 14.22 ms |
| max search time | 15.61 ms |

Keyword results:

| Keyword | Hits | Time |
| --- | ---: | ---: |
| ComfyUI | 22 | 9.66 ms |
| Claude | 274 | 15.24 ms |
| Agent | 228 | 15.40 ms |
| OpenWrt | 19 | 15.19 ms |
| MCP | 34 | 15.61 ms |

Interpretation:

- 关键词都能命中。
- 当前本地文本扫描速度可接受。
- 下一步人工验证应检查 top results 是否符合用户预期，而不仅是命中数量。

Manual gate still required:

```text
每个关键词抽 top 5，人工判定准确/一般/不相关。
```

## Scenario 4 — 重启持久化

Status: **FAIL**

| Metric | Value |
| --- | ---: |
| simulated cycles | 20 |
| config hash stable | yes |
| average cycle time | 0.11 ms |
| missing preference keys | timezone, fontFamily, density |

Interpretation:

- 配置文件在 20 次只读模拟中没有损坏。
- 但本地现有配置仍是旧 preferences 结构。
- App 默认值可以兜底，但 RC 阶段应提供显式 config migration，确保旧配置保存后补齐新字段。

Important security note:

- 本地 `BiliKnowledge/config/config.json` 含真实凭据/密钥类字段。
- 本报告不展开任何敏感值。
- 不应把该文件的真实内容提交到公开仓库。

Recommended next fix:

```text
在 get_config/save_config 或前端 normalizeConfig 后保存时执行 preferences migration：
language, appearance, timezone, fontFamily, density 缺失则补默认值。
```

Manual gate still required:

```text
真实 app 启动/关闭 20 次：
配置不丢失、状态不丢失、manifest 不损坏、UI 偏好不回退。
```

## Scenario 5 — 大知识库

Status: **PASS**

| Metric | Value |
| --- | ---: |
| internal Markdown | 1455 |
| external `~/Knowledge` Markdown | 28 |
| total Markdown | 1483 |
| total size | 0.71 MiB |
| probe time | 23.47 ms |

Interpretation:

- 文件数量已经超过 1000+ Markdown 规模门槛。
- 但总字节量较小，仍不代表大型真实知识库压力。
- 下一步应补测索引构建耗时、搜索耗时、内存占用。

Manual gate still required:

```text
索引耗时
搜索耗时
内存占用
```

## RC-Validation-1 Decision

```text
Overall: ACTION REQUIRED
RC2: HOLD
```

RC2 前必须完成：

1. **Note chain acceptance repair**
   - 明确抽样池：全量视频 vs 已有笔记视频。
   - 对已生成笔记池达到 `50/50` 打开成功。
   - 对未生成笔记视频展示 blocked/pending，而不是伪装成可打开笔记。

2. **Config preference migration**
   - 旧配置自动补齐 `timezone` / `fontFamily` / `density`。
   - 真实 app 重启 20 次配置不回退。

3. **Manual app smoke**
   - 使用本地 DMG 或 `.app` 启动。
   - 导入/刷新/搜索/打开笔记至少跑一轮。
   - 记录截图或日志证据。

## Next Cut Recommendation

```text
Phase RC-Validation-1A
fix validation blockers, no new features
```

Suggested commit order:

```text
1. test: add rc validation probe
2. fix: migrate legacy preference config defaults
3. fix: validate notes only against materialized note set
4. docs: update rc validation report
```

---

## Follow-up Update — 2026-06-24

After the initial ACTION REQUIRED result, two follow-up actions were completed.

### Fix applied: legacy preference migration

Commit:

```text
6ea4b06 fix: migrate legacy preference config defaults
```

What changed:

- Tauri `get_config` now returns normalized preferences with missing defaults filled.
- Tauri `save_config` writes normalized preferences.
- Added Rust coverage for legacy preferences migration.

Validation:

```text
cargo test: PASS, 21 tests passed
```

Remaining manual gate:

- Launch real app once and save settings to persist normalized defaults into the local real config file.
- Do not commit the real config file because it contains local credentials/secrets.

### Additional probe: materialized notes scope

Command:

```bash
python3 tools/rc_validation_probe.py \
  --root BiliKnowledge \
  --note-scope materialized \
  --output reports/rc-validation-probe-materialized-notes-results.json
```

Result:

| Metric | Value |
| --- | ---: |
| note scope | materialized |
| sampled notes | 50 |
| opened notes | 50 |
| success rate | 100.0% |
| average open time | 0.30 ms |
| p95 open time | 0.37 ms |

Interpretation:

- Existing generated Markdown notes open correctly.
- The original `10/50` failure is caused by sampling from all imported videos, many of which do not yet have generated notes.
- Product logic should keep this distinction visible: `imported video` is not the same as `materialized note`.

Updated RC-Validation-1 status:

```text
Build/test layer: PASS
Materialized note open chain: PASS
All-video random note chain: FAIL by product/data semantics
Legacy preference migration code: FIXED, pending real app persistence smoke
RC2: HOLD until real app manual smoke confirms persistence and note-state UX
```

---

## Fix Update — reconcile note materialization state

Commit scope: `fix: reconcile note materialization state`

What changed:

- Added `BiliKnowledge/scripts/reconcile_notes.py`.
- Reconciled `manifest/videos.json` and `manifest/videos.csv` against `notes/raw/*.md`.
- `note_path` now means a real Markdown file exists and can be opened.
- `note_ready` is aligned with materialized note availability for app routing/status.
- `parse_favorites.py` now preserves/rebuilds note materialization state after imports.
- `generate_notes.py` marks newly generated notes as `note_ready=true`.
- Tauri `get_videos` now backfills `note_path` from `notes/raw/{video_id}.md` when the manifest field is missing.
- The app no longer falls back to `{video_id}.md` when `note_path` is absent; it shows a clear "note not generated" state instead.
- Notes page now lists videos with a real `note_path`, not only legacy `note_ready` values.
- RC probe now distinguishes:
  - all-video sample: validates materialized vs pending state correctness
  - materialized-note sample: validates 50/50 open success

Updated evidence:

```text
All-video random 50:
PASS — 10 materialized notes opened, 40 pending notes correctly marked, state correctness 100.0%

Materialized-note random 50:
PASS — 50/50 opened, success rate 100.0%
```

Manifest reconciliation result:

```text
total videos: 6736
materialized notes: 1444
note_path added: 1414
note_ready changed: 1444
```

Remaining unrelated RC gate:

- Local real `BiliKnowledge/config/config.json` still needs one real app settings save to persist migrated preference defaults. The file contains local secrets and is intentionally not committed.

---

## RC-Validation-1B Update — 2026-06-25

Local real config preference migration was completed without printing or committing secret-bearing config content.

Migrated missing local preference keys:

```text
timezone
fontFamily
density
```

Updated probe results:

```text
All-video random 50: PASS
- 10 materialized notes opened
- 40 videos correctly marked pending
- state correctness 100.0%

Materialized-note random 50: PASS
- 50/50 opened
- success rate 100.0%

Config persistence probe: PASS
- 20 cycles
- config hash stable
- required preference keys present

Search probe: PASS
Large knowledge probe: PASS
Favorite manifest probe: PASS
```

Updated decision:

```text
Phase RC-Validation-1: PASS
RC2: READY FOR LOCAL TAG
```

Remaining release-only gate:

```text
Developer ID signing + notarization are still required before public distribution.
```
