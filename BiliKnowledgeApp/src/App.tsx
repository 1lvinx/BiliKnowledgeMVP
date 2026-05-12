import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import {
  Activity,
  BookOpen,
  Boxes,
  ChevronRight,
  Circle,
  CloudDownload,
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
  MacSearchField,
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
import { previewVideos, previewProjects } from "./data/demo";
import { localizeLabel, priorityTone, statusLabel, statusTone } from "./lib/video-utils";
import { cn } from "./lib/utils";
import { Videos } from "./pages/Videos";
import { Notes } from "./pages/Notes";
import { Candidates } from "./pages/Candidates";
import { getSavedLanguage, saveLanguage, setLanguage as setI18nLanguage, t } from "./i18n";
import "./App.css";

type View =
  | "dashboard"
  | "favorites"
  | "videos"
  | "notes"
  | "projects"
  | "knowledge"
  | "scripts"
  | "settings"
  | "tags";

type ViewMode = "list" | "detail";

interface ScriptItem {
  name: string;
  title: string;
  detail: string;
  status: "Idle" | "Running" | "Success" | "Failed";
}

function buildViewMeta(t: (key: string, p?: Record<string, string | number>) => string): Record<View, { title: string; subtitle: string }> {
  return {
    dashboard: { title: t("view.overview"), subtitle: t("view.overviewSubtitle") },
    favorites: { title: t("view.favorites"), subtitle: t("view.favoritesSubtitle") },
    videos: { title: t("view.videos"), subtitle: t("view.videosSubtitle") },
    notes: { title: t("view.notes"), subtitle: t("view.notesSubtitle") },
    projects: { title: t("view.projects"), subtitle: t("view.projectsSubtitle") },
    knowledge: { title: t("view.knowledge"), subtitle: t("view.knowledgeSubtitle") },
    scripts: { title: t("sidebar.healthCheck"), subtitle: t("view.scriptsSubtitle") },
    settings: { title: t("view.settings"), subtitle: t("view.settingsSubtitle") },
    tags: { title: t("sidebar.tags"), subtitle: t("view.tagsSubtitle") },
  };
}

function buildScriptCatalog(t: (key: string, p?: Record<string, string | number>) => string): ScriptItem[] {
  return [
    {
      name: "parse_favorites.py",
      title: t("scripts.parseFavorites"),
      detail: t("scripts.parseFavoritesDesc"),
      status: "Idle" as const,
    },
    {
      name: "extract_projects.py",
      title: t("scripts.extractProjects"),
      detail: t("scripts.extractProjectsDesc"),
      status: "Idle" as const,
    },
    {
      name: "build_index.py",
      title: t("scripts.buildIndex"),
      detail: t("scripts.buildIndexDesc"),
      status: "Idle" as const,
    },
    {
      name: "validate_knowledge_base.py",
      title: t("scripts.healthCheck"),
      detail: t("scripts.healthCheckDesc"),
      status: "Idle" as const,
    },
  ];
}

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
  const viewMode: ViewMode = "list";
  const [videos, setVideos] = useState<Video[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [noteContent, setNoteContent] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const outputAnchorRef = useRef<HTMLDivElement>(null);
  const tauriAvailable = isTauriRuntime();

  const [language, setLanguage] = useState<"zh-CN" | "en-US">(() => {
    const saved = getSavedLanguage();
    const lang = saved === "zh-CN" || saved === "en-US" ? saved : "zh-CN";
    setI18nLanguage(lang);
    return lang;
  });

  function handleLanguageChange(lang: string) {
    if (lang === "zh-CN" || lang === "en-US") {
      setLanguage(lang);
      setI18nLanguage(lang);
      saveLanguage(lang);
    }
  }

  const viewMeta = useMemo(() => buildViewMeta(t), [language]);
  const scriptCatalog = useMemo(() => buildScriptCatalog(t), [language]);
  const [selectedScript, setSelectedScript] = useState("validate_knowledge_base.py");

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
      setError(t("error.syncFailed"));
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
      setNoteContent(t("error.loadingNote"));
      const content: string = await invoke("get_note", { notePath: `${video.id}.md` });
      setNoteContent(content);
    } catch {
      setSelectedVideo(video);
      setNoteContent(t("error.noNotes"));
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!tauriAvailable) {
      setVideos((prev) => prev.map((video) => (video.id === id ? { ...video, status } : video)));
      setLogs((prev) => [...prev, t("error.previewMarked", { id, status })]);
      return;
    }
    try {
      await invoke("update_video_status", { id, status });
      setLogs((prev) => [...prev, t("error.systemMarked", { id, status })]);
      await fetchVideos();
    } catch (err) {
      setError(t("error.updateFailed", { error: String(err) }));
    }
  }

  async function runPythonScript(name: string, args: string[] = []) {
    if (isRunning) return;
    if (!tauriAvailable) {
      setIsRunning(true);
      setSelectedScript(name);
      setLogs((prev) => [
        ...prev,
        t("error.scriptPreview", { name, args: args.length ? ` ${args.join(" ")}` : "" }),
        t("error.scriptPreviewHint"),
      ]);
      window.setTimeout(() => setIsRunning(false), 500);
      return;
    }
    try {
      setIsRunning(true);
      setSelectedScript(name);
      setError(null);
      setLogs((prev) => [...prev, t("error.scriptStart", { name })]);
      await invoke("run_script", { scriptName: name, args });
      setLogs((prev) => [...prev, t("error.scriptSuccess")]);
      await fetchVideos();
      await fetchProjects();
      setError(null);
    } catch (err) {
      const errMsg = String(err);
      setLogs((prev) => [...prev, t("error.scriptError", { error: errMsg })]);
      if (!errMsg.includes("exit code") && !errMsg.includes("issues")) {
        setError(t("error.scriptFailed"));
      }
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
          <MacSidebarSection title={t("sidebar.library")}>
            <MacSidebarItem
              active={currentView === "dashboard"}
              badge={videos.length}
              icon={<LayoutDashboard size={16} />}
              label={t("sidebar.overview")}
              onClick={() => setCurrentView("dashboard")}
            />
            <MacSidebarItem
              active={currentView === "favorites"}
              badge={pendingCount}
              icon={<Heart size={16} />}
              label={t("sidebar.favorites")}
              onClick={() => setCurrentView("favorites")}
            />
            <MacSidebarItem
              active={currentView === "videos"}
              badge={videos.length}
              icon={<PlaySquare size={16} />}
              label={t("sidebar.videos")}
              onClick={() => setCurrentView("videos")}
            />
            <MacSidebarItem
              active={currentView === "notes"}
              badge={noteCount}
              icon={<FileText size={16} />}
              label={t("sidebar.notes")}
              onClick={() => setCurrentView("notes")}
            />
          </MacSidebarSection>

          <MacSidebarSection title={t("sidebar.knowledge")}>
            <MacSidebarItem
              active={currentView === "projects"}
              badge={projects.length}
              icon={<Boxes size={16} />}
              label={t("sidebar.projects")}
              onClick={() => setCurrentView("projects")}
            />
            <MacSidebarItem
              active={currentView === "knowledge"}
              icon={<FolderTree size={16} />}
              label={t("sidebar.knowledgeBase")}
              onClick={() => setCurrentView("knowledge")}
            />
            <MacSidebarItem
              active={currentView === "tags"}
              icon={<Tag size={16} />}
              label={t("sidebar.tags")}
              onClick={() => setCurrentView("tags")}
            />
          </MacSidebarSection>

          <MacSidebarSection title={t("sidebar.automation")}>
            <MacSidebarItem
              active={currentView === "scripts"}
              badge={logs.length}
              icon={<Activity size={16} />}
              label={t("sidebar.healthCheck")}
              onClick={() => {
                setCurrentView("scripts");
                setSelectedScript("validate_knowledge_base.py");
              }}
            />
          </MacSidebarSection>

          <MacSidebarSection title={t("sidebar.settings")}>
            <MacSidebarItem
              active={currentView === "settings"}
              icon={<SettingsIcon size={16} />}
              label={t("sidebar.preferences")}
              onClick={() => setCurrentView("settings")}
            />
          </MacSidebarSection>

          <div className="mac-sidebar-footer">
            <div className="mac-sidebar-footer-row">
              <span>{t("dashboard.reviewed")}</span>
              <strong>{reviewedCount}</strong>
            </div>
            <div className="mac-sidebar-footer-row">
              <span>{t("kb.p0Items")}</span>
              <strong>{p0Count}</strong>
            </div>
          </div>
        </MacSidebar>
      }
      toolbar={
        <MacToolbar
          action={toolbarAction}
          search={
            currentView !== "settings" ? (
              <MacSearchField
                onChange={setSearchTerm}
                placeholder={t("toolbar.search")}
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
            isRunning,
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
        {currentView === "favorites" && (
          <Videos
            activeVideo={activeVideo}
            fetchNote={fetchNote}
            filterPriority={filterPriority}
            filterStatus={filterStatus}
            setFilterPriority={setFilterPriority}
            setFilterStatus={setFilterStatus}
            title={t("view.favorites")}
            updateStatus={updateStatus}
            videos={filteredVideos}
          />
        )}
        {currentView === "videos" && (
          <Videos
            activeVideo={activeVideo}
            fetchNote={fetchNote}
            filterPriority={filterPriority}
            filterStatus={filterStatus}
            setFilterPriority={setFilterPriority}
            setFilterStatus={setFilterStatus}
            title={t("view.videos")}
            updateStatus={updateStatus}
            videos={filteredVideos}
          />
        )}
        {currentView === "notes" && (
          <Notes
            activeVideo={activeVideo}
            fetchNote={fetchNote}
            noteContent={noteContent}
            projects={projects}
            videos={filteredVideos}
          />
        )}
        {currentView === "projects" && (
          <Candidates
            activeProject={activeProject}
            projects={filteredProjects}
            setSelectedProject={setSelectedProject}
            viewMode={viewMode}
          />
        )}
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
            scriptCatalog,
          })}
        {currentView === "tags" && (
          <div className="mac-page-scroll custom-scrollbar">
            <MacEmptyState
              detail={t("tags.emptyHint")}
              icon={<Tag size={32} />}
              title={t("tags.empty")}
            />
          </div>
        )}
        {currentView === "settings" && (
          <div className="mac-page-scroll custom-scrollbar">
            <SettingsView onLanguageChange={handleLanguageChange} />
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
        label={t("toolbar.openNote")}
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
        label={isRunning ? t("toolbar.running") : t("dashboard.runHealthCheck")}
        onClick={() => runPythonScript(selectedScript)}
        primary
      />
    );
  }

  const actionByView: Partial<Record<View, { label: string; script: string; icon: ReactNode }>> = {
    dashboard: { label: t("action.import"), script: "parse_favorites.py", icon: <CloudDownload size={14} /> },
    favorites: {
      label: t("action.importFromBilibili"),
      script: "parse_favorites.py",
      icon: <CloudDownload size={14} />,
    },
    videos: { label: t("action.analyze"), script: "extract_projects.py", icon: <Sparkles size={14} /> },
    projects: { label: t("action.extract"), script: "extract_projects.py", icon: <Boxes size={14} /> },
    knowledge: {
      label: t("action.validate"),
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
      label={isRunning ? t("toolbar.running") : action.label}
      onClick={() => runPythonScript(action.script, action.script === "parse_favorites.py" ? ["--limit", "20"] : [])}
      primary
    />
  );
}

function renderDashboard({
  activeVideo,
  isPreview,
  isRunning,
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
  isRunning: boolean;
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
  const isEmpty = videos.length === 0 && projects.length === 0;

  return (
    <div className="mac-page-scroll custom-scrollbar">
      {isEmpty && (
        <section className="dashboard-onboarding">
          <div className="dashboard-hero">
            <div className="dashboard-hero-main">
              <h1 className="dashboard-hero-title">{t("onboarding.title")}</h1>
              <p className="dashboard-hero-subtitle">{t("view.overviewSubtitle")}</p>
            </div>
          </div>
          <div className="onboarding-steps">
            <div className="onboarding-step">
              <div className="onboarding-step-num">1</div>
              <div className="onboarding-step-text">
                <strong>{t("onboarding.step1")}</strong>
                <p>{t("onboarding.step1Desc")}</p>
              </div>
            </div>
            <div className="onboarding-step">
              <div className="onboarding-step-num">2</div>
              <div className="onboarding-step-text">
                <strong>{t("onboarding.step2")}</strong>
                <p>{t("onboarding.step2Desc")}</p>
              </div>
            </div>
            <div className="onboarding-step">
              <div className="onboarding-step-num">3</div>
              <div className="onboarding-step-text">
                <strong>{t("onboarding.step3")}</strong>
                <p>{t("onboarding.step3Desc")}</p>
              </div>
            </div>
            <div className="onboarding-step">
              <div className="onboarding-step-num">4</div>
              <div className="onboarding-step-text">
                <strong>{t("onboarding.step4")}</strong>
                <p>{t("onboarding.step4Desc")}</p>
              </div>
            </div>
          </div>
          <div className="onboarding-actions">
            <MacToolbarButton
              disabled={isRunning}
              icon={<HardDrive size={14} />}
              label={isRunning ? t("toolbar.running") : t("onboarding.createWorkspace")}
              onClick={() => runPythonScript("validate_knowledge_base.py")}
              primary
            />
            <MacToolbarButton
              disabled={isRunning}
              icon={<CloudDownload size={14} />}
              label={isRunning ? t("toolbar.running") : t("onboarding.runImport")}
              onClick={() => runPythonScript("parse_favorites.py", ["--limit", "20"])}
            />
          </div>
        </section>
      )}
      {isPreview && (
        <MacInlineNotice className="dev-preview-notice" tone="neutral">
          <Circle size={10} fill="currentColor" /> {t("common.browserPreview")}
        </MacInlineNotice>
      )}

      <section className="dashboard-focus-grid">
        <header className="dashboard-focus-head">
          <div>
            <span className="overview-kicker">{t("dashboard.knowledgeStudio")}</span>
            <h2>{t("dashboard.continueWorkflow")}</h2>
            <p>
              {t("dashboard.videoCount", { count: videos.length })} · {t("dashboard.projectCount", { count: projects.length })} · {t("dashboard.pendingCount", { count: pendingCount })}
            </p>
          </div>
          <div className="dashboard-focus-cta">
            <MacToolbarButton
              disabled={isRunning}
              icon={<Sparkles size={14} />}
              label={isRunning ? t("toolbar.running") : t("dashboard.runHealthCheck")}
              onClick={() => runPythonScript("validate_knowledge_base.py")}
              primary
            />
            <MacToolbarButton
              disabled={isRunning}
              icon={<CloudDownload size={14} />}
              label={isRunning ? t("toolbar.running") : t("dashboard.quickImport")}
              onClick={() => runPythonScript("parse_favorites.py", ["--limit", "20"])}
            />
          </div>
        </header>

        <div className="dashboard-focus-strip">
          <article className="focus-card is-primary">
            <div className="focus-card-meta">{t("dashboard.focusPriority")}</div>
            <div className="focus-card-value">{activeVideo?.priority ?? "P0"}</div>
            <p>{activeVideo?.title ?? t("dashboard.importFavoritesHint")}</p>
            {activeVideo && (
              <div className="focus-card-tags">
                <MacTagPill tone={priorityTone(activeVideo.priority)}>{activeVideo.priority}</MacTagPill>
                <MacStatusPill tone={statusTone(activeVideo.status)}>{statusLabel(activeVideo.status)}</MacStatusPill>
              </div>
            )}
          </article>
          <article className="focus-card">
            <div className="focus-card-meta">{t("dashboard.focusCandidates")}</div>
            <div className="focus-card-value">{projects.length}</div>
            <p>{t("dashboard.extractedReposHint")}</p>
            <MacTagPill tone="warm">{t("dashboard.taggedSync")}</MacTagPill>
          </article>
          <article className="focus-card">
            <div className="focus-card-meta">{t("dashboard.focusPendingReview")}</div>
            <div className="focus-card-value">{pendingCount}</div>
            <p>{t("dashboard.browseAndMarkHint")}</p>
            <MacTagPill tone="critical">{t("dashboard.priorityP0")}</MacTagPill>
          </article>
          <article className="focus-card">
            <div className="focus-card-meta">{t("dashboard.focusScriptRuns")}</div>
            <div className="focus-card-value">{logs.length}</div>
            <p>{t("dashboard.recentLogsHint")}</p>
            <MacTagPill tone="cool">{t("dashboard.checkOutput")}</MacTagPill>
          </article>
        </div>
      </section>

      <section className="dashboard-metrics-grid">
        <div className="metric-card">
          <span>{t("dashboard.totalVideos")}</span>
          <strong>{videos.length}</strong>
        </div>
        <div className="metric-card">
          <span>{t("dashboard.totalProjects")}</span>
          <strong>{projects.length}</strong>
        </div>
        <div className="metric-card">
          <span>{t("dashboard.reviewed")}</span>
          <strong>{reviewedCount}</strong>
        </div>
        <div className="metric-card">
          <span>{t("dashboard.pending")}</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric-card">
          <span>{t("dashboard.p0Count")}</span>
          <strong>{p0Count}</strong>
        </div>
      </section>

      {/* Continue Working */}
      <section className="dashboard-body-grid">
        <article className="dashboard-board">
          <header className="dashboard-board-head">
            <div>
              <h3>{t("dashboard.continueWorking")}</h3>
              {activeVideo && <span>{activeVideo.id}</span>}
            </div>
            <MacToolbarButton
              icon={<BookOpen size={14} />}
              label={t("inspector.openNote")}
              onClick={() => activeVideo && fetchNote(activeVideo)}
            />
          </header>
          <div className="dashboard-board-feed custom-scrollbar">
            {recentVideos.length === 0 ? (
              <MacEmptyState
                detail={t("dashboard.noFavoritesHint")}
                icon={<PlaySquare size={20} />}
                title={t("dashboard.noFavorites")}
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
            <h3>{t("dashboard.quickActions")}</h3>
          </header>
          <div className="dashboard-actions">
            <button
              className="dashboard-action"
              disabled={isRunning}
              onClick={() => runPythonScript("parse_favorites.py", ["--limit", "20"])}
              type="button"
            >
              <span className="dashboard-action-icon">
                <CloudDownload size={16} />
              </span>
              <div>
                <strong>{t("dashboard.importFavorites")}</strong>
                <span>{t("dashboard.importFavoritesDesc")}</span>
              </div>
              <ChevronRight size={16} />
            </button>
            <button
              className="dashboard-action"
              disabled={isRunning}
              onClick={() => runPythonScript("extract_projects.py")}
              type="button"
            >
              <span className="dashboard-action-icon">
                <Boxes size={16} />
              </span>
              <div>
                <strong>{t("dashboard.extractProjects")}</strong>
                <span>{t("dashboard.extractProjectsDesc")}</span>
              </div>
              <ChevronRight size={16} />
            </button>
            <button
              className="dashboard-action"
              disabled={isRunning}
              onClick={() => runPythonScript("validate_knowledge_base.py")}
              type="button"
            >
              <span className="dashboard-action-icon">
                <ShieldCheck size={16} />
              </span>
              <div>
                <strong>{t("dashboard.healthCheck")}</strong>
                <span>{t("dashboard.healthCheckDesc")}</span>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </article>

        <article className="dashboard-board">
          <header className="dashboard-board-head">
            <div>
              <h3>{t("dashboard.projectCandidates")}</h3>
              <span>{projects.length} 个</span>
            </div>
          </header>
          <div className="dashboard-board-feed custom-scrollbar">
            {projectCards.length === 0 ? (
              <MacEmptyState
                detail={t("dashboard.noCandidatesHint")}
                icon={<Boxes size={20} />}
                title={t("dashboard.noCandidates")}
              />
            ) : (
              projectCards.map((project) => (
                <div className="dashboard-feed-row" key={project.url}>
                  <div className="dashboard-feed-main">
                    <div className="dashboard-feed-title">{project.name}</div>
                    <div className="dashboard-feed-meta">
                      <span>{localizeLabel(project.type)}</span>
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
              <h3>{t("dashboard.automationLogs")}</h3>
              <span>{t("dashboard.logCount", { count: logs.length })}</span>
            </div>
            <MacToolbarButton
              icon={<Terminal size={14} />}
              label={t("dashboard.viewConsole")}
              onClick={onScrollToConsole}
            />
          </header>
          <div className="dashboard-board-feed custom-scrollbar">
            {recentLogs.length === 0 ? (
              <MacEmptyState
                detail={t("dashboard.noLogsHint")}
                icon={<Activity size={20} />}
                title={t("dashboard.noLogs")}
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
              <h3>{t("dashboard.videoStatus")}</h3>
              <span>{t("dashboard.filterUpdate")}</span>
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
                detail={t("dashboard.noMatchingVideosHint")}
                icon={<Search size={20} />}
                title={t("dashboard.noMatchingVideos")}
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
                      <option value="pending">{t("status.pending")}</option>
                      <option value="reviewed">{t("status.reviewed")}</option>
                      <option value="archived">{t("status.archived")}</option>
                      <option value="failed">{t("status.failed")}</option>
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
              <span>{t("dashboard.currentVideo")}</span>
              <strong>{activeVideo?.title ?? t("dashboard.waitingSelection")}</strong>
            </header>
            <div className="dashboard-note-body">
              {noteContent ? (
                <div className="dashboard-markdown">
                  <ReactMarkdown>{noteContent}</ReactMarkdown>
                </div>
              ) : (
                <p>{t("dashboard.selectVideoHint")}</p>
              )}
            </div>
            <footer>
              <MacToolbarButton
                icon={<BookOpen size={14} />}
                label={t("dashboard.refreshNote")}
                onClick={() => activeVideo && fetchNote(activeVideo)}
              />
            </footer>
          </div>

          <div className="dashboard-console-card">
            <header>
              <span>{t("dashboard.scriptConsole")}</span>
              <MacToolbarButton
                icon={<Terminal size={14} />}
                label={t("dashboard.scrollToBottom")}
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
          <h2>{t("kb.biliKnowledge")}</h2>
          <HardDrive size={15} />
        </div>
        <div className="mac-native-list">
          {folders.map((folder) => (
            <div className="kb-folder-row" key={folder.name}>
              <FolderTree size={14} className="kb-folder-icon" />
              <div>
                <div className="mac-row-title">{localizeLabel(folder.name)}</div>
                <div className="mac-row-meta">{t("kb.items", { count: folder.count })}</div>
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
                <h2>{t("kb.knowledgeBasePath")}</h2>
                <span>../BiliKnowledge</span>
              </header>
              <div className="kb-meta-list">
                <div className="kb-meta-row">
                  <span className="kb-meta-label">{t("kb.location")}</span>
                  <strong className="kb-meta-value">../BiliKnowledge</strong>
                </div>
                <div className="kb-meta-row">
                  <span className="kb-meta-label">{t("kb.type")}</span>
                  <strong className="kb-meta-value">{t("kb.localMarkdownWorkspace")}</strong>
                </div>
                <div className="kb-meta-row">
                  <span className="kb-meta-label">{t("kb.status")}</span>
                  <strong className="kb-meta-value">{t("kb.accessible")}</strong>
                </div>
                <div className="kb-meta-row">
                  <span className="kb-meta-label">{t("kb.lastScan")}</span>
                  <strong className="kb-meta-value">{t("status.idle")}</strong>
                </div>
              </div>
            </section>

            <section className="bk-panel kb-notes-panel">
              <header className="panel-header">
                <h2>{t("kb.recentNotes")}</h2>
                <span>{t("kb.totalItems", { count: videos.length })}</span>
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
                <h2>{t("kb.folderSummary")}</h2>
                <span>{t("kb.biliKnowledge")}</span>
              </header>
              <div className="kb-folder-summary">
                {folders.map((folder) => (
                  <div key={folder.name}>
                    <span>{localizeLabel(folder.name)}</span>
                    <strong>{t("kb.items", { count: folder.count })}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
      <aside className="mac-inspector kb-inspector custom-scrollbar">
        <div className="mac-inspector-content">
          <h2 className="mac-inspector-title">{t("kb.healthScore")}</h2>
          <section className="bk-panel health-panel">
            <header className="panel-header">
              <h2>{t("kb.overview")}</h2>
            </header>
            <div className="health-list">
              <div className="health-row">
                <span className="health-label">{t("kb.reviewed")}</span>
                <strong className="health-status">{reviewedCount}</strong>
              </div>
              <div className="health-row">
                <span className="health-label">{t("kb.pending")}</span>
                <strong className="health-status">{pendingCount}</strong>
              </div>
              <div className="health-row">
                <span className="health-label">{t("kb.p0Items")}</span>
                <strong className="health-status">{p0Count}</strong>
              </div>
            </div>
          </section>

          <section className="bk-panel validation-panel">
            <header className="panel-header">
              <h2>{t("kb.validation")}</h2>
            </header>
            <div className="validation-list">
              <div className="validation-row">
                <span className="validation-label">{t("kb.brokenLinks")}</span>
                <span className="status-pill status-pass">{t("kb.pass")}</span>
              </div>
              <div className="validation-row">
                <span className="validation-label">{t("kb.sensitiveData")}</span>
                <span className="status-pill status-pass">{t("kb.pass")}</span>
              </div>
              <div className="validation-row">
                <span className="validation-label">{t("kb.orphanNotes")}</span>
                <span className="status-pill status-review">{t("kb.review")}</span>
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
  scriptCatalog,
}: {
  isRunning: boolean;
  logs: string[];
  onViewOutput: () => void;
  outputAnchorRef: RefObject<HTMLDivElement | null>;
  runPythonScript: (name: string, args?: string[]) => void;
  selectedScript: string;
  setLogs: (logs: string[]) => void;
  setSelectedScript: (name: string) => void;
  scriptCatalog: ScriptItem[];
}) {
  const activeScript = scriptCatalog.find((script) => script.name === selectedScript) ?? scriptCatalog[0];
  const lastOutput = logs.length > 0 ? logs[logs.length - 1] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MacSplitView columns="340px minmax(0, 1fr)">
        <section className="script-list-pane custom-scrollbar">
          <div className="script-list-header">
            <h2>{t("scripts.whitelist")}</h2>
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
                  {isRunning && selectedScript === script.name ? t("scripts.running") : script.status}
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
                <span>{t("scripts.scriptDetail.status")}</span>
                <strong>{isRunning && selectedScript === activeScript.name ? t("scripts.running") : activeScript.status}</strong>
              </div>
              <div className="script-meta-row">
                <span>{t("scripts.scriptDetail.permission")}</span>
                <strong>{t("scripts.scriptDetail.backendAllowlist")}</strong>
              </div>
              <div className="script-meta-row">
                <span>{t("scripts.scriptDetail.lastRun")}</span>
                <strong>{logs.length > 0 ? t("scripts.scriptDetail.recentOutput") : t("scripts.scriptDetail.never")}</strong>
              </div>
              <div className="script-meta-row">
                <span>{t("scripts.scriptDetail.scope")}</span>
                <strong>{t("scripts.scriptDetail.knowledgeValidation")}</strong>
              </div>
            </div>

            <div className="script-policy-success">
              <ShieldCheck size={14} /> {t("scripts.policyMessage")}
            </div>

            <div className="detail-actions">
              <button className="bk-button" onClick={onViewOutput} type="button">
                {t("scripts.viewOutput")}
              </button>
              <button
                className="bk-button bk-button-primary"
                disabled={isRunning}
                onClick={() => runPythonScript(activeScript.name)}
                type="button"
              >
                {isRunning ? t("scripts.running") : t("scripts.runScript")}
              </button>
            </div>
          </div>

          <div className="script-secondary-panel">
            <div className="panel-title">{t("scripts.executionPolicy")}</div>
            <ul>
              <li>{t("scripts.policyItem1")}</li>
              <li>{t("scripts.policyItem2")}</li>
              <li>{t("scripts.policyItem3")}</li>
            </ul>
          </div>

          <div className="safe-notice-panel">
            <h3>{t("scripts.safeNotice")}</h3>
            <p>{t("scripts.safeNoticeDesc")}</p>
          </div>

          <div className="script-secondary-panel">
            <div className="panel-title">{t("scripts.lastOutput")}</div>
            {lastOutput ? (
              <div className="last-output-preview">{lastOutput}</div>
            ) : (
              <p className="last-output-empty">{t("scripts.noOutputYet")}</p>
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

export default App;
