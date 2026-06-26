import { Archive, BookOpen, Check, ExternalLink, FileText, Sparkles, Subtitles } from "lucide-react";
import type { Video, VideoInsight, VideoSubtitle } from "../types";
import { t } from "../i18n";
import {
  formatPubdate,
  formatVideoDuration,
  formatVideoTime,
  localizeLabel,
  priorityTone,
  statusLabel,
  statusTone,
} from "../lib/video-utils";
import { MacEmptyState, MacPanel, MacStatusPill, MacTagPill } from "./MacUI";

interface VideoInspectorProps {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  onExtractSubtitle: (videoId: string) => void;
  onGenerateInsight: (videoId: string) => void;
  onGenerateNote: (videoId: string) => void;
  updateStatus: (id: string, status: string) => void;
  subtitle?: VideoSubtitle | null;
  insight?: VideoInsight | null;
}


function getSubtitleEvidence(subtitle?: VideoSubtitle | null) {
  if (!subtitle) return { label: "缺失", tone: "neutral" as const, detail: "请先抓取字幕，或使用本地转写。" };
  if (subtitle.validation?.status === "mismatch") {
    return { label: "错配", tone: "red" as const, detail: subtitle.validation.reason || "字幕与视频不匹配，请重抓或本地转写。" };
  }
  return { label: "有效", tone: "green" as const, detail: `${subtitle.source.toUpperCase()} · ${subtitle.segments.length} 段` };
}

function getEvidenceQualityLabel(value?: string) {
  if (value === "high") return "高";
  if (value === "low") return "低";
  return "中";
}

export function VideoInspector({
  activeVideo,
  fetchNote,
  onExtractSubtitle,
  onGenerateInsight,
  onGenerateNote,
  updateStatus,
  subtitle = null,
  insight = null,
}: VideoInspectorProps) {
  if (!activeVideo) {
    return (
      <aside className="mac-inspector">
        <MacEmptyState
          detail={t("inspector.chooseVideoHint")}
          title={t("inspector.noVideoSelected")}
        />
      </aside>
    );
  }

  const hasTags = activeVideo.tags.length > 0;
  const hasCategory = Boolean(activeVideo.category);
  const hasNote = Boolean(activeVideo.note_path);
  const formattedDuration = formatVideoDuration(activeVideo.duration);
  const formattedPubdate = formatPubdate(activeVideo.pubdate);
  const collectedAt = formatVideoTime(activeVideo.collected_at);
  const bvid = activeVideo.id;
  const subtitleEvidence = getSubtitleEvidence(subtitle);
  const hasInsight = Boolean(insight);
  const evidenceQuality = insight?.evidence_quality ? getEvidenceQualityLabel(insight.evidence_quality) : "-";

  return (
    <aside className="mac-inspector custom-scrollbar">
      <div className="mac-inspector-content">
        <div>
          <h2 className="mac-inspector-title">{activeVideo.title}</h2>
          <p className="mac-inspector-meta">
            {activeVideo.uploader || t("inspector.notAvailable")}
            {activeVideo.collected_at ? ` · ${activeVideo.collected_at}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MacStatusPill tone={statusTone(activeVideo.status)}>
            {statusLabel(activeVideo.status)}
          </MacStatusPill>
          <MacTagPill tone={priorityTone(activeVideo.priority)}>{activeVideo.priority}</MacTagPill>
          {hasCategory && <MacTagPill>{localizeLabel(activeVideo.category)}</MacTagPill>}
          {activeVideo.favorite_folder && <MacTagPill>{activeVideo.favorite_folder}</MacTagPill>}
        </div>
        <div className="mac-stat-grid">
          <div className="mac-stat">
            <strong>{formattedDuration}</strong>
            <span>{t("inspector.duration")}</span>
          </div>
          <div className="mac-stat">
            <strong>{collectedAt}</strong>
            <span>{t("inspector.collectedAt")}</span>
          </div>
        </div>
        <MacPanel title="内容证据状态">
          <div className="mac-native-list">
            <div className="mac-native-row">
              <span className="mac-row-title">字幕</span>
              <span className="mac-row-meta"><MacStatusPill tone={subtitleEvidence.tone}>{subtitleEvidence.label}</MacStatusPill></span>
            </div>
            <div className="mac-native-row">
              <span className="mac-row-title">字幕说明</span>
              <span>{subtitleEvidence.detail}</span>
            </div>
            <div className="mac-native-row">
              <span className="mac-row-title">洞察</span>
              <MacStatusPill tone={hasInsight ? "green" : "neutral"}>{hasInsight ? "已生成" : "未生成"}</MacStatusPill>
            </div>
            <div className="mac-native-row">
              <span className="mac-row-title">笔记</span>
              <MacStatusPill tone={hasNote ? "green" : "neutral"}>{hasNote ? "已生成" : "未生成"}</MacStatusPill>
            </div>
            <div className="mac-native-row">
              <span className="mac-row-title">证据质量</span>
              <span>{evidenceQuality}</span>
            </div>
          </div>
        </MacPanel>
        <MacPanel title={t("inspector.importedData")}>
          <div className="mac-inspector-content">
            <p className="mac-inspector-meta">
              {t("inspector.importedDataHint")}
            </p>
            <p className="mac-inspector-meta">
              当前条目归属：{activeVideo.favorite_folder || "全部收藏夹聚合视图"}
            </p>
            <div className="mac-native-list">
              <div className="mac-native-row">
                <span className="mac-row-title">{t("inspector.bvid")}</span>
                <span>{bvid}</span>
              </div>
              <div className="mac-native-row">
                <span className="mac-row-title">{t("inspector.favoriteFolder")}</span>
                <span>{activeVideo.favorite_folder || t("inspector.notAvailable")}</span>
              </div>
              <div className="mac-native-row">
                <span className="mac-row-title">{t("inspector.uploader")}</span>
                <span>{activeVideo.uploader || t("inspector.notAvailable")}</span>
              </div>
              <div className="mac-native-row">
                <span className="mac-row-title">{t("inspector.publishedAt")}</span>
                <span>{formattedPubdate}</span>
              </div>
              <div className="mac-native-row">
                <span className="mac-row-title">{t("inspector.collectedAt")}</span>
                <span>{collectedAt || t("inspector.notAvailable")}</span>
              </div>
              <div className="mac-native-row">
                <span className="mac-row-title">{t("inspector.noteStatus")}</span>
                <span>{hasNote ? t("inspector.noteReady") : t("inspector.noteMissing")}</span>
              </div>
            </div>
          </div>
        </MacPanel>
        <MacPanel title={t("inspector.aiSummary")}>
          <div className="mac-inspector-content">
            <p className="mac-inspector-meta">
              {hasTags ? t("inspector.transcriptNote") : t("inspector.summaryPending")}
            </p>
            {!hasTags && (
              <p className="mac-inspector-meta">
                {t("inspector.tagsPending")}
              </p>
            )}
          </div>
        </MacPanel>
        <MacPanel title={t("inspector.actions")}>
          <div className="mac-native-list">
            <button
              className="mac-native-row"
              disabled={!hasNote}
              onClick={() => fetchNote(activeVideo)}
              type="button"
            >
              <span className="mac-row-title">{t("inspector.openNote")}</span>
              <BookOpen size={14} />
            </button>
            <button
              className="mac-native-row"
              onClick={() => onExtractSubtitle(activeVideo.id)}
              type="button"
            >
              <span className="mac-row-title">{t("inspector.extractSubtitle")}</span>
              <Subtitles size={14} />
            </button>
            <button
              className="mac-native-row"
              disabled={subtitleEvidence.label !== "有效"}
              onClick={() => onGenerateInsight(activeVideo.id)}
              type="button"
            >
              <span className="mac-row-title">{t("inspector.generateInsight")}</span>
              <Sparkles size={14} />
            </button>
            <button
              className="mac-native-row"
              disabled={subtitleEvidence.label !== "有效" || !hasInsight}
              onClick={() => onGenerateNote(activeVideo.id)}
              type="button"
            >
              <span className="mac-row-title">{t("inspector.generateNote")}</span>
              <FileText size={14} />
            </button>
            <button
              className="mac-native-row"
              onClick={() => updateStatus(activeVideo.id, "reviewed")}
              type="button"
            >
              <span className="mac-row-title">{t("inspector.markReviewed")}</span>
              <Check size={14} />
            </button>
            <button
              className="mac-native-row"
              onClick={() => updateStatus(activeVideo.id, "archived")}
              type="button"
            >
              <span className="mac-row-title">{t("inspector.archive")}</span>
              <Archive size={14} />
            </button>
            <a className="mac-native-row" href={activeVideo.url} rel="noreferrer" target="_blank">
              <span className="mac-row-title">{t("inspector.openInBilibili")}</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </MacPanel>
      </div>
    </aside>
  );
}
