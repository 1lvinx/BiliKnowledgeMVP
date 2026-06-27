export interface TokenUsage {
  mode: "insight" | "note" | "github_repo_match" | string;
  provider?: string;
  model?: string;
  estimated?: boolean;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  measured_at?: string;
  source?: "api_usage" | "local_estimate" | string;
}

export interface Video {
  id: string;
  title: string;
  url: string;
  uploader: string;
  collected_at?: string;
  favorite_folder: string;
  category: string;
  tags: string[];
  duration: string;
  pubdate: string;
  priority: "P0" | "P1" | "P2";
  status: string;
  note_path: string;
  note_ready?: boolean;
  note_generated_at?: string;
  note_generation_mode?: "single" | "batch";
  note_token_usage?: TokenUsage;
  token_usage?: {
    insight?: TokenUsage;
    note?: TokenUsage;
    github_repo_match?: TokenUsage;
    [key: string]: TokenUsage | undefined;
  };
  project_extracted: boolean;
  remarks: string;
}

export interface FavoriteFolder {
  id: string;
  title: string;
  media_count: number;
  latest_ts?: number;
  latest_collected_at?: string;
  sync_status?: "complete" | "partial" | "failed";
  synced_count?: number;
  error?: string;
}

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoSubtitle {
  video_id: string;
  language: string;
  source: "cc" | "ai" | "asr";
  segments: SubtitleSegment[];
  raw_text: string;
  created_at: string;
  validation?: {
    status: "valid" | "mismatch";
    reason?: string;
    matched_keywords?: string[];
  };
}

export interface VideoInsight {
  video_id: string;
  summary: string;
  key_points: string[];
  action_items: string[];
  insight_tags: string[];
  use_cases: string[];
  problem_statements: string[];
  category_paths: string[];
  reusable_value?: string[];
  workflow_steps?: string[];
  evidence?: string[];
  limitations?: string[];
  evidence_quality?: "high" | "medium" | "low" | string;
  core_assets: Array<{
    name: string;
    asset_type: string;
    url: string;
    role: string;
    solves: string;
    notes: string[];
  }>;
  token_usage?: TokenUsage;
  created_at: string;
  updated_at: string;
}

export interface PipelineFlags {
  manifest_generated: boolean;
  notes_generated: boolean;
  projects_extracted: boolean;
  index_built: boolean;
  validated: boolean;
}

export interface ProcessingStatus {
  last_updated: string;
  total_videos: number;
  pending: number;
  note_created: number;
  projects_extracted: number;
  reviewed: number;
  sample_limit?: number;
  pipeline: PipelineFlags;
}

export interface Project {
  name: string;
  url: string;
  source_note: string;
  source_video: string;
  type: string;
  tech_stack: string[];
  description: string;
  mentioned_context: string;
  reusable_value: string;
  commercial_value: string;
  risk: string;
  priority: string;
  status: string;
  need_verify: boolean;
  match_source?: string;
  match_confidence?: number;
  match_reason?: string;
  matched_terms?: string[];
  homepage?: string;
  stars?: number;
  forks?: number;
  watchers?: number;
  open_issues?: number;
  language?: string;
  license?: string;
  archived?: boolean;
  default_branch?: string;
  pushed_at?: string;
}
