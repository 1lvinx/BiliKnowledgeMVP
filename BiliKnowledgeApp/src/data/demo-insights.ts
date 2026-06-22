import { VideoInsight } from "../types";

export const previewInsights: VideoInsight[] = [
  {
    video_id: "BV1aiKbase01",
    summary:
      "本视频演示了如何使用 Claude Code 构建从 Bilibili 收藏夹到本地知识库的完整工作流。核心流程包括：收藏夹解析、笔记生成、项目提取、健康检查。",
    key_points: [
      "Claude Code 可以作为自动化编排工具，串联多个本地流程",
      "本地受控执行机制可以保证处理过程安全",
      "Markdown 是知识库的最佳中间格式",
      "本地优先架构保护用户隐私",
    ],
    action_items: [
      "将导入收藏流程集成到定时任务",
      "为笔记模板添加 AI 摘要字段",
      "测试批量导入 100+ 视频的性能",
    ],
    insight_tags: ["automation", "workflow", "claude-code"],
    use_cases: [
      "适合把零散视频收藏整理成可复用知识库时使用",
      "适合需要批量沉淀视频信息并快速筛出高价值内容时使用",
    ],
    problem_statements: [
      "解决收藏很多视频但后续无法沉淀和复用的问题",
      "解决只收藏不整理，导致知识无法检索和行动的问题",
    ],
    category_paths: ["知识管理/本地知识库/Bilibili", "AI开发/自动化工作流"],
    core_assets: [
      {
        name: "Claude Code",
        asset_type: "代码助手",
        url: "",
        role: "负责串联本地导入、分析、生成笔记等流程",
        solves: "减少手工整理视频知识的重复劳动",
        notes: ["可用于工作流编排", "适合本地知识沉淀场景"],
      },
    ],
    created_at: "2026-05-01",
    updated_at: "2026-05-15",
  },
  {
    video_id: "BV1local02",
    summary:
      "Tauri v2 桌面应用开发实战。对比了 Electron 和 Tauri 的性能差异，展示了如何用 React + Rust 构建原生质感的 macOS 应用。",
    key_points: [
      "Tauri 应用体积比 Electron 小 10-20 倍",
      "Rust 后端提供安全的系统级访问",
      "前端可复用 React 生态",
      "IPC 通信设计影响应用架构",
    ],
    action_items: [
      "将当前应用迁移到 Tauri v2 stable",
      "优化前端 bundle size",
      "添加离线缓存支持",
    ],
    insight_tags: ["tauri", "desktop", "performance"],
    use_cases: ["适合做本地桌面工具并希望降低包体积时使用"],
    problem_statements: ["解决 Electron 包体积大、资源占用高的问题"],
    category_paths: ["桌面开发/Tauri/React"],
    core_assets: [
      {
        name: "Tauri",
        asset_type: "桌面框架",
        url: "",
        role: "用于构建轻量本地桌面应用",
        solves: "降低桌面应用体积并保留原生能力",
        notes: ["前端可复用 React", "后端可使用 Rust"],
      },
    ],
    created_at: "2026-04-27",
    updated_at: "2026-05-10",
  },
  {
    video_id: "BV1index03",
    summary:
      "本地 Markdown 知识库的轻量检索方案。介绍了基于文件系统的内容索引和模糊搜索实现。",
    key_points: [
      "文件系统遍历 + 正则匹配可满足小规模检索",
      "Tantivy 适合需要全文索引的场景",
      "Markdown frontmatter 是元数据的最佳载体",
      "搜索结果需要按相关性排序",
    ],
    action_items: [
      "为 BiliKnowledge 添加本地搜索功能",
      "评估 Tantivy 集成的可行性",
      "实现基于标签的筛选",
    ],
    insight_tags: ["search", "indexing", "markdown"],
    use_cases: ["适合本地 Markdown 知识库需要快速检索时使用"],
    problem_statements: ["解决知识库内容积累后难以搜索和定位的问题"],
    category_paths: ["知识管理/检索/Markdown"],
    core_assets: [
      {
        name: "Tantivy",
        asset_type: "搜索引擎库",
        url: "",
        role: "为本地知识库提供全文索引能力",
        solves: "提升 Markdown 知识库的全文搜索效果",
        notes: ["适合中大型本地索引", "可补足文件系统检索能力"],
      },
    ],
    created_at: "2026-04-19",
    updated_at: "2026-05-08",
  },
];
