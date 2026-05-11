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
