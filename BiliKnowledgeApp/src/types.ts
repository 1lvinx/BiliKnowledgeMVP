export interface Video {
  id: string;
  title: string;
  url: string;
  uploader: string;
  favorite_folder: string;
  category: string;
  tags: string[];
  duration: string;
  pubdate: string;
  priority: "P0" | "P1" | "P2";
  status: string;
  note_path: string;
  project_extracted: boolean;
  remarks: string;
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
}
