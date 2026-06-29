import { useMemo } from "react";
import {
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Video, Project } from "../types";
import { t } from "../i18n";
import { formatVideoDuration, priorityTone, statusTone, statusLabel } from "../lib/video-utils";
import { cn } from "../lib/utils";
import {
  MacStatusPill,
  MacTagPill,
  MacToolbarButton,
} from "./MacUI";

interface ActionCenterProps {
  videos: Video[];
  projects: Project[];
  onOpenNote: (video: Video) => void;
  onStartLearning: (video: Video) => void;
}

interface HealthMetric {
  label: string;
  value: number;
  total: number;
  tone: "success" | "warm" | "critical" | "neutral";
  icon: React.ReactNode;
}

function getVideoQueueTime(video: Video) {
  const candidates = [video.collected_at, video.note_generated_at, video.pubdate];
  for (const value of candidates) {
    if (!value) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function isLearningQueueVideo(video: Video) {
  return !video.note_ready && !video.note_path && video.status !== "invalid" && video.status !== "archived";
}

function sortLearningQueueVideos(videos: Video[]) {
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  return videos
    .filter(isLearningQueueVideo)
    .sort((a, b) => {
      const timeDelta = getVideoQueueTime(b) - getVideoQueueTime(a);
      if (timeDelta !== 0) return timeDelta;
      return (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) - (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3);
    });
}

function computeMetrics(videos: Video[], projects: Project[]): HealthMetric[] {
  const total = videos.length;
  const reviewed = videos.filter((v) => v.status === "reviewed" || v.note_ready).length;
  const pending = videos.filter(isLearningQueueVideo).length;
  const withNotes = videos.filter((v) => v.note_ready || v.note_path).length;

  return [
    {
      label: t("action.learningRate"),
      value: reviewed,
      total,
      tone: reviewed / Math.max(total, 1) > 0.5 ? "success" : "warm",
      icon: <TrendingUp size={14} />,
    },
    {
      label: t("action.organizeRate"),
      value: withNotes,
      total,
      tone: withNotes / Math.max(total, 1) > 0.3 ? "success" : "warm",
      icon: <FileText size={14} />,
    },
    {
      label: t("action.outputRate"),
      value: projects.length,
      total: Math.max(withNotes, 1),
      tone: projects.length > 0 ? "success" : "critical",
      icon: <Layers size={14} />,
    },
    {
      label: t("action.dormantRate"),
      value: total - reviewed - pending,
      total,
      tone: total - reviewed - pending === 0 ? "success" : "critical",
      icon: <Flame size={14} />,
    },
  ];
}

function ActionCenter({
  videos,
  projects,
  onOpenNote,
  onStartLearning,
}: ActionCenterProps) {
  const metrics = useMemo(() => computeMetrics(videos, projects), [videos, projects]);

  const queuedVideos = useMemo(() => sortLearningQueueVideos(videos), [videos]);
  const nextVideo = queuedVideos[0] ?? null;

  const pendingVideos = useMemo(
    () => queuedVideos.slice(0, 5),
    [queuedVideos]
  );

  const highValueProjects = useMemo(
    () => projects.filter((p) => p.priority === "P0" || p.priority === "P1").slice(0, 3),
    [projects]
  );

  const totalVideos = videos.length;
  const reviewedCount = videos.filter((v) => v.status === "reviewed" || v.note_ready).length;
  const pendingCount = queuedVideos.length;
  const p0Count = videos.filter((v) => v.priority === "P0").length;

  return (
    <div className="action-center">
      {/* Hero: Next Action */}
      <section className="action-hero">
        <div className="action-hero-content">
          <div className="action-hero-badge">
            <Sparkles size={12} />
            {t("action.todayFocus")}
          </div>
          {nextVideo ? (
            <>
              <h2 className="action-hero-title">{nextVideo.title}</h2>
              <p className="action-hero-meta">
                {nextVideo.uploader} · {nextVideo.favorite_folder}
              </p>
              <div className="action-hero-tags">
                <MacTagPill tone={priorityTone(nextVideo.priority)}>
                  {nextVideo.priority}
                </MacTagPill>
                <MacStatusPill tone={statusTone(nextVideo.status)}>
                  {statusLabel(nextVideo.status)}
                </MacStatusPill>
                {nextVideo.duration && (
                  <span className="action-hero-duration">
                    <Clock size={12} /> {formatVideoDuration(nextVideo.duration)}
                  </span>
                )}
              </div>
              <MacToolbarButton
                icon={<BookOpen size={14} />}
                label={nextVideo.note_path ? t("action.openCurrentNote") : t("action.goToFavorites")}
                onClick={() => onStartLearning(nextVideo)}
                primary
              />
            </>
          ) : (
            <>
              <h2 className="action-hero-title">{t("action.allCaughtUp")}</h2>
              <p className="action-hero-meta">{t("action.allCaughtUpHint")}</p>
            </>
          )}
        </div>
      </section>

      {/* Quick Stats Row */}
      <section className="action-stats">
        <div className="action-stat">
          <span className="action-stat-value">{totalVideos}</span>
          <span className="action-stat-label">{t("action.totalVideos")}</span>
        </div>
        <div className="action-stat">
          <span className="action-stat-value">{reviewedCount}</span>
          <span className="action-stat-label">{t("action.reviewed")}</span>
        </div>
        <div className="action-stat">
          <span className="action-stat-value">{pendingCount}</span>
          <span className="action-stat-label">{t("action.pending")}</span>
        </div>
        <div className="action-stat">
          <span className="action-stat-value">{p0Count}</span>
          <span className="action-stat-label">{t("action.p0Items")}</span>
        </div>
        <div className="action-stat">
          <span className="action-stat-value">{projects.length}</span>
          <span className="action-stat-label">{t("action.projects")}</span>
        </div>
      </section>

      {/* Main Grid */}
      <section className="action-grid">
        {/* Learning Queue */}
        <article className="action-card">
          <header className="action-card-header">
            <div>
              <h3>{t("action.learningQueue")}</h3>
              <span>{t("action.videosToReview", { count: pendingCount })}</span>
            </div>
          </header>
          <div className="action-card-body">
            {pendingVideos.length === 0 ? (
              <p className="action-empty">{t("action.noPendingVideos")}</p>
            ) : (
              pendingVideos.map((video) => (
                <button
                  className="action-queue-row"
                  key={video.id}
                  onClick={() => onOpenNote(video)}
                  type="button"
                >
                  <div className="action-queue-main">
                    <div className="action-queue-title">{video.title}</div>
                    <div className="action-queue-meta">
                      {video.uploader} · {video.favorite_folder}
                    </div>
                  </div>
                  <div className="action-queue-tags">
                    <MacTagPill tone={priorityTone(video.priority)}>
                      {video.priority}
                    </MacTagPill>
                    <ChevronRight size={14} />
                  </div>
                </button>
              ))
            )}
          </div>
        </article>

        {/* High Value Projects */}
        <article className="action-card">
          <header className="action-card-header">
            <div>
              <h3>{t("action.highValueProjects")}</h3>
              <span>{t("action.candidatesToVerify", { count: highValueProjects.length })}</span>
            </div>
          </header>
          <div className="action-card-body">
            {highValueProjects.length === 0 ? (
              <p className="action-empty">{t("action.noProjectsYet")}</p>
            ) : (
              highValueProjects.map((project) => (
                <div className="action-queue-row" key={project.url}>
                  <div className="action-queue-main">
                    <div className="action-queue-title">{project.name}</div>
                    <div className="action-queue-meta">
                      {project.type} · {project.source_note}
                    </div>
                  </div>
                  <MacTagPill tone={priorityTone(project.priority)}>
                    {project.priority}
                  </MacTagPill>
                </div>
              ))
            )}
          </div>
        </article>

        {/* Health Metrics */}
        <article className="action-card">
          <header className="action-card-header">
            <div>
              <h3>{t("action.knowledgeHealth")}</h3>
              <span>{t("action.healthOverview")}</span>
            </div>
          </header>
          <div className="action-card-body action-metrics">
            {metrics.map((metric) => (
              <div className="action-metric" key={metric.label}>
                <div className="action-metric-header">
                  <span className="action-metric-icon">{metric.icon}</span>
                  <span className="action-metric-label">{metric.label}</span>
                  <span className="action-metric-value">
                    {metric.value}/{metric.total}
                  </span>
                </div>
                <div className="action-metric-bar">
                  <div
                    className={cn(
                      "action-metric-fill",
                      metric.tone === "success" && "is-success",
                      metric.tone === "warm" && "is-warm",
                      metric.tone === "critical" && "is-critical"
                    )}
                    style={{ width: `${(metric.value / Math.max(metric.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

      </section>
    </div>
  );
}

export { ActionCenter };
