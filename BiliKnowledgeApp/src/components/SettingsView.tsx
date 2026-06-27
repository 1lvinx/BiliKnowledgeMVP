import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  MacInlineNotice,
  MacSettingsGroup,
  MacSettingsRow,
  MacToolbarButton,
} from "./MacUI";
import { cn } from "../lib/utils";
import { t } from "../i18n";
import { BilibiliLogin } from "./BilibiliLogin";
import type { AppearancePreference, DensityPreference, FontPreference } from "../app/app-model";

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
    fontFamily: FontPreference;
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

const fontOptions: Array<{ value: FontPreference; label: string; detail: string }> = [
  { value: "system", label: "System UI", detail: "SF Pro / Inter / PingFang SC" },
  { value: "rounded", label: "Rounded", detail: "SF Pro Rounded / Nunito / PingFang SC" },
  { value: "serif", label: "Serif", detail: "New York / Noto Serif SC" },
  { value: "mono", label: "Mono", detail: "SF Mono / JetBrains Mono / Menlo" },
];

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
  onFontChange,
  onDensityChange,
  onTimezoneChange,
}: {
  onLanguageChange?: (lang: string) => void;
  onAppearanceChange?: (appearance: AppearancePreference) => void;
  onFontChange?: (fontFamily: FontPreference) => void;
  onDensityChange?: (density: DensityPreference) => void;
  onTimezoneChange?: (timezone: string) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState<"diagnose" | "repair" | null>(null);
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
            <MacSettingsRow detail={t("settings.helpHowToUseDesc")} label={t("settings.helpHowToUse")}>
              <span className="mac-inspector-meta">1. {t("scripts.fetchSubtitles")} / {t("scripts.transcribeSubtitles")} → 2. {t("scripts.generateInsights")} → 3. {t("scripts.generateNotes")}</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.helpWorkflowDesc")} label={t("settings.helpWorkflow")}>
              <span className="mac-inspector-meta">{t("settings.helpWorkflowValue")}</span>
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
            <MacSettingsRow detail={t("settings.helpTroubleshootingDesc")} label={t("settings.helpTroubleshooting")}>
              <span className="mac-inspector-meta">{t("settings.helpTroubleshootingValue")}</span>
            </MacSettingsRow>
            <MacSettingsRow detail={t("settings.feedbackDesc")} label={t("settings.feedback")}>
              <span className="mac-inspector-meta">{t("settings.feedbackValue")}</span>
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
            <MacSettingsRow detail={t("settings.localeDesc")} label={t("settings.locale")}>
              <span className="mac-inspector-meta">
                {languageOptions.find((language) => language.value === config.preferences.language)?.detail}
                {" · "}
                {config.preferences.language}
              </span>
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
            <MacSettingsRow detail={t("settings.fontDesc")} label={t("settings.font")}>
              <select
                className="mac-select"
                onChange={(event) => {
                  const fontFamily = event.target.value as FontPreference;
                  updatePreferences({ fontFamily });
                  onFontChange?.(fontFamily);
                }}
                value={config.preferences.fontFamily}
              >
                {fontOptions.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label} · {font.detail}
                  </option>
                ))}
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
