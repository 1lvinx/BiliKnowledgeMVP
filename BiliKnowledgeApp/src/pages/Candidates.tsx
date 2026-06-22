import { Boxes, ExternalLink, GitFork, Globe, Star } from "lucide-react";
import type { Project } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { localizeLabel } from "../lib/video-utils";
import { MacEmptyState, MacPanel, MacSplitView, MacStatusPill, MacTagPill } from "../components/MacUI";

type ViewMode = "list" | "detail";

interface CandidatesProps {
  activeProject: Project | null;
  projects: Project[];
  setSelectedProject: (project: Project) => void;
  viewMode: ViewMode;
}

export function Candidates({
  activeProject,
  projects,
  setSelectedProject,
  viewMode,
}: CandidatesProps) {
  const sortedProjects = [...projects].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  return (
    <MacSplitView columns={viewMode === "list" ? "380px minmax(0, 1fr) 300px" : "minmax(0, 1fr) 300px"}>
      {viewMode === "list" && (
        <section className="mac-list-pane custom-scrollbar">
          <div className="mac-panel-header">
            <h2>{t("sidebar.projects")}</h2>
            <span>{projects.length}</span>
          </div>
          <div className="mac-native-list">
            {sortedProjects.map((project) => (
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
                <MacStatusPill tone="blue">{localizeLabel(project.status || "candidate")}</MacStatusPill>
              </button>
            ))}
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
                  <div className="flex flex-wrap gap-3 text-sm text-slate-400">
                    {typeof activeProject.stars === "number" ? (
                      <span className="inline-flex items-center gap-1">
                        <Star size={14} />
                        {activeProject.stars}
                      </span>
                    ) : null}
                    {typeof activeProject.forks === "number" ? (
                      <span className="inline-flex items-center gap-1">
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
          <MacStatusPill tone={activeProject?.need_verify ? "orange" : "green"}>
            {activeProject?.need_verify ? t("projects.toReview") : t("projects.useful")}
          </MacStatusPill>
          <MacPanel title={t("projects.metadata")}>
            <div className="mac-inspector-content">
              <p className="mac-inspector-meta">{t("projects.repo")}: {activeProject?.name ?? "-"}</p>
              <p className="mac-inspector-meta">{t("projects.priority")}: {activeProject?.priority ?? "-"}</p>
              <p className="mac-inspector-meta">{t("projects.stars")}: {activeProject?.stars ?? 0}</p>
              <p className="mac-inspector-meta">{t("projects.forks")}: {activeProject?.forks ?? 0}</p>
              <p className="mac-inspector-meta">{t("projects.language")}: {activeProject?.language || "-"}</p>
              <p className="mac-inspector-meta">{t("projects.updatedAt")}: {formatProjectDate(activeProject?.pushed_at)}</p>
            </div>
          </MacPanel>
        </div>
      </aside>
    </MacSplitView>
  );
}

function formatProjectDate(raw?: string) {
  if (!raw) {
    return "-";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleDateString();
}
