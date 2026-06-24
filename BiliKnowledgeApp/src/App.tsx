import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import ReactMarkdown from "react-markdown";
import {
  Activity,
  BookOpen,
  Boxes,
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
  Star,
  Subtitles,
  Tag,
  Terminal,
} from "lucide-react";
import { FavoriteFolder, ProcessingStatus, Project, Video, VideoInsight, VideoSubtitle } from "./types";
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
import { ActionCenter } from "./components/ActionCenter";
import { previewVideos, previewProjects } from "./data/demo";
import { previewInsights } from "./data/demo-insights";
import { previewSubtitles } from "./data/demo-subtitles";
import { runtimeEvidenceStatus } from "./data/runtimeEvidenceStatus";
import { compareVideosByRecency, formatVideoTime, localizeLabel, priorityTone, statusLabel, statusTone } from "./lib/video-utils";
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

const RUNTIME_EVIDENCE_CAPTURE_GUIDE = [
  {
    label: "Route URL",
    value: "http://localhost:1420",
  },
  {
    label: "Screenshot path",
    value: "/private/tmp/bili-pipeline-status-playwright.png",
  },
  {
    label: "Runtime evidence path",
    value: "agent-room/runtime/evidence/20260523-003116-biliknowledgemvp-runtime-verification-hard-gate-second-controlled-trial.md",
  },
  {
    label: "Report linkage",
    value: "reports/pipeline-status-ui-integration-acceptance-summary-2026-05-23.md",
  },
  {
    label: "Capture rule",
    value: "PASS requires runtime evidence + visible result; build/test PASS alone is not enough.",
  },
] as const;

function buildPreviewPipelineStatus(): ProcessingStatus {
  return {
    last_updated: "preview mode",
    total_videos: previewVideos.length,
    pending: previewVideos.filter((video) => video.status === "pending").length,
    note_created: previewVideos.length,
    projects_extracted: previewProjects.length,
    reviewed: previewVideos.filter((video) => video.status === "reviewed").length,
    pipeline: {
      manifest_generated: true,
      notes_generated: true,
      projects_extracted: true,
      index_built: true,
      validated: false,
    },
  };
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
      name: "generate_insights.py",
      title: t("scripts.generateInsights"),
      detail: t("scripts.generateInsightsDesc"),
      status: "Idle" as const,
    },
    {
      name: "fetch_subtitles.py",
      title: t("scripts.fetchSubtitles"),
      detail: t("scripts.fetchSubtitlesDesc"),
      status: "Idle" as const,
    },
    {
      name: "generate_notes.py",
      title: t("scripts.generateNotes"),
      detail: t("scripts.generateNotesDesc"),
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

function getScriptDisplayName(
  scriptName: string,
  t: (key: string, p?: Record<string, string | number>) => string,
) {
  const labels: Record<string, string> = {
    "parse_favorites.py": t("scripts.parseFavorites"),
    "generate_insights.py": t("scripts.generateInsights"),
    "fetch_subtitles.py": t("scripts.fetchSubtitles"),
    "generate_notes.py": t("scripts.generateNotes"),
    "extract_projects.py": t("scripts.extractProjects"),
    "build_index.py": t("scripts.buildIndex"),
    "validate_knowledge_base.py": t("scripts.healthCheck"),
  };
  return labels[scriptName] ?? t("toolbar.runSelected");
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

Open the native app build to read real files, run local flows, and update review status.`;
}

interface BilibiliCookieValidationResult {
  valid: boolean;
  message: string;
  mid?: number | null;
  uname?: string | null;
}

interface ToastMessage {
  id: number;
  tone: "neutral" | "success" | "error";
  text: string;
}

function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const viewMode: ViewMode = "list";
  const [videos, setVideos] = useState<Video[]>([]);
  const [favoriteFolders, setFavoriteFolders] = useState<FavoriteFolder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [insights, setInsights] = useState<VideoInsight[]>([]);
  const [subtitles, setSubtitles] = useState<VideoSubtitle[]>([]);
  const [subtitleExtracting, setSubtitleExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const MAX_LOGS = 500;
  const appendLog = (msg: string) =>
    setLogs((prev) => [...prev.slice(-(MAX_LOGS - 1)), msg]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [noteContent, setNoteContent] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const outputAnchorRef = useRef<HTMLDivElement>(null);
  const hiddenRefreshRef = useRef(false);
  const knowledgeRefreshNoticeRef = useRef(false);
  const tauriAvailable = isTauriRuntime();

  const [pipelineStatus, setPipelineStatus] = useState<ProcessingStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<string | null>(null);

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
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const onScrollToConsole = () => {
    outputAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function showToast(text: string, tone: ToastMessage["tone"] = "neutral") {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({
      id: Date.now(),
      tone,
      text,
    });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }

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

  async function fetchFavoriteFolders() {
    if (!tauriAvailable) {
      const counts = previewVideos.reduce<Record<string, number>>((acc, video) => {
        const title = video.favorite_folder || "默认收藏夹";
        acc[title] = (acc[title] || 0) + 1;
        return acc;
      }, {});
      setFavoriteFolders(
        Object.entries(counts).map(([title, media_count]) => ({ id: title, title, media_count })),
      );
      return;
    }
    try {
      const data: string = await invoke("get_favorite_folders");
      setFavoriteFolders(JSON.parse(data));
    } catch {
      setFavoriteFolders([]);
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

  async function fetchInsights() {
    if (!tauriAvailable) {
      setInsights(previewInsights);
      return;
    }
    try {
      const data: string = await invoke("get_insights");
      setInsights(JSON.parse(data));
    } catch {
      setInsights([]);
    }
  }

  async function fetchSubtitles() {
    if (!tauriAvailable) {
      setSubtitles(previewSubtitles);
      return;
    }
    try {
      const data: string = await invoke("get_subtitles");
      setSubtitles(JSON.parse(data));
    } catch {
      setSubtitles([]);
    }
  }

  async function fetchProcessingStatus() {
    if (!tauriAvailable) return;
    setPipelineLoading(true);
    setPipelineError(null);
    try {
      const data: string = await invoke("get_processing_status");
      setPipelineStatus(JSON.parse(data));
    } catch (err) {
      setPipelineError(String(err));
      setPipelineStatus(null);
    } finally {
      setPipelineLoading(false);
    }
  }

  const PIPELINE_STEPS = [
    "parse_favorites.py",
    "fetch_subtitles.py",
    "generate_insights.py",
    "generate_notes.py",
    "extract_projects.py",
    "build_index.py",
    "validate_knowledge_base.py",
  ] as const;

  async function runFullPipeline() {
    if (pipelineRunning || isRunning) return;
    if (!tauriAvailable) return;
    setPipelineRunning(true);
    setPipelineError(null);
    appendLog("流程执行：开始完整处理");
    try {
      const cookieCheck = await validateBilibiliCookie({
        requiredFor: "完整流程",
        silentOnSuccess: true,
      });
      if (!cookieCheck.valid) {
        throw new Error(cookieCheck.message);
      }
      for (const script of PIPELINE_STEPS) {
        setPipelineStep(script);
        appendLog(`流程执行：正在处理 ${getScriptDisplayName(script, t)}`);
        await invoke("run_script", { scriptName: script, args: [] });
        appendLog(`流程执行：${getScriptDisplayName(script, t)} 已完成`);
      }
      appendLog("流程执行：全部步骤已完成");
      await fetchVideos();
      await fetchFavoriteFolders();
      await fetchProjects();
      await fetchInsights();
      await fetchSubtitles();
      await fetchProcessingStatus();
    } catch (err) {
      setPipelineError(String(err));
      appendLog(`流程执行失败：${String(err)}`);
    } finally {
      setPipelineStep(null);
      setPipelineRunning(false);
    }
  }

  async function runHiddenKnowledgeRefresh() {
    if (!tauriAvailable || hiddenRefreshRef.current || isRunning || pipelineRunning) return;
    hiddenRefreshRef.current = true;
    try {
      await invoke("run_script", { scriptName: "extract_projects.py", args: [] });
      await invoke("run_script", { scriptName: "build_index.py", args: [] });
      await invoke("run_script", { scriptName: "validate_knowledge_base.py", args: [] });
      await fetchProjects();
      await fetchProcessingStatus();
    } catch (err) {
      appendLog(`后台整理失败：${String(err)}`);
    } finally {
      hiddenRefreshRef.current = false;
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
      const content: string = await invoke("get_note", { notePath: video.note_path || `${video.id}.md` });
      setNoteContent(content);
    } catch {
      setSelectedVideo(video);
      setNoteContent(t("error.noNotes"));
    }
  }

  function openVideoInNotes(video: Video) {
    setSelectedVideo(video);
    setCurrentView("notes");
    void fetchNote(video);
  }

  function openVideoInFavorites(video: Video) {
    setSelectedVideo(video);
    setCurrentView("favorites");
    setNoteContent(null);
  }

  async function updateStatus(id: string, status: string) {
    if (!tauriAvailable) {
      setVideos((prev) => prev.map((video) => (video.id === id ? { ...video, status } : video)));
      appendLog(t("error.previewMarked", { id, status }));
      return;
    }
    try {
      await invoke("update_video_status", { id, status });
      appendLog(t("error.systemMarked", { id, status }));
      await fetchVideos();
      await fetchFavoriteFolders();
    } catch (err) {
      setError(t("error.updateFailed", { error: String(err) }));
    }
  }

  async function runPythonScript(name: string, args: string[] = []) {
    if (isRunning) return;
    const displayName = getScriptDisplayName(name, t);
    if (!tauriAvailable) {
      setIsRunning(true);
      setSelectedScript(name);
      appendLog(t("error.scriptPreview", { name: displayName, args: args.length ? ` ${args.join(" ")}` : "" }));
      appendLog(t("error.scriptPreviewHint"));
      window.setTimeout(() => setIsRunning(false), 500);
      return;
    }
    try {
      setIsRunning(true);
      setSelectedScript(name);
      setError(null);
      if (name === "parse_favorites.py" || name === "fetch_subtitles.py") {
        const cookieCheck = await validateBilibiliCookie({
          requiredFor: name === "parse_favorites.py" ? "导入收藏夹" : "抓取字幕",
        });
        if (!cookieCheck.valid) {
          appendLog(cookieCheck.message);
          setError(cookieCheck.message);
          return;
        }
      }
      appendLog(t("error.scriptStart", { name: displayName }));
      await invoke("run_script", { scriptName: name, args });
      appendLog(t("error.scriptSuccess", { name: displayName }));
      await fetchVideos();
      await fetchFavoriteFolders();
      await fetchProjects();
      await fetchInsights();
      await fetchSubtitles();
      await fetchProcessingStatus();
      setError(null);
    } catch (err) {
      const errMsg = String(err);
      appendLog(t("error.scriptError", { name: displayName, error: errMsg }));
      if (!errMsg.includes("exit code") && !errMsg.includes("issues")) {
        setError(t("error.scriptFailed"));
      }
    } finally {
      setIsRunning(false);
    }
  }

  async function extractSubtitle(videoId: string) {
    if (!tauriAvailable || subtitleExtracting) return;
    try {
      setSubtitleExtracting(true);
      appendLog(`字幕提取：正在处理 ${videoId}`);
      showToast(`开始抓取字幕：${videoId}`, "neutral");
      await invoke("run_script", {
        scriptName: "fetch_subtitles.py",
        args: ["--root", ".", "--video-id", videoId],
      });
      await fetchSubtitles();
      appendLog(`字幕提取：已完成 ${videoId}`);
      showToast(`字幕抓取完成：${videoId}`, "success");
    } catch (err) {
      appendLog(`字幕提取失败：${String(err)}`);
      setError(String(err));
      showToast(`字幕抓取失败：${videoId}`, "error");
    } finally {
      setSubtitleExtracting(false);
    }
  }

  async function generateInsightForVideo(videoId: string) {
    if (!tauriAvailable || isRunning) return;
    try {
      setIsRunning(true);
      appendLog(`视频洞察：正在生成 ${videoId}`);
      showToast(`开始分析笔记：${videoId}`, "neutral");
      await invoke("run_script", {
        scriptName: "generate_insights.py",
        args: ["--root", ".", "--video-id", videoId, "--limit", "1"],
      });
      await fetchInsights();
      appendLog(`视频洞察：已生成 ${videoId}`);
      showToast(`笔记分析完成：${videoId}`, "success");
    } catch (err) {
      appendLog(`视频洞察失败：${String(err)}`);
      setError(String(err));
      showToast(`笔记分析失败：${videoId}`, "error");
    } finally {
      setIsRunning(false);
    }
  }

  async function generateNoteForVideo(videoId: string) {
    if (!tauriAvailable || isRunning) return;
    try {
      setIsRunning(true);
      appendLog(`笔记生成：正在处理 ${videoId}`);
      showToast(`开始生成基础笔记：${videoId}`, "neutral");
      await invoke("run_script", {
        scriptName: "generate_notes.py",
        args: ["--root", ".", "--video-id", videoId, "--limit", "1"],
      });
      await fetchVideos();
      appendLog(`笔记生成：已完成 ${videoId}`);
      showToast(`基础笔记生成完成：${videoId}`, "success");
    } catch (err) {
      appendLog(`笔记生成失败：${String(err)}`);
      setError(String(err));
      showToast(`基础笔记生成失败：${videoId}`, "error");
    } finally {
      setIsRunning(false);
    }
  }

  async function validateBilibiliCookie(options?: {
    requiredFor?: string;
    silentOnSuccess?: boolean;
  }): Promise<BilibiliCookieValidationResult> {
    if (!tauriAvailable) {
      return { valid: true, message: "preview mode" };
    }
    try {
      const raw: string = await invoke("validate_bilibili_cookie");
      const result = JSON.parse(raw) as BilibiliCookieValidationResult;
      if (result.valid && !options?.silentOnSuccess) {
        appendLog(`Bilibili 登录校验通过：${result.message}`);
      }
      if (!result.valid && options?.requiredFor) {
        return {
          ...result,
          message: `${options.requiredFor}前校验失败：${result.message}`,
        };
      }
      return result;
    } catch (err) {
      const message = `${options?.requiredFor ?? "Bilibili 登录"}校验失败：${String(err)}`;
      return { valid: false, message };
    }
  }

  useEffect(() => {
    fetchVideos();
    fetchFavoriteFolders();
    fetchProjects();
    fetchInsights();
    fetchSubtitles();
    fetchProcessingStatus();
    if (!tauriAvailable) {
      setPipelineStatus(buildPreviewPipelineStatus());
      setInsights(previewInsights);
      setSubtitles(previewSubtitles);
    }
    if (!tauriAvailable) return undefined;
    const unlisten = listen<string>("script-log", (event) => {
      appendLog(event.payload);
    });
    return () => {
      unlisten.then((remove) => remove());
    };
  }, []);

  useEffect(() => {
    if (!tauriAvailable) return;
    if (currentView !== "projects" && currentView !== "knowledge") return;

    const needsRefresh =
      projects.length === 0 ||
      !pipelineStatus?.pipeline.projects_extracted ||
      !pipelineStatus?.pipeline.index_built ||
      !pipelineStatus?.pipeline.validated;

    if (needsRefresh && !knowledgeRefreshNoticeRef.current) {
      knowledgeRefreshNoticeRef.current = true;
      appendLog("知识库索引可能需要刷新：请在知识库页点击刷新，或在处理流程中手动运行项目提取/索引构建。");
    } else if (!needsRefresh) {
      knowledgeRefreshNoticeRef.current = false;
    }
  }, [
    currentView,
    tauriAvailable,
    projects.length,
    pipelineStatus?.pipeline.projects_extracted,
    pipelineStatus?.pipeline.index_built,
    pipelineStatus?.pipeline.validated,
  ]);

  const filteredVideos = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return videos
      .filter((video) => {
        const text = `${video.title} ${video.uploader} ${video.category} ${video.favorite_folder} ${video.id}`.toLowerCase();
        const matchesSearch = !query || text.includes(query);
        const matchesPriority = filterPriority === "all" || video.priority === filterPriority;
        const matchesStatus = filterStatus === "all" || video.status === filterStatus;
        return matchesSearch && matchesPriority && matchesStatus;
      })
      .sort(compareVideosByRecency);
  }, [filterPriority, filterStatus, searchTerm, videos]);

  const favoriteVideos = useMemo(() => {
    const folderOrder = new Map(favoriteFolders.map((folder, index) => [folder.title, index]));
    return [...filteredVideos].sort((a, b) => {
      const aFolder = a.favorite_folder || "未归属";
      const bFolder = b.favorite_folder || "未归属";
      const aRank = folderOrder.has(aFolder) ? folderOrder.get(aFolder)! : Number.MAX_SAFE_INTEGER;
      const bRank = folderOrder.has(bFolder) ? folderOrder.get(bFolder)! : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return compareVideosByRecency(a, b);
    });
  }, [favoriteFolders, filteredVideos]);

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return projects.filter((project) => {
      const text =
        `${project.name} ${project.description} ${project.type} ${project.source_note}`.toLowerCase();
      return !query || text.includes(query);
    });
  }, [projects, searchTerm]);

  const viewScopedVideos = currentView === "favorites" ? favoriteVideos : filteredVideos;
  const activeVideo =
    (selectedVideo && viewScopedVideos.find((video) => video.id === selectedVideo.id)) ||
    viewScopedVideos[0] ||
    videos[0] ||
    null;
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
  const toolbarControls = getToolbarControls({
    currentView,
    isRunning,
    subtitleExtracting,
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
          controls={toolbarControls}
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
        {toast && (
          <div className="mac-toast-stack" key={toast.id}>
            <MacInlineNotice className="mac-toast" tone={toast.tone}>
              <Circle size={10} fill="currentColor" /> {toast.text}
            </MacInlineNotice>
          </div>
        )}
        {error && (
          <MacInlineNotice tone="error">
            <Circle size={10} fill="currentColor" /> {error}
          </MacInlineNotice>
        )}
        {currentView === "dashboard" && (
          <div className="mac-page-scroll custom-scrollbar">
            {isTauriRuntime() ? (
              <ActionCenter
                videos={videos}
                projects={projects}
                onOpenNote={openVideoInNotes}
                onStartLearning={(video) => {
                  if (video.note_path) {
                    openVideoInNotes(video);
                  } else {
                    openVideoInFavorites(video);
                  }
                }}
              />
            ) : (
              renderDashboard({
                activeVideo,
                isPreview: !tauriAvailable,
                isRunning,
                logs,
                openVideoInNotes,
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
                pipelineStatus,
                pipelineLoading,
                pipelineError,
                fetchProcessingStatus,
                pipelineRunning,
                pipelineStep,
                runFullPipeline,
              })
            )}
          </div>
        )}
        {currentView === "favorites" && (
          <Videos
            activeVideo={activeVideo}
            fetchNote={fetchNote}
            favoriteFolders={favoriteFolders}
            filterPriority={filterPriority}
            filterStatus={filterStatus}
            groupByFolder
            onExtractSubtitle={extractSubtitle}
            onGenerateInsight={generateInsightForVideo}
            onGenerateNote={generateNoteForVideo}
            onRunBatchSubtitle={() => runPythonScript("fetch_subtitles.py", ["--root", ".", "--limit", "30"])}
            onRunBatchInsight={() => runPythonScript("generate_insights.py", ["--root", ".", "--limit", "30"])}
            onRunBatchNote={() => runPythonScript("generate_notes.py", ["--root", ".", "--limit", "30"])}
            setFilterPriority={setFilterPriority}
            setFilterStatus={setFilterStatus}
            title={t("view.favorites")}
            updateStatus={updateStatus}
            videos={favoriteVideos}
          />
        )}
        {currentView === "videos" && (
          <Videos
            activeVideo={activeVideo}
            fetchNote={fetchNote}
            favoriteFolders={favoriteFolders}
            filterPriority={filterPriority}
            filterStatus={filterStatus}
            onExtractSubtitle={extractSubtitle}
            onGenerateInsight={generateInsightForVideo}
            onGenerateNote={generateNoteForVideo}
            onRunBatchSubtitle={() => runPythonScript("fetch_subtitles.py", ["--root", ".", "--limit", "30"])}
            onRunBatchInsight={() => runPythonScript("generate_insights.py", ["--root", ".", "--limit", "30"])}
            onRunBatchNote={() => runPythonScript("generate_notes.py", ["--root", ".", "--limit", "30"])}
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
            onExtractSubtitle={extractSubtitle}
            subtitleExtracting={subtitleExtracting}
            videos={filteredVideos}
            insights={insights}
            subtitles={subtitles}
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
            openVideoInNotes,
            openVideoInFavorites,
            noteCount,
            onOpenCandidates: () => setCurrentView("projects"),
            onRefreshKnowledge: () => void runHiddenKnowledgeRefresh(),
            onOpenScripts: () => setCurrentView("scripts"),
            onOpenTags: () => setCurrentView("tags"),
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
          renderThoughts({
            insights,
            openVideoInNotes,
            videos,
          })
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

  if (currentView === "favorites" || currentView === "videos") {
    return undefined;
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
              onClick={() => runPythonScript(action.script)}
      primary
    />
  );
}

function getToolbarControls({
  currentView,
  isRunning,
  subtitleExtracting,
  runPythonScript,
}: {
  currentView: View;
  isRunning: boolean;
  subtitleExtracting: boolean;
  runPythonScript: (name: string, args?: string[]) => void;
}) {
  if (currentView !== "favorites" && currentView !== "videos") {
    return undefined;
  }

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      <MacToolbarButton
        disabled={isRunning}
        icon={<CloudDownload size={14} />}
        label={t("action.importFromBilibili")}
        onClick={() => runPythonScript("parse_favorites.py")}
        primary={currentView === "favorites"}
      />
      <MacToolbarButton
        disabled={isRunning || subtitleExtracting}
        icon={<Subtitles size={14} />}
        label={t("scripts.fetchSubtitles")}
        onClick={() => runPythonScript("fetch_subtitles.py")}
      />
      <MacToolbarButton
        disabled={isRunning}
        icon={<Sparkles size={14} />}
        label={t("scripts.generateInsights")}
        onClick={() => runPythonScript("generate_insights.py")}
      />
      <MacToolbarButton
        disabled={isRunning}
        icon={<FileText size={14} />}
        label={t("scripts.generateNotes")}
        onClick={() => runPythonScript("generate_notes.py")}
      />
    </div>
  );
}

function getStaleness(lastUpdated: string | undefined): { stale: boolean; hours: number } {
  if (!lastUpdated) return { stale: false, hours: 0 };
  const updated = new Date(lastUpdated);
  const now = new Date();
  const hours = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);
  return { stale: hours > 24, hours: Math.round(hours) };
}

function renderDashboard({
  activeVideo,
  isPreview,
  isRunning,
  logs,
  openVideoInNotes,
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
  pipelineStatus,
  pipelineLoading,
  pipelineError,
  fetchProcessingStatus,
  pipelineRunning,
  pipelineStep,
  runFullPipeline,
}: {
  activeVideo: Video | null;
  isPreview: boolean;
  isRunning: boolean;
  logs: string[];
  openVideoInNotes: (video: Video) => void;
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
  pipelineStatus: ProcessingStatus | null;
  pipelineLoading: boolean;
  pipelineError: string | null;
  fetchProcessingStatus: () => void;
  pipelineRunning: boolean;
  pipelineStep: string | null;
  runFullPipeline: () => void;
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
              onClick={() => runPythonScript("parse_favorites.py")}
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
              onClick={() => runPythonScript("parse_favorites.py")}
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

      {/* Pipeline Status */}
      <section className="dashboard-board" style={{ margin: "0 0 20px" }}>
        <header className="dashboard-board-head">
          <div>
            <h3>Pipeline Status</h3>
            <span>Real knowledge pipeline state</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <MacToolbarButton
              disabled={pipelineLoading || isRunning || pipelineRunning}
              icon={<Activity size={14} />}
              label={pipelineLoading ? "Loading..." : "Refresh"}
              onClick={() => fetchProcessingStatus()}
            />
            <MacToolbarButton
              disabled={isRunning || pipelineRunning}
              icon={<ShieldCheck size={14} />}
              label={isRunning ? t("toolbar.running") : "Run Validation"}
              onClick={() => runPythonScript("validate_knowledge_base.py")}
            />
            <MacToolbarButton
              disabled={isRunning || pipelineRunning}
              icon={<Activity size={14} />}
              label={pipelineRunning ? `Running: ${pipelineStep ?? "..."}` : "Run Full Pipeline"}
              onClick={() => runFullPipeline()}
              primary
            />
          </div>
        </header>
        {pipelineRunning && pipelineStep && (
          <div style={{ padding: "12px 20px", color: "var(--text-secondary, #888)" }}>
            <MacInlineNotice tone="neutral">
              <Activity size={12} /> Running pipeline: {pipelineStep}
            </MacInlineNotice>
          </div>
        )}
        {pipelineLoading && (
          <div style={{ padding: "16px 20px", color: "var(--text-secondary, #888)" }}>
            Loading pipeline status...
          </div>
        )}
        {pipelineError && !pipelineLoading && (
          <div style={{ padding: "16px 20px" }}>
            <MacInlineNotice tone="error">
              <Circle size={10} fill="currentColor" /> Pipeline Status unavailable: {pipelineError}
            </MacInlineNotice>
          </div>
        )}
        {pipelineStatus && !pipelineLoading && !pipelineError && (
          <>
            <div className="dashboard-metrics-grid" style={{ margin: 0, padding: "0 20px" }}>
              <div className="metric-card">
                <span>Videos</span>
                <strong>{pipelineStatus.total_videos}</strong>
              </div>
              <div className="metric-card">
                <span>Pending</span>
                <strong>{pipelineStatus.pending}</strong>
              </div>
              <div className="metric-card">
                <span>Notes</span>
                <strong>{pipelineStatus.note_created}</strong>
              </div>
              <div className="metric-card">
                <span>Projects</span>
                <strong>{pipelineStatus.projects_extracted}</strong>
              </div>
              <div className="metric-card">
                <span>Reviewed</span>
                <strong>{pipelineStatus.reviewed}</strong>
              </div>
              <div className="metric-card">
                <span>Last Updated</span>
                <strong>{pipelineStatus.last_updated}</strong>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "12px 20px 16px", flexWrap: "wrap" }}>
              {([
                ["Manifest", pipelineStatus.pipeline.manifest_generated],
                ["Notes", pipelineStatus.pipeline.notes_generated],
                ["Projects", pipelineStatus.pipeline.projects_extracted],
                ["Index", pipelineStatus.pipeline.index_built],
                ["Validated", pipelineStatus.pipeline.validated],
              ] as const).map(([label, ok]) => (
                <MacTagPill key={label} tone={ok ? "success" : "critical"}>
                  {ok ? `${label} ✓` : `${label} ✗`}
                </MacTagPill>
              ))}
            </div>
            {(() => {
              const { stale, hours } = getStaleness(pipelineStatus.last_updated);
              if (stale) {
                return (
                  <MacInlineNotice tone="neutral">
                    <Circle size={10} fill="currentColor" /> Data is {hours}h old. Consider running the pipeline to refresh.
                  </MacInlineNotice>
                );
              }
              if (!Object.values(pipelineStatus.pipeline).every(Boolean)) {
                return (
                  <MacInlineNotice tone="neutral">
                    <Circle size={10} fill="currentColor" /> Pipeline status may be stale. Some flags are not complete.
                  </MacInlineNotice>
                );
              }
              return null;
            })()}
            <div style={{ padding: "0 20px 16px" }}>
              <div
                style={{
                  border: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))",
                  borderRadius: 16,
                  padding: 16,
                  background: "var(--panel-elevated, rgba(255, 255, 255, 0.6))",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <strong style={{ fontSize: 14 }}>Runtime Evidence Capture</strong>
                  <span style={{ color: "var(--text-secondary, #666)", fontSize: 12 }}>
                    Fixed evidence targets for UI-visible tasks. Capture these paths during runtime verification.
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {RUNTIME_EVIDENCE_CAPTURE_GUIDE.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "rgba(255, 255, 255, 0.55)",
                        border: "1px solid rgba(0, 0, 0, 0.06)",
                        display: "grid",
                        gap: 4,
                        minHeight: 72,
                      }}
                    >
                      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary, #666)" }}>
                        {item.label}
                      </span>
                      <span style={{ fontSize: 13, lineHeight: 1.45, wordBreak: "break-word" }}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: "0 20px 16px" }}>
              <div
                style={{
                  border: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))",
                  borderRadius: 16,
                  padding: 16,
                  background: "rgba(248, 250, 252, 0.72)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <strong style={{ fontSize: 14 }}>Runtime Evidence Log</strong>
                    <span style={{ color: "var(--text-secondary, #666)", fontSize: 12 }}>
                      Latest runtime verification evidence for UI-visible tasks.
                    </span>
                  </div>
                  <MacTagPill tone={runtimeEvidenceStatus.status === "PASS" ? "success" : runtimeEvidenceStatus.status === "MISSING" ? "critical" : "warm"}>
                    {runtimeEvidenceStatus.status}
                  </MacTagPill>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {[
                    ["Last route URL", runtimeEvidenceStatus.lastRouteUrl],
                    ["Last screenshot path", runtimeEvidenceStatus.lastScreenshotPath],
                    ["Last report path", runtimeEvidenceStatus.lastReportPath],
                    ["Last verified at", runtimeEvidenceStatus.lastVerifiedAt],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "rgba(255, 255, 255, 0.72)",
                        border: "1px solid rgba(0, 0, 0, 0.06)",
                        display: "grid",
                        gap: 4,
                        minHeight: 72,
                      }}
                    >
                      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary, #666)" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 13, lineHeight: 1.45, wordBreak: "break-word" }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <MacInlineNotice tone={runtimeEvidenceStatus.status === "PASS" ? "neutral" : runtimeEvidenceStatus.status === "MISSING" ? "error" : "neutral"}>
                  <Circle size={10} fill="currentColor" /> {runtimeEvidenceStatus.evidenceRule}
                </MacInlineNotice>
              </div>
            </div>
          </>
        )}
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
              onClick={() => activeVideo && openVideoInNotes(activeVideo)}
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
                <button
                  className={cn("dashboard-feed-row", activeVideo?.id === video.id && "is-active")}
                  key={video.id}
                  onClick={() => openVideoInNotes(video)}
                  type="button"
                >
                  <div className="dashboard-feed-main">
                    <div className="dashboard-feed-title">{video.title}</div>
                    <div className="dashboard-feed-meta">
                      <span>{video.uploader || "-"}</span>
                      <span>{video.favorite_folder || "Favorites"}</span>
                      <span>{formatVideoTime(video.collected_at || video.pubdate)}</span>
                    </div>
                  </div>
                  <div className="dashboard-feed-tags">
                    <MacTagPill tone={priorityTone(video.priority)}>{video.priority}</MacTagPill>
                    <MacStatusPill tone={statusTone(video.status)}>{statusLabel(video.status)}</MacStatusPill>
                  </div>
                </button>
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
              onClick={() => runPythonScript("parse_favorites.py")}
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
                <a className="dashboard-feed-row" href={project.url} key={project.url} rel="noreferrer" target="_blank">
                  <div className="dashboard-feed-main">
                    <div className="dashboard-feed-title">{project.name}</div>
                    <div className="dashboard-feed-meta">
                      <span>{localizeLabel(project.type)}</span>
                      <span>{project.source_note}</span>
                    </div>
                  </div>
                  <MacTagPill tone={priorityTone(project.priority)}>{project.priority}</MacTagPill>
                </a>
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
                      <span>{video.uploader || "-"}</span>
                      <span>{video.favorite_folder || "Favorites"}</span>
                      <span>{formatVideoTime(video.collected_at || video.pubdate)}</span>
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
  openVideoInNotes,
  openVideoInFavorites,
  noteCount,
  onOpenCandidates,
  onRefreshKnowledge,
  onOpenScripts,
  onOpenTags,
  pendingCount,
  projects,
  reviewedCount,
  videos,
}: {
  openVideoInNotes: (video: Video) => void;
  openVideoInFavorites: (video: Video) => void;
  noteCount: number;
  onOpenCandidates: () => void;
  onRefreshKnowledge: () => void;
  onOpenScripts: () => void;
  onOpenTags: () => void;
  pendingCount: number;
  projects: Project[];
  reviewedCount: number;
  videos: Video[];
}) {
  const folders = [
    { name: "manifest", count: videos.length, onClick: onOpenVideoFavorites },
    { name: "notes/raw", count: noteCount, onClick: onOpenNotes },
    { name: "projects", count: projects.length, onClick: onOpenCandidates },
    { name: "reports", count: 2, onClick: onOpenScripts },
    { name: "thoughts", count: 3, onClick: onOpenTags },
  ];

  function onOpenVideoFavorites() {
    if (videos[0]) {
      openVideoInFavorites(videos[0]);
      return;
    }
    onRefreshKnowledge();
  }

  function onOpenNotes() {
    if (videos[0]) {
      openVideoInNotes(videos[0]);
      return;
    }
    onRefreshKnowledge();
  }

  const p0Count = videos.filter((video) => video.priority === "P0").length;
  const topProjects = [...projects]
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 6);

  return (
    <MacSplitView columns="260px minmax(0, 1fr) 340px">
      <section className="mac-list-pane custom-scrollbar">
        <div className="mac-panel-header">
          <h2>{t("kb.biliKnowledge")}</h2>
          <HardDrive size={15} />
        </div>
        <div className="mac-native-list">
          {folders.map((folder) => (
            <button className="kb-folder-row" key={folder.name} onClick={folder.onClick} type="button">
              <FolderTree size={14} className="kb-folder-icon" />
              <div>
                <div className="mac-row-title">{localizeLabel(folder.name)}</div>
                <div className="mac-row-meta">{t("kb.items", { count: folder.count })}</div>
              </div>
            </button>
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
              <div className="mb-4 flex flex-wrap gap-2">
                <MacToolbarButton label={t("kb.openCandidates")} onClick={onOpenCandidates} primary />
                <MacToolbarButton
                  label={t("kb.openTopRepo")}
                  onClick={() => topProjects[0] && openUrl(topProjects[0].url)}
                />
                <MacToolbarButton label={t("kb.refreshKnowledge")} onClick={onRefreshKnowledge} />
              </div>
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
                  <button
                    className="kb-note-row w-full text-left"
                    key={video.id}
                    onClick={() => openVideoInNotes(video)}
                    type="button"
                  >
                    <div className="kb-note-main">
                      <div className="kb-note-title">{video.id}.md</div>
                      <div className="kb-note-subtitle">{video.title}</div>
                    </div>
                    <div className="kb-note-status">
                      <MacTagPill tone={priorityTone(video.priority)}>{video.priority}</MacTagPill>
                    </div>
                  </button>
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

            <section className="bk-panel kb-secondary-panel">
              <header className="panel-header">
                <h2>{t("kb.recentRepos")}</h2>
                <span>{projects.length}</span>
              </header>
              <div className="kb-note-list">
                {topProjects.map((project) => (
                  <a
                    className="kb-note-row"
                    href={project.url}
                    key={project.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <div className="kb-note-main">
                      <div className="kb-note-title">{project.name}</div>
                      <div className="kb-note-subtitle">
                        {[project.language, project.source_note].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="kb-note-status flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Star size={13} />
                        {project.stars ?? 0}
                      </span>
                      <ExternalLink size={14} />
                    </div>
                  </a>
                ))}
                {topProjects.length === 0 ? (
                  <div className="kb-note-row">
                    <div className="kb-note-main">
                      <div className="kb-note-title">-</div>
                      <div className="kb-note-subtitle">{t("dashboard.noCandidatesHint")}</div>
                    </div>
                  </div>
                ) : null}
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

function renderThoughts({
  insights,
  openVideoInNotes,
  videos,
}: {
  insights: VideoInsight[];
  openVideoInNotes: (video: Video) => void;
  videos: Video[];
}) {
  const insightMap = new Map(insights.map((item) => [item.video_id, item]));
  const cards = [...videos]
    .sort(compareVideosByRecency)
    .slice(0, 24)
    .map((video) => ({
      video,
      insight: insightMap.get(video.id) ?? null,
    }));

  return (
    <div className="mac-page-scroll custom-scrollbar">
      <div className="dashboard-page">
        <section className="dashboard-hero">
          <div className="dashboard-hero-main">
            <div className="dashboard-hero-badge">{t("kb.thoughts")}</div>
            <h1 className="dashboard-hero-title">按最新内容整理的思考卡片</h1>
            <p className="dashboard-hero-text">这里展示最近收藏内容的核心判断、适用场景与下一步跟进入口。</p>
          </div>
        </section>
        <section className="dashboard-body-grid">
          {cards.map(({ video, insight }) => (
            <article className="dashboard-board" key={video.id}>
              <header className="dashboard-board-head">
                <div>
                  <h3>{video.title}</h3>
                  <span>
                    {video.uploader || "-"} · {video.favorite_folder || "默认收藏夹"} · {formatVideoTime(video.collected_at || video.pubdate)}
                  </span>
                </div>
                <MacToolbarButton
                  label={t("inspector.openNote")}
                  onClick={() => openVideoInNotes(video)}
                  primary
                />
              </header>
              <div className="dashboard-board-feed custom-scrollbar">
                <div className="dashboard-feed-row">
                  <div className="dashboard-feed-main">
                    <div className="dashboard-feed-title">核心摘要</div>
                    <div className="dashboard-feed-meta">
                      <span>{insight?.summary || "暂未生成 AI 洞察，点击打开笔记继续处理。"}</span>
                    </div>
                  </div>
                </div>
                {(insight?.problem_statements?.slice(0, 3) || []).map((item, index) => (
                  <div className="dashboard-feed-row" key={`${video.id}-problem-${index}`}>
                    <div className="dashboard-feed-main">
                      <div className="dashboard-feed-title">解决的问题</div>
                      <div className="dashboard-feed-meta">
                        <span>{item}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {(insight?.use_cases?.slice(0, 3) || []).map((item, index) => (
                  <div className="dashboard-feed-row" key={`${video.id}-usecase-${index}`}>
                    <div className="dashboard-feed-main">
                      <div className="dashboard-feed-title">适用场景</div>
                      <div className="dashboard-feed-meta">
                        <span>{item}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
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
                  <div className="script-row-subtitle">{script.detail}</div>
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
