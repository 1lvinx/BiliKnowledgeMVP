import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  Library,
  Moon,
  Plus,
  PlaySquare,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
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
import { ActionCenter } from "./components/ActionCenter";
import { previewVideos, previewProjects } from "./data/demo";
import { previewInsights } from "./data/demo-insights";
import { previewSubtitles } from "./data/demo-subtitles";
import { runtimeEvidenceStatus } from "./data/runtimeEvidenceStatus";
import { compareVideosByRecency, formatVideoTime, localizeLabel, priorityTone, setDisplayTimezone, statusLabel, statusTone } from "./lib/video-utils";
import { cn } from "./lib/utils";
import { getSavedLanguage, saveLanguage, setLanguage as setI18nLanguage, t } from "./i18n";
import {
  PREVIEW_CONFIG_STORAGE_KEY,
  RUNTIME_EVIDENCE_CAPTURE_GUIDE,
  buildPreviewPipelineStatus,
  buildScriptCatalog,
  buildTaskDisplay,
  buildViewMeta,
  getScriptDisplayName,
  getScriptScopeLabel,
  getScriptStateLabel,
  getScriptStateTone,
  previewNote,
  type AppearancePreference,
  type BilibiliCookieValidationResult,
  type DensityPreference,
  type FontPreference,
  type ScriptItem,
  type ScriptRunState,
  type TaskDisplay,
  type TaskLightState,
  type ToastMessage,
  type VideoTaskStage,
  type VideoTaskState,
  type VideoTaskSnapshot,
  type View,
  type ViewMode,
} from "./app/app-model";
import "./App.css";

const LazyLogViewer = lazy(() => import("./components/LogViewer").then((module) => ({ default: module.LogViewer })));
const LazySettingsView = lazy(() => import("./components/SettingsView").then((module) => ({ default: module.SettingsView })));
const LazyVideos = lazy(() => import("./pages/Videos").then((module) => ({ default: module.Videos })));
const LazyNotes = lazy(() => import("./pages/Notes").then((module) => ({ default: module.Notes })));
const LazyCandidates = lazy(() => import("./pages/Candidates").then((module) => ({ default: module.Candidates })));
const LazyReactMarkdown = lazy(() => import("react-markdown"));

function isTauriRuntime() {
  return isTauri() || (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
}

interface UserIdea {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const PREVIEW_USER_IDEAS_STORAGE_KEY = "biliknowledge.preview.userIdeas";

function createIdeaId() {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}


function extractScriptFailureReason(message: string): string | null {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[ERROR\]\s*/, "").trim())
    .filter(Boolean);
  const reasonLine = [...lines].reverse().find((line) => /\[错误\]|失败|缺少|not found|No module named|ModuleNotFoundError|校验/.test(line));
  if (!reasonLine) return null;
  return reasonLine.replace(/^\[错误\]\s*/, "");
}

function humanizeScriptError(error: unknown, scriptName?: string): string {
  const message = String(error);
  const scriptReason = extractScriptFailureReason(message);
  if (message.includes("exit code")) {
    if (scriptName === "fetch_subtitles.py") {
      return scriptReason ?? "字幕抓取或校验失败：当前视频可能没有可用字幕，或字幕疑似错配。请重新抓取字幕，或使用本地转写。";
    }
    if (scriptName === "transcribe_subtitles.py") {
      return scriptReason ?? "本地转写失败：缺少 Python 依赖或视频音频不可访问。请安装 yt-dlp、FunASR、modelscope、torch、pydub 后重试。";
    }
    if (scriptName === "generate_insights.py") {
      return scriptReason ?? "洞察生成失败：需要先获得有效字幕；如果字幕缺失或错配，请先抓取字幕或本地转写。";
    }
    if (scriptName === "generate_notes.py") {
      return scriptReason ?? "笔记生成失败：需要有效字幕和已生成洞察。请先完成字幕校验和洞察生成。";
    }
    return scriptReason ?? "脚本执行失败：请查看日志中的具体错误，并按当前视频状态继续处理。";
  }
  return scriptReason ?? message;
}

function GlobalTaskStatusCard({ task }: { task: TaskDisplay }) {
  return (
    <article className={`global-task-card tone-${task.light}`}>
      <div className="global-task-card-head">
        <span className={`global-task-light is-${task.light}`} />
        <strong>{task.label}</strong>
      </div>
      <div className="global-task-card-state">{task.statusText}</div>
    </article>
  );
}

function GlobalTaskStatusPanel({
  video,
  subtitle,
  insight,
  noteContent,
  taskState,
  scriptStates,
}: {
  video: Video | null;
  subtitle: VideoSubtitle | null;
  insight: VideoInsight | null;
  noteContent: string | null;
  taskState: VideoTaskState | null;
  scriptStates: Record<string, ScriptRunState>;
}) {
  const hasStructuredNote = Boolean(video?.note_ready || (noteContent && noteContent.trim().length > 0));
  const subtitleTask = buildTaskDisplay("字幕", "subtitle", taskState?.subtitle, Boolean(subtitle), subtitle, insight);
  const insightTask = buildTaskDisplay("洞察", "insight", taskState?.insight, Boolean(insight), subtitle, insight);
  const noteTask = buildTaskDisplay("笔记", "note", taskState?.note, hasStructuredNote, subtitle, insight);
  const tasks = [subtitleTask, insightTask, noteTask];
  const runningScript = Object.entries(scriptStates).find(([, state]) => state.state === "running");
  const failedScript = Object.entries(scriptStates).find(([, state]) => state.state === "error");
  const blockedScript = Object.entries(scriptStates).find(([, state]) => state.state === "blocked");
  const runningTask = tasks.find((task) => task.statusText === "进行中");
  const blockedTask = tasks.find((task) => task.statusText === "阻塞");
  const failedTask = tasks.find((task) => task.statusText === "失败");
  const allDone = tasks.every((task) => task.statusText === "完成");
  const currentPhase = runningScript
    ? getScriptDisplayName(runningScript[0], t)
    : runningTask?.label ?? blockedTask?.label ?? failedTask?.label ?? blockedScript?.[0] ?? failedScript?.[0] ?? (allDone ? "全部阶段" : "待开始");
  const overallState = runningScript || runningTask
    ? "进行中"
    : failedScript || failedTask
      ? "失败"
      : blockedScript || blockedTask
        ? "阻塞"
        : allDone
          ? "完成"
          : "待开始";
  const overallLight: TaskLightState = runningScript || runningTask || blockedScript || blockedTask
    ? "yellow"
    : failedScript || failedTask
      ? "red"
      : allDone
        ? "green"
        : "red";
  const latestTimestamp = [
    runningScript?.[1].startedAt,
    failedScript?.[1].endedAt,
    blockedScript?.[1].endedAt,
    subtitleTask.endedAt,
    insightTask.endedAt,
    noteTask.endedAt,
    subtitleTask.startedAt,
    insightTask.startedAt,
    noteTask.startedAt,
  ].filter(Boolean)[0];

  return (
    <section className="mac-toolbar-status">
      <div className="mac-toolbar-status-trigger">
        <div className="mac-sidebar-status-pill">
          <span className={`global-task-light is-${overallLight}`} />
          <strong>{overallState}</strong>
        </div>
      </div>
      <div className="mac-toolbar-status-popover">
        <div className="mac-sidebar-status-header">
          <div>
            <strong>{video?.title || "当前未选中视频"}</strong>
            <span>{video ? `${video.id} · ${video.uploader || "-"} · ${video.favorite_folder || "全部收藏夹"}` : "切换任意视频后同步显示处理进度"}</span>
          </div>
        </div>
        <div className="mac-sidebar-status-summary">
          <div className="mac-sidebar-status-pill">
            <span className={`global-task-light is-${overallLight}`} />
            <strong>{overallState}</strong>
          </div>
          <div className="mac-sidebar-status-summary-meta">
            <div className="mac-sidebar-status-phase">
              <span>阶段</span>
              <strong>{currentPhase}</strong>
            </div>
            <div className="mac-sidebar-status-phase is-time">
              <span>时间</span>
              <strong>{latestTimestamp || "-"}</strong>
            </div>
          </div>
        </div>
        <div className="mac-sidebar-status-grid">
          <GlobalTaskStatusCard task={subtitleTask} />
          <GlobalTaskStatusCard task={insightTask} />
          <GlobalTaskStatusCard task={noteTask} />
        </div>
      </div>
    </section>
  );
}
function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const viewMode: ViewMode = "list";
  const [appearance, setAppearance] = useState<AppearancePreference>("system");
  const [fontPreference, setFontPreference] = useState<FontPreference>("system");
  const [densityPreference, setDensityPreference] = useState<DensityPreference>("comfortable");
  const [timezonePreference, setTimezonePreference] = useState("Asia/Singapore");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [favoriteFolders, setFavoriteFolders] = useState<FavoriteFolder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [insights, setInsights] = useState<VideoInsight[]>([]);
  const [subtitles, setSubtitles] = useState<VideoSubtitle[]>([]);
  const [userIdeas, setUserIdeas] = useState<UserIdea[]>([]);
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
      void persistPreferencePatch({ language: lang }).catch((err) => appendLog(`语言偏好保存失败：${String(err)}`));
    }
  }

  function handleAppearanceChange(nextAppearance: AppearancePreference) {
    setAppearance(nextAppearance);
    void persistPreferencePatch({ appearance: nextAppearance }).catch((err) => appendLog(`外观偏好保存失败：${String(err)}`));
  }

  function handleDensityChange(nextDensity: DensityPreference) {
    setDensityPreference(nextDensity);
    void persistPreferencePatch({ density: nextDensity }).catch((err) => appendLog(`密度偏好保存失败：${String(err)}`));
  }

  function handleTimezoneChange(nextTimezone: string) {
    setTimezonePreference(nextTimezone);
    setDisplayTimezone(nextTimezone);
    void persistPreferencePatch({ timezone: nextTimezone }).catch((err) => appendLog(`时区偏好保存失败：${String(err)}`));
  }

  async function persistPreferencePatch(
    patch: Partial<{
      appearance: AppearancePreference;
      fontFamily: FontPreference;
      density: DensityPreference;
      timezone: string;
      language: string;
    }>,
  ) {
    if (!tauriAvailable) {
      const cached = window.localStorage.getItem(PREVIEW_CONFIG_STORAGE_KEY);
      const parsed = cached ? JSON.parse(cached) : {};
      const preferences = { ...(parsed.preferences ?? {}), ...patch };
      window.localStorage.setItem(PREVIEW_CONFIG_STORAGE_KEY, JSON.stringify({ ...parsed, preferences }));
      return;
    }

    const raw: string = await invoke("get_config");
    const parsed = JSON.parse(raw);
    const preferences = { ...(parsed.preferences ?? {}), ...patch };
    await invoke("save_config", { config: JSON.stringify({ ...parsed, preferences }) });
  }

  async function loadUserIdeas() {
    if (!tauriAvailable) {
      const cached = window.localStorage.getItem(PREVIEW_USER_IDEAS_STORAGE_KEY);
      setUserIdeas(cached ? JSON.parse(cached) : []);
      return;
    }
    const raw: string = await invoke("get_user_ideas");
    setUserIdeas(JSON.parse(raw));
  }

  async function persistUserIdeas(nextIdeas: UserIdea[]) {
    setUserIdeas(nextIdeas);
    if (!tauriAvailable) {
      window.localStorage.setItem(PREVIEW_USER_IDEAS_STORAGE_KEY, JSON.stringify(nextIdeas));
      return;
    }
    await invoke("save_user_ideas", { ideas: JSON.stringify(nextIdeas) });
  }

  async function addUserIdea(input: { title: string; content: string; tags: string[] }) {
    const now = new Date().toISOString();
    const nextIdea: UserIdea = {
      id: createIdeaId(),
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
      created_at: now,
      updated_at: now,
    };
    if (!nextIdea.title && !nextIdea.content) return;
    await persistUserIdeas([nextIdea, ...userIdeas]);
    appendLog(`已保存想法：${nextIdea.title || nextIdea.content.slice(0, 18)}`);
  }

  async function updateUserIdea(id: string, input: { title: string; content: string; tags: string[] }) {
    const now = new Date().toISOString();
    await persistUserIdeas(userIdeas.map((idea) => (
      idea.id === id
        ? {
            ...idea,
            title: input.title.trim(),
            content: input.content.trim(),
            tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
            updated_at: now,
          }
        : idea
    )));
    appendLog(`已更新想法：${input.title.trim() || input.content.trim().slice(0, 18)}`);
  }

  async function deleteUserIdea(id: string) {
    await persistUserIdeas(userIdeas.filter((idea) => idea.id !== id));
  }

  async function setAppearanceAndPersist(nextAppearance: AppearancePreference) {
    setAppearance(nextAppearance);
    try {
      await persistPreferencePatch({ appearance: nextAppearance });
    } catch (err) {
      appendLog(`外观偏好保存失败：${String(err)}`);
    }
  }

  const viewMeta = useMemo(() => buildViewMeta(t), [language]);
  const scriptCatalog = useMemo(() => buildScriptCatalog(t), [language]);
  const [selectedScript, setSelectedScript] = useState("validate_knowledge_base.py");
  const [scriptStates, setScriptStates] = useState<Record<string, ScriptRunState>>({});
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [videoTaskStates, setVideoTaskStates] = useState<Record<string, VideoTaskState>>({});
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

  function nowStamp() {
    return new Date().toLocaleString(undefined, {
      timeZone: timezonePreference,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function updateScriptState(scriptName: string, patch: Partial<ScriptRunState>) {
    setScriptStates((prev) => ({
      ...prev,
      [scriptName]: {
        ...(prev[scriptName] || {}),
        state: prev[scriptName]?.state ?? "idle",
        ...patch,
      },
    }));
  }

  function updateVideoTaskState(videoId: string, stage: VideoTaskStage, patch: Partial<VideoTaskSnapshot>) {
    setVideoTaskStates((prev) => ({
      ...prev,
      [videoId]: {
        subtitle: prev[videoId]?.subtitle,
        insight: prev[videoId]?.insight,
        note: prev[videoId]?.note,
        [stage]: {
          state: "idle",
          ...(prev[videoId]?.[stage] || {}),
          ...patch,
        },
      },
    }));
  }

  async function fetchVideos(): Promise<Video[]> {
    if (!tauriAvailable) {
      setVideos(previewVideos);
      setError(null);
      return previewVideos;
    }
    try {
      const data: string = await invoke("get_videos");
      const parsed = JSON.parse(data) as Video[];
      setVideos(parsed);
      setError(null);
      return parsed;
    } catch {
      setError(t("error.syncFailed"));
      return [];
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
        Object.entries(counts)
          .map(([title, media_count]) => ({ id: title, title, media_count, latest_ts: 0, latest_collected_at: "" }))
          .sort((a, b) => a.title.localeCompare(b.title, "zh-CN")),
      );
      return;
    }
    try {
      const data: string = await invoke("get_favorite_folders");
      const parsed = JSON.parse(data);
      setFavoriteFolders(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFavoriteFolders([]);
    }
  }

  async function fetchProjects() {
    if (!tauriAvailable) {
      setProjects(previewProjects);
      return previewProjects;
    }
    try {
      const data: string = await invoke("get_projects");
      const parsed = JSON.parse(data) as Project[];
      setProjects(parsed);
      return parsed;
    } catch {
      setProjects([]);
      return [];
    }
  }

  async function updateProjectReviewStatus(projectUrl: string, status: "candidate" | "valuable" | "archived") {
    if (!tauriAvailable) {
      setProjects((current) =>
        current.map((project) =>
          project.url === projectUrl ? { ...project, status, need_verify: status === "candidate" } : project,
        ),
      );
      setSelectedProject((current) =>
        current?.url === projectUrl ? { ...current, status, need_verify: status === "candidate" } : current,
      );
      return;
    }
    try {
      await invoke("update_project_status", { url: projectUrl, status });
      const updatedProjects = await fetchProjects();
      const updatedProject = updatedProjects.find((project) => project.url === projectUrl);
      if (updatedProject) {
        setSelectedProject(updatedProject);
      }
      showToast(t("projects.statusUpdated"), "success");
    } catch (err) {
      showToast(`${t("projects.statusUpdateFailed")}: ${String(err)}`, "error");
      throw err;
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
    let currentPipelineStep: (typeof PIPELINE_STEPS)[number] | null = null;
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
        currentPipelineStep = script;
        setPipelineStep(script);
        updateScriptState(script, {
          state: "running",
          startedAt: nowStamp(),
          endedAt: undefined,
          lastMessage: `正在执行 ${getScriptDisplayName(script, t)}`,
        });
        appendLog(`流程执行：正在处理 ${getScriptDisplayName(script, t)}`);
        await invoke("run_script", { scriptName: script, args: [] });
        appendLog(`流程执行：${getScriptDisplayName(script, t)} 已完成`);
        updateScriptState(script, {
          state: "success",
          endedAt: nowStamp(),
          lastMessage: `${getScriptDisplayName(script, t)} 已完成`,
          lastOutput: `流程执行：${getScriptDisplayName(script, t)} 已完成`,
        });
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
      if (currentPipelineStep) {
        updateScriptState(currentPipelineStep, {
          state: "error",
          endedAt: nowStamp(),
          lastMessage: String(err),
          lastOutput: `流程执行失败：${String(err)}`,
        });
      }
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
      if (!video.note_path) {
        setNoteContent(t("inspector.noteMissing"));
        showToast(`笔记未生成：${video.id}`, "error");
        return;
      }
      setNoteContent(t("error.loadingNote"));
      const content: string = await invoke("get_note", { notePath: video.note_path });
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

  async function addManualVideo(input: string, title?: string) {
    if (!tauriAvailable) {
      showToast("预览模式不能写入视频清单。", "error");
      return;
    }
    try {
      const message: string = await invoke("add_manual_video", { input, title: title ?? null });
      showToast(message, "success");
      appendLog(message);
      await fetchVideos();
      await fetchFavoriteFolders();
      setCurrentView("favorites");
    } catch (err) {
      const message = `添加视频失败：${String(err)}`;
      showToast(message, "error");
      appendLog(message);
      throw err;
    }
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
      updateScriptState(name, {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        lastMessage: `正在执行 ${displayName}`,
      });
      if (name === "parse_favorites.py" || name === "fetch_subtitles.py") {
        const cookieCheck = await validateBilibiliCookie({
          requiredFor: name === "parse_favorites.py" ? "导入收藏夹" : "抓取字幕",
        });
        if (!cookieCheck.valid) {
          appendLog(cookieCheck.message);
          setError(cookieCheck.message);
          updateScriptState(name, {
            state: "blocked",
            endedAt: nowStamp(),
            lastMessage: cookieCheck.message,
            lastOutput: cookieCheck.message,
          });
          return;
        }
      }
      appendLog(t("error.scriptStart", { name: displayName }));
      await invoke("run_script", { scriptName: name, args });
      appendLog(t("error.scriptSuccess", { name: displayName }));
      updateScriptState(name, {
        state: "success",
        endedAt: nowStamp(),
        lastMessage: `${displayName} 执行完成`,
        lastOutput: t("error.scriptSuccess", { name: displayName }),
      });
      await fetchVideos();
      await fetchFavoriteFolders();
      await fetchProjects();
      await fetchInsights();
      await fetchSubtitles();
      await fetchProcessingStatus();
      setError(null);
    } catch (err) {
      const errMsg = humanizeScriptError(err, name);
      appendLog(t("error.scriptError", { name: displayName, error: errMsg }));
      updateScriptState(name, {
        state: "error",
        endedAt: nowStamp(),
        lastMessage: errMsg,
        lastOutput: t("error.scriptError", { name: displayName, error: errMsg }),
      });
      setError(errMsg);
    } finally {
      setIsRunning(false);
    }
  }

  async function extractSubtitle(videoId: string) {
    if (!tauriAvailable || subtitleExtracting) return;
    try {
      setSubtitleExtracting(true);
      updateScriptState("fetch_subtitles.py", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        lastMessage: `正在抓取字幕：${videoId}`,
      });
      updateVideoTaskState(videoId, "subtitle", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        message: "正在抓取字幕",
      });
      appendLog(`字幕提取：正在处理 ${videoId}`);
      showToast(`开始抓取字幕：${videoId}`, "neutral");
      await invoke("run_script", {
        scriptName: "fetch_subtitles.py",
        args: ["--root", ".", "--video-id", videoId],
      });
      await fetchSubtitles();
      appendLog(`字幕提取：已完成 ${videoId}`);
      updateScriptState("fetch_subtitles.py", {
        state: "success",
        endedAt: nowStamp(),
        lastMessage: `字幕抓取完成：${videoId}`,
        lastOutput: `字幕提取：已完成 ${videoId}`,
      });
      updateVideoTaskState(videoId, "subtitle", {
        state: "success",
        endedAt: nowStamp(),
        message: "字幕抓取完成",
      });
      showToast(`字幕抓取完成：${videoId}`, "success");
    } catch (err) {
      const errMsg = humanizeScriptError(err, "fetch_subtitles.py");
      appendLog(`字幕提取失败：${errMsg}`);
      setError(errMsg);
      updateScriptState("fetch_subtitles.py", {
        state: "error",
        endedAt: nowStamp(),
        lastMessage: errMsg,
        lastOutput: `字幕提取失败：${errMsg}`,
      });
      updateVideoTaskState(videoId, "subtitle", {
        state: "error",
        endedAt: nowStamp(),
        message: errMsg,
      });
      showToast(`字幕抓取失败：${videoId}`, "error");
    } finally {
      setSubtitleExtracting(false);
    }
  }

  async function transcribeSubtitle(videoId: string) {
    if (!tauriAvailable || subtitleExtracting || isRunning) return;
    try {
      setSubtitleExtracting(true);
      setIsRunning(true);
      updateScriptState("transcribe_subtitles.py", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        lastMessage: `正在本地转写：${videoId}`,
      });
      updateVideoTaskState(videoId, "subtitle", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        message: "正在本地 ASR 转写",
      });
      appendLog(`本地转写：正在处理 ${videoId}`);
      showToast(`开始本地转写：${videoId}`, "neutral");
      await invoke("run_script", {
        scriptName: "transcribe_subtitles.py",
        args: ["--root", ".", "--video-id", videoId],
      });
      await fetchSubtitles();
      appendLog(`本地转写：已完成 ${videoId}`);
      updateScriptState("transcribe_subtitles.py", {
        state: "success",
        endedAt: nowStamp(),
        lastMessage: `本地转写完成：${videoId}`,
        lastOutput: `本地转写：已完成 ${videoId}`,
      });
      updateVideoTaskState(videoId, "subtitle", {
        state: "success",
        endedAt: nowStamp(),
        message: "本地转写完成",
      });
      showToast(`本地转写完成：${videoId}`, "success");
    } catch (err) {
      const errMsg = humanizeScriptError(err, "transcribe_subtitles.py");
      appendLog(`本地转写失败：${errMsg}`);
      setError(errMsg);
      updateScriptState("transcribe_subtitles.py", {
        state: "error",
        endedAt: nowStamp(),
        lastMessage: errMsg,
        lastOutput: `本地转写失败：${errMsg}`,
      });
      updateVideoTaskState(videoId, "subtitle", {
        state: "error",
        endedAt: nowStamp(),
        message: errMsg,
      });
      showToast(`本地转写失败：${videoId}`, "error");
    } finally {
      setSubtitleExtracting(false);
      setIsRunning(false);
    }
  }

  async function generateInsightForVideo(videoId: string) {
    if (!tauriAvailable || isRunning) return;
    try {
      setIsRunning(true);
      updateScriptState("generate_insights.py", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        lastMessage: `正在生成洞察：${videoId}`,
      });
      updateVideoTaskState(videoId, "insight", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        message: "正在生成洞察",
      });
      appendLog(`视频洞察：正在生成 ${videoId}`);
      showToast(`开始分析笔记：${videoId}`, "neutral");
      await invoke("run_script", {
        scriptName: "generate_insights.py",
        args: ["--root", ".", "--video-id", videoId, "--limit", "1"],
      });
      await fetchInsights();
      appendLog(`视频洞察：已生成 ${videoId}`);
      updateScriptState("generate_insights.py", {
        state: "success",
        endedAt: nowStamp(),
        lastMessage: `洞察生成完成：${videoId}`,
        lastOutput: `视频洞察：已生成 ${videoId}`,
      });
      updateVideoTaskState(videoId, "insight", {
        state: "success",
        endedAt: nowStamp(),
        message: "洞察生成完成",
      });
      showToast(`笔记分析完成：${videoId}`, "success");
    } catch (err) {
      const errMsg = humanizeScriptError(err, "generate_insights.py");
      appendLog(`视频洞察失败：${errMsg}`);
      setError(errMsg);
      updateScriptState("generate_insights.py", {
        state: "error",
        endedAt: nowStamp(),
        lastMessage: errMsg,
        lastOutput: `视频洞察失败：${errMsg}`,
      });
      updateVideoTaskState(videoId, "insight", {
        state: "error",
        endedAt: nowStamp(),
        message: errMsg,
      });
      showToast(`笔记分析失败：${videoId}`, "error");
    } finally {
      setIsRunning(false);
    }
  }

  async function generateNoteForVideo(videoId: string) {
    if (!tauriAvailable || isRunning) return;
    try {
      setIsRunning(true);
      updateScriptState("generate_notes.py", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        lastMessage: `正在生成笔记：${videoId}`,
      });
      updateVideoTaskState(videoId, "note", {
        state: "running",
        startedAt: nowStamp(),
        endedAt: undefined,
        message: "正在生成笔记",
      });

      const hasSubtitle = subtitles.some((subtitle) => subtitle.video_id === videoId);
      if (!hasSubtitle) {
        const cookieCheck = await validateBilibiliCookie({ requiredFor: "抓取字幕" });
        if (!cookieCheck.valid) {
          throw new Error(cookieCheck.message);
        }
        appendLog(`笔记生成：先抓取字幕 ${videoId}`);
        await invoke("run_script", {
          scriptName: "fetch_subtitles.py",
          args: ["--root", ".", "--video-id", videoId],
        });
        await fetchSubtitles();
      }

      const hasInsight = insights.some((insight) => insight.video_id === videoId);
      if (!hasInsight) {
        appendLog(`笔记生成：先生成洞察 ${videoId}`);
        await invoke("run_script", {
          scriptName: "generate_insights.py",
          args: ["--root", ".", "--video-id", videoId, "--limit", "1"],
        });
        await fetchInsights();
      }

      appendLog(`笔记生成：正在处理 ${videoId}`);
      showToast(`开始生成笔记：${videoId}`, "neutral");
      await invoke("run_script", {
        scriptName: "generate_notes.py",
        args: ["--root", ".", "--video-id", videoId, "--limit", "1"],
      });
      const updatedVideos = await fetchVideos();
      const generatedNotePath = `${videoId}.md`;
      const generatedContent: string = await invoke("get_note", { notePath: generatedNotePath });
      const materializedVideo = updatedVideos.find((video) => video.id === videoId);
      setVideos((prev) =>
        prev.map((video) =>
          video.id === videoId
            ? { ...video, ...(materializedVideo ?? {}), note_path: generatedNotePath, note_ready: true }
            : video,
        ),
      );
      setSelectedVideo((prev) => ({
        ...(materializedVideo ?? prev ?? { id: videoId }),
        note_path: generatedNotePath,
        note_ready: true,
        note_generated_at: materializedVideo?.note_generated_at ?? new Date().toISOString(),
        note_generation_mode: "single",
      } as Video));
      setNoteContent(generatedContent);
      setCurrentView("notes");
      appendLog(`笔记生成：已完成 ${videoId}`);
      updateScriptState("generate_notes.py", {
        state: "success",
        endedAt: nowStamp(),
        lastMessage: `笔记生成完成：${videoId}`,
        lastOutput: `笔记生成：已完成 ${videoId}`,
      });
      updateVideoTaskState(videoId, "note", {
        state: "success",
        endedAt: nowStamp(),
        message: "笔记生成完成",
      });
      showToast(`笔记生成完成：${videoId}`, "success");
    } catch (err) {
      const errMsg = humanizeScriptError(err, "generate_notes.py");
      appendLog(`笔记生成失败：${errMsg}`);
      setError(errMsg);
      updateScriptState("generate_notes.py", {
        state: "error",
        endedAt: nowStamp(),
        lastMessage: errMsg,
        lastOutput: `笔记生成失败：${errMsg}`,
      });
      updateVideoTaskState(videoId, "note", {
        state: "error",
        endedAt: nowStamp(),
        message: errMsg,
      });
      showToast(`笔记生成失败：${videoId}`, "error");
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
    void loadUserIdeas().catch((err) => appendLog(`想法加载失败：${String(err)}`));
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
    async function loadVisualPreferences() {
      try {
        if (!tauriAvailable) {
          const cached = window.localStorage.getItem(PREVIEW_CONFIG_STORAGE_KEY);
          if (!cached) return;
          const parsed = JSON.parse(cached) as {
            preferences?: {
              appearance?: AppearancePreference;
              fontFamily?: FontPreference;
              density?: DensityPreference;
              timezone?: string;
            };
          };
          const nextAppearance = parsed.preferences?.appearance;
          if (nextAppearance === "system" || nextAppearance === "light" || nextAppearance === "dark") {
            setAppearance(nextAppearance);
          }
          const nextFont = parsed.preferences?.fontFamily;
          if (nextFont === "system" || nextFont === "rounded" || nextFont === "serif" || nextFont === "mono") {
            setFontPreference(nextFont);
          }
          const nextDensity = parsed.preferences?.density;
          if (nextDensity === "comfortable" || nextDensity === "compact") {
            setDensityPreference(nextDensity);
          }
          if (parsed.preferences?.timezone) {
            setTimezonePreference(parsed.preferences.timezone);
            setDisplayTimezone(parsed.preferences.timezone);
          }
          return;
        }

        const raw: string = await invoke("get_config");
        const parsed = JSON.parse(raw) as {
          preferences?: {
            appearance?: AppearancePreference;
            fontFamily?: FontPreference;
            density?: DensityPreference;
            timezone?: string;
          };
        };
        const nextAppearance = parsed.preferences?.appearance;
        if (nextAppearance === "system" || nextAppearance === "light" || nextAppearance === "dark") {
          setAppearance(nextAppearance);
        }
        const nextFont = parsed.preferences?.fontFamily;
        if (nextFont === "system" || nextFont === "rounded" || nextFont === "serif" || nextFont === "mono") {
          setFontPreference(nextFont);
        }
        const nextDensity = parsed.preferences?.density;
        if (nextDensity === "comfortable" || nextDensity === "compact") {
          setDensityPreference(nextDensity);
        }
        if (parsed.preferences?.timezone) {
          setTimezonePreference(parsed.preferences.timezone);
          setDisplayTimezone(parsed.preferences.timezone);
        }
      } catch {
        // Keep default visual preferences as fallback.
      }
    }

    void loadVisualPreferences();
  }, [tauriAvailable]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyAppearance = () => {
      const resolved = appearance === "system" ? (media.matches ? "dark" : "light") : appearance;
      root.dataset.theme = resolved;
    };

    applyAppearance();
    media.addEventListener?.("change", applyAppearance);
    return () => media.removeEventListener?.("change", applyAppearance);
  }, [appearance]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.font = fontPreference;
    root.dataset.density = densityPreference;
    root.dataset.timezone = timezonePreference;
  }, [fontPreference, densityPreference, timezonePreference]);

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
  const scopedSelectedVideo = selectedVideo
    ? viewScopedVideos.find((video) => video.id === selectedVideo.id)
    : null;
  const activeVideo = selectedVideo
    ? {
        ...selectedVideo,
        ...(scopedSelectedVideo ?? {}),
        note_path: scopedSelectedVideo?.note_path || selectedVideo.note_path,
        note_ready: Boolean(scopedSelectedVideo?.note_ready || selectedVideo.note_ready),
        note_generated_at: scopedSelectedVideo?.note_generated_at || selectedVideo.note_generated_at,
        note_generation_mode: scopedSelectedVideo?.note_generation_mode || selectedVideo.note_generation_mode,
      }
    : viewScopedVideos[0] || videos[0] || null;
  const activeProject = selectedProject ?? filteredProjects[0] ?? projects[0] ?? null;
  const activeInsight = activeVideo
    ? insights.find((item) => item.video_id === activeVideo.id) ?? null
    : null;
  const activeSubtitle = activeVideo
    ? subtitles.find((item) => item.video_id === activeVideo.id) ?? null
    : null;
  const reviewedCount = videos.filter((video) => video.status === "reviewed").length;
  const pendingCount = videos.filter((video) => video.status === "pending").length;
  const p0Count = videos.filter((video) => video.priority === "P0").length;
  const generatedNoteVideos = useMemo(
    () =>
      videos
        .filter((video) => video.note_ready && video.note_path && video.note_generation_mode === "single")
        .sort((a, b) => {
          const aTime = Date.parse(a.note_generated_at || "") || 0;
          const bTime = Date.parse(b.note_generated_at || "") || 0;
          if (aTime !== bTime) return bTime - aTime;
          return compareVideosByRecency(a, b);
        }),
    [videos],
  );
  const noteCount = generatedNoteVideos.length;

  const toolbarAction = getToolbarAction({
    currentView,
    isRunning,
    selectedScript,
    runPythonScript,
  });
  const toolbarControls = getToolbarControls();
  const resolvedAppearance: Exclude<AppearancePreference, "system"> =
    appearance === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : appearance;
  const showToolbarSearch =
    currentView === "knowledge" ||
    currentView === "scripts" ||
    currentView === "tags";

  return (
    <MacAppShell
      sidebarCollapsed={sidebarCollapsed}
      sidebar={
        <MacSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        >
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
            <div className="mac-sidebar-theme-toggle" aria-label={t("settings.theme")}>
              <button
                aria-pressed={resolvedAppearance === "light"}
                className={cn(resolvedAppearance === "light" && "is-active")}
                onClick={() => void setAppearanceAndPersist("light")}
                type="button"
              >
                <Sun size={15} />
                <span>{t("settings.light")}</span>
              </button>
              <button
                aria-pressed={resolvedAppearance === "dark"}
                className={cn(resolvedAppearance === "dark" && "is-active")}
                onClick={() => void setAppearanceAndPersist("dark")}
                type="button"
              >
                <Moon size={15} />
                <span>{t("settings.dark")}</span>
              </button>
            </div>
          </div>
        </MacSidebar>
      }
      toolbar={
        <MacToolbar
          controls={toolbarControls}
          action={toolbarAction}
          status={
            <GlobalTaskStatusPanel
              insight={activeInsight}
              noteContent={noteContent}
              subtitle={activeSubtitle}
              taskState={activeVideo ? (videoTaskStates[activeVideo.id] ?? null) : null}
              scriptStates={scriptStates}
              video={activeVideo}
            />
          }
          search={
            showToolbarSearch ? (
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
        <Suspense
          fallback={
            <div className="mac-page-scroll custom-scrollbar">
              <MacEmptyState detail={t("status.loadingDetail")} title={t("status.processing")} />
            </div>
          }
        >
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
            <LazyVideos
              activeVideo={activeVideo}
              fetchNote={fetchNote}
              favoriteFolders={favoriteFolders}
              filterPriority={filterPriority}
              filterStatus={filterStatus}
              groupByFolder
              onAddManualVideo={addManualVideo}
              onExtractSubtitle={extractSubtitle}
              onGenerateInsight={generateInsightForVideo}
              onGenerateNote={generateNoteForVideo}
              onTranscribeSubtitle={transcribeSubtitle}
              onRunBatchInsight={() => activeVideo && generateInsightForVideo(activeVideo.id)}
              onRunBatchNote={() => activeVideo && generateNoteForVideo(activeVideo.id)}
              insights={insights}
              subtitles={subtitles}
              setFilterPriority={setFilterPriority}
              setFilterStatus={setFilterStatus}
              title={t("view.favorites")}
              updateStatus={updateStatus}
              videos={favoriteVideos}
            />
          )}
          {currentView === "videos" && (
            <LazyVideos
              activeVideo={activeVideo}
              fetchNote={fetchNote}
              favoriteFolders={favoriteFolders}
              filterPriority={filterPriority}
              filterStatus={filterStatus}
              onExtractSubtitle={extractSubtitle}
              onGenerateInsight={generateInsightForVideo}
              onGenerateNote={generateNoteForVideo}
              onTranscribeSubtitle={transcribeSubtitle}
              onRunBatchInsight={() => activeVideo && generateInsightForVideo(activeVideo.id)}
              onRunBatchNote={() => activeVideo && generateNoteForVideo(activeVideo.id)}
              insights={insights}
              subtitles={subtitles}
              setFilterPriority={setFilterPriority}
              setFilterStatus={setFilterStatus}
              title={t("view.videos")}
              updateStatus={updateStatus}
              videos={filteredVideos}
            />
          )}
          {currentView === "notes" && (
            <LazyNotes
              activeVideo={activeVideo}
              fetchNote={fetchNote}
              noteContent={noteContent}
              onGenerateNote={generateNoteForVideo}
              videos={videos}
            />
          )}
          {currentView === "projects" && (
            <LazyCandidates
              activeProject={activeProject}
              onUpdateProjectStatus={updateProjectReviewStatus}
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
              generatedNoteVideos,
            })}
          {currentView === "scripts" &&
            renderScripts({
              isRunning,
              logs,
              onViewOutput: () => outputAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
              outputAnchorRef,
              runPythonScript,
              selectedScript,
              scriptStates,
              setLogs,
              setSelectedScript,
              scriptCatalog,
            })}
          {currentView === "tags" && (
            renderThoughts({
              insights,
              onAddIdea: addUserIdea,
              onDeleteIdea: deleteUserIdea,
              onUpdateIdea: updateUserIdea,
              openVideoInNotes,
              userIdeas,
              videos,
            })
          )}
          {currentView === "settings" && (
            <div className="mac-page-scroll custom-scrollbar">
              <LazySettingsView
                onAppearanceChange={handleAppearanceChange}
                onDensityChange={handleDensityChange}
                onLanguageChange={handleLanguageChange}
                onTimezoneChange={handleTimezoneChange}
              />
            </div>
          )}
        </Suspense>
      </div>
    </MacAppShell>
  );
}

function getToolbarAction({
  currentView,
  isRunning,
  selectedScript,
  runPythonScript,
}: {
  currentView: View;
  isRunning: boolean;
  selectedScript: string;
  runPythonScript: (name: string, args?: string[]) => void;
}) {
  if (currentView === "settings") return undefined;

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

  if (
    currentView === "favorites" ||
    currentView === "videos" ||
    currentView === "notes" ||
    currentView === "projects"
  ) {
    return undefined;
  }

  const actionByView: Partial<Record<View, { label: string; script: string; icon: ReactNode }>> = {
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

function getToolbarControls() {
  return undefined;
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
                  <LazyReactMarkdown>{noteContent}</LazyReactMarkdown>
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
            <LazyLogViewer logs={logs.slice(-10)} />
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
  generatedNoteVideos,
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
  generatedNoteVideos: Video[];
}) {
  const folders = [
    { name: "manifest", count: videos.length, onClick: onOpenVideoFavorites },
    { name: "notes/raw", count: noteCount, onClick: onOpenNotes },
    { name: "projects", count: projects.length, onClick: onOpenCandidates },
    { name: "status-flow", count: 1, onClick: onOpenScripts },
    { name: "thoughts", count: generatedNoteVideos.length, onClick: onOpenTags },
  ];

  function onOpenVideoFavorites() {
    if (videos[0]) {
      openVideoInFavorites(videos[0]);
      return;
    }
    onRefreshKnowledge();
  }

  function onOpenNotes() {
    if (generatedNoteVideos[0]) {
      openVideoInNotes(generatedNoteVideos[0]);
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
              <div className="kb-path-actions">
                <MacToolbarButton icon={<Library size={14} />} label={t("kb.openCandidates")} onClick={onOpenCandidates} />
                {topProjects[0] ? (
                  <MacToolbarButton
                    icon={<ExternalLink size={14} />}
                    label={t("kb.openTopRepo")}
                    onClick={() => openUrl(topProjects[0].url)}
                  />
                ) : null}
                <MacToolbarButton icon={<RefreshCw size={14} />} label={t("kb.refreshKnowledge")} onClick={onRefreshKnowledge} />
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
                <span>{t("kb.totalItems", { count: generatedNoteVideos.length })}</span>
              </header>
              <div className="kb-note-list">
                {generatedNoteVideos.slice(0, 7).map((video) => (
                  <button
                    className="kb-note-row w-full text-left"
                    key={video.id}
                    onClick={() => openVideoInNotes(video)}
                    type="button"
                  >
                    <div className="kb-note-main">
                      <div className="kb-note-title">{video.note_path || `${video.id}.md`}</div>
                      <div className="kb-note-subtitle">{video.title}</div>
                    </div>
                    <div className="kb-note-status">
                      <MacTagPill tone={priorityTone(video.priority)}>{video.priority}</MacTagPill>
                    </div>
                  </button>
                ))}
                {generatedNoteVideos.length === 0 ? (
                  <div className="kb-note-row">
                    <div className="kb-note-main">
                      <div className="kb-note-title">暂无生成笔记</div>
                      <div className="kb-note-subtitle">从收藏夹选择视频，完成“生成笔记”后会显示在这里。</div>
                    </div>
                  </div>
                ) : null}
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

function normalizeThoughtTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .slice(0, 80);
}

function parseIdeaTags(raw: FormDataEntryValue | null) {
  return String(raw || "")
    .split(/[，,#\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 12);
}

function renderThoughts({
  insights,
  onAddIdea,
  onDeleteIdea,
  onUpdateIdea,
  openVideoInNotes,
  userIdeas,
  videos,
}: {
  insights: VideoInsight[];
  onAddIdea: (input: { title: string; content: string; tags: string[] }) => Promise<void>;
  onDeleteIdea: (id: string) => Promise<void>;
  onUpdateIdea: (id: string, input: { title: string; content: string; tags: string[] }) => Promise<void>;
  openVideoInNotes: (video: Video) => void;
  userIdeas: UserIdea[];
  videos: Video[];
}) {
  const insightMap = new Map(insights.map((item) => [item.video_id, item]));
  const seenTitles = new Set<string>();
  const cards = [...videos]
    .filter((video) => Boolean(video.note_ready && video.note_path))
    .sort((a, b) => {
      const aTime = new Date(a.note_generated_at || a.collected_at || a.pubdate || 0).getTime();
      const bTime = new Date(b.note_generated_at || b.collected_at || b.pubdate || 0).getTime();
      return bTime - aTime;
    })
    .filter((video) => {
      const key = normalizeThoughtTitle(video.title || video.id);
      if (!key) return true;
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, 18)
    .map((video) => ({
      video,
      insight: insightMap.get(video.id) ?? null,
    }));

  async function handleIdeaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await onAddIdea({
      title: String(data.get("title") || ""),
      content: String(data.get("content") || ""),
      tags: parseIdeaTags(data.get("tags")),
    });
    form.reset();
  }

  async function handleIdeaUpdate(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onUpdateIdea(id, {
      title: String(data.get("title") || ""),
      content: String(data.get("content") || ""),
      tags: parseIdeaTags(data.get("tags")),
    });
  }

  return (
    <div className="mac-page-scroll custom-scrollbar">
      <div className="dashboard-page thoughts-page">
        <section className="dashboard-hero thoughts-hero">
          <div className="dashboard-hero-main">
            <div className="dashboard-hero-badge">{t("kb.thoughts")}</div>
            <h1 className="dashboard-hero-title">基于最近笔记的想法</h1>
            <p className="dashboard-hero-text">只围绕已经生成的笔记继续写判断、标签和下一步动作，避免把未沉淀的视频也当成知识线索。</p>
          </div>
        </section>

        <section className="thoughts-editor-panel bk-panel">
          <header className="panel-header">
            <h2>新增想法</h2>
            <span>写给未来的自己</span>
          </header>
          <form className="thoughts-editor-form" onSubmit={handleIdeaSubmit}>
            <input className="mac-input" name="title" placeholder="一句话标题，例如：这个项目适合做本地 RAG 工具链" />
            <textarea className="mac-textarea" name="content" placeholder="真实想法、判断依据、下一步动作。尽量写具体：为什么值得跟进？怎么用？风险是什么？" rows={4} />
            <div className="thoughts-editor-bottom">
              <input className="mac-input" name="tags" placeholder="tags：RAG，开源项目，待验证" />
              <button className="mac-toolbar-button is-primary" type="submit"><Plus size={14} /><span>保存想法</span></button>
            </div>
          </form>
        </section>

        {userIdeas.length > 0 ? (
          <section className="thoughts-user-list">
            {userIdeas.map((idea) => (
              <form className="thought-user-card" key={idea.id} onSubmit={(event) => void handleIdeaUpdate(event, idea.id)}>
                <header>
                  <div>
                    <input className="thought-title-input" name="title" defaultValue={idea.title} placeholder="未命名想法" />
                    <span>{formatVideoTime(idea.updated_at || idea.created_at)}</span>
                  </div>
                  <div className="thought-card-actions">
                    <button className="mac-toolbar-button" type="submit"><span>保存</span></button>
                    <button className="thought-delete-button" onClick={() => void onDeleteIdea(idea.id)} title="删除想法" type="button">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </header>
                <textarea className="thought-content-input" name="content" defaultValue={idea.content} placeholder="写下真实想法、判断和下一步动作" rows={3} />
                <input className="thought-tags-input" name="tags" defaultValue={idea.tags.join("，")} placeholder="tags：RAG，开源项目，待验证" />
              </form>
            ))}
          </section>
        ) : null}

        <section className="dashboard-body-grid thoughts-feed-grid">
          {cards.length === 0 ? (
            <article className="dashboard-board thought-signal-card">
              <header className="dashboard-board-head">
                <div>
                  <h3>暂无最近笔记</h3>
                  <span>先在「收藏夹」完成生成笔记，这里才会出现可继续思考的内容。</span>
                </div>
              </header>
            </article>
          ) : cards.map(({ video, insight }) => (
            <article className="dashboard-board thought-signal-card" key={video.id}>
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
                      <span>{insight?.summary || "这条笔记还没有关联洞察，可打开笔记补充你的判断。"}</span>
                    </div>
                  </div>
                </div>
                {(insight?.problem_statements?.slice(0, 1) || []).map((item, index) => (
                  <div className="dashboard-feed-row" key={`${video.id}-problem-${index}`}>
                    <div className="dashboard-feed-main">
                      <div className="dashboard-feed-title">解决的问题</div>
                      <div className="dashboard-feed-meta">
                        <span>{item}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {(insight?.use_cases?.slice(0, 1) || []).map((item, index) => (
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
  scriptStates,
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
  scriptStates: Record<string, ScriptRunState>;
  setLogs: (logs: string[]) => void;
  setSelectedScript: (name: string) => void;
  scriptCatalog: ScriptItem[];
}) {
  const activeScript = scriptCatalog.find((script) => script.name === selectedScript) ?? scriptCatalog[0];
  const activeScriptState = scriptStates[activeScript.name];
  const lastOutput = activeScriptState?.lastOutput || (logs.length > 0 ? logs[logs.length - 1] : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MacSplitView columns="340px minmax(0, 1fr)">
        <section className="script-list-pane custom-scrollbar">
          <div className="script-list-header">
            <h2>{t("scripts.whitelist")}</h2>
            <ShieldCheck size={15} />
          </div>
          <div className="script-list">
            {scriptCatalog.map((script) => {
              const state = scriptStates[script.name]?.state ?? "idle";
              return (
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
                <MacStatusPill tone={getScriptStateTone(state)}>
                  {getScriptStateLabel(state, t)}
                </MacStatusPill>
              </button>
              );
            })}
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
                <strong>{getScriptStateLabel(activeScriptState?.state ?? "idle", t)}</strong>
              </div>
              <div className="script-meta-row">
                <span>{t("scripts.scriptDetail.permission")}</span>
                <strong>{t("scripts.scriptDetail.backendAllowlist")}</strong>
              </div>
              <div className="script-meta-row">
                <span>{t("scripts.scriptDetail.lastRun")}</span>
                <strong>{activeScriptState?.endedAt || activeScriptState?.startedAt || t("scripts.scriptDetail.never")}</strong>
              </div>
              <div className="script-meta-row">
                <span>{t("scripts.scriptDetail.scope")}</span>
                <strong>{getScriptScopeLabel(activeScript.name, t)}</strong>
              </div>
            </div>

            <div className="script-meta-grid">
              <div className="script-meta-row">
                <span>开始时间</span>
                <strong>{activeScriptState?.startedAt || "-"}</strong>
              </div>
              <div className="script-meta-row">
                <span>结束时间</span>
                <strong>{activeScriptState?.endedAt || "-"}</strong>
              </div>
              <div className="script-meta-row">
                <span>最近结果</span>
                <strong>{activeScriptState?.lastMessage || "尚未执行"}</strong>
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
