import { Archive, BookOpen, Check, ExternalLink } from "lucide-react";
import type { Video } from "../types";
import { t } from "../i18n";
import { localizeLabel, priorityTone, statusLabel, statusTone } from "../lib/video-utils";
import { MacEmptyState, MacPanel, MacStatusPill, MacTagPill } from "./MacUI";

interface VideoInspectorProps {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  updateStatus: (id: string, status: string) => void;
}

export function VideoInspector({ activeVideo, fetchNote, updateStatus }: VideoInspectorProps) {
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

  return (
    <aside className="mac-inspector custom-scrollbar">
      <div className="mac-inspector-content">
        <div>
          <h2 className="mac-inspector-title">{activeVideo.title}</h2>
          <p className="mac-inspector-meta">{activeVideo.uploader}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MacStatusPill tone={statusTone(activeVideo.status)}>
            {statusLabel(activeVideo.status)}
          </MacStatusPill>
          <MacTagPill tone={priorityTone(activeVideo.priority)}>{activeVideo.priority}</MacTagPill>
          <MacTagPill>{localizeLabel(activeVideo.category)}</MacTagPill>
        </div>
        <div className="mac-stat-grid">
          <div className="mac-stat">
            <strong>{activeVideo.duration || "-"}</strong>
            <span>{t("inspector.duration")}</span>
          </div>
          <div className="mac-stat">
            <strong>{activeVideo.tags.length}</strong>
            <span>{t("inspector.tags")}</span>
          </div>
        </div>
        <MacPanel title={t("inspector.aiSummary")}>
          <div className="mac-inspector-content">
            <p className="mac-inspector-meta">
              {t("inspector.transcriptNote")}
            </p>
          </div>
        </MacPanel>
        <MacPanel title={t("inspector.actions")}>
          <div className="mac-native-list">
            <button className="mac-native-row" onClick={() => fetchNote(activeVideo)} type="button">
              <span className="mac-row-title">{t("inspector.openNote")}</span>
              <BookOpen size={14} />
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
