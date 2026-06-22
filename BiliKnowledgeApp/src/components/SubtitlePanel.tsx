import { useState } from "react";
import {
  Bot,
  Captions,
  Clock,
  Download,
  Languages,
  Search,
} from "lucide-react";
import { Video, VideoSubtitle, SubtitleSegment } from "../types";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { MacToolbarButton } from "./MacUI";

interface SubtitlePanelProps {
  video: Video | null;
  subtitle: VideoSubtitle | null;
  onExtract?: (videoId: string) => void;
  isExtracting?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function SubtitlePanel({
  video,
  subtitle,
  onExtract,
  isExtracting = false,
}: SubtitlePanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);

  if (!video) {
    return (
      <div className="subtitle-panel subtitle-empty">
        <Captions size={32} />
        <h3>{t("subtitle.selectVideo")}</h3>
        <p>{t("subtitle.selectVideoHint")}</p>
      </div>
    );
  }

  if (!subtitle) {
    return (
      <div className="subtitle-panel subtitle-no-data">
        <div className="subtitle-no-data-icon">
          <Captions size={24} />
        </div>
        <h3>{t("subtitle.noSubtitle")}</h3>
        <p>{t("subtitle.noSubtitleHint")}</p>
        <div className="subtitle-video-context">
          <span>{video.title}</span>
          <span>{video.id}</span>
        </div>
        {onExtract && (
          <MacToolbarButton
            icon={<Download size={14} />}
            label={isExtracting ? t("subtitle.extracting") : t("subtitle.extractSubtitle")}
            onClick={() => onExtract(video.id)}
            disabled={isExtracting}
            primary
          />
        )}
      </div>
    );
  }

  const filteredSegments = searchTerm
    ? subtitle.segments.filter((seg) =>
        seg.text.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : subtitle.segments;

  return (
    <div className="subtitle-panel">
      {/* Header */}
      <header className="subtitle-header">
        <div className="subtitle-header-info">
          <div className="subtitle-header-badge">
            <Captions size={12} />
            {t("subtitle.title")}
          </div>
          <div className="subtitle-header-meta">
            <span className="subtitle-source">
              {subtitle.source === "cc" ? (
                <>
                  <Languages size={12} />
                  {t("subtitle.ccSource")}
                </>
              ) : (
                <>
                  <Bot size={12} />
                  {t("subtitle.aiSource")}
                </>
              )}
            </span>
            <span className="subtitle-lang">{subtitle.language.toUpperCase()}</span>
            <span className="subtitle-count">
              {subtitle.segments.length} {t("subtitle.segments")}
            </span>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="subtitle-search">
        <Search size={14} />
        <input
          type="text"
          placeholder={t("subtitle.searchPlaceholder")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Segments */}
      <div className="subtitle-segments">
        {filteredSegments.length === 0 ? (
          <p className="subtitle-no-results">{t("subtitle.noResults")}</p>
        ) : (
          filteredSegments.map((segment, index) => (
            <SubtitleSegmentRow
              key={index}
              segment={segment}
              isSelected={selectedSegment === subtitle.segments.indexOf(segment)}
              onClick={() => setSelectedSegment(subtitle.segments.indexOf(segment))}
            />
          ))
        )}
      </div>

      {/* Full Text */}
      <div className="subtitle-fulltext">
        <h4>{t("subtitle.fullText")}</h4>
        <p>{subtitle.raw_text}</p>
      </div>
    </div>
  );
}

function SubtitleSegmentRow({
  segment,
  isSelected,
  onClick,
}: {
  segment: SubtitleSegment;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn("subtitle-segment", isSelected && "is-selected")}
      onClick={onClick}
      type="button"
    >
      <div className="subtitle-segment-time">
        <Clock size={12} />
        <span>{formatTime(segment.start)}</span>
      </div>
      <div className="subtitle-segment-text">{segment.text}</div>
    </button>
  );
}

export { SubtitlePanel };
