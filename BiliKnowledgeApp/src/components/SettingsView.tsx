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

interface Config {
  bilibili: {
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
  };
}

const defaultConfig: Config = {
  bilibili: { sessdata: "", bili_jct: "", buvid3: "", dedeuserid: "" },
  ai: {
    provider: "anthropic",
    api_key: "",
    base_url: "",
    model: "claude-3-5-sonnet-20241022",
  },
  preferences: {
    language: "zh-CN",
  },
};

const languageOptions = [
  { value: "zh-CN", label: "中文（简体）", detail: "Chinese Simplified" },
  { value: "en-US", label: "English", detail: "English" },
  { value: "en-SG", label: "English (Singapore)", detail: "Singapore English" },
  { value: "ru-RU", label: "Русский", detail: "Russian" },
  { value: "ja-JP", label: "日本語", detail: "Japanese" },
  { value: "ko-KR", label: "한국어", detail: "Korean" },
];

const settingsSections = [
  "General",
  "Knowledge Base",
  "Import",
  "Validation",
  "AI",
  "Security",
  "Scripts",
  "Export & Backup",
  "Appearance",
];

type SettingsSection = (typeof settingsSections)[number];

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

export function SettingsView({ onLanguageChange }: { onLanguageChange?: (lang: string) => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("General");
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

  async function saveConfig() {
    if (!config) return;
    try {
      setSaving(true);
      if (!isTauriRuntime()) {
        window.localStorage.setItem(previewStorageKey, JSON.stringify(config));
        setMessage({ type: "success", text: "Preview preferences saved" });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      await invoke("save_config", { config: JSON.stringify(config) });
      setMessage({ type: "success", text: "Preferences saved" });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: "error", text: "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (!config) return;
    document.documentElement.lang = config.preferences.language;
  }, [config]);

  if (loading) {
    return <div className="mac-empty-state">Loading preferences...</div>;
  }
  if (!config) return null;

  return (
    <div className="mac-settings-layout">
      <nav className="mac-settings-nav">
        {settingsSections.map((section) => (
          <button
            className={cn(activeSection === section && "is-active")}
            key={section}
            onClick={() => setActiveSection(section)}
            type="button"
          >
            {section}
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

        {activeSection === "General" && (
          <MacSettingsGroup title="General">
            <MacSettingsRow
              detail="Local Markdown workspace used by the app."
              label="Knowledge Base Location"
            >
              <span className="mac-inspector-meta">../BiliKnowledge</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Modern light dashboard appearance." label="Appearance">
              <select className="mac-select" defaultValue="system">
                <option value="system">System</option>
                <option value="light">Light</option>
              </select>
            </MacSettingsRow>
            <MacSettingsRow detail="Sets the preferred app language for supported UI text." label="Language">
              <select
                className="mac-select"
                onChange={(event) => {
                  setConfig({
                    ...config,
                    preferences: { ...config.preferences, language: event.target.value },
                  });
                  onLanguageChange?.(event.target.value);
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
          </MacSettingsGroup>
        )}

        {activeSection === "Knowledge Base" && (
          <MacSettingsGroup title="Knowledge Base">
            <MacSettingsRow
              detail="Local Markdown workspace used by the app."
              label="Workspace"
            >
              <span className="mac-inspector-meta">../BiliKnowledge</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Raw Markdown notes generated per video." label="Notes Path">
              <span className="mac-inspector-meta">BiliKnowledge/notes/raw</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Project candidates extracted from notes." label="Projects Path">
              <span className="mac-inspector-meta">BiliKnowledge/projects</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Manifests and processing status." label="Manifest Path">
              <span className="mac-inspector-meta">BiliKnowledge/manifest</span>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "Import" && (
          <MacSettingsGroup title="Import">
            <MacSettingsRow detail="Used by local Bilibili favorite parsing." label="SESSDATA">
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
            <MacSettingsRow detail="Avoid importing duplicate BV items." label="Detect Duplicates">
              <span aria-label="Enabled" className="mac-switch is-on" role="switch" aria-checked="true" />
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "Validation" && (
          <MacSettingsGroup title="Validation">
            <MacSettingsRow detail="Check structure, links, and sensitive data." label="Health Check">
              <span className="mac-status-pill tone-green">Enabled</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Flag notes not referenced by the manifest." label="Orphan Notes">
              <span className="mac-status-pill tone-orange">Review</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Avoid keeping cookies or API keys in reports." label="Sensitive Data Scan">
              <span className="mac-status-pill tone-green">Enabled</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Validate internal Markdown links." label="Link Check">
              <span className="mac-status-pill tone-green">Enabled</span>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "AI" && (
          <MacSettingsGroup title="AI">
            <MacSettingsRow label="Provider">
              <select
                className="mac-select"
                onChange={(event) =>
                  setConfig({ ...config, ai: { ...config.ai, provider: event.target.value } })
                }
                value={config.ai.provider}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </MacSettingsRow>
            <MacSettingsRow label="API Key">
              <SettingInput
                onChange={(value) => setConfig({ ...config, ai: { ...config.ai, api_key: value } })}
                type="password"
                value={config.ai.api_key}
              />
            </MacSettingsRow>
            <MacSettingsRow label="Model">
              <SettingInput
                onChange={(value) => setConfig({ ...config, ai: { ...config.ai, model: value } })}
                value={config.ai.model}
              />
            </MacSettingsRow>
            <MacSettingsRow label="Base URL">
              <SettingInput
                onChange={(value) => setConfig({ ...config, ai: { ...config.ai, base_url: value } })}
                value={config.ai.base_url}
              />
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "Security" && (
          <MacSettingsGroup title="Security">
            <MacSettingsRow detail="Configured in Tauri CSP." label="Content Security Policy">
              <span className="mac-status-pill tone-green">Enabled</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Notes open in reader mode by default." label="Read-only Note Mode">
              <span aria-label="Enabled" className="mac-switch is-on" role="switch" aria-checked="true" />
            </MacSettingsRow>
            <MacSettingsRow detail="Knowledge paths are constrained in the backend." label="Path Whitelist">
              <span className="mac-status-pill tone-green">Enabled</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Only bundled knowledge scripts are listed." label="Script Whitelist">
              <span className="mac-status-pill tone-green">Enabled</span>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "Scripts" && (
          <MacSettingsGroup title="Scripts">
            <MacSettingsRow detail="Import Bilibili favorites into manifest." label="parse_favorites.py">
              <span className="mac-status-pill tone-green">Allowed</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Scan notes for repositories and packages." label="extract_projects.py">
              <span className="mac-status-pill tone-green">Allowed</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Regenerate knowledge index and reports." label="build_index.py">
              <span className="mac-status-pill tone-green">Allowed</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Run structure and data validation." label="validate_knowledge_base.py">
              <span className="mac-status-pill tone-green">Allowed</span>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "Export & Backup" && (
          <MacSettingsGroup title="Export & Backup">
            <MacSettingsRow label="Export Location">
              <span className="mac-inspector-meta">BiliKnowledge/projects</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Use local files only." label="Auto Backup">
              <span aria-label="Disabled" className="mac-switch" role="switch" aria-checked="false" />
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        {activeSection === "Appearance" && (
          <MacSettingsGroup title="Appearance">
            <MacSettingsRow detail="Choose Chinese, English, Singapore English, Russian, Japanese, or Korean." label="Language">
              <select
                className="mac-select"
                onChange={(event) => {
                  setConfig({
                    ...config,
                    preferences: { ...config.preferences, language: event.target.value },
                  });
                  onLanguageChange?.(event.target.value);
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
            <MacSettingsRow detail="Current language locale code." label="Locale">
              <span className="mac-inspector-meta">
                {languageOptions.find((language) => language.value === config.preferences.language)?.detail}
                {" · "}
                {config.preferences.language}
              </span>
            </MacSettingsRow>
            <MacSettingsRow detail="Current optimized dashboard theme." label="Theme">
              <select className="mac-select" defaultValue="modern-light">
                <option value="modern-light">Modern Light</option>
                <option value="system">System</option>
              </select>
            </MacSettingsRow>
            <MacSettingsRow detail="Readable UI stack with Chinese fallbacks." label="Font">
              <span className="mac-inspector-meta">Inter / PingFang SC / Noto Sans SC</span>
            </MacSettingsRow>
            <MacSettingsRow detail="Compact but readable desktop density." label="Density">
              <select className="mac-select" defaultValue="comfortable">
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </MacSettingsRow>
          </MacSettingsGroup>
        )}

        <div className="flex justify-end pb-10">
          <MacToolbarButton
            disabled={saving}
            label={saving ? "Saving" : "Save"}
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
