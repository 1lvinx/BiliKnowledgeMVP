import { useRef, useEffect } from "react";
import { cn } from "../lib/utils";

interface Props {
  logs: string[];
}

export function LogViewer({ logs }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      className="mac-console-body h-full custom-scrollbar"
    >
      {logs.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="mac-console-empty">等待任务执行...</p>
        </div>
      ) : (
        logs.map((log, i) => {
          const isError = log.includes("[ERROR]") || log.includes("[错误]");
          const isSystem = log.includes("[系统]") || log.includes(">>>");

          return (
            <div key={i} className={cn(
              "mac-console-line",
              isError ? "is-error" : isSystem ? "is-system" : undefined
            )}>
              <span>{(i + 1).toString().padStart(3, '0')}</span>
              <code>{log}</code>
            </div>
          );
        })
      )}
    </div>
  );
}
