import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import {
  Activity,
  Archive,
  BookOpen,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CloudDownload,
  ExternalLink,
  FileText,
  FolderTree,
  HardDrive,
  Heart,
  LayoutDashboard,
  PlaySquare,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
} from "lucide-react";
import { Project, Video } from "./types";
import {
  MacAppShell,
  MacConsole,
  MacEmptyState,
  MacInlineNotice,
  MacPanel,
  MacSearchField,
  MacSegmentedControl,
  MacSidebar,
  MacSidebarItem,
  MacSidebarSection,
  MacSplitView,
  MacStatusPill,
  MacTagPill,
  MacToolbar,
  MacToolbarButton,
} from "./components/MacUI";
import { LogViewer } from "./components/LogViewer";
import { SettingsView } from "./components/SettingsView";
import { cn } from "./lib/utils";
import "./App.css";

type View =
  | "dashboard"
  | "favorites"
  | "videos"
  | "notes"
  | "projects"
  | "knowledge"
  | "scripts"
  | "settings";

type ViewMode = "list" | "detail";

interface ScriptItem {
  name: string;
  title: string;
  detail: string;
  status: "Idle" | "Running" | "Success" | "Failed";
}

const viewMeta: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: "Overview", subtitle: "Continue work and health summary" },
  favorites: { title: "Favorites", subtitle: "Bilibili imports and review state" },
  videos: { title: "Video Library", subtitle: "Transcript, notes, and project signals" },
  notes: { title: "Notes", subtitle: "Markdown knowledge documents" },
  projects: { title: "Projects", subtitle: "Open-source candidates extracted from notes" },
  knowledge: { title: "Knowledge Base", subtitle: "Local folder structure and validation" },
  scripts: { title: "Scripts", subtitle: "Whitelisted local automation" },
  settings: { title: "Preferences", subtitle: "System Settings style configuration" },
};

const scriptCatalog: ScriptItem[] = [
  {
    name: "parse_favorites.py",
    title: "Import Favorites",
    detail: "Parse Bilibili favorites into the local manifest.",
    status: "Idle",
  },
  {
    name: "extract_projects.py",
    title: "Extract Projects",
    detail: "Scan Markdown notes for repositories and packages.",
    status: "Idle",
  },
  {
    name: "build_index.py",
    title: "Build Index",
    detail: "Regenerate the knowledge base index and report.",
    status: "Idle",
  },
  {
    name: "validate_knowledge_base.py",
    title: "Health Check",
    detail: "Check structure, internal links, and sensitive data.",
    status: "Idle",
  },
];

const previewVideos: Video[] = [
  {
    id: "BV1aiKbase01",
    title: "Claude Code 工作流：从 Bilibili 收藏到本地知识库",
    url: "https://www.bilibili.com/video/BV1aiKbase01",
    uploader: "AI 工具箱",
    favorite_folder: "AI Workflow",
    category: "AI",
    tags: ["agent", "knowledge-base", "automation"],
    duration: "1240",
    pubdate: "2026-05-01",
    priority: "P0",
    status: "pending",
    note_path: "BV1aiKbase01.md",
    project_extracted: true,
    remarks: "Needs review before promotion.",
  },
  {
    id: "BV1local02",
    title: "用 Tauri 构建 macOS 原生质感桌面应用",
    url: "https://www.bilibili.com/video/BV1local02",
    uploader: "桌面开发研究所",
    favorite_folder: "Native App",
    category: "Frontend",
    tags: ["tauri", "react", "desktop"],
    duration: "1860",
    pubdate: "2026-04-27",
    priority: "P1",
    status: "reviewed",
    note_path: "BV1local02.md",
    project_extracted: true,
    remarks: "Useful UI references.",
  },
  {
    id: "BV1index03",
    title: "向量索引和 Markdown 笔记的轻量检索实践",
    url: "https://www.bilibili.com/video/BV1index03",
    uploader: "知识工程笔记",
    favorite_folder: "Knowledge Base",
    category: "Knowledge",
    tags: ["markdown", "search", "index"],
    duration: "940",
    pubdate: "2026-04-19",
    priority: "P1",
    status: "pending",
    note_path: "BV1index03.md",
    project_extracted: false,
    remarks: "Extract candidate libraries.",
  },
  {
    id: "BV1ops04",
    title: "本地自动化脚本安全白名单设计",
    url: "https://www.bilibili.com/video/BV1ops04",
    uploader: "安全工程实践",
    favorite_folder: "Automation",
    category: "Security",
    tags: ["allowlist", "script", "tauri"],
    duration: "760",
    pubdate: "2026-04-11",
    priority: "P2",
    status: "archived",
    note_path: "BV1ops04.md",
    project_extracted: false,
    remarks: "Reference only.",
  },
];

const previewProjects: Project[] = [
  {
    name: "markmap",
    url: "https://github.com/markmap/markmap",
    source_note: "BV1index03.md",
    source_video: "BV1index03",
    type: "Visualization",
    tech_stack: ["TypeScript", "Markdown", "SVG"],
    description: "Markdown-driven mind map renderer for knowledge summaries.",
    mentioned_context: "Used as a visual layer for structured notes.",
    reusable_value: "Can turn extracted notes into browsable topic maps.",
    commercial_value: "Useful for knowledge product prototypes.",
    risk: "Needs layout testing with long Chinese titles.",
    priority: "P1",
    status: "candidate",
    need_verify: true,
  },
  {
    name: "tantivy",
    url: "https://github.com/quickwit-oss/tantivy",
    source_note: "BV1index03.md",
    source_video: "BV1index03",
    type: "Search",
    tech_stack: ["Rust", "Indexing"],
    description: "Fast full-text search engine suitable for local indexing.",
    mentioned_context: "Candidate search backend for offline knowledge bases.",
    reusable_value: "Can improve local note search quality.",
    commercial_value: "Strong fit for private desktop knowledge tools.",
    risk: "Requires Rust integration work.",
    priority: "P0",
    status: "review",
    need_verify: true,
  },
  {
    name: "tauri-plugin-shell",
    url: "https://github.com/tauri-apps/plugins-workspace",
    source_note: "BV1local02.md",
    source_video: "BV1local02",
    type: "Desktop Plugin",
    tech_stack: ["Rust", "Tauri"],
    description: "Official shell plugin pattern for constrained command execution.",
    mentioned_context: "Compared with a custom command allowlist.",
    reusable_value: "Reference for future command permission design.",
    commercial_value: "Reduces maintenance risk.",
    risk: "Must keep permissions narrow.",
    priority: "P1",
    status: "useful",
    need_verify: false,
  },
];

function isTauriRuntime() {
  return isTauri() || (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
}

function previewNote(video: Video) {
  return `# ${video.title}

## Summary

This browser preview uses local sample data because Tauri backend commands are only available inside the desktop runtime.

## Review Points

- Priority: ${video.priority}
- Status: ${statusLabel(video.status)}
- Folder: ${video.favorite_folder}

## Next Action

Open the native app build to read real files, run scripts, and update review status.`;
}

function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [videos, setVideos] = useState<Video[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedScript, setSelectedScript] = useState(scriptCatalog[0].name);
  const [noteContent, setNoteContent] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const outputAnchorRef = useRef<HTMLDivElement>(null);
  const tauriAvailable = isTauriRuntime();

  const onScrollToConsole = () => {
    outputAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function fetchVideos() {
    if (!tauriAvailable) {
      setVideos(previewVideos);
      setError(null);
      return;
    }
    try {
      const data: string = await invoke("get_videos");
      setVideos(JSON.parse(data));
      setError(null);
    } catch {
      setError("Unable to sync local manifest. Please check the data file.");
    }
  }

  async function fetchProjects() {
    if (!tauriAvailable) {
      setProjects(previewProjects);
      return;
    }
    try {
      const data: string = await invoke("get_projects");
      setProjects(JSON.parse(data));
    } catch {
      setProjects([]);
    }
  }

  async function fetchNote(video: Video) {
    if (!tauriAvailable) {
      setSelectedVideo(video);
      setNoteContent(previewNote(video));
      return;
    }
    try {
      setSelectedVideo(video);
      setNoteContent("正在读取笔记...");
      const content: string = await invoke("get_note", { notePath: `${video.id}.md` });
      setNoteContent(content);
    } catch {
      setSelectedVideo(video);
      setNoteContent("### No notes yet\n\nThis video may not have been processed.");
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!tauriAvailable) {
      setVideos((prev) => prev.map((video) => (video.id === id ? { ...video, status } : video)));
      setLogs((prev) => [...prev, `[预览] 标记视频 ${id} 为 ${status}`]);
      return;
    }
    try {
      await invoke("update_video_status", { id, status });
      setLogs((prev) => [...prev, `[系统] 标记视频 ${id} 为 ${status}`]);
      await fetchVideos();
    } catch (err) {
      setError(`更新失败: ${err}`);
    }
  }

  async function runPythonScript(name: string, args: string[] = []) {
    if (isRunning) return;
    if (!tauriAvailable) {
      setIsRunning(true);
      setSelectedScript(name);
      setLogs((prev) => [
        ...prev,
        `>>> Preview run ${name}${args.length ? ` ${args.join(" ")}` : ""}`,
        ">>> Browser preview only. Open the Tauri app to execute local scripts.",
      ]);
      window.setTimeout(() => setIsRunning(false), 500);
      return;
    }
    try {
      setIsRunning(true);
      setSelectedScript(name);
      setLogs((prev) => [...prev, `>>> 开始运行 ${name}...`]);
      await invoke("run_script", { scriptName: name, args });
      setLogs((prev) => [...prev, ">>> 执行成功。"]);
      await fetchVideos();
      await fetchProjects();
      setError(null);
    } catch (err) {
      setLogs((prev) => [...prev, `[错误] ${err}`]);
      setError("脚本执行异常");
    } finally {
      setIsRunning(false);
    }
  }

  useEffect(() => {
    fetchVideos();
    fetchProjects();
    if (!tauriAvailable) return undefined;
    const unlisten = listen<string>("script-log", (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });
    return () => {
      unlisten.then((remove) => remove());
    };
  }, []);

  const filteredVideos = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return videos.filter((video) => {
      const text = `${video.title} ${video.uploader} ${video.category} ${video.id}`.toLowerCase();
      const matchesSearch = !query || text.includes(query);
      const matchesPriority = filterPriority === "all" || video.priority === filterPriority;
      const matchesStatus = filterStatus === "all" || video.status === filterStatus;
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [filterPriority, filterStatus, searchTerm, videos]);

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return projects.filter((project) => {
      const text =
        `${project.name} ${project.description} ${project.type} ${project.source_note}`.toLowerCase();
      return !query || text.includes(query);
    });
  }, [projects, searchTerm]);

  const activeVideo = selectedVideo ?? filteredVideos[0] ?? videos[0] ?? null;
  const activeProject = selectedProject ?? filteredProjects[0] ?? projects[0] ?? null;
  const reviewedCount = videos.filter((video) => video.status === "reviewed").length;
  const pendingCount = videos.filter((video) => video.status === "pending").length;
  const p0Count = videos.filter((video) => video.priority === "P0").length;
  const noteCount = videos.length;

  const toolbarAction = getToolbarAction({
    currentView,
    activeVideo,
    isRunning,
    selectedScript,
    fetchNote,
    runPythonScript,
  });

  return (
    <MacAppShell
      sidebar={
        <MacSidebar>
          <MacSidebarSection title="Library">
            <MacSidebarItem
              active={currentView === "dashboard"}
              badge={videos.length}
              icon={<LayoutDashboard size={16} />}
              label="Overview"
              onClick={() => setCurrentView("dashboard")}
            />
            <MacSidebarItem
              active={currentView === "favorites"}
              badge={pendingCount}
              icon={<Heart size={16} />}
              label="Favorites"
              onClick={() => setCurrentView("favorites")}
            />
            <MacSidebarItem
              active={currentView === "videos"}
              badge={videos.length}
              icon={<PlaySquare size={16} />}
              label="Videos"
              onClick={() => setCurrentView("videos")}
            />
            <MacSidebarItem
              active={currentView === "notes"}
              badge={noteCount}
              icon={<FileText size={16} />}
              label="Notes"
              onClick={() => setCurrentView("notes")}
            />
          </MacSidebarSection>

          <MacSidebarSection title="Knowledge">
            <MacSidebarItem
              active={currentView === "projects"}
              badge={projects.length}
              icon={<Boxes size={16} />}
              label="Projects"
              onClick={() => setCurrentView("projects")}
            />
            <MacSidebarItem
              active={currentView === "knowledge"}
              icon={<FolderTree size={16} />}
              label="Knowledge Base"
              onClick={() => setCurrentView("knowledge")}
            />
            <MacSidebarItem
              active={false}
              icon={<Tag size={16} />}
              label="Tags"
              onClick={() => setCurrentView("knowledge")}
            />
          </MacSidebarSection>

          <MacSidebarSection title="Automation">
            <MacSidebarItem
              active={currentView === "scripts"}
              badge={logs.length}
              icon={<Terminal size={16} />}
              label="Scripts"
              onClick={() => setCurrentView("scripts")}
            />
            <MacSidebarItem
              active={false}
              icon={<Activity size={16} />}
              label="Health Check"
              onClick={() => {
                setCurrentView("scripts");
                setSelectedScript("validate_knowledge_base.py");
              }}
            />
          </MacSidebarSection>

          <MacSidebarSection title="Settings">
            <MacSidebarItem
              active={currentView === "settings"}
              icon={<SettingsIcon size={16} />}
              label="Preferences"
              onClick={() => setCurrentView("settings")}
            />
          </MacSidebarSection>

          <div className="mac-sidebar-footer">
            <div className="mac-sidebar-footer-row">
              <span>Reviewed</span>
              <strong>{reviewedCount}</strong>
            </div>
            <div className="mac-sidebar-footer-row">
              <span>P0 items</span>
              <strong>{p0Count}</strong>
            </div>
          </div>
        </MacSidebar>
      }
      toolbar={
        <MacToolbar
          action={toolbarAction}
          controls={
            currentView !== "settings" ? (
              <MacSegmentedControl
                onChange={setViewMode}
                options={[
                  { value: "list", label: "List" },
                  { value: "detail", label: "Detail" },
                ]}
                value={viewMode}
              />
            ) : null
          }
          leading={
            <>
              <MacToolbarButton ariaLabel="Back" disabled icon={<ChevronLeft size={15} />} />
              <MacToolbarButton ariaLabel="Forward" disabled icon={<ChevronRight size={15} />} />
            </>
          }
          search={
            currentView !== "settings" ? (
              <MacSearchField
                onChange={setSearchTerm}
                placeholder="Search"
                value={searchTerm}
              />
            ) : undefined
          }
          subtitle={viewMeta[currentView].subtitle}
          title={viewMeta[currentView].title}
        />
      }
    >
      <div className="mac-content">
        {error && (
          <MacInlineNotice tone="error">
            <Circle size={10} fill="currentColor" /> {error}
          </MacInlineNotice>
        )}
        {currentView === "dashboard" &&
          renderDashboard({
            activeVideo,
            isPreview: !tauriAvailable,
            logs,
            p0Count,
            pendingCount,
            projects,
            reviewedCount,
            runPythonScript,
            videos,
            fetchNote,
            filterPriority,
            setFilterPriority,
            filterStatus,
            setFilterStatus,
            filteredVideos,
            updateStatus,
            noteContent,
            onScrollToConsole,
          })}
        {currentView === "favorites" &&
          renderVideoManager({
            activeVideo,
            fetchNote,
            filterPriority,
            filterStatus,
            setFilterPriority,
            setFilterStatus,
            title: "Favorites",
            updateStatus,
            videos: filteredVideos,
            viewMode,
          })}
        {currentView === "videos" &&
          renderVideoManager({
            activeVideo,
            fetchNote,
            filterPriority,
            filterStatus,
            setFilterPriority,
            setFilterStatus,
            title: "Video Library",
            updateStatus,
            videos: filteredVideos,
            viewMode,
          })}
        {currentView === "notes" &&
          renderNotes({
            activeVideo,
            fetchNote,
            noteContent,
            projects,
            videos: filteredVideos,
          })}
        {currentView === "projects" &&
          renderProjects({
            activeProject,
            projects: filteredProjects,
            setSelectedProject,
            viewMode,
          })}
        {currentView === "knowledge" &&
          renderKnowledge({
            noteCount,
            pendingCount,
            projects,
            reviewedCount,
            videos,
          })}
        {currentView === "scripts" &&
          renderScripts({
            isRunning,
            logs,
            onViewOutput: () => outputAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
            outputAnchorRef,
            runPythonScript,
            selectedScript,
            setLogs,
            setSelectedScript,
          })}
        {currentView === "settings" && (
          <div className="mac-page-scroll custom-scrollbar">
            <SettingsView />
          </div>
        )}
      </div>
    </MacAppShell>
  );
}

function getToolbarAction({
  currentView,
  activeVideo,
  isRunning,
  selectedScript,
  fetchNote,
  runPythonScript,
}: {
  currentView: View;
  activeVideo: Video | null;
  isRunning: boolean;
  selectedScript: string;
  fetchNote: (video: Video) => void;
  runPythonScript: (name: string, args?: string[]) => void;
}) {
  if (currentView === "settings") return undefined;

  if (currentView === "notes") {
    return (
      <MacToolbarButton
        disabled={!activeVideo}
        icon={<BookOpen size={14} />}
        label="Open Note"
        onClick={() => activeVideo && fetchNote(activeVideo)}
        primary
      />
    );
  }

  if (currentView === "scripts") {
    return (
      <MacToolbarButton
        disabled={isRunning}
        icon={<Terminal size={14} />}
        label={isRunning ? "Running" : "Run Selected"}
        onClick={() => runPythonScript(selectedScript)}
        primary
      />
    );
  }

  const actionByView: Partial<Record<View, { label: string; script: string; icon: ReactNode }>> = {
    dashboard: { label: "Import", script: "parse_favorites.py", icon: <CloudDownload size={14} /> },
    favorites: {
      label: "Import from Bilibili",
      script: "parse_favorites.py",
      icon: <CloudDownload size={14} />,
    },
    videos: { label: "Analyze", script: "extract_projects.py", icon: <Sparkles size={14} /> },
    projects: { label: "Extract", script: "extract_projects.py", icon: <Boxes size={14} /> },
    knowledge: {
      label: "Validate",
      script: "validate_knowledge_base.py",
      icon: <ShieldCheck size={14} />,
    },
  };
  const action = actionByView[currentView];
  if (!action) return undefined;

  return (
    <MacToolbarButton
      disabled={isRunning}
      icon={action.icon}
      label={isRunning ? "Running" : action.label}
      onClick={() => runPythonScript(action.script, action.script === "parse_favorites.py" ? ["--limit", "20"] : [])}
      primary
    />
  );
}

function renderDashboard({
  activeVideo,
  isPreview,
  logs,
  p0Count,
  pendingCount,
  projects,
  reviewedCount,
  runPythonScript,
  videos,
  fetchNote,
  filterPriority,
  setFilterPriority,
  filterStatus,
  setFilterStatus,
  filteredVideos,
  updateStatus,
  noteContent,
  onScrollToConsole,
}: {
  activeVideo: Video | null;
  isPreview: boolean;
  logs: string[];
  p0Count: number;
  pendingCount: number;
  projects: Project[];
  reviewedCount: number;
  runPythonScript: (name: string, args?: string[]) => void;
  videos: Video[];
  fetchNote: (video: Video) => void;
  filterPriority: string;
  setFilterPriority: (value: string) => void;
  filterStatus: string;
  setFilterStatus: (value: string) => void;
  filteredVideos: Video[];
  updateStatus: (id: string, status: string) => void;
  noteContent: string | null;
  onScrollToConsole: () => void;
}) {
  const recentVideos = videos.slice(0, 6);
  const recentLogs = logs.slice(-5);
  const projectCards = projects.slice(0, 4);

  return (
    <div className="mac-page-scroll custom-scrollbar">
      {isPreview && (
        <MacInlineNotice className="dev-preview-notice" tone="neutral">
          <Circle size={10} fill="currentColor" /> Browser preview using sample data
        </MacInlineNotice>
      )}

      <section className="dashboard-focus-grid">
        <header className="dashboard-focus-head">
          <div>
            <span className="overview-kicker">Knowledge Studio</span>
            <h2>继续推进收藏→知识库工作流</h2>
            <p>
              {videos.length} 个视频 · {projects.length} 个候选项目 · {pendingCount} 条待审核
            </p>
          </div>
          <div className="dashboard-focus-cta">
            <MacToolbarButton
              icon={<Sparkles size={14} />}
              label="运行健康检查"
              onClick={() => runPythonScript("validate_knowledge_base.py")}
              primary
            />
            <MacToolbarButton
              icon={<CloudDownload size={14} />}
              label="快速导入"
              onClick={() => runPythonScript("parse_favorites.py", ["--limit", "20"])}
            />
          </div>
        </header>

        <div className="dashboard-focus-strip">
          <article className="focus-card is-primary">
            <div className="focus-card-meta">当前优先级</div>
            <div className="focus-card-value">{activeVideo?.priority ?? "P0"}</div>
            <p>{activeVideo?.title ?? "导入收藏后即可看到今日重点视频。"}</p>
            {activeVideo && (
              <div className="focus-card-tags">
                <MacTagPill tone={priorityTone(activeVideo.priority)}>{activeVideo.priority}</MacTagPill>
                <MacStatusPill tone={statusTone(activeVideo.status)}>{statusLabel(activeVideo.status)}</MacStatusPill>
              </div>
            )}
          </article>
          <article className="focus-card">
            <div className="focus-card-meta">项目候选</div>
            <div className="focus-card-value">{projects.length}</div>
            <p>提取的开源仓库，等待验证商业/复用价值。</p>
            <MacTagPill tone="warm">标注后同步</MacTagPill>
          </article>
          <article className="focus-card">
            <div className="focus-card-meta">待审核视频</div>
            <div className="focus-card-value">{pendingCount}</div>
            <p>浏览并标记状态，维持知识库健康度。</p>
            <MacTagPill tone="critical">优先处理 P0</MacTagPill>
          </article>
          <article className="focus-card">
            <div className="focus-card-meta">脚本运行</div>
            <div className="focus-card-value">{logs.length}</div>
            <p>最近的自动化日志可在下方控制台查看。</p>
            <MacTagPill tone="cool">检查输出</MacTagPill>
          </article>
        </div>
      </section>

      <section className="dashboard-metrics-grid">
        <div className="metric-card">
          <span>视频总量</span>
          <strong>{videos.length}</strong>
        </div>
        <div className="metric-card">
          <span>项目总量</span>
          <strong>{projects.length}</strong>
        </div>
        <div className="metric-card">
          <span>已审核</span>
          <strong>{reviewedCount}</strong>
        </div>
        <div className="metric-card">
          <span>待处理</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric-card">
          <span>P0 数量</span>
          <strong>{p0Count}</strong>
        </div>
      </section>

      {/* Continue Working */}
      <section className="dashboard-body-grid">
        <article className="dashboard-board">
          <header className="dashboard-board-head">
            <div>
              <h3>继续处理</h3>
              {activeVideo && <span>{activeVideo.id}</span>}
            </div>
            <MacToolbarButton
              icon={<BookOpen size={14} />}
              label="打开笔记"
              onClick={() => activeVideo && fetchNote(activeVideo)}
            />
          </header>
          <div className="dashboard-board-feed custom-scrollbar">
            {recentVideos.length === 0 ? (
              <MacEmptyState
                detail="Run Quick Import to see recent favorites."
                icon={<PlaySquare size={20} />}
                title="No favorites"
              />
            ) : (
              recentVideos.map((video) => (
                <div className={cn("dashboard-feed-row", activeVideo?.id === video.id && "is-active")}
                  key={video.id}
                >
                  <div className="dashboard-feed-main">
                    <div className="dashboard-feed-title">{video.title}</div>
                    <div className="dashboard-feed-meta">
                      <span>{video.uploader}</span>
                      <span>{video.favorite_folder || "Favorites"}</span>
                      <span>{video.pubdate}</span>
                    </div>
                  </div>
                  <div className="dashboard-feed-tags">
                    <MacTagPill tone={priorityTone(video.priority)}>{video.priority}</MacTagPill>
                    <MacStatusPill tone={statusTone(video.status)}>{statusLabel(video.status)}</MacStatusPill>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="dashboard-board">
          <header className="dashboard-board-head">
            <h3>快速操作</h3>
          </header>
          <div className="dashboard-actions">
            <button
              className="dashboard-action"
              onClick={() => runPythonScript("parse_favorites.py", ["--limit", "20"])}
              type="button"
            >
              <span className="dashboard-action-icon">
                <CloudDownload size={16} />
              </span>
              <div>
                <strong>导入收藏</strong>
                <span>刷新本地 manifest，并生成最新待办。</span>
              </div>
              <ChevronRight size={16} />
            </button>
            <button
              className="dashboard-action"
              onClick={() => runPythonScript("extract_projects.py")}
              type="button"
            >
              <span className="dashboard-action-icon">
                <Boxes size={16} />
              </span>
              <div>
                <strong>提取项目</strong>
                <span>从 Markdown 笔记中识别开源候选。</span>
              </div>
              <ChevronRight size={16} />
            </button>
            <button
              className="dashboard-action"
              onClick={() => runPythonScript("validate_knowledge_base.py")}
              type="button"
            >
              <span className="dashboard-action-icon">
                <ShieldCheck size={16} />
              </span>
              <div>
                <strong>健康检查</strong>
                <span>结构、链接与敏感信息检查。</span>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </article>

        <article className="dashboard-board">
          <header className="dashboard-board-head">
            <div>
              <h3>项目候选</h3>
              <span>{projects.length} 个</span>
            </div>
          </header>
          <div className="dashboard-board-feed custom-scrollbar">
            {projectCards.length === 0 ? (
              <MacEmptyState
                detail="Run the Extract command from any video to generate candidates."
                icon={<Boxes size={20} />}
                title="No candidates"
              />
            ) : (
              projectCards.map((project) => (
                <div className="dashboard-feed-row" key={project.url}>
                  <div className="dashboard-feed-main">
                    <div className="dashboard-feed-title">{project.name}</div>
                    <div className="dashboard-feed-meta">
                      <span>{project.type}</span>
                      <span>{project.source_note}</span>
                    </div>
                  </div>
                  <MacTagPill tone={priorityTone(project.priority)}>{project.priority}</MacTagPill>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="dashboard-board">
          <header className="dashboard-board-head">
            <div>
              <h3>自动化日志</h3>
              <span>{logs.length} 条</span>
            </div>
            <MacToolbarButton
              icon={<Terminal size={14} />}
              label="查看控制台"
              onClick={onScrollToConsole}
            />
          </header>
          <div className="dashboard-board-feed custom-scrollbar">
            {recentLogs.length === 0 ? (
              <MacEmptyState
                detail="Run any script to see recent output."
                icon={<Activity size={20} />}
                title="No logs"
              />
            ) : (
              recentLogs.map((log, index) => (
                <div className="dashboard-feed-row" key={`${log}-${index}`}>
                  <code className="dashboard-log-text">{log}</code>
                  <span className="dashboard-log-index">#{String(index + 1).padStart(2, "0")}</span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="dashboard-split">
        <article className="dashboard-table">
          <header className="dashboard-table-head">
            <div>
              <h3>视频状态</h3>
              <span>筛选并更新优先级</span>
            </div>
            <div className="dashboard-table-actions">
              <select
                className="mac-select is-inline"
                onChange={(event) => setFilterPriority(event.target.value)}
                value={filterPriority}
              >
                <option value="all">全部优先级</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
              </select>
              <select
                className="mac-select is-inline"
                onChange={(event) => setFilterStatus(event.target.value)}
                value={filterStatus}
              >
                <option value="all">全部状态</option>
                <option value="pending">待审核</option>
                <option value="reviewed">已完成</option>
                <option value="archived">归档</option>
              </select>
            </div>
          </header>
          <div className="dashboard-table-body custom-scrollbar">
            {filteredVideos.length === 0 ? (
              <MacEmptyState
                detail="修改筛选条件或导入新视频。"
                icon={<Search size={20} />}
                title="未找到匹配视频"
              />
            ) : (
              filteredVideos.slice(0, 6).map((video) => (
                <div className="dashboard-table-row" key={video.id}>
                  <div className="dashboard-table-main">
                    <div className="dashboard-table-title">{video.title}</div>
                    <div className="dashboard-table-meta">
                      <span>{video.uploader}</span>
                      <span>{video.favorite_folder || "Favorites"}</span>
                      <span>{video.pubdate}</span>
                    </div>
                  </div>
                  <div className="dashboard-table-controls">
                    <MacTagPill tone={priorityTone(video.priority)}>{video.priority}</MacTagPill>
                    <select
                      className="mac-select is-inline"
                      onChange={(event) => updateStatus(video.id, event.target.value)}
                      value={video.status}
                    >
                      <option value="pending">Pending</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="archived">Archived</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <aside className="dashboard-detail">
          <div className="dashboard-note-card">
            <header>
              <span>当前视频</span>
              <strong>{activeVideo?.title ?? "等待选择"}</strong>
            </header>
            <div className="dashboard-note-body">
              {noteContent ? (
                <div className="dashboard-markdown">
                  <ReactMarkdown>{noteContent}</ReactMarkdown>
                </div>
              ) : (
                <p>选择左侧视频或导入收藏后可预览笔记。</p>
              )}
            </div>
            <footer>
              <MacToolbarButton
                icon={<BookOpen size={14} />}
                label="刷新笔记"
                onClick={() => activeVideo && fetchNote(activeVideo)}
              />
            </footer>
          </div>

          <div className="dashboard-console-card">
            <header>
              <span>脚本控制台</span>
              <MacToolbarButton
                icon={<Terminal size={14} />}
                label="滚动到底部"
                onClick={onScrollToConsole}
              />
            </header>
            <LogViewer logs={logs.slice(-10)} />
          </div>
        </aside>
      </section>
    </div>
  );
}

function renderVideoManager({
  activeVideo,
  fetchNote,
  filterPriority,
  filterStatus,
  setFilterPriority,
  setFilterStatus,
  title,
  updateStatus,
  videos,
  viewMode,
}: {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  filterPriority: string;
  filterStatus: string;
  setFilterPriority: (value: string) => void;
  setFilterStatus: (value: string) => void;
  title: string;
  updateStatus: (id: string, status: string) => void;
  videos: Video[];
  viewMode: ViewMode;
}) {
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
              <option value="all">All priorities</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
            <select
              className="mac-select"
              onChange={(event) => setFilterStatus(event.target.value)}
              value={filterStatus}
            >
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div className={cn("mac-native-list", viewMode === "detail" && "is-detail")}>
          {videos.length === 0 ? (
            <MacEmptyState icon={<Search size={24} />} title="No matching videos" />
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

function VideoInspector({
  activeVideo,
  fetchNote,
  updateStatus,
}: {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  updateStatus: (id: string, status: string) => void;
}) {
  if (!activeVideo) {
    return (
      <aside className="mac-inspector">
        <MacEmptyState
          detail="Choose a video from the list to view details and actions."
          title="No video selected"
        />
      </aside>
    );
  }

  return (
    <aside className="mac-inspector custom-scrollbar">
      <div className="mac-inspector-content">
        <div>
          <h2 className="mac-inspector-title">{activeVideo.title}</h2>
          <p className="mac-inspector-meta">{activeVideo.uploader}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MacStatusPill tone={statusTone(activeVideo.status)}>
            {statusLabel(activeVideo.status)}
          </MacStatusPill>
                <MacTagPill tone={priorityTone(activeVideo.priority)}>{activeVideo.priority}</MacTagPill>
          <MacTagPill>{activeVideo.category}</MacTagPill>
        </div>
        <div className="mac-stat-grid">
          <div className="mac-stat">
            <strong>{activeVideo.duration || "-"}</strong>
            <span>Duration</span>
          </div>
          <div className="mac-stat">
            <strong>{activeVideo.tags.length}</strong>
            <span>Tags</span>
          </div>
        </div>
        <MacPanel title="AI Summary">
          <div className="mac-inspector-content">
            <p className="mac-inspector-meta">
              Transcript and note extraction are tracked locally for this BV item.
            </p>
          </div>
        </MacPanel>
        <MacPanel title="Actions">
          <div className="mac-native-list">
            <button className="mac-native-row" onClick={() => fetchNote(activeVideo)} type="button">
              <span className="mac-row-title">Open Note</span>
              <BookOpen size={14} />
            </button>
            <button
              className="mac-native-row"
              onClick={() => updateStatus(activeVideo.id, "reviewed")}
              type="button"
            >
              <span className="mac-row-title">Mark Reviewed</span>
              <Check size={14} />
            </button>
            <button
              className="mac-native-row"
              onClick={() => updateStatus(activeVideo.id, "archived")}
              type="button"
            >
              <span className="mac-row-title">Archive</span>
              <Archive size={14} />
            </button>
            <a className="mac-native-row" href={activeVideo.url} rel="noreferrer" target="_blank">
              <span className="mac-row-title">Open in Bilibili</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </MacPanel>
      </div>
    </aside>
  );
}

function renderNotes({
  activeVideo,
  fetchNote,
  noteContent,
  projects,
  videos,
}: {
  activeVideo: Video | null;
  fetchNote: (video: Video) => void;
  noteContent: string | null;
  projects: Project[];
  videos: Video[];
}) {
  return (
    <MacSplitView columns="280px minmax(0, 1fr) 300px">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-panel-header">
          <h2>Notes</h2>
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
                  <span>{video.category}</span>
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
                <ReactMarkdown>{noteContent ?? "Select a note to load its Markdown content."}</ReactMarkdown>
              </div>
            </article>
          ) : (
            <MacEmptyState
              detail="Choose a note from the list or open a markdown document."
              icon={<FileText size={28} />}
              title="No note selected"
            />
          )}
        </div>
      </section>
      <aside className="mac-inspector custom-scrollbar">
        <div className="mac-inspector-content">
          <h2 className="mac-inspector-title">Context</h2>
          <MacPanel title="Related Video">
            <div className="mac-inspector-content">
              <p className="mac-inspector-meta">{activeVideo?.url ?? "No video selected"}</p>
            </div>
          </MacPanel>
          <MacPanel title="Extracted Projects" meta={`${projects.length} candidates`}>
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
          <MacPanel title="Document Status">
            <div className="mac-inspector-content">
              <div className="mac-row-meta">
                <span>Markdown</span>
                <span>{noteContent?.length ?? 0} characters</span>
              </div>
            </div>
          </MacPanel>
        </div>
      </aside>
    </MacSplitView>
  );
}

function renderProjects({
  activeProject,
  projects,
  setSelectedProject,
  viewMode,
}: {
  activeProject: Project | null;
  projects: Project[];
  setSelectedProject: (project: Project) => void;
  viewMode: ViewMode;
}) {
  return (
    <MacSplitView columns={viewMode === "list" ? "380px minmax(0, 1fr) 300px" : "minmax(0, 1fr) 300px"}>
      {viewMode === "list" && (
        <section className="mac-list-pane custom-scrollbar">
          <div className="mac-panel-header">
            <h2>Projects</h2>
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
                    <span>{project.type}</span>
                    <span>{project.source_note}</span>
                  </div>
                </div>
                <MacStatusPill tone="blue">{project.status || "candidate"}</MacStatusPill>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="mac-detail-pane custom-scrollbar">
        <div className="mac-page-scroll custom-scrollbar">
          {activeProject ? (
            <div className="mac-settings-stack">
              <MacPanel title={activeProject.name} meta={activeProject.type}>
                <div className="mac-inspector-content">
                  <p>{activeProject.description || "从视频笔记中提取出来的开源项目候选。"}</p>
                  <div className="flex flex-wrap gap-2">
                    {(activeProject.tech_stack.length ? activeProject.tech_stack : ["to-review"]).map((item) => (
                      <MacTagPill key={item}>{item}</MacTagPill>
                    ))}
                  </div>
                </div>
              </MacPanel>
              <MacPanel title="Source References">
                <div className="mac-native-list">
                  <a className="mac-native-row" href={activeProject.url} rel="noreferrer" target="_blank">
                    <span className="mac-row-title">{activeProject.url}</span>
                    <ExternalLink size={14} />
                  </a>
                  <div className="mac-native-row">
                    <div>
                      <div className="mac-row-title">Source note</div>
                      <div className="mac-row-meta">{activeProject.source_note}</div>
                    </div>
                  </div>
                </div>
              </MacPanel>
            </div>
          ) : (
            <MacEmptyState icon={<Boxes size={28} />} title="No project selected" />
          )}
        </div>
      </section>
      <aside className="mac-inspector custom-scrollbar">
        <div className="mac-inspector-content">
          <h2 className="mac-inspector-title">Review State</h2>
          <MacStatusPill tone={activeProject?.need_verify ? "orange" : "green"}>
            {activeProject?.need_verify ? "To Review" : "Useful"}
          </MacStatusPill>
          <MacPanel title="Metadata">
            <div className="mac-inspector-content">
              <p className="mac-inspector-meta">Repo: {activeProject?.name ?? "-"}</p>
              <p className="mac-inspector-meta">Priority: {activeProject?.priority ?? "-"}</p>
            </div>
          </MacPanel>
        </div>
      </aside>
    </MacSplitView>
  );
}

function renderKnowledge({
  noteCount,
  pendingCount,
  projects,
  reviewedCount,
  videos,
}: {
  noteCount: number;
  pendingCount: number;
  projects: Project[];
  reviewedCount: number;
  videos: Video[];
}) {
  const folders = [
    { name: "manifest", count: videos.length },
    { name: "notes/raw", count: noteCount },
    { name: "projects", count: projects.length },
    { name: "reports", count: 2 },
    { name: "thoughts", count: 3 },
  ];

  const p0Count = videos.filter((video) => video.priority === "P0").length;

  return (
    <MacSplitView columns="260px minmax(0, 1fr) 340px">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-panel-header">
          <h2>BiliKnowledge</h2>
          <HardDrive size={15} />
        </div>
        <div className="mac-native-list">
          {folders.map((folder) => (
            <div className="kb-folder-row" key={folder.name}>
              <FolderTree size={14} className="kb-folder-icon" />
              <div>
                <div className="mac-row-title">{folder.name}</div>
                <div className="mac-row-meta">{folder.count} items</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="mac-detail-pane custom-scrollbar">
        <div className="mac-page-scroll custom-scrollbar">
          <div className="mac-settings-stack">
            <section className="bk-panel kb-path-panel">
              <header className="panel-header">
                <h2>Knowledge Base Path</h2>
                <span>../BiliKnowledge</span>
              </header>
              <div className="kb-meta-list">
                <div className="kb-meta-row">
                  <span className="kb-meta-label">Location</span>
                  <strong className="kb-meta-value">../BiliKnowledge</strong>
                </div>
                <div className="kb-meta-row">
                  <span className="kb-meta-label">Type</span>
                  <strong className="kb-meta-value">Local Markdown Workspace</strong>
                </div>
                <div className="kb-meta-row">
                  <span className="kb-meta-label">Status</span>
                  <strong className="kb-meta-value">Accessible</strong>
                </div>
                <div className="kb-meta-row">
                  <span className="kb-meta-label">Last Scan</span>
                  <strong className="kb-meta-value">Browser preview</strong>
                </div>
              </div>
            </section>

            <section className="bk-panel kb-notes-panel">
              <header className="panel-header">
                <h2>Recent Notes</h2>
                <span>{videos.length} total</span>
              </header>
              <div className="kb-note-list">
                {videos.slice(0, 7).map((video) => (
                  <div className="kb-note-row" key={video.id}>
                    <div className="kb-note-main">
                      <div className="kb-note-title">{video.id}.md</div>
                      <div className="kb-note-subtitle">{video.title}</div>
                    </div>
                    <div className="kb-note-status">
                      <MacTagPill tone={priorityTone(video.priority)}>{video.priority}</MacTagPill>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bk-panel kb-secondary-panel">
              <header className="panel-header">
                <h2>Folder Summary</h2>
                <span>Local workspace</span>
              </header>
              <div className="kb-folder-summary">
                {folders.map((folder) => (
                  <div key={folder.name}>
                    <span>{folder.name}</span>
                    <strong>{folder.count} items</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
      <aside className="mac-inspector kb-inspector custom-scrollbar">
        <div className="mac-inspector-content">
          <h2 className="mac-inspector-title">Health Score</h2>
          <section className="bk-panel health-panel">
            <header className="panel-header">
              <h2>Overview</h2>
            </header>
            <div className="health-list">
              <div className="health-row">
                <span className="health-label">Reviewed</span>
                <strong className="health-status">{reviewedCount}</strong>
              </div>
              <div className="health-row">
                <span className="health-label">Pending</span>
                <strong className="health-status">{pendingCount}</strong>
              </div>
              <div className="health-row">
                <span className="health-label">P0 Items</span>
                <strong className="health-status">{p0Count}</strong>
              </div>
            </div>
          </section>

          <section className="bk-panel validation-panel">
            <header className="panel-header">
              <h2>Validation</h2>
            </header>
            <div className="validation-list">
              <div className="validation-row">
                <span className="validation-label">Broken Links</span>
                <span className="status-pill status-pass">Pass</span>
              </div>
              <div className="validation-row">
                <span className="validation-label">Sensitive Data</span>
                <span className="status-pill status-pass">Pass</span>
              </div>
              <div className="validation-row">
                <span className="validation-label">Orphan Notes</span>
                <span className="status-pill status-review">Review</span>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </MacSplitView>
  );
}

function renderScripts({
  isRunning,
  logs,
  onViewOutput,
  outputAnchorRef,
  runPythonScript,
  selectedScript,
  setLogs,
  setSelectedScript,
}: {
  isRunning: boolean;
  logs: string[];
  onViewOutput: () => void;
  outputAnchorRef: RefObject<HTMLDivElement | null>;
  runPythonScript: (name: string, args?: string[]) => void;
  selectedScript: string;
  setLogs: (logs: string[]) => void;
  setSelectedScript: (name: string) => void;
}) {
  const activeScript = scriptCatalog.find((script) => script.name === selectedScript) ?? scriptCatalog[0];
  const lastOutput = logs.length > 0 ? logs[logs.length - 1] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MacSplitView columns="340px minmax(0, 1fr)">
        <section className="script-list-pane custom-scrollbar">
          <div className="script-list-header">
            <h2>Whitelist</h2>
            <ShieldCheck size={15} />
          </div>
          <div className="script-list">
            {scriptCatalog.map((script) => (
              <button
                className={cn("script-row", selectedScript === script.name && "is-selected")}
                key={script.name}
                onClick={() => setSelectedScript(script.name)}
                type="button"
              >
                <div>
                  <div className="script-row-title">{script.title}</div>
                  <div className="script-row-subtitle">{script.name}</div>
                </div>
                <MacStatusPill tone={isRunning && selectedScript === script.name ? "orange" : "neutral"}>
                  {isRunning && selectedScript === script.name ? "Running" : script.status}
                </MacStatusPill>
              </button>
            ))}
          </div>
        </section>
        <section className="script-detail-wrap custom-scrollbar">
          <div className="script-detail">
            <div className="script-detail-header">
              <div>
                <h2>{activeScript.title}</h2>
                <p>{activeScript.detail}</p>
              </div>
              <code>{activeScript.name}</code>
            </div>

            <div className="script-meta-grid">
              <div className="script-meta-row">
                <span>Status</span>
                <strong>{isRunning && selectedScript === activeScript.name ? "Running" : activeScript.status}</strong>
              </div>
              <div className="script-meta-row">
                <span>Permission</span>
                <strong>Backend allowlist</strong>
              </div>
              <div className="script-meta-row">
                <span>Last Run</span>
                <strong>{logs.length > 0 ? "Recent output available" : "Never"}</strong>
              </div>
              <div className="script-meta-row">
                <span>Scope</span>
                <strong>Knowledge validation</strong>
              </div>
            </div>

            <div className="script-policy-success">
              <ShieldCheck size={14} /> Script execution uses the existing backend allowlist.
            </div>

            <div className="detail-actions">
              <button className="bk-button" onClick={onViewOutput} type="button">
                View Output
              </button>
              <button
                className="bk-button bk-button-primary"
                disabled={isRunning}
                onClick={() => runPythonScript(activeScript.name)}
                type="button"
              >
                {isRunning ? "Running" : "Run Script"}
              </button>
            </div>
          </div>

          <div className="script-secondary-panel">
            <div className="panel-title">Execution Policy</div>
            <ul>
              <li>Only whitelisted scripts are shown.</li>
              <li>Running scripts uses the existing backend allowlist.</li>
              <li>This UI does not add new command permissions.</li>
            </ul>
          </div>

          <div className="safe-notice-panel">
            <h3>Safe Execution Notice</h3>
            <p>
              This UI lists existing local scripts only. It does not add new command permissions or API calls.
            </p>
          </div>

          <div className="script-secondary-panel">
            <div className="panel-title">Last Output</div>
            {lastOutput ? (
              <div className="last-output-preview">{lastOutput}</div>
            ) : (
              <p className="last-output-empty">No output yet. Run a whitelisted script to view logs here.</p>
            )}
          </div>
        </section>
      </MacSplitView>
      <div ref={outputAnchorRef}>
        <MacConsole logs={logs} onClear={() => setLogs([])} />
      </div>
    </div>
  );
}

function statusTone(status: string): "blue" | "green" | "orange" | "red" | "neutral" {
  if (status === "pending") return "orange";
  if (status === "reviewed") return "green";
  if (status === "failed") return "red";
  if (status === "archived") return "neutral";
  return "blue";
}

function priorityTone(priority: string): "critical" | "warm" | "cool" | "neutral" {
  if (priority === "P0") return "critical";
  if (priority === "P1") return "warm";
  if (priority === "P2") return "cool";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "pending") return "Needs Review";
  if (status === "reviewed") return "Ready";
  if (status === "archived") return "Archived";
  if (status === "failed") return "Failed";
  return status || "Ready";
}

export default App;
