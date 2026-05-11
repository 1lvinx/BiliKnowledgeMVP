import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/utils";

interface ShellProps {
  sidebar: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
}

export function MacAppShell({ sidebar, toolbar, children }: ShellProps) {
  return (
    <div className="mac-window">
      {sidebar}
      <main className="mac-main">
        {toolbar}
        {children}
      </main>
    </div>
  );
}

export function MacSidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="mac-sidebar">
      <div className="mac-sidebar-brand">
        <div className="mac-sidebar-brand-mark">BK</div>
        <div className="mac-sidebar-brand-copy">
          <strong>BiliKnowledge</strong>
          <span>Local intelligence studio</span>
        </div>
      </div>
      {children}
    </aside>
  );
}

export function MacSidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mac-sidebar-section">
      <div className="mac-sidebar-label">{title}</div>
      <div className="mac-sidebar-items">{children}</div>
    </section>
  );
}

export function MacSidebarItem({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  onClick: () => void;
}) {
  return (
    <button
      className={cn("mac-sidebar-item", active && "is-active")}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      type="button"
    >
      <span className="mac-sidebar-icon">{icon}</span>
      <span className="mac-sidebar-title">{label}</span>
      {badge !== undefined && <span className="mac-sidebar-badge">{badge}</span>}
    </button>
  );
}

export function MacToolbar({
  title,
  subtitle,
  leading,
  controls,
  search,
  action,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  controls?: ReactNode;
  search?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mac-toolbar">
      <div className="mac-toolbar-leading">
        {leading}
        <div className="mac-toolbar-title-group">
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>
      <div className="mac-toolbar-center">{controls}</div>
      <div className="mac-toolbar-trailing">
        {search}
        {action}
      </div>
    </header>
  );
}

export function MacToolbarButton({
  icon,
  label,
  ariaLabel,
  disabled,
  primary,
  onClick,
}: {
  icon?: ReactNode;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel ?? label}
      className={cn("mac-toolbar-button", primary && "is-primary")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

export function MacSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="mac-search-field">
      <Search aria-hidden="true" size={14} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
      />
    </label>
  );
}

export function MacSegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mac-segmented-control">
      {options.map((option) => (
        <button
          className={cn(option.value === value && "is-active")}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MacSplitView({
  children,
  columns = "1fr 320px",
}: {
  children: ReactNode;
  columns?: string;
}) {
  return (
    <div className="mac-split-view" style={{ gridTemplateColumns: columns }}>
      {children}
    </div>
  );
}

export function MacPanel({
  title,
  meta,
  children,
  className,
}: {
  title?: string;
  meta?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mac-panel", className)}>
      {(title || meta) && (
        <header className="mac-panel-header">
          {title && <h2>{title}</h2>}
          {meta && <span>{meta}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function MacStatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "blue" | "green" | "orange" | "red" | "neutral";
  children: ReactNode;
}) {
  return <span className={cn("mac-status-pill", `tone-${tone}`)}>{children}</span>;
}

export function MacTagPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warm" | "cool" | "critical" | "success";
}) {
  return <span className={cn("mac-tag-pill", `tone-${tone}`)}>{children}</span>;
}

export function MacEmptyState({
  icon,
  title,
  detail,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="mac-empty-state">
      {icon && <div className="mac-empty-icon">{icon}</div>}
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export function MacInlineNotice({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "error" | "success";
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("mac-inline-notice", `tone-${tone}`, className)}>{children}</div>;
}

export function MacConsole({
  logs,
  onClear,
}: {
  logs: string[];
  onClear?: () => void;
}) {
  return (
    <section className="mac-console">
      <header>
        <span>Output</span>
        {onClear && (
          <button onClick={onClear} type="button">
            Clear
          </button>
        )}
      </header>
      <div className="mac-console-body">
        {logs.length === 0 ? (
          <p className="mac-console-empty">No recent output.</p>
        ) : (
          logs.map((log, index) => (
            <div
              className={cn(
                "mac-console-line",
                log.includes("[ERROR]") || log.includes("[错误]")
                  ? "is-error"
                  : log.includes(">>>") || log.includes("[系统]")
                    ? "is-system"
                    : undefined,
              )}
              key={`${index}-${log}`}
            >
              <span>{String(index + 1).padStart(3, "0")}</span>
              <code>{log}</code>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function MacSettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mac-settings-group">
      <h2>{title}</h2>
      <div className="mac-settings-rows">{children}</div>
    </section>
  );
}

export function MacSettingsRow({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className="mac-settings-row">
      <div>
        <span>{label}</span>
        {detail && <p>{detail}</p>}
      </div>
      <div className="mac-settings-control">{children}</div>
    </div>
  );
}
