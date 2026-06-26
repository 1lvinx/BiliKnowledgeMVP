import { useEffect, useMemo, useState } from "react";
import { Captions, ChevronRight, FileText, Search, Sparkles } from "lucide-react";
import type { FavoriteFolder, Video } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { compareVideosByRecency, formatVideoDuration, formatVideoTime, statusLabel, statusTone } from "../lib/video-utils";
import { VideoInspector } from "../components/VideoInspector";
import { MacEmptyState, MacSplitView, MacStatusPill, MacToolbarButton } from "../components/MacUI";

const PAGE_SIZE = 200;
const UNASSIGNED_FOLDER = "未归属";

interface VideosProps {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  favoriteFolders?: FavoriteFolder[];
  filterPriority: string;
  filterStatus: string;
  groupByFolder?: boolean;
  onExtractSubtitle: (videoId: string) => void;
  onGenerateInsight: (videoId: string) => void;
  onGenerateNote: (videoId: string) => void;
  onRunBatchInsight: () => void;
  onRunBatchNote: () => void;
  setFilterPriority: (value: string) => void;
  setFilterStatus: (value: string) => void;
  title: string;
  updateStatus: (id: string, status: string) => void;
  videos: Video[];
}

export function Videos({
  activeVideo,
  fetchNote,
  favoriteFolders = [],
  filterPriority,
  filterStatus,
  groupByFolder = false,
  onExtractSubtitle,
  onGenerateInsight,
  onGenerateNote,
  onRunBatchInsight,
  onRunBatchNote,
  setFilterPriority,
  setFilterStatus,
  updateStatus,
  videos,
}: VideosProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [folderVisibleCounts, setFolderVisibleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setFolderVisibleCounts({});
  }, [videos, filterPriority, filterStatus, groupByFolder]);

  useEffect(() => {
    if (!groupByFolder) return;
    const nextState: Record<string, boolean> = {};
    const nextVisible: Record<string, number> = {};
    favoriteFolders.forEach((folder, index) => {
      nextState[folder.title] = index !== 0;
      nextVisible[folder.title] = PAGE_SIZE;
    });
    setCollapsedFolders(nextState);
    setFolderVisibleCounts(nextVisible);
  }, [favoriteFolders, groupByFolder]);

  const groupedVideos = useMemo(() => {
    if (!groupByFolder) return [];
    const groupsFromVideos = videos.reduce<Record<string, Video[]>>((acc, video) => {
      const title = video.favorite_folder || UNASSIGNED_FOLDER;
      if (!acc[title]) {
        acc[title] = [];
      }
      acc[title].push(video);
      return acc;
    }, {});
    const folderMeta = new Map(favoriteFolders.map((folder) => [folder.title, folder.media_count]));
    const orderedTitles = [
      ...favoriteFolders.map((folder) => folder.title),
      ...Object.keys(groupsFromVideos).filter((title) => !folderMeta.has(title)),
    ];

    return orderedTitles
      .filter((title, index, arr) => arr.indexOf(title) === index)
      .sort((a, b) => {
        if (a === UNASSIGNED_FOLDER) return 1;
        if (b === UNASSIGNED_FOLDER) return -1;
        const aItems = [...(groupsFromVideos[a] ?? [])].sort(compareVideosByRecency);
        const bItems = [...(groupsFromVideos[b] ?? [])].sort(compareVideosByRecency);
        const aTop = aItems[0];
        const bTop = bItems[0];
        const diff = aTop && bTop ? compareVideosByRecency(aTop, bTop) : 0;
        if (diff !== 0) return diff;
        return a.localeCompare(b, "zh-CN");
      })
      .map((title) => {
        const items = [...(groupsFromVideos[title] ?? [])].sort(compareVideosByRecency);
        const visibleLimit = folderVisibleCounts[title] ?? PAGE_SIZE;
        return {
          title,
          items,
          visibleItems: items.slice(0, visibleLimit),
          visibleCount: visibleLimit,
          total: folderMeta.get(title) ?? items.length,
        };
      });
  }, [favoriteFolders, folderVisibleCounts, groupByFolder, videos]);
  const visibleVideos = useMemo(() => videos.slice(0, visibleCount), [videos, visibleCount]);

  function loadMoreInFolder(title: string, total: number) {
    setFolderVisibleCounts((prev) => ({
      ...prev,
      [title]: Math.min((prev[title] ?? PAGE_SIZE) + PAGE_SIZE, total),
    }));
  }

  function handleFlatListScroll(event: React.UIEvent<HTMLDivElement>) {
    if (groupByFolder) return;
    const element = event.currentTarget;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 120;
    if (nearBottom && visibleCount < videos.length) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, videos.length));
    }
  }

  return (
    <MacSplitView columns="minmax(430px, 1fr) 320px">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-list-controls">
          <div className="mac-list-controls-row">
            <MacToolbarButton
              disabled={!activeVideo}
              icon={<Captions size={14} />}
              label={t("scripts.fetchSubtitles")}
              onClick={() => activeVideo && onExtractSubtitle(activeVideo.id)}
            />
            <MacToolbarButton
              disabled={!activeVideo}
              icon={<Sparkles size={14} />}
              label={t("scripts.generateInsights")}
              onClick={onRunBatchInsight}
            />
            <MacToolbarButton
              disabled={!activeVideo}
              icon={<FileText size={14} />}
              label={t("scripts.generateNotes")}
              onClick={onRunBatchNote}
            />
          </div>
          <div className="mac-list-controls-row mac-list-controls-row--filters">
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
          {!groupByFolder ? (
            <div className="mac-list-context-note">
              当前为全部收藏夹合并视图，不对应单一收藏夹；列表按最近收藏/发布时间排序。
            </div>
          ) : null}
        </div>
        <div className="mac-native-list" onScroll={handleFlatListScroll}>
          {videos.length === 0 ? (
            <MacEmptyState icon={<Search size={24} />} title={t("video.noMatching")} />
          ) : groupByFolder ? (
            groupedVideos.map((group) => (
              <div key={group.title}>
                <button
                  className="mac-folder-group-header"
                  onClick={() =>
                    setCollapsedFolders((prev) => ({
                      ...prev,
                      [group.title]: !prev[group.title],
                    }))
                  }
                  type="button"
                >
                  <span className="mac-folder-group-title">
                    <ChevronRight
                      size={14}
                      className={cn("transition-transform", collapsedFolders[group.title] ? "" : "rotate-90")}
                    />
                    {group.title}
                  </span>
                  <span className="mac-folder-group-count">
                    已导入 {group.items.length} / 当前显示 {Math.min(group.visibleCount, group.items.length)} / 全部 {group.total}
                  </span>
                </button>
                {(() => {
                  const folderMeta = favoriteFolders.find((folder) => folder.title === group.title);
                  if (!folderMeta || folderMeta.sync_status === "complete" || group.title === UNASSIGNED_FOLDER) {
                    return null;
                  }
                  const isFailed = folderMeta.sync_status === "failed";
                  return (
                    <div className="px-4 pb-3">
                      <div
                        className={cn(
                          "rounded-2xl border px-3 py-2 text-xs",
                          isFailed
                            ? "mac-sync-notice is-error"
                            : "mac-sync-notice is-warning",
                        )}
                      >
                        {isFailed
                          ? `该收藏夹本次同步失败${folderMeta.error ? `：${folderMeta.error}` : ""}`
                          : `该收藏夹本次仅同步 ${folderMeta.synced_count ?? group.items.length} / ${folderMeta.media_count} 条，建议后续重试补齐。`}
                      </div>
                    </div>
                  );
                })()}
                {!collapsedFolders[group.title] ? group.visibleItems.map((video) => (
                  <button
                    className={cn("mac-native-row", activeVideo?.id === video.id && "is-selected")}
                    key={video.id}
                    onClick={() => fetchNote(video)}
                    type="button"
                  >
                    <div>
                      <div className="mac-row-title">{video.title}</div>
                      <div className="mac-row-meta">
                        <span>{video.uploader || "-"}</span>
                        <span>{formatVideoDuration(video.duration)}</span>
                        <span>{formatVideoTime(video.collected_at || video.pubdate)}</span>
                        <span>{video.id}</span>
                      </div>
                    </div>
                    <MacStatusPill tone={statusTone(video.status)}>{statusLabel(video.status)}</MacStatusPill>
                  </button>
                )) : null}
                {!collapsedFolders[group.title] && group.visibleItems.length < group.items.length ? (
                  <button
                    className="mac-native-row"
                    onClick={() => loadMoreInFolder(group.title, group.items.length)}
                    type="button"
                  >
                    <div>
                      <div className="mac-row-title">继续加载</div>
                      <div className="mac-row-meta">
                        <span>
                          继续读取 {group.title} 中的更多视频
                        </span>
                      </div>
                    </div>
                    <MacStatusPill tone="neutral">
                      {group.visibleItems.length} / {group.items.length}
                    </MacStatusPill>
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            visibleVideos.map((video) => (
              <button
                className={cn("mac-native-row", activeVideo?.id === video.id && "is-selected")}
                key={video.id}
                onClick={() => fetchNote(video)}
                type="button"
              >
                <div>
                  <div className="mac-row-title">{video.title}</div>
                  <div className="mac-row-meta">
                    <span>{video.uploader || "-"}</span>
                    <span>{formatVideoDuration(video.duration)}</span>
                    <span>{formatVideoTime(video.collected_at || video.pubdate)}</span>
                    <span>{video.id}</span>
                  </div>
                </div>
                <MacStatusPill tone={statusTone(video.status)}>{statusLabel(video.status)}</MacStatusPill>
              </button>
            ))
          )}
          {visibleCount < videos.length ? (
            <div className="px-4 py-3 text-center text-sm text-slate-500">
              {t("video.loadedCount", { shown: visibleCount, total: videos.length })}
            </div>
          ) : null}
        </div>
      </section>
      <VideoInspector
        activeVideo={activeVideo}
        fetchNote={fetchNote}
        onExtractSubtitle={onExtractSubtitle}
        onGenerateInsight={onGenerateInsight}
        onGenerateNote={onGenerateNote}
        updateStatus={updateStatus}
      />
    </MacSplitView>
  );
}
