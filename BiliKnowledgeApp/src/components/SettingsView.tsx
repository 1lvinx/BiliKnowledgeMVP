import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AlertCircle, CheckCircle2, ExternalLink, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  MacInlineNotice,
  MacSettingsGroup,
  MacSettingsRow,
  MacToolbarButton,
} from "./MacUI";
import { cn } from "../lib/utils";
import { t } from "../i18n";
import { BilibiliLogin } from "./BilibiliLogin";
import type { AppearancePreference, DensityPreference } from "../app/app-model";

interface Config {
  bilibili: {
    cookie: string;
    sessdata: string;
    bili_jct: string;
    buvid3: string;
    dedeuserid: string;
  };
  ai: {
    provider: string;
    api_key: string;
    base_url: string;
    model: string;
  };
  preferences: {
    language: string;
    appearance: AppearancePreference;
    timezone: string;
    fontFamily: string;
    density: DensityPreference;
  };
}

const defaultConfig: Config = {
  bilibili: { cookie: "", sessdata: "", bili_jct: "", buvid3: "", dedeuserid: "" },
  ai: {
    provider: "deepseek",
    api_key: "",
    base_url: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
  },
  preferences: {
    language: "zh-CN",
    appearance: "system",
    timezone: "Asia/Singapore",
    fontFamily: "system",
    density: "comfortable",
  },
};

const languageOptions = [
  { value: "zh-CN", label: "中文（简体）", detail: "Chinese Simplified" },
  { value: "en-US", label: "English", detail: "English" },
];

const timezoneOptions = [
  { value: "Asia/Singapore", label: "Singapore (UTC+08:00)" },
  { value: "Asia/Shanghai", label: "Beijing / Shanghai (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+09:00)" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-08:00/UTC-07:00)" },
  { value: "America/New_York", label: "New York (UTC-05:00/UTC-04:00)" },
  { value: "Europe/London", label: "London (UTC+00:00/UTC+01:00)" },
  { value: "UTC", label: "UTC" },
];


type HelpDocKey = "usage" | "workflow" | "qa";

const feedbackIssueUrl = "https://github.com/1lvinx/BiliKnowledgeMVP/issues/new?title=%5BFeedback%5D%20BiliKnowledge%20Beta&body=%E8%AF%B7%E5%A1%AB%E5%86%99%EF%BC%9A%0A%0A-%20%E6%88%AA%E5%9B%BE%EF%BC%9A%0A-%20Doctor%20%E6%97%A5%E5%BF%97%EF%BC%9A%0A-%20%E8%A7%86%E9%A2%91%20BV%20%E5%8F%B7%EF%BC%9A%0A-%20%E7%82%B9%E5%87%BB%E7%9A%84%E6%8C%89%E9%92%AE%EF%BC%9A%0A-%20%E6%9C%9F%E6%9C%9B%E7%BB%93%E6%9E%9C%EF%BC%9A%0A-%20%E5%AE%9E%E9%99%85%E7%BB%93%E6%9E%9C%EF%BC%9A%0A";
const feedbackEmail = "mailto:feedback@biliknowledge.local?subject=BiliKnowledge%20Beta%20Feedback&body=%E8%AF%B7%E9%99%84%E4%B8%8A%EF%BC%9A%E6%88%AA%E5%9B%BE%2C%20Doctor%20%E6%97%A5%E5%BF%97%2C%20BV%20%E5%8F%B7%2C%20%E6%93%8D%E4%BD%9C%E6%AD%A5%E9%AA%A4%2C%20%E6%9C%9F%E6%9C%9B%E7%BB%93%E6%9E%9C%E3%80%82";

function helpDocMarkdown(key: HelpDocKey): string {
  const docs: Record<HelpDocKey, string> = {
    usage: `# 使用方法

## 每天建议怎么用

每天只挑你真正需要沉淀的 10 条左右视频，不建议后台全量批量生成。

## 单条视频标准链路

1. 在「收藏夹」选择视频。
2. 如果有原生字幕，点击「抓取字幕」。
3. 如果没有字幕或字幕错配，点击「本地转写」。
4. 字幕状态变为有效后，点击「生成视频洞察」。
5. 洞察生成后，点击「生成笔记」。
6. 如果视频明确提到 GitHub 仓库，笔记会尝试同步到「开源候选」。

## 什么情况下不要生成笔记

- 字幕明显和视频不匹配。
- ASR 转写只有几句话，信息量不足。
- 洞察提示证据不足。
- 视频只是娱乐/新闻片段，没有复用价值。

## 好笔记应该包含什么

- 具体工具、仓库、命令、步骤或判断。
- 可复用到哪个工作流。
- 限制与风险。
- 判断依据来自字幕或视频信息，而不是标题脑补。`,
    workflow: `# 推荐处理流程

## 最短稳定路径

\`\`\`text
抓字幕 / 本地转写
→ 生成视频洞察
→ 生成笔记
→ 明确 GitHub 仓库自动进入开源候选
\`\`\`

## 为什么不建议全量批量跑

批量跑会导致：

- 后台并发高，App 容易卡顿。
- 低质量字幕也被拿去生成洞察。
- 旧洞察可能污染新笔记。
- 你真正需要的内容反而被淹没。

## 推荐节奏

- 每天 10 条以内。
- 先处理 P0 / P1。
- 先确认字幕有效，再生成洞察。
- 笔记只保留有复用价值的视频。

## GitHub 仓库同步规则

只有明确识别到 \`https://github.com/owner/repo\` 才会进入开源候选。

如果只是提到项目名但没有仓库地址，系统不会编造 URL。`,
    qa: `# Q&A

## Q: 字幕抓取失败怎么办？

先确认视频是否有 Bilibili 原生字幕。如果没有，使用「本地转写」。

## Q: 本地转写失败怎么办？

先运行「环境诊断 Doctor」。如果缺 Python 依赖、ffmpeg、torch/torchaudio 或模型缓存，再运行「环境修复 Doctor」。

## Q: 生成洞察失败怎么办？

常见原因：

- 字幕缺失。
- 字幕错配。
- AI API Key 未配置。
- 字幕信息量太低。

## Q: 笔记内容很空怎么办？

不要继续保存这条。先重新抓字幕/转写，再重新生成洞察。系统会阻止旧洞察生成新笔记，但低信息量视频本身也可能不值得做笔记。

## Q: 什么是未关联笔记？

指 \`notes/raw\` 里存在，但没有被视频清单 \`note_path\` 引用的 Markdown。通常是旧测试笔记、历史残留文件，或者需要重新关联/清理的笔记。

## Q: Doctor 修复后还是不行怎么办？

反馈给作者，并附上：截图、Doctor 日志、视频 BV 号、点击了哪个按钮、期望结果和实际结果。`,
  };
  return docs[key];
}


const settingsSectionKeys = [
  "settings.general",
  "settings.knowledgeBase",
  "settings.import",
  "settings.validation",
  "settings.ai",
  "settings.security",
  "settings.helpFeedback",
  "settings.exportBackup",
  "settings.appearance",
] as const;

type SettingsSection = (typeof settingsSectionKeys)[number];

const previewStorageKey = "biliknowledge-preview-config";

function isTauriRuntime() {
  return isTauri() || (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
}

function normalizeConfig(value: unknown): Config {
  const partial = value as Partial<Config> | null;
  return {
    bilibili: {
      ...defaultConfig.bilibili,
      ...(partial?.bilibili ?? {}),
    },
    ai: {
      ...defaultConfig.ai,
      ...(partial?.ai ?? {}),
    },
    preferences: {
      ...defaultConfig.preferences,
      ...(partial?.preferences ?? {}),
    },
  };
}

export function SettingsView({
  onLanguageChange,
  onAppearanceChange,
  onDensityChange,
  onTimezoneChange,
}: {
  onLanguageChange?: (lang: string) => void;
  onAppearanceChange?: (appearance: AppearancePreference) => void;
  onDensityChange?: (density: DensityPreference) => void;
  onTimezoneChange?: (timezone: string) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState<"diagnose" | "repair" | null>(null);
  const [helpDoc, setHelpDoc] = useState<HelpDocKey | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("settings.general");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  async function loadConfig() {
    try {
      setLoading(true);
      if (!isTauriRuntime()) {
        const cached = window.localStorage.getItem(previewStorageKey);
        setConfig(cached ? normalizeConfig(JSON.parse(cached)) : defaultConfig);
        return;
      }
      const data: string = await invoke("get_config");
      setConfig(normalizeConfig(JSON.parse(data)));
    } catch {
      setConfig(defaultConfig);
    } finally {
      setLoading(false);
    }
  }

  async function persistConfig(nextConfig: Config) {
    if (!isTauriRuntime()) {
      window.localStorage.setItem(previewStorageKey, JSON.stringify(nextConfig));
      return;
    }
    await invoke("save_config", { config: JSON.stringify(nextConfig) });
  }


  async function runDoctor(mode: "diagnose" | "repair") {
    if (!isTauriRuntime()) {
      setMessage({ type: "error", text: t("settings.doctorPreviewUnavailable") });
      return;
    }
    try {
      setDoctorRunning(mode);
      await invoke("run_script", {
        scriptName: mode === "repair" ? "doctor_fix.py" : "doctor.py",
        args: ["--root", "."],
      });
      setMessage({
        type: "success",
        text: mode === "repair" ? t("settings.doctorRepairDone") : t("settings.doctorDiagnoseDone"),
      });
    } catch (err) {
      setMessage({ type: "error", text: `${t("settings.doctorFailed")}: ${String(err)}` });
    } finally {
      setDoctorRunning(null);
    }
  }

  async function saveConfig() {
    if (!config) return;
    try {
      setSaving(true);
      await persistConfig(config);
      setMessage({ type: "success", text: isTauriRuntime() ? t("settings.saved") : t("settings.previewSaved") });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: "error", text: `${t("settings.saveFailed")}: ${String(err)}` });
    } finally {
      setSaving(false);
    }
  }

  function updatePreferences(nextPreferences: Partial<Config["preferences"]>) {
    if (!config) return;
    setConfig({
      ...config,
      preferences: { ...config.preferences, ...nextPreferences },
    });
  }

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (!config) return;
    document.documentElement.lang = config.preferences.language;
  }, [config]);

  if (loading) {
    return <div className="mac-empty-state">{t("status.processing")}...</div>;
  }
  if (!config) return null;

  return (
    <div className="mac-settings-layout">
      <nav className="mac-settings-nav">
        {settingsSectionKeys.map((key) => (
          <button
            className={cn(activeSection === key && "is-active")}
            key={key}
            onClick={() => setActiveSection(key)}
            type="button"
          >
            {t(key)}
          </button>
        ))}
      </nav>

      <div className="mac-settings-stack">
        {message && (
          <MacInlineNotice tone={message.type === "success" ? "success" : "error"}>
            {message.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {message.text}
          </MacInlineNotice>
        )}

        {activeSection === "settings.general" && (
          <MacSettingsGroup title={t("settings.general")}>
            <MacSettingsRow
              detail={t("settings.knowledgeBaseLocationDesc")}
              label={t("settings.knowledgeBaseLocation")}
            >
              <span className="mac-inspector-meta">../BiliKnowledge</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.appearanceDesc")} label={t("settings.appearanceLabel")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const appearance = event.target.value as AppearancePreference;
                  updatePreferences({ appearance });
                  onAppearanceChange?.(appearance);
                }}
                value={config.preferences.appearance}
              >
                <option value="system">{t("settings.system")}</option>
                <option value="light">{t("settings.light")}</option>
                <option value="dark">{t("settings.dark")}</option>
              </select>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.languageDesc")} label={t("settings.language")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const language = event.target.value;
                  updatePreferences({ language });
                  onLanguageChange?.(language);
                }}
                value={config.preferences.language}
              >
                {languageOptions.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.timezoneDesc")} label={t("settings.timezone")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const timezone = event.target.value;
                  updatePreferences({ timezone });
                  onTimezoneChange?.(timezone);
                }}
                value={config.preferences.timezone}
              >
                {timezoneOptions.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.knowledgeBase" && (
          <MacSettingsGroup title={t("settings.knowledgeBase")}>
            <MacSettingsRow
              detail={t("settings.knowledgeBaseLocationDesc")}
              label={t("settings.workspace")}
            >
              <span className="mac-inspector-meta">../BiliKnowledge</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.notesPathDesc")} label={t("settings.notesPath")}>
              <span className="mac-inspector-meta">BiliKnowledge/notes/raw</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.projectsPathDesc")} label={t("settings.projectsPath")}>
              <span className="mac-inspector-meta">BiliKnowledge/projects</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.manifestPathDesc")} label={t("settings.manifestPath")}>
              <span className="mac-inspector-meta">BiliKnowledge/manifest</span>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.import" && (
          <MacSettingsGroup title={t("settings.import")}>
            <div className="settings-qr-section">
              <BilibiliLogin
                onLoginSuccess={async (cookies) => {
                  const nextConfig = {
                    ...config,
                    bilibili: {
                      ...config.bilibili,
                      sessdata: cookies.sessdata,
                      bili_jct: cookies.bili_jct,
                      dedeuserid: cookies.dedeuserid,
                      buvid3: cookies.buvid3,
                    },
                  };
                  setConfig(nextConfig);
                  await persistConfig(nextConfig);
                  setMessage({ type: "success", text: t("bilibili.loginSuccess") });
                }}
              />
            </div>

            <MacSettingsRow detail={t("settings.sessdataDesc")} label="SESSDATA">
              <SettingInput
                onChange={(value) =>
                  setConfig({ ...config, bilibili: { ...config.bilibili, sessdata: value } })
                }
                type="password"
                value={config.bilibili.sessdata}
              />
            </MacSettingsRow>
            <MacSettingsRow label="bili_jct">
              <SettingInput
                onChange={(value) =>
                  setConfig({ ...config, bilibili: { ...config.bilibili, bili_jct: value } })
                }
                type="password"
                value={config.bilibili.bili_jct}
              />
            </MacSettingsRow>
            <MacSettingsRow label="DedeUserID">
              <SettingInput
                onChange={(value) =>
                  setConfig({ ...config, bilibili: { ...config.bilibili, dedeuserid: value } })
                }
                value={config.bilibili.dedeuserid}
              />
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.detectDuplicatesDesc")} label={t("settings.detectDuplicates")}>
              <span aria-label="Enabled" className="mac-switch is-on" role="switch" aria-checked="true" />
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.validation" && (
          <MacSettingsGroup title={t("settings.validation")}>
            <MacSettingsRow detail={t("settings.healthCheckDesc")} label={t("settings.healthCheck")}>
              <span className="mac-status-pill tone-green">{t("status.ready")}</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.orphanNotesDesc")} label={t("settings.orphanNotes")}>
              <span className="mac-status-pill tone-orange">{t("kb.review")}</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.sensitiveDataScanDesc")} label={t("settings.sensitiveDataScan")}>
              <span className="mac-status-pill tone-green">{t("status.ready")}</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.linkCheckDesc")} label={t("settings.linkCheck")}>
              <span className="mac-status-pill tone-green">{t("status.ready")}</span>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.ai" && (
          <MacSettingsGroup title={t("settings.ai")}>
            <MacSettingsRow label={t("settings.provider")}>
              <select
                className="mac-select"
                onChange={(event) =>
                  setConfig({ ...config, ai: { ...config.ai, provider: event.target.value } })
                }
                value={config.ai.provider}
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="local">Local</option>
              </select>
            </MacSettingsRow>
            <MacSettingsRow label={t("settings.apiKey")}>
              <SettingInput
                onChange={(value) => setConfig({ ...config, ai: { ...config.ai, api_key: value } })}
                type="password"
                value={config.ai.api_key}
              />
            </MacSettingsRow>
            <MacSettingsRow label={t("settings.model")}>
              <SettingInput
                onChange={(value) => setConfig({ ...config, ai: { ...config.ai, model: value } })}
                value={config.ai.model}
              />
            </MacSettingsRow>
            <MacSettingsRow label={t("settings.baseUrl")}>
              <SettingInput
                onChange={(value) => setConfig({ ...config, ai: { ...config.ai, base_url: value } })}
                value={config.ai.base_url}
              />
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.security" && (
          <MacSettingsGroup title={t("settings.security")}>
            <MacSettingsRow detail={t("settings.contentSecurityPolicyDesc")} label={t("settings.contentSecurityPolicy")}>
              <span className="mac-status-pill tone-green">{t("status.ready")}</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.readOnlyNoteModeDesc")} label={t("settings.readOnlyNoteMode")}>
              <span aria-label="Enabled" className="mac-switch is-on" role="switch" aria-checked="true" />
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.pathWhitelistDesc")} label={t("settings.pathWhitelist")}>
              <span className="mac-status-pill tone-green">{t("status.ready")}</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.scriptWhitelistDesc")} label={t("settings.scriptWhitelist")}>
              <span className="mac-status-pill tone-green">{t("status.ready")}</span>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.helpFeedback" && (
          <MacSettingsGroup title={t("settings.helpFeedback")}>
            <MacSettingsRow detail={t("settings.usageMethodDesc")} label={t("settings.usageMethod")}>
              <MacToolbarButton label={t("settings.openGuide")} onClick={() => setHelpDoc("usage")} />
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.helpWorkflowDesc")} label={t("settings.helpWorkflow")}>
              <MacToolbarButton label={t("settings.openWorkflow")} onClick={() => setHelpDoc("workflow")} />
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.qaDesc")} label={t("settings.qa")}>
              <MacToolbarButton label={t("settings.openQa")} onClick={() => setHelpDoc("qa")} />
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.doctorDesc")} label={t("scripts.doctor")}>
              <MacToolbarButton
                disabled={doctorRunning !== null}
                label={doctorRunning === "diagnose" ? t("scripts.running") : t("settings.runDoctor")}
                onClick={() => runDoctor("diagnose")}
              />
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.doctorFixDesc")} label={t("scripts.doctorFix")}>
              <MacToolbarButton
                disabled={doctorRunning !== null}
                label={doctorRunning === "repair" ? t("scripts.running") : t("settings.runDoctorFix")}
                onClick={() => runDoctor("repair")}
                primary
              />
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.feedbackDesc")} label={t("settings.feedback")}>
              <div className="settings-feedback-actions">
                <a className="mac-toolbar-button" href={feedbackIssueUrl} rel="noreferrer" target="_blank">
                  <ExternalLink size={14} />
                  {t("settings.openIssue")}
                </a>
                <a className="mac-toolbar-button" href={feedbackEmail}>
                  {t("settings.sendEmail")}
                </a>
              </div>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.exportBackup" && (
          <MacSettingsGroup title={t("settings.exportBackup")}>
            <MacSettingsRow label={t("settings.exportLocation")}>
              <span className="mac-inspector-meta">BiliKnowledge/projects</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.autoBackupDesc")} label={t("settings.autoBackup")}>
              <span aria-label="Disabled" className="mac-switch" role="switch" aria-checked="false" />
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "settings.appearance" && (
          <MacSettingsGroup title={t("settings.appearance")}>
            <MacSettingsRow detail={t("settings.chooseLanguageDesc")} label={t("settings.language")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const language = event.target.value;
                  updatePreferences({ language });
                  onLanguageChange?.(language);
                }}
                value={config.preferences.language}
              >
                {languageOptions.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.timezoneDesc")} label={t("settings.timezone")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const timezone = event.target.value;
                  updatePreferences({ timezone });
                  onTimezoneChange?.(timezone);
                }}
                value={config.preferences.timezone}
              >
                {timezoneOptions.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.themeDesc")} label={t("settings.theme")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const appearance = event.target.value as AppearancePreference;
                  updatePreferences({ appearance });
                  onAppearanceChange?.(appearance);
                }}
                value={config.preferences.appearance}
              >
                <option value="light">{t("settings.modernLight")}</option>
                <option value="dark">{t("settings.dark")}</option>
                <option value="system">{t("settings.system")}</option>
              </select>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.densityDesc")} label={t("settings.density")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const density = event.target.value as DensityPreference;
                  updatePreferences({ density });
                  onDensityChange?.(density);
                }}
                value={config.preferences.density}
              >
                <option value="comfortable">{t("settings.comfortable")}</option>
                <option value="compact">{t("settings.compact")}</option>
              </select>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}


        {helpDoc && (
          <div className="settings-help-modal" role="dialog" aria-modal="true">
            <div className="settings-help-backdrop" onClick={() => setHelpDoc(null)} />
            <section className="settings-help-dialog">
              <header className="settings-help-header">
                <strong>{helpDoc === "usage" ? t("settings.usageMethod") : helpDoc === "workflow" ? t("settings.helpWorkflow") : t("settings.qa")}</strong>
                <button aria-label="Close" onClick={() => setHelpDoc(null)} type="button">
                  <X size={16} />
                </button>
              </header>
              <div className="settings-help-markdown custom-scrollbar">
                <ReactMarkdown>{helpDocMarkdown(helpDoc)}</ReactMarkdown>
              </div>
            </section>
          </div>
        )}

        <div className="flex justify-end pb-10">
          <MacToolbarButton
            disabled={saving}
            label={saving ? t("settings.saving") : t("settings.save")}
            onClick={saveConfig}
            primary
          />
        </div>
      </div>
    </div>
  );
}

function SettingInput({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <input
      className="mac-input"
      onChange={(event) => onChange(event.target.value)}
      placeholder="Not set"
      type={type}
      value={value}
    />
  );
}
