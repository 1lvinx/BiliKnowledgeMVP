import {
  CheckCircle2,
  Circle,
  Clock,
  FolderTree,
  Link as LinkIcon,
  Lightbulb,
  ListChecks,
  Sparkles,
  Tag,
  Wrench,
} from "lucide-react";
import { Video, VideoInsight } from "../types";
import { t } from "../i18n";
import { MacTagPill } from "./MacUI";

interface InsightPanelProps {
  video: Video | null;
  insight: VideoInsight | null;
  relatedInsights?: VideoInsight[];
}

function InsightPanel({ video, insight, relatedInsights = [] }: InsightPanelProps) {
  if (!video) {
    return (
      <div className="insight-panel insight-empty">
        <Sparkles size={32} />
        <h3>{t("insight.selectVideo")}</h3>
        <p>{t("insight.selectVideoHint")}</p>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="insight-panel insight-no-data">
        <div className="insight-no-data-icon">
          <Lightbulb size={24} />
        </div>
        <h3>{t("insight.noInsight")}</h3>
        <p>{t("insight.noInsightHint")}</p>
        <div className="insight-video-context">
          <span>{video.title}</span>
          <span>{video.uploader}</span>
        </div>
      </div>
    );
  }

  const keyPoints = Array.isArray(insight.key_points) ? insight.key_points : [];
  const useCases = Array.isArray(insight.use_cases) ? insight.use_cases : [];
  const problems = Array.isArray(insight.problem_statements) ? insight.problem_statements : [];
  const actionItems = Array.isArray(insight.action_items) ? insight.action_items : [];
  const reusableValue = Array.isArray(insight.reusable_value) ? insight.reusable_value : [];
  const workflowSteps = Array.isArray(insight.workflow_steps) ? insight.workflow_steps : [];
  const evidence = Array.isArray(insight.evidence) ? insight.evidence : [];
  const limitations = Array.isArray(insight.limitations) ? insight.limitations : [];
  const evidenceQuality = insight.evidence_quality || "medium";
  const tags = Array.isArray(insight.insight_tags) ? insight.insight_tags : [];
  const categories = Array.isArray(insight.category_paths) ? insight.category_paths : [];
  const coreAssets = Array.isArray(insight.core_assets) ? insight.core_assets : [];

  return (
    <div className="insight-panel">
      {/* Header */}
      <header className="insight-header">
        <div className="insight-header-badge">
          <Sparkles size={12} />
          {t("insight.title")}
        </div>
        <div className="insight-header-meta">
          <Clock size={12} />
          {t("insight.lastUpdated", { date: insight.updated_at })}
        </div>
      </header>

      {/* Summary */}
      <section className="insight-section">
        <h4 className="insight-section-title">
          <Lightbulb size={14} />
          {t("insight.summary")}
        </h4>
        <p className="insight-summary-text">{insight.summary}</p>
        <div className="mac-row-meta mt-3">证据质量：{evidenceQuality}</div>
      </section>

      {/* Key Points */}
      <section className="insight-section">
        <h4 className="insight-section-title">
          <ListChecks size={14} />
          {t("insight.keyPoints")}
        </h4>
        <ul className="insight-list">
          {keyPoints.map((point, index) => (
            <li className="insight-list-item" key={index}>
              <CheckCircle2 size={14} className="insight-check" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {useCases.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <Lightbulb size={14} />
            {t("insight.useCases")}
          </h4>
          <ul className="insight-list">
            {useCases.map((item, index) => (
              <li className="insight-list-item" key={index}>
                <CheckCircle2 size={14} className="insight-check" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {reusableValue.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <Wrench size={14} />
            可复用价值
          </h4>
          <ul className="insight-list">
            {reusableValue.map((item, index) => (
              <li className="insight-list-item" key={index}>
                <CheckCircle2 size={14} className="insight-check" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {workflowSteps.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <ListChecks size={14} />
            操作流程 / 方法
          </h4>
          <ul className="insight-list">
            {workflowSteps.map((item, index) => (
              <li className="insight-list-item insight-action-item" key={index}>
                <span className="insight-action-num">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <CheckCircle2 size={14} />
            判断依据
          </h4>
          <ul className="insight-list">
            {evidence.map((item, index) => (
              <li className="insight-list-item" key={index}>
                <CheckCircle2 size={14} className="insight-check" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {limitations.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <Circle size={14} />
            限制与风险
          </h4>
          <ul className="insight-list">
            {limitations.map((item, index) => (
              <li className="insight-list-item" key={index}>
                <Circle size={10} className="insight-check" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {problems.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <Circle size={14} />
            {t("insight.problems")}
          </h4>
          <ul className="insight-list">
            {problems.map((item, index) => (
              <li className="insight-list-item insight-action-item" key={index}>
                <span className="insight-action-num">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Action Items */}
      <section className="insight-section">
        <h4 className="insight-section-title">
          <Circle size={14} />
          {t("insight.actionItems")}
        </h4>
        <ul className="insight-list">
          {actionItems.map((item, index) => (
            <li className="insight-list-item insight-action-item" key={index}>
              <span className="insight-action-num">{index + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {coreAssets.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <Wrench size={14} />
            {t("insight.coreAssets")}
          </h4>
          <div className="insight-related">
            {coreAssets.map((asset, index) => (
              <div className="insight-related-item" key={`${asset.name}-${index}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="insight-related-id">{asset.name}</div>
                  {asset.asset_type && <MacTagPill tone="cool">{asset.asset_type}</MacTagPill>}
                </div>
                {asset.role && <div className="insight-related-summary">{asset.role}</div>}
                {asset.solves && <div className="insight-related-summary">{asset.solves}</div>}
                {Array.isArray(asset.notes) && asset.notes.length > 0 && (
                  <ul className="insight-list mt-3">
                    {asset.notes.map((note, noteIndex) => (
                      <li className="insight-list-item" key={noteIndex}>
                        <CheckCircle2 size={14} className="insight-check" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {asset.url && (
                  <a className="mac-row-meta mt-3 inline-flex items-center gap-1" href={asset.url} rel="noreferrer" target="_blank">
                    <LinkIcon size={12} />
                    {t("insight.assetLink")}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <FolderTree size={14} />
            {t("insight.categories")}
          </h4>
          <div className="insight-tags">
            {categories.map((tag) => (
              <MacTagPill key={tag} tone="warm">
                {tag}
              </MacTagPill>
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      <section className="insight-section">
        <h4 className="insight-section-title">
          <Tag size={14} />
          {t("insight.tags")}
        </h4>
        <div className="insight-tags">
          {tags.map((tag) => (
            <MacTagPill key={tag} tone="cool">
              {tag}
            </MacTagPill>
          ))}
        </div>
      </section>

      {/* Related Insights */}
      {relatedInsights.length > 0 && (
        <section className="insight-section">
          <h4 className="insight-section-title">
            <Sparkles size={14} />
            {t("insight.related")}
          </h4>
          <div className="insight-related">
            {relatedInsights.slice(0, 3).map((related) => (
              <div className="insight-related-item" key={related.video_id}>
                <div className="insight-related-id">{related.video_id}</div>
                <div className="insight-related-summary">
                  {related.summary.slice(0, 80)}...
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export { InsightPanel };
