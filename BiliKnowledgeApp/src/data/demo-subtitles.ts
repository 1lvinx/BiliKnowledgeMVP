import { VideoSubtitle } from "../types";

export const previewSubtitles: VideoSubtitle[] = [
  {
    video_id: "BV1aiKbase01",
    language: "zh",
    source: "cc",
    segments: [
      { start: 0, end: 4.2, text: "大家好，今天我们来聊聊如何用 Claude Code 构建本地知识库。" },
      { start: 4.2, end: 8.8, text: "这个工作流的核心是从 Bilibili 收藏夹开始。" },
      { start: 8.8, end: 14.5, text: "首先，我们需要解析收藏夹数据，生成本地 manifest 文件。" },
      { start: 14.5, end: 20.1, text: "然后，自动为每个视频生成 Markdown 笔记。" },
      { start: 20.1, end: 26.3, text: "接下来，从笔记中提取开源项目候选，这一步非常关键。" },
      { start: 26.3, end: 32.0, text: "最后，运行健康检查确保知识库结构完整。" },
      { start: 32.0, end: 38.5, text: "整个流程可以通过本地受控处理自动完成。" },
      { start: 38.5, end: 44.2, text: "安全性方面，我们使用受限路径机制防止目录遍历。" },
      { start: 44.2, end: 50.0, text: "执行能力也只保留在应用内置的几个本地流程中。" },
    ],
    raw_text:
      "大家好，今天我们来聊聊如何用 Claude Code 构建本地知识库。这个工作流的核心是从 Bilibili 收藏夹开始。首先，我们需要解析收藏夹数据，生成本地 manifest 文件。然后，自动为每个视频生成 Markdown 笔记。接下来，从笔记中提取开源项目候选，这一步非常关键。最后，运行健康检查确保知识库结构完整。整个流程可以通过本地受控处理自动完成。安全性方面，我们使用受限路径机制防止目录遍历。执行能力也只保留在应用内置的几个本地流程中。",
    created_at: "2026-05-01",
  },
  {
    video_id: "BV1local02",
    language: "zh",
    source: "cc",
    segments: [
      { start: 0, end: 5.1, text: "今天我们来对比 Electron 和 Tauri 两个桌面应用框架。" },
      { start: 5.1, end: 11.3, text: "Tauri 使用 Rust 作为后端，前端可以用 React 或 Vue。" },
      { start: 11.3, end: 17.8, text: "最大的优势是应用体积，Tauri 比 Electron 小 10 到 20 倍。" },
      { start: 17.8, end: 24.2, text: "内存占用也更低，因为不需要捆绑 Chromium。" },
      { start: 24.2, end: 30.5, text: "安全性方面，Tauri 的权限模型更精细。" },
      { start: 30.5, end: 36.8, text: "IPC 通信设计影响整个应用架构，需要提前规划。" },
      { start: 36.8, end: 42.0, text: "对于 macOS 原生质感，Tauri 是更好的选择。" },
    ],
    raw_text:
      "今天我们来对比 Electron 和 Tauri 两个桌面应用框架。Tauri 使用 Rust 作为后端，前端可以用 React 或 Vue。最大的优势是应用体积，Tauri 比 Electron 小 10 到 20 倍。内存占用也更低，因为不需要捆绑 Chromium。安全性方面，Tauri 的权限模型更精细。IPC 通信设计影响整个应用架构，需要提前规划。对于 macOS 原生质感，Tauri 是更好的选择。",
    created_at: "2026-04-27",
  },
  {
    video_id: "BV1index03",
    language: "zh",
    source: "ai",
    segments: [
      { start: 0, end: 6.2, text: "在本地知识库中，搜索是一个核心功能。" },
      { start: 6.2, end: 12.5, text: "对于小规模文档，文件系统遍历加正则匹配就足够了。" },
      { start: 12.5, end: 18.8, text: "但如果需要全文索引，Tantivy 是一个很好的选择。" },
      { start: 18.8, end: 25.0, text: "Markdown 的 frontmatter 是存储元数据的最佳载体。" },
      { start: 25.0, end: 31.3, text: "搜索结果需要按相关性排序，这影响用户体验。" },
      { start: 31.3, end: 37.5, text: "我们还可以基于标签进行筛选，提高查找效率。" },
    ],
    raw_text:
      "在本地知识库中，搜索是一个核心功能。对于小规模文档，文件系统遍历加正则匹配就足够了。但如果需要全文索引，Tantivy 是一个很好的选择。Markdown 的 frontmatter 是存储元数据的最佳载体。搜索结果需要按相关性排序，这影响用户体验。我们还可以基于标签进行筛选，提高查找效率。",
    created_at: "2026-04-19",
  },
];
