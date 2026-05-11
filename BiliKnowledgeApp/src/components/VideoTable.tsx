import { Video } from "../types";
import { cn } from "../lib/utils";
import { User } from "lucide-react";

interface Props {
  videos: Video[];
  onSelect: (video: Video) => void;
  selectedId?: string;
}

export function VideoTable({ videos, onSelect, selectedId }: Props) {
  if (videos.length === 0) {
    return (
      <div className="mac-empty-state">
        <p>无匹配结果</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto custom-scrollbar">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead className="sticky top-0 z-10 border-b border-[var(--bk-separator)] bg-[var(--bk-content-bg)]">
          <tr className="font-medium text-[var(--bk-tertiary-label)]">
            <th className="w-1/2 px-4 py-2">标题</th>
            <th className="px-4 py-2">UP主</th>
            <th className="px-4 py-2">分类</th>
            <th className="px-4 py-2">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--bk-separator)]">
          {videos.map((video) => (
            <tr 
              key={video.id} 
              onClick={() => onSelect(video)}
              className={cn(
                "cursor-default transition-colors",
                selectedId === video.id ? "bg-[var(--bk-blue-soft)]" : "hover:bg-[rgba(120,120,128,0.07)]"
              )}
            >
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <div className={cn(
                    "line-clamp-1 font-medium",
                    selectedId === video.id ? "text-[var(--bk-blue)]" : "text-[var(--bk-label)]"
                  )}>
                    {video.title}
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 text-[11px]",
                    "text-[var(--bk-tertiary-label)]"
                  )}>
                    <span>{video.pubdate}</span>
                    <span>{video.id}</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className={cn(
                  "flex items-center gap-1.5",
                  selectedId === video.id ? "text-[var(--bk-blue)]" : "text-[var(--bk-secondary-label)]"
                )}>
                  <User size={10} /> {video.uploader}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={cn(
                  "mac-tag-pill",
                  selectedId === video.id && "text-[var(--bk-blue)]"
                )}>
                  {video.category}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={video.status} active={selectedId === video.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status, active }: { status: string, active: boolean }) {
  const label = status === 'pending' ? '待复核' : status === 'reviewed' ? '已复核' : '已归档';
  const color = status === 'pending' ? 'bg-[var(--bk-orange)]' : status === 'reviewed' ? 'bg-[var(--bk-green)]' : 'bg-[var(--bk-quaternary-label)]';
  
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-white" : color)}></div>
      <span className={cn("text-[11px]", active ? "text-[var(--bk-blue)]" : "text-[var(--bk-secondary-label)]")}>{label}</span>
    </div>
  );
}
