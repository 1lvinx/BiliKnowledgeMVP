# 用Claude Code搭建个人AI工作流全攻略

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 视频标题 | 用Claude Code搭建个人AI工作流全攻略 |
| 视频链接 | https://www.bilibili.com/video/BV1xK4y1E7pR |
| BV号 | BV1xK4y1E7pR |
| UP主 | AI效率派 |
| 收藏夹 | AI工具 |
| 分类 | AI工具 |
| 处理日期 | 2026-05-06 |
| 处理状态 | 已完成 |

---

## 2. 一句话结论

> Claude Code + MCP + Agent 工作流是目前最轻量的本地AI生产力系统搭建方案，适合一人公司和独立开发者。

---

## 3. 核心内容摘要

### 3.1 主要观点

- Claude Code 可以通过 MCP 协议连接本地工具（文件系统、数据库、API）
- Agent 工作流的核心是「意图 → 规划 → 执行 → 验证」循环
- 本地优先：不需要云服务，数据不出本机

### 3.2 关键步骤 / 方法

1. 安装 Claude Code CLI
2. 配置 MCP Server（文件系统、GitHub、数据库）
3. 编写 CLAUDE.md 项目指引
4. 用 Agent 模式串联多步骤任务

### 3.3 重要概念

| 概念 | 解释 | 价值 |
|---|---|---|
| MCP | Model Context Protocol，连接LLM与外部工具的标准协议 | 可复用 |
| Agent Loop | 意图识别→规划→执行→验证的自动化循环 | 核心方法论 |
| CLAUDE.md | 项目级AI指引文件，定义代码风格和约束 | 实用 |

---

## 4. 视频中提到的开源项目 / 工具 / 框架

| 名称 | 链接 | 类型 | 用途 | 是否值得深入 |
|---|---|---|---|---|
| Claude Code | https://github.com/anthropics/claude-code | CLI工具 | AI编程助手 | 是 |
| FastMCP | https://github.com/jlowin/fastmcp | Python库 | 快速构建MCP Server | 是 |

---

## 5. 可执行信息

### 5.1 命令

```bash
npm install -g @anthropic-ai/claude-code
claude mcp add filesystem /path/to/project
```

---

## 6. 我的想法

### 6.1 可以复用的点

- CLAUDE.md 模板可以直接用于我的项目

### 6.2 可以做成产品/服务的点

- 「AI工作流搭建服务」：帮中小企业搭建本地AI工作流

### 6.3 后续行动

| 行动 | 优先级 | 备注 |
|---|---|---|
| 整理CLAUDE.md模板库 | P0 | 可直接复用 |

---

## 7. 风险与不确定项

| 项目 | 风险 | 是否需验证 |
|---|---|---|
| MCP协议稳定性 | 协议仍在演进中 | 是 |

---

## 8. 标签

`#B站` `#视频笔记` `#AI` `#Claude` `#MCP` `#工作流`
