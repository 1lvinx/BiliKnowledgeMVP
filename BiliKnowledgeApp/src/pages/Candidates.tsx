import { Boxes, ExternalLink } from "lucide-react";
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
  return (
    <MacSplitView columns={viewMode === "list" ? "380px minmax(0, 1fr) 300px" : "minmax(0, 1fr) 300px"}>
      {viewMode === "list" && (
        <section className="mac-list-pane custom-scrollbar">
          <div className="mac-panel-header">
            <h2>{t("sidebar.projects")}</h2>
            <span>{projects.length}</span>
          </div>
          <div className="mac-native-list">
            {projects.map((project) => (
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
                  <div className="flex flex-wrap gap-2">
                    {(activeProject.tech_stack.length ? activeProject.tech_stack : ["to-review"]).map((item) => (
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
            </div>
          </MacPanel>
        </div>
      </aside>
    </MacSplitView>
  );
}
