import { useState } from "react";
import { Boxes, ExternalLink, GitFork, Globe, Star } from "lucide-react";
import type { Project } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { getDisplayTimezone, localizeLabel } from "../lib/video-utils";
import { MacEmptyState, MacPanel, MacSplitView, MacStatusPill, MacTagPill } from "../components/MacUI";

type ViewMode = "list" | "detail";

type ProjectReviewStatus = "candidate" | "valuable" | "archived";

interface CandidatesProps {
  activeProject: Project | null;
  onUpdateProjectStatus: (projectUrl: string, status: ProjectReviewStatus) => Promise<void>;
  projects: Project[];
  setSelectedProject: (project: Project) => void;
  viewMode: ViewMode;
}

export function Candidates({
  activeProject,
  onUpdateProjectStatus,
  projects,
  setSelectedProject,
  viewMode,
}: CandidatesProps) {
  const [updatingStatus, setUpdatingStatus] = useState<ProjectReviewStatus | null>(null);
  const sortedProjects = [...projects].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  async function handleReviewStatus(status: ProjectReviewStatus) {
    if (!activeProject || updatingStatus) return;
    setUpdatingStatus(status);
    try {
      await onUpdateProjectStatus(activeProject.url, status);
    } finally {
      setUpdatingStatus(null);
    }
  }

  return (
    <MacSplitView columns={viewMode === "list" ? "380px minmax(0, 1fr) 300px" : "minmax(0, 1fr) 300px"}>
      {viewMode === "list" && (
        <section className="mac-list-pane custom-scrollbar">
          <div className="mac-panel-header">
            <h2>{t("sidebar.projects")}</h2>
            <span>{projects.length}</span>
          </div>
          <div className="mac-native-list">
            {sortedProjects.length === 0 ? (
              <MacEmptyState
                detail="运行项目提取后，这里会显示从笔记中识别出的开源仓库与工具候选。"
                icon={<Boxes size={24} />}
                title="暂无开源候选"
              />
            ) : (
              sortedProjects.map((project) => (
                <button
                  className={cn("mac-native-row", activeProject?.url === project.url && "is-selected")}
                  key={project.url}
                  onClick={() => setSelectedProject(project)}
                  type="button"
                >
                  <div>
                    <div className="mac-row-title">{project.name}</div>
                    <div className="mac-row-meta">
                      <span>{localizeLabel(project.type)}</span>
                      {typeof project.stars === "number" && project.stars > 0 ? <span>Star {project.stars}</span> : null}
                      {project.language ? <span>{project.language}</span> : null}
                      <span>{project.source_note}</span>
                    </div>
                  </div>
                  <MacStatusPill tone={project.need_verify ? "orange" : "green"}>{formatProjectReviewLabel(project)}</MacStatusPill>
                </button>
              ))
            )}
          </div>
        </section>
      )}
      <section className="mac-detail-pane custom-scrollbar">
        <div className="mac-page-scroll custom-scrollbar">
          {activeProject ? (
            <div className="mac-settings-stack">
              <MacPanel title={activeProject.name} meta={localizeLabel(activeProject.type)}>
                <div className="mac-inspector-content">
                  <p>{activeProject.description || "从视频笔记中提取出来的开源项目候选。"}</p>
                  {activeProject.match_source ? (
                    <div className="mac-row-meta">
                      <span>{activeProject.match_source === "ai_github_search" ? "AI 精准匹配" : "明确链接"}</span>
                      {typeof activeProject.match_confidence === "number" ? (
                        <span>置信度 {Math.round(activeProject.match_confidence * 100)}%</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mac-project-metrics">
                    {typeof activeProject.stars === "number" ? (
                      <span className="mac-project-metric">
                        <Star size={14} />
                        {activeProject.stars}
                      </span>
                    ) : null}
                    {typeof activeProject.forks === "number" ? (
                      <span className="mac-project-metric">
                        <GitFork size={14} />
                        {activeProject.forks}
                      </span>
                    ) : null}
                    {activeProject.language ? <span>{activeProject.language}</span> : null}
                    {activeProject.license ? <span>{activeProject.license}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeProject.tech_stack.map((item) => (
                      <MacTagPill key={item}>{item}</MacTagPill>
                    ))}
                  </div>
                </div>
              </MacPanel>
              <MacPanel title={t("projects.sourceReferences")}>
                <div className="mac-native-list">
                  <a className="mac-native-row" href={activeProject.url} rel="noreferrer" target="_blank">
                    <span className="mac-row-title">{activeProject.url}</span>
                    <ExternalLink size={14} />
                  </a>
                  {activeProject.homepage ? (
                    <a className="mac-native-row" href={activeProject.homepage} rel="noreferrer" target="_blank">
                      <div>
                        <div className="mac-row-title">{t("projects.homepage")}</div>
                        <div className="mac-row-meta">{activeProject.homepage}</div>
                      </div>
                      <Globe size={14} />
                    </a>
                  ) : null}
                  {activeProject.source_video ? (
                    <a className="mac-native-row" href={activeProject.source_video} rel="noreferrer" target="_blank">
                      <div>
                        <div className="mac-row-title">{t("projects.sourceVideo")}</div>
                        <div className="mac-row-meta">{activeProject.source_video}</div>
                      </div>
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                  <div className="mac-native-row">
                    <div>
                      <div className="mac-row-title">{t("projects.sourceNote")}</div>
                      <div className="mac-row-meta">{activeProject.source_note}</div>
                    </div>
                  </div>
                  {activeProject.match_reason ? (
                    <div className="mac-native-row">
                      <div>
                        <div className="mac-row-title">匹配依据</div>
                        <div className="mac-row-meta">{activeProject.match_reason}</div>
                      </div>
                    </div>
                  ) : null}
                  {activeProject.matched_terms?.length ? (
                    <div className="mac-native-row">
                      <div>
                        <div className="mac-row-title">匹配词</div>
                        <div className="mac-row-meta">{activeProject.matched_terms.join(" · ")}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </MacPanel>
            </div>
          ) : (
            <MacEmptyState icon={<Boxes size={28} />} title={t("projects.noProjectSelected")} />
          )}
        </div>
      </section>
      <aside className="mac-inspector custom-scrollbar">
        <div className="mac-inspector-content">
          <h2 className="mac-inspector-title">{t("projects.reviewState")}</h2>
          <MacStatusPill tone={activeProject?.status === "archived" ? "neutral" : activeProject?.need_verify ? "orange" : "green"}>
            {activeProject ? formatProjectReviewLabel(activeProject) : "-"}
          </MacStatusPill>
          <p className="mac-inspector-meta">{t("projects.reviewHint")}</p>
          <div className="settings-feedback-actions">
            <button
              className="mac-toolbar-button"
              disabled={!activeProject || Boolean(updatingStatus)}
              onClick={() => handleReviewStatus("candidate")}
              type="button"
            >
              {updatingStatus === "candidate" ? t("status.processing") : t("projects.keepCandidate")}
            </button>
            <button
              className="mac-toolbar-button primary"
              disabled={!activeProject || Boolean(updatingStatus)}
              onClick={() => handleReviewStatus("valuable")}
              type="button"
            >
              {updatingStatus === "valuable" ? t("status.processing") : t("projects.markValuable")}
            </button>
            <button
              className="mac-toolbar-button"
              disabled={!activeProject || Boolean(updatingStatus)}
              onClick={() => handleReviewStatus("archived")}
              type="button"
            >
              {updatingStatus === "archived" ? t("status.processing") : t("projects.archiveCandidate")}
            </button>
          </div>
          <MacPanel title={t("projects.metadata")}>
            <div className="mac-inspector-content">
              <p className="mac-inspector-meta">{t("projects.repo")}: {activeProject?.name ?? "-"}</p>
              <p className="mac-inspector-meta">{t("projects.priority")}: {activeProject?.priority ?? "-"}</p>
              <p className="mac-inspector-meta">{t("projects.stars")}: {activeProject?.stars ?? 0}</p>
              <p className="mac-inspector-meta">{t("projects.forks")}: {activeProject?.forks ?? 0}</p>
              <p className="mac-inspector-meta">{t("projects.language")}: {activeProject?.language || "-"}</p>
              <p className="mac-inspector-meta">{t("projects.updatedAt")}: {formatProjectDate(activeProject?.pushed_at)}</p>
              <p className="mac-inspector-meta">匹配: {formatMatchSource(activeProject)}</p>
            </div>
          </MacPanel>
        </div>
      </aside>
    </MacSplitView>
  );
}

function formatProjectReviewLabel(project: Project) {
  if (project.need_verify || project.status === "candidate") {
    return t("projects.toReview");
  }
  if (project.status === "valuable" || project.status === "useful" || project.status === "reviewed") {
    return t("projects.valuable");
  }
  if (project.status === "archived") {
    return t("projects.archived");
  }
  return localizeLabel(project.status || "candidate");
}

function formatProjectDate(raw?: string) {
  if (!raw) {
    return "-";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleDateString(undefined, {
    timeZone: getDisplayTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatMatchSource(project: Project | null) {
  if (!project?.match_source) {
    return "-";
  }
  const source = project.match_source === "ai_github_search" ? "AI 精准搜索" : "明确链接";
  if (typeof project.match_confidence !== "number") {
    return source;
  }
  return `${source} · ${Math.round(project.match_confidence * 100)}%`;
}
