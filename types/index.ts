export type ThemeMode = 'light' | 'dark' | 'system';
export type DifficultyLevel = 'easy' | 'medium' | 'detailed';
export type VoiceLanguage = 'bn' | 'en';
export type LessonStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type LessonStage = 'queued' | 'analyzing' | 'tracing' | 'composing' | 'ready' | 'failed';
export type PerformanceMode = 'auto' | 'standard' | 'lite';

export type PartKind = 'main-shape' | 'secondary' | 'detail' | 'texture' | 'shading' | 'background';
export type ApproxShape = 'circle' | 'ellipse' | 'rect' | 'triangle' | 'polygon' | 'freeform';
export type PathKind = 'guide' | 'shape' | 'contour' | 'detail' | 'shade';

export interface LessonPart {
  id: string;
  name: string;
  kind: PartKind;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  approx_shape: ApproxShape;
  draw_order: number;
  tips: string[];
}

export interface LessonAnalysisStep {
  title: string;
  goal: string;
  part_ids: string[];
  instruction: string;
  narration: string;
  common_mistake?: string;
  tip?: string;
}

export interface LessonAnalysis {
  title: string;
  subject_summary: string;
  overall_proportions: string;
  parts: LessonPart[];
  steps: LessonAnalysisStep[];
}

export interface StepPath {
  d: string;
  kind: PathKind;
  length: number;
  order: number;
  stroke_width: number;
  opacity: number;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  theme: ThemeMode;
  default_difficulty: DifficultyLevel;
  voice_language: VoiceLanguage;
  performance_mode?: PerformanceMode;
  created_at: string;
}

export interface LessonProgress {
  user_id: string;
  lesson_id: string;
  last_step: number;
  completed: boolean;
  updated_at: string;
}

export interface Lesson {
  id: string;
  user_id: string;
  title: string;
  image_path: string;
  difficulty: DifficultyLevel;
  voice_language: VoiceLanguage;
  status: LessonStatus;
  stage?: LessonStage;
  progress?: number;
  attempts?: number;
  viewbox_w?: number;
  viewbox_h?: number;
  started_at?: string | null;
  finished_at?: string | null;
  error_message: string | null;
  analysis?: LessonAnalysis | null;
  created_at: string;
  updated_at: string;
  signed_image_url?: string | null;
  user_progress?: LessonProgress | null;
}

export interface LessonStep {
  id: string;
  lesson_id: string;
  step_index: number;
  title: string | null;
  instruction: string | null;
  narration: string | null;
  paths: StepPath[] | null;
  duration_ms: number | null;
  audio_path?: string | null;
  audio_duration_ms?: number | null;
  audio_url?: string | null;
  goal?: string | null;
  tip?: string | null;
  common_mistake?: string | null;
}

export type FeedbackArea =
  | 'proportion'
  | 'line-quality'
  | 'shape-accuracy'
  | 'detail'
  | 'shading'
  | 'composition';

export interface FeedbackImprovement {
  area: FeedbackArea;
  what_you_did: string;
  how_to_fix: string;
  practice_tip: string;
}

export interface FeedbackResult {
  summary: string;
  strengths: string[];
  improvements: FeedbackImprovement[];
  next_challenge: string;
}

export interface LessonFeedback {
  id: string;
  lesson_id: string;
  user_id: string;
  image_path: string | null;
  status: string;
  result: FeedbackResult | null;
  created_at: string;
  signed_image_url?: string | null;
}
