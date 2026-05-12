import { Search } from "lucide-react";
import type { Video } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { statusLabel, statusTone } from "../lib/video-utils";
import { VideoInspector } from "../components/VideoInspector";
import { MacEmptyState, MacSplitView, MacStatusPill } from "../components/MacUI";

interface VideosProps {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  filterPriority: string;
  filterStatus: string;
  setFilterPriority: (value: string) => void;
  setFilterStatus: (value: string) => void;
  title: string;
  updateStatus: (id: string, status: string) => void;
  videos: Video[];
}

export function Videos({
  activeVideo,
  fetchNote,
  filterPriority,
  filterStatus,
  setFilterPriority,
  setFilterStatus,
  title,
  updateStatus,
  videos,
}: VideosProps) {
  return (
    <MacSplitView columns="minmax(430px, 1fr) 320px">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-panel-header">
          <h2>{title}</h2>
          <div className="flex gap-2">
            <select
              className="mac-select"
              onChange={(event) => setFilterPriority(event.target.value)}
              value={filterPriority}
            >
              <option value="all">{t("video.allPriorities")}</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
            <select
              className="mac-select"
              onChange={(event) => setFilterStatus(event.target.value)}
              value={filterStatus}
            >
              <option value="all">{t("video.allStatus")}</option>
              <option value="pending">{t("video.pending")}</option>
              <option value="reviewed">{t("video.reviewed")}</option>
              <option value="archived">{t("video.archived")}</option>
            </select>
          </div>
        </div>
        <div className="mac-native-list">
          {videos.length === 0 ? (
            <MacEmptyState icon={<Search size={24} />} title={t("video.noMatching")} />
          ) : (
            videos.map((video) => (
              <button
                className={cn("mac-native-row", activeVideo?.id === video.id && "is-selected")}
                key={video.id}
                onClick={() => fetchNote(video)}
                type="button"
              >
                <div>
                  <div className="mac-row-title">{video.title}</div>
                  <div className="mac-row-meta">
                    <span>{video.uploader}</span>
                    <span>{video.duration}s</span>
                    <span>{video.pubdate}</span>
                    <span>{video.id}</span>
                  </div>
                </div>
                <MacStatusPill tone={statusTone(video.status)}>{statusLabel(video.status)}</MacStatusPill>
              </button>
            ))
          )}
        </div>
      </section>
      <VideoInspector activeVideo={activeVideo} fetchNote={fetchNote} updateStatus={updateStatus} />
    </MacSplitView>
  );
}
