import { t } from "../i18n";

export function statusTone(status: string): "blue" | "green" | "orange" | "red" | "neutral" {
  if (status === "pending") return "orange";
  if (status === "reviewed") return "green";
  if (status === "failed") return "red";
  if (status === "archived") return "neutral";
  return "blue";
}

export function priorityTone(priority: string): "critical" | "warm" | "cool" | "neutral" {
  if (priority === "P0") return "critical";
  if (priority === "P1") return "warm";
  if (priority === "P2") return "cool";
  return "neutral";
}

export function statusLabel(status: string) {
  if (status === "pending") return t("status.pending");
  if (status === "reviewed") return t("status.reviewed");
  if (status === "archived") return t("status.archived");
  if (status === "failed") return t("status.failed");
  return t("status.unknown");
}

export function localizeLabel(raw: string): string {
  const map: Record<string, string> = {
    candidate: t("status.pending"),
    review: t("status.needsReview"),
    useful: t("status.ready"),
    pending: t("status.pending"),
    reviewed: t("status.reviewed"),
    archived: t("status.archived"),
    failed: t("status.failed"),
    Visualization: "可视化",
    "Search Engine": "搜索工具",
    "Desktop Plugin": "桌面插件",
    "Native App": "原生应用",
    Automation: "自动化",
    "Knowledge Base": "知识库",
    Security: "安全",
    AI: "AI",
    Frontend: "前端",
    Knowledge: "知识",
    manifest: t("kb.manifest"),
    "notes/raw": t("kb.notesRaw"),
    projects: t("kb.projects"),
    reports: t("kb.reports"),
    thoughts: t("kb.thoughts"),
  };
  return map[raw] ?? raw;
}
