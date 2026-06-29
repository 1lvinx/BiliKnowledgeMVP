import { Copy, Download, Edit3, FileText, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Video } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { formatVideoTime, localizeLabel } from "../lib/video-utils";
import { MacEmptyState, MacSplitView, MacToolbarButton } from "../components/MacUI";

function compactNoteForReading(content: string | null): string | null {
  if (!content) return content;

  const sections = content.split(/\n(?=##\s+)/);
  if (sections.length <= 1) return content;

  const lowSignalPattern = /信息不足|待补充|人工复核原视频|暂无足够信息/;
  const compacted = sections.filter((section, index) => {
    if (index === 0) return true;
    const lines = section
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const bodyLines = lines.filter((line) => !line.startsWith("##") && !line.startsWith("---"));
    if (bodyLines.length === 0) return false;
    return !bodyLines.every((line) => lowSignalPattern.test(line));
  });

  return compacted.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

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
  fetchNote: (video: Video) => void;
  noteContent: string | null;
  onGenerateNote?: (videoId: string) => void;
  onSaveNote?: (video: Video, content: string) => Promise<void>;
  onExportNote?: (video: Video) => Promise<void>;
  videos: Video[];
}

export function Notes({
  activeVideo,
  fetchNote,
  noteContent,
  onGenerateNote,
  onSaveNote,
  onExportNote,
  videos,
}: NotesProps) {
  const noteVideos = videos.filter((video) => Boolean(video.note_ready && video.note_path && video.note_generation_mode === "single"));
  const hasSubstantiveNote = !isPlaceholderNoteContent(noteContent);
  const readingContent = compactNoteForReading(noteContent);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(noteContent ?? "");

  useEffect(() => {
    setDraftContent(noteContent ?? "");
    setIsEditing(false);
  }, [activeVideo?.id, noteContent]);

  async function copyCurrentNote() {
    const text = isEditing ? draftContent : (readingContent ?? noteContent ?? "");
    if (!text.trim()) return;
    await navigator.clipboard?.writeText(text);
  }

  async function saveCurrentNote() {
    if (!activeVideo || !onSaveNote) return;
    await onSaveNote(activeVideo, draftContent);
    setIsEditing(false);
  }

  return (
    <MacSplitView columns="300px minmax(0, 1fr)">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-panel-header">
          <h2>{t("view.notes")}</h2>
          <span>{noteVideos.length}</span>
        </div>
        <div className="mac-native-list">
          {noteVideos.length === 0 ? (
            <MacEmptyState
              detail="为某条视频生成真实 Markdown 笔记后，这里会出现可浏览条目。"
              icon={<FileText size={24} />}
              title="暂无真实笔记"
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
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="mac-detail-pane">
        <div className="mac-note-reader custom-scrollbar">
          {activeVideo ? (
            <article>
              <div className="note-reader-toolbar">
                <div className="mac-row-meta">
                  <span>{activeVideo.uploader || "-"}</span>
                  <span>{activeVideo.id}</span>
                  <span>{activeVideo.collected_at || activeVideo.category || "-"}</span>
                </div>
                {hasSubstantiveNote && (
                  <div className="note-reader-actions">
                    <MacToolbarButton icon={<Copy size={14} />} label="复制" onClick={() => void copyCurrentNote()} />
                    {isEditing ? (
                      <>
                        <MacToolbarButton icon={<Save size={14} />} label="保存" onClick={() => void saveCurrentNote()} primary />
                        <MacToolbarButton icon={<X size={14} />} label="取消" onClick={() => { setDraftContent(noteContent ?? ""); setIsEditing(false); }} />
                      </>
                    ) : (
                      <MacToolbarButton icon={<Edit3 size={14} />} label="编辑" onClick={() => setIsEditing(true)} />
                    )}
                    <MacToolbarButton icon={<Download size={14} />} label="导出 MD" onClick={() => activeVideo && void onExportNote?.(activeVideo)} />
                  </div>
                )}
              </div>
              {hasSubstantiveNote ? (
                isEditing ? (
                  <textarea
                    className="note-editor-textarea custom-scrollbar"
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    spellCheck={false}
                  />
                ) : (
                  <div className="mac-markdown">
                    <ReactMarkdown>{readingContent ?? t("notes.chooseNoteHint")}</ReactMarkdown>
                  </div>
                )
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
    </MacSplitView>
  );
}
