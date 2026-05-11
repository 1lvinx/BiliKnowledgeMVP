import { Project } from "../types";
import { ExternalLink, Box, Bookmark } from "lucide-react";

interface Props {
  projects: Project[];
}

export function ProjectExplorer({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="mac-empty-state">
        <div className="mac-empty-icon">
          <Box size={32} />
        </div>
        <strong>暂无提取项目</strong>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project, i) => (
        <div key={i} className="mac-panel p-3 transition-colors hover:bg-[rgba(120,120,128,0.06)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="overview-action-icon">
              <Box size={16} />
            </div>
            <a 
              href={project.url} 
              target="_blank" 
              rel="noreferrer"
              className="mac-toolbar-button"
            >
              <ExternalLink size={14} />
            </a>
          </div>
          
          <h3 className="mac-row-title mb-1">{project.name}</h3>
          <p className="mac-inspector-meta mb-4 line-clamp-2 min-h-8">
            {project.description || "从笔记中识别出的项目资源。"}
          </p>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {project.tech_stack.slice(0, 3).map((tech, j) => (
              <span key={j} className="mac-tag-pill">
                {tech}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--bk-separator)] pt-3">
            <div className="mac-row-meta flex-nowrap">
              <Bookmark size={10} />
              <span className="truncate">{project.source_note}</span>
            </div>
            <span className="mac-status-pill tone-blue">{project.type}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
