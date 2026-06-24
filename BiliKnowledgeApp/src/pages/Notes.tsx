import { useState } from "react";
import { BookOpen, Captions, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Video, VideoInsight, VideoSubtitle } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { formatVideoTime, localizeLabel } from "../lib/video-utils";
import { MacEmptyState, MacSplitView } from "../components/MacUI";
import { InsightPanel } from "../components/InsightPanel";
import { SubtitlePanel } from "../components/SubtitlePanel";

type InspectorTab = "insight" | "subtitle";

interface VideoTaskSnapshot {
  state: "idle" | "running" | "blocked" | "success" | "error";
}

interface VideoTaskState {
  subtitle?: VideoTaskSnapshot;
  insight?: VideoTaskSnapshot;
  note?: VideoTaskSnapshot;
}

function isPlaceholderNoteContent(content: string | null): boolean {
  if (!content) return true;
  const normalized = content.trim();
  if (!normalized) return true;

  const placeholderSignals = [
    "> 待补充。",
    "- 待补充",
    "问题定义待补充",
    "## 内容概述",
    "## 核心观点",
    "## 适用场景",
    "## 解决的问题",
    "## 关键名词",
  ];

  const hits = placeholderSignals.filter((signal) => normalized.includes(signal)).length;
  return hits >= 4;
}

interface NotesProps {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  noteContent: string | null;
  onExtractSubtitle?: (videoId: string) => void;
  subtitleExtracting?: boolean;
  videos: Video[];
  insights?: VideoInsight[];
  subtitles?: VideoSubtitle[];
  videoTaskStates?: Record<string, VideoTaskState>;
}

export function Notes({
  activeVideo,
  fetchNote,
  noteContent,
  onExtractSubtitle,
  subtitleExtracting = false,
  videos,
  insights = [],
  subtitles = [],
  videoTaskStates = {},
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

  const noteVideos = videos.filter((video) => Boolean(video.note_path));

  const hasSubstantiveNote = !isPlaceholderNoteContent(noteContent);

  function getStageTone(state?: VideoTaskSnapshot["state"]) {
    if (state === "success") return "green";
    if (state === "running" || state === "blocked") return "yellow";
    if (state === "error") return "red";
    return "neutral";
  }

  function getStageLabel(state?: VideoTaskSnapshot["state"]) {
    if (state === "success") return "完成";
    if (state === "running") return "进行中";
    if (state === "blocked") return "阻塞";
    if (state === "error") return "失败";
    return "未开始";
  }

  function renderTaskStrip(videoId: string) {
    const taskState = videoTaskStates[videoId];
    return (
      <div className="mac-row-taskstrip">
        <span className={`mac-row-taskchip tone-${getStageTone(taskState?.subtitle?.state)}`}>字幕 {getStageLabel(taskState?.subtitle?.state)}</span>
        <span className={`mac-row-taskchip tone-${getStageTone(taskState?.insight?.state)}`}>洞察 {getStageLabel(taskState?.insight?.state)}</span>
        <span className={`mac-row-taskchip tone-${getStageTone(taskState?.note?.state)}`}>笔记 {getStageLabel(taskState?.note?.state)}</span>
      </div>
    );
  }

  return (
    <MacSplitView columns="280px minmax(0, 1fr) 340px">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-panel-header">
          <h2>{t("view.notes")}</h2>
          <span>{noteVideos.length}</span>
        </div>
        <div className="mac-native-list">
          {noteVideos.length === 0 ? (
            <MacEmptyState
              detail="运行字幕提取、AI 洞察或基础笔记生成后，这里才会出现可浏览条目。"
              icon={<FileText size={24} />}
              title="暂无已生成内容"
            />
          ) : noteVideos.map((video) => (
            <button
              className={cn("mac-native-row", activeVideo?.id === video.id && "is-selected")}
              key={video.id}
              onClick={() => fetchNote(video)}
              type="button"
            >
              <div>
                <div className="mac-row-title">{video.title}</div>
                <div className="mac-row-meta">
                  <span>{localizeLabel(video.category)}</span>
                  <span>{formatVideoTime(video.collected_at || video.pubdate)}</span>
                </div>
                {renderTaskStrip(video.id)}
              </div>
            </button>
          ))}
        </div>
      </section>
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
                <MacEmptyState
                  detail="当前只有占位模板，还没有形成可用的基础笔记。请先运行 AI 洞察或重新生成基础笔记。"
                  icon={<FileText size={28} />}
                  title="暂无有效笔记内容"
                />
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
