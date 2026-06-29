import { t } from "../i18n";

let displayTimezone = "Asia/Singapore";

export function setDisplayTimezone(timezone: string) {
  displayTimezone = timezone || "Asia/Singapore";
}

export function getDisplayTimezone() {
  return displayTimezone;
}

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
    "status-flow": t("kb.statusFlow"),
    thoughts: t("kb.thoughts"),
  };
  return map[raw] ?? raw;
}

export function formatVideoDuration(raw: string): string {
  if (!raw) return "-";
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) return raw;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return raw;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatVideoTime(raw?: string): string {
  if (!raw) return "-";
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) {
    const normalized = value > 10_000_000_000 ? value : value * 1000;
    return new Date(normalized).toLocaleString(undefined, {
      timeZone: displayTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toLocaleString(undefined, {
      timeZone: displayTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return raw;
}

export function formatPubdate(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return raw || "-";
  }
  const normalized = value > 10_000_000_000 ? value : value * 1000;
  return new Date(normalized).toLocaleDateString(undefined, {
    timeZone: displayTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function getVideoTimestamp(video: { pubdate?: string; collected_at?: string }): number {
  const pubdateValue = Number(video.pubdate || "");
  if (Number.isFinite(pubdateValue) && pubdateValue > 0) {
    return pubdateValue > 10_000_000_000 ? pubdateValue : pubdateValue * 1000;
  }

  const collectedAt = (video.collected_at || "").trim();
  if (!collectedAt) return 0;

  const hourMatch = collectedAt.match(/^(\d+)\s*小时[前內内]?$/);
  if (hourMatch) {
    return Date.now() - Number(hourMatch[1]) * 60 * 60 * 1000;
  }

  const dayMatch = collectedAt.match(/^(\d+)\s*天[前內内]?$/);
  if (dayMatch) {
    return Date.now() - Number(dayMatch[1]) * 24 * 60 * 60 * 1000;
  }

  if (collectedAt === "昨天") {
    return Date.now() - 24 * 60 * 60 * 1000;
  }

  const monthDayMatch = collectedAt.match(/^(\d{2})-(\d{2})$/);
  if (monthDayMatch) {
    const now = new Date();
    const month = Number(monthDayMatch[1]) - 1;
    const day = Number(monthDayMatch[2]);
    const candidate = new Date(now.getFullYear(), month, day).getTime();
    return candidate > Date.now() ? new Date(now.getFullYear() - 1, month, day).getTime() : candidate;
  }

  const parsed = Date.parse(collectedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareVideosByRecency(
  a: { pubdate?: string; collected_at?: string; title?: string },
  b: { pubdate?: string; collected_at?: string; title?: string },
): number {
  const diff = getVideoTimestamp(b) - getVideoTimestamp(a);
  if (diff !== 0) return diff;
  return (a.title || "").localeCompare(b.title || "", "zh-CN");
}
