import { FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Video, Project } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { localizeLabel } from "../lib/video-utils";
import { MacEmptyState, MacPanel, MacSplitView } from "../components/MacUI";

interface NotesProps {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  noteContent: string | null;
  projects: Project[];
  videos: Video[];
}

export function Notes({
  activeVideo,
  fetchNote,
  noteContent,
  projects,
  videos,
}: NotesProps) {
  return (
    <MacSplitView columns="280px minmax(0, 1fr) 300px">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-panel-header">
          <h2>{t("view.notes")}</h2>
          <span>{videos.length}</span>
        </div>
        <div className="mac-native-list">
          {videos.map((video) => (
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
                  <span>{video.pubdate}</span>
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
              <h1>{activeVideo.title}</h1>
              <div className="mac-row-meta mb-6">
                <span>{activeVideo.uploader}</span>
                <span>{activeVideo.id}</span>
                <span>{activeVideo.category}</span>
              </div>
              <div className="mac-markdown">
                <ReactMarkdown>{noteContent ?? t("notes.chooseNoteHint")}</ReactMarkdown>
              </div>
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
        <div className="mac-inspector-content">
          <h2 className="mac-inspector-title">{t("notes.context")}</h2>
          <MacPanel title={t("notes.relatedVideo")}>
            <div className="mac-inspector-content">
              <p className="mac-inspector-meta">{activeVideo?.url ?? t("notes.noVideoSelected")}</p>
            </div>
          </MacPanel>
          <MacPanel title={t("notes.extractedProjects")} meta={t("notes.candidates", { count: projects.length })}>
            <div className="mac-native-list">
              {projects.slice(0, 4).map((project) => (
                <div className="mac-native-row" key={project.url}>
                  <div>
                    <div className="mac-row-title">{project.name}</div>
                    <div className="mac-row-meta">{project.source_note}</div>
                  </div>
                </div>
              ))}
            </div>
          </MacPanel>
          <MacPanel title={t("notes.documentStatus")}>
            <div className="mac-inspector-content">
              <div className="mac-row-meta">
                <span>{t("inspector.markdownNotes")}</span>
                <span>{t("notes.characters", { count: noteContent?.length ?? 0 })}</span>
              </div>
            </div>
          </MacPanel>
        </div>
      </aside>
    </MacSplitView>
  );
}
