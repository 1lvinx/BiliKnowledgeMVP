import { VideoInsight } from "../types";

export const previewInsights: VideoInsight[] = [
  {
    video_id: "BV1aiKbase01",
    summary:
      "本视频演示了一个从视频收藏到本地知识库的示例流程。核心步骤包括：收藏解析、字幕检查、笔记生成、候选项目提取和健康检查。",
    key_points: [
      "本地受控处理可以串联多个知识整理步骤",
      "本地受控执行机制可以保证处理过程安全",
      "Markdown 是知识库的最佳中间格式",
      "本地优先架构保护用户隐私",
    ],
    action_items: [
      "将导入收藏流程保留为用户确认后执行",
      "为笔记模板添加摘要字段",
      "测试批量导入 100+ 视频的性能",
    ],
    insight_tags: ["local-first", "workflow", "demo"],
    use_cases: [
      "适合把零散视频收藏整理成可复用知识库时使用",
      "适合需要筛选少量高价值视频并沉淀信息时使用",
    ],
    problem_statements: [
      "解决收藏很多视频但后续无法沉淀和复用的问题",
      "解决只收藏不整理，导致知识无法检索和行动的问题",
    ],
    category_paths: ["知识管理/本地知识库/Bilibili", "知识管理/受控处理流程"],
    core_assets: [
      {
        name: "示例本地处理器",
        asset_type: "本地处理模块",
        url: "",
        role: "负责串联本地导入、字幕检查、洞察生成和笔记整理等步骤",
        solves: "减少手工整理视频知识的重复劳动",
        notes: ["用于演示受控处理步骤", "适合本地知识沉淀场景"],
      },
    ],
    created_at: "2026-05-01",
    updated_at: "2026-05-15",
  },
  {
    video_id: "BV1local02",
    summary:
      "本地优先桌面应用开发示例。展示了桌面壳、前端界面和本地命令之间的协作方式。",
    key_points: [
      "桌面应用需要平衡包体积、权限和本地能力",
      "后端命令应通过白名单和路径限制暴露",
      "前端负责展示状态、结果和用户确认动作",
      "前后端通信边界影响应用架构",
    ],
    action_items: [
      "梳理桌面端本地命令边界",
      "优化前端资源体积",
      "添加离线缓存支持",
    ],
    insight_tags: ["desktop", "local", "performance"],
    use_cases: ["适合设计本地优先桌面工具时使用"],
    problem_statements: ["解决桌面工具需要访问本地资源但又要控制权限边界的问题"],
    category_paths: ["桌面开发/本地优先/UI"],
    core_assets: [
      {
        name: "示例桌面应用框架",
        asset_type: "桌面应用框架",
        url: "",
        role: "用于演示桌面端本地能力边界",
        solves: "保留本地能力并控制权限暴露",
        notes: ["前端展示 UI 状态", "后端执行受控命令"],
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
      "全文索引方案适合中大型本地资料库",
      "Markdown frontmatter 是元数据的最佳载体",
      "搜索结果需要按相关性排序",
    ],
    action_items: [
      "为 BiliKnowledge 添加本地搜索功能",
      "评估全文索引方案的可行性",
      "实现基于标签的筛选",
    ],
    insight_tags: ["search", "indexing", "markdown"],
    use_cases: ["适合本地 Markdown 知识库需要快速检索时使用"],
    problem_statements: ["解决知识库内容积累后难以搜索和定位的问题"],
    category_paths: ["知识管理/检索/Markdown"],
    core_assets: [
      {
        name: "示例全文索引模块",
        asset_type: "搜索模块",
        url: "",
        role: "为本地知识库提供可选的全文索引能力",
        solves: "提升 Markdown 知识库的全文搜索效果",
        notes: ["适合中大型本地资料库", "可补足文件系统检索能力"],
      },
    ],
    created_at: "2026-04-19",
    updated_at: "2026-05-08",
  },
];
