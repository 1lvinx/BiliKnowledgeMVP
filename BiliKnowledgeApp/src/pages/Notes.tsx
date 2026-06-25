import { useState } from "react";
import { BookOpen, Captions, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Video, VideoInsight, VideoSubtitle } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { MacEmptyState, MacSplitView, MacToolbarButton } from "../components/MacUI";
import { InsightPanel } from "../components/InsightPanel";
import { SubtitlePanel } from "../components/SubtitlePanel";

type InspectorTab = "insight" | "subtitle";

function isPlaceholderNoteContent(content: string | null): boolean {
  if (!content) return true;
  const normalized = content.trim();
  if (!normalized) return true;

  const placeholderSignals = [
    "> 待补充。",
    "- 待补充",
    "问题定义待补充",
    "适用场景待补充",
    "解决的问题待补充",
    "关键名词待补充",
  ];

  const hits = placeholderSignals.filter((signal) => normalized.includes(signal)).length;
  return hits >= 2;
}

interface NotesProps {
  activeVideo: Video | null;
  noteContent: string | null;
  onExtractSubtitle?: (videoId: string) => void;
  onGenerateNote?: (videoId: string) => void;
  subtitleExtracting?: boolean;
  insights?: VideoInsight[];
  subtitles?: VideoSubtitle[];
}

export function Notes({
  activeVideo,
  noteContent,
  onExtractSubtitle,
  onGenerateNote,
  subtitleExtracting = false,
  insights = [],
  subtitles = [],
}: NotesProps) {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("insight");

  const activeInsight = activeVideo
    ? insights.find((i) => i.video_id === activeVideo.id) ?? null
    : null;

  const activeSubtitle = activeVideo
    ? subtitles.find((s) => s.video_id === activeVideo.id) ?? null
    : null;

  const relatedInsights = activeVideo
    ? insights.filter((i) => i.video_id !== activeVideo.id)
    : [];

  const hasSubstantiveNote = !isPlaceholderNoteContent(noteContent);

  return (
    <MacSplitView columns="minmax(0, 1fr) 360px">
      <section className="mac-detail-pane">
        <div className="mac-note-reader custom-scrollbar">
          {activeVideo ? (
            <article>
              <div className="mac-row-meta mb-6">
                <span>{activeVideo.uploader || "-"}</span>
                <span>{activeVideo.id}</span>
                <span>{activeVideo.collected_at || activeVideo.category || "-"}</span>
              </div>
              {hasSubstantiveNote ? (
                <div className="mac-markdown">
                  <ReactMarkdown>{noteContent ?? t("notes.chooseNoteHint")}</ReactMarkdown>
                </div>
              ) : (
                <div className="mac-note-generation-state">
                  <MacEmptyState
                    detail="当前视频还没有形成可用笔记。点击下方按钮，只为这条视频生成笔记。"
                    icon={<FileText size={28} />}
                    title="暂无有效笔记内容"
                  />
                  <MacToolbarButton
                    disabled={!activeVideo}
                    icon={<FileText size={14} />}
                    label="生成笔记"
                    onClick={() => activeVideo && onGenerateNote?.(activeVideo.id)}
                    primary
                  />
                </div>
              )}
            </article>
          ) : (
            <MacEmptyState
              detail={t("notes.chooseNoteHint")}
              icon={<FileText size={28} />}
              title={t("notes.noNoteSelected")}
            />
          )}
        </div>
      </section>
      <aside className="mac-inspector custom-scrollbar">
        <div className="inspector-tabs">
          <button
            className={cn("inspector-tab", inspectorTab === "insight" && "is-active")}
            onClick={() => setInspectorTab("insight")}
            type="button"
          >
            <BookOpen size={14} />
            {t("insight.title")}
          </button>
          <button
            className={cn("inspector-tab", inspectorTab === "subtitle" && "is-active")}
            onClick={() => setInspectorTab("subtitle")}
            type="button"
          >
            <Captions size={14} />
            {t("subtitle.title")}
          </button>
        </div>
        <div className="inspector-tab-content">
          {inspectorTab === "insight" ? (
            <InsightPanel
              video={activeVideo}
              insight={activeInsight}
              relatedInsights={relatedInsights}
            />
          ) : (
            <SubtitlePanel
              video={activeVideo}
              subtitle={activeSubtitle}
              onExtract={onExtractSubtitle}
              isExtracting={subtitleExtracting}
            />
          )}
        </div>
      </aside>
    </MacSplitView>
  );
}
