import type { ProcessingStatus, Video, VideoInsight, VideoSubtitle } from "../types";
import { previewProjects, previewVideos } from "../data/demo";
import { statusLabel } from "../lib/video-utils";

export type View =
  | "dashboard"
  | "favorites"
  | "videos"
  | "notes"
  | "projects"
  | "knowledge"
  | "scripts"
  | "settings"
  | "tags";

export type ViewMode = "list" | "detail";
export type AppearancePreference = "system" | "light" | "dark";
export type FontPreference = "system" | "rounded" | "serif" | "mono";
export type DensityPreference = "comfortable" | "compact";
export type VideoTaskStage = "subtitle" | "insight" | "note";
export type VideoTaskStateValue = "idle" | "running" | "blocked" | "success" | "error";

export interface VideoTaskSnapshot {
  state: VideoTaskStateValue;
  startedAt?: string;
  endedAt?: string;
  message?: string;
}

export type VideoTaskState = Record<VideoTaskStage, VideoTaskSnapshot | undefined>;

export interface ScriptItem {
  name: string;
  title: string;
  detail: string;
}

export type ScriptRunStateValue = "idle" | "running" | "success" | "error" | "blocked";

export interface ScriptRunState {
  state: ScriptRunStateValue;
  startedAt?: string;
  endedAt?: string;
  lastMessage?: string;
  lastOutput?: string;
}

export type TaskLightState = "red" | "yellow" | "green";

export interface TaskDisplay {
  light: TaskLightState;
  label: string;
  statusText: string;
  startedAt?: string;
  endedAt?: string;
  message?: string;
}

export interface BilibiliCookieValidationResult {
  valid: boolean;
  message: string;
  mid?: number | null;
  uname?: string | null;
}

export interface ToastMessage {
  id: number;
  tone: "neutral" | "success" | "error";
  text: string;
}

type Translate = (key: string, p?: Record<string, string | number>) => string;

export const PREVIEW_CONFIG_STORAGE_KEY = "biliknowledge-preview-config";

export const RUNTIME_EVIDENCE_CAPTURE_GUIDE = [
  {
    label: "Route URL",
    value: "http://localhost:1420",
  },
  {
    label: "Screenshot path",
    value: "/private/tmp/bili-pipeline-status-playwright.png",
  },
  {
    label: "Runtime evidence path",
    value: "agent-room/runtime/evidence/20260523-003116-biliknowledgemvp-runtime-verification-hard-gate-second-controlled-trial.md",
  },
  {
    label: "Report linkage",
    value: "reports/pipeline-status-ui-integration-acceptance-summary-2026-05-23.md",
  },
  {
    label: "Capture rule",
    value: "PASS requires runtime evidence + visible result; build/test PASS alone is not enough.",
  },
] as const;

export function buildPreviewPipelineStatus(): ProcessingStatus {
  return {
    last_updated: "preview mode",
    total_videos: previewVideos.length,
    pending: previewVideos.filter((video) => video.status === "pending").length,
    note_created: previewVideos.length,
    projects_extracted: previewProjects.length,
    reviewed: previewVideos.filter((video) => video.status === "reviewed").length,
    pipeline: {
      manifest_generated: true,
      notes_generated: true,
      projects_extracted: true,
      index_built: true,
      validated: false,
    },
  };
}

export function buildViewMeta(t: Translate): Record<View, { title: string; subtitle: string }> {
  return {
    dashboard: { title: t("view.overview"), subtitle: t("view.overviewSubtitle") },
    favorites: { title: t("view.favorites"), subtitle: t("view.favoritesSubtitle") },
    videos: { title: t("view.videos"), subtitle: t("view.videosSubtitle") },
    notes: { title: t("view.notes"), subtitle: t("view.notesSubtitle") },
    projects: { title: t("view.projects"), subtitle: t("view.projectsSubtitle") },
    knowledge: { title: t("view.knowledge"), subtitle: t("view.knowledgeSubtitle") },
    scripts: { title: t("sidebar.healthCheck"), subtitle: t("view.scriptsSubtitle") },
    settings: { title: t("view.settings"), subtitle: t("view.settingsSubtitle") },
    tags: { title: t("sidebar.tags"), subtitle: t("view.tagsSubtitle") },
  };
}

export function buildScriptCatalog(t: Translate): ScriptItem[] {
  return [
    {
      name: "parse_favorites.py",
      title: t("scripts.parseFavorites"),
      detail: t("scripts.parseFavoritesDesc"),
    },
    {
      name: "fetch_video_meta.py",
      title: t("scripts.fetchVideoMeta"),
      detail: t("scripts.fetchVideoMetaDesc"),
    },
    {
      name: "generate_insights.py",
      title: t("scripts.generateInsights"),
      detail: t("scripts.generateInsightsDesc"),
    },
    {
      name: "fetch_subtitles.py",
      title: t("scripts.fetchSubtitles"),
      detail: t("scripts.fetchSubtitlesDesc"),
    },
    {
      name: "transcribe_subtitles.py",
      title: t("scripts.transcribeSubtitles"),
      detail: t("scripts.transcribeSubtitlesDesc"),
    },
    {
      name: "fetch_comments.py",
      title: t("scripts.fetchComments"),
      detail: t("scripts.fetchCommentsDesc"),
    },
    {
      name: "generate_notes.py",
      title: t("scripts.generateNotes"),
      detail: t("scripts.generateNotesDesc"),
    },
    {
      name: "extract_projects.py",
      title: t("scripts.extractProjects"),
      detail: t("scripts.extractProjectsDesc"),
    },
    {
      name: "build_index.py",
      title: t("scripts.buildIndex"),
      detail: t("scripts.buildIndexDesc"),
    },
    {
      name: "validate_knowledge_base.py",
      title: t("scripts.healthCheck"),
      detail: t("scripts.healthCheckDesc"),
    },
  ];
}

export function getScriptDisplayName(scriptName: string, t: Translate) {
  const labels: Record<string, string> = {
    "parse_favorites.py": t("scripts.parseFavorites"),
    "fetch_video_meta.py": t("scripts.fetchVideoMeta"),
    "generate_insights.py": t("scripts.generateInsights"),
    "fetch_subtitles.py": t("scripts.fetchSubtitles"),
    "transcribe_subtitles.py": t("scripts.transcribeSubtitles"),
    "fetch_comments.py": t("scripts.fetchComments"),
    "generate_notes.py": t("scripts.generateNotes"),
    "extract_projects.py": t("scripts.extractProjects"),
    "build_index.py": t("scripts.buildIndex"),
    "validate_knowledge_base.py": t("scripts.healthCheck"),
  };
  return labels[scriptName] ?? t("toolbar.runSelected");
}

export function getScriptScopeLabel(scriptName: string, t: Translate) {
  const scopes: Record<string, string> = {
    "parse_favorites.py": "收藏导入与同步",
    "fetch_subtitles.py": "字幕抓取与补全",
    "generate_insights.py": "知识洞察与摘要",
    "generate_notes.py": "笔记生成",
    "extract_projects.py": "项目提取与归档",
    "build_index.py": "知识索引构建",
    "validate_knowledge_base.py": "结构校验与健康检查",
  };
  return scopes[scriptName] ?? t("scripts.scriptDetail.knowledgeValidation");
}

export function getScriptStateLabel(state: ScriptRunStateValue, t: Translate) {
  if (state === "running") return t("scripts.running");
  if (state === "success") return "完成";
  if (state === "error") return "失败";
  if (state === "blocked") return "阻塞";
  return t("status.idle");
}

export function getScriptStateTone(state: ScriptRunStateValue): "neutral" | "orange" | "green" | "red" {
  if (state === "running" || state === "blocked") return "orange";
  if (state === "success") return "green";
  if (state === "error") return "red";
  return "neutral";
}

export function buildTaskDisplay(
  label: string,
  stage: VideoTaskStage,
  snapshot: VideoTaskSnapshot | undefined,
  isComplete: boolean,
  subtitle: VideoSubtitle | null,
  insight: VideoInsight | null,
): TaskDisplay {
  if (snapshot?.state === "error") {
    return { label, light: "red", statusText: "失败", ...snapshot };
  }
  if (snapshot?.state === "blocked") {
    return { label, light: "yellow", statusText: "阻塞", ...snapshot };
  }
  if (snapshot?.state === "running") {
    return { label, light: "yellow", statusText: "进行中", ...snapshot };
  }
  if (isComplete) {
    const endedAt =
      snapshot?.endedAt
      || (stage === "subtitle" ? subtitle?.created_at : undefined)
      || (stage === "insight" ? insight?.updated_at : undefined)
      || undefined;
    return {
      label,
      light: "green",
      statusText: "完成",
      startedAt: snapshot?.startedAt,
      endedAt,
      message: snapshot?.message || "已完成",
    };
  }
  if (stage === "note" && (!subtitle || !insight)) {
    return {
      label,
      light: "yellow",
      statusText: "阻塞",
      startedAt: snapshot?.startedAt,
      endedAt: snapshot?.endedAt,
      message: `缺少${[!subtitle ? "字幕" : null, !insight ? "洞察" : null].filter(Boolean).join("、")}`,
    };
  }
  return {
    label,
    light: "red",
    statusText: "未完成",
    startedAt: snapshot?.startedAt,
    endedAt: snapshot?.endedAt,
    message: snapshot?.message || "尚未开始",
  };
}

export function previewNote(video: Video) {
  return `# ${video.title}

## Summary

This browser preview uses local sample data because Tauri backend commands are only available inside the desktop runtime.

## Review Points

- Priority: ${video.priority}
- Status: ${statusLabel(video.status)}
- Folder: ${video.favorite_folder}

## Next Action

Open the native app build to read real files, run local flows, and update review status.`;
}
