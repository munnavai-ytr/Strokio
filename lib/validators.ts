import { z } from 'zod';

export const createLessonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty')
    .max(120, 'Title cannot exceed 120 characters')
    .default('Drawing Lesson'),
  difficulty: z.enum(['easy', 'medium', 'detailed'], {
    message: 'Difficulty must be easy, medium, or detailed',
  }).default('easy'),
  voice_language: z.enum(['bn', 'en'], {
    message: 'Voice language must be bn (Bengali) or en (English)',
  }).default('bn'),
});

export const updateProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'Display name cannot be empty')
    .max(50, 'Display name cannot exceed 50 characters')
    .optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  default_difficulty: z.enum(['easy', 'medium', 'detailed']).optional(),
  voice_language: z.enum(['bn', 'en']).optional(),
  performance_mode: z.enum(['auto', 'standard', 'lite']).optional(),
});

export const updateProgressSchema = z.object({
  last_step: z.number().int().min(0),
  completed: z.boolean().default(false),
});

export const feedbackImprovementSchema = z.object({
  area: z.enum([
    'proportion',
    'line-quality',
    'shape-accuracy',
    'detail',
    'shading',
    'composition',
  ]),
  what_you_did: z.string().min(1),
  how_to_fix: z.string().min(1),
  practice_tip: z.string().min(1),
});

export const feedbackResultSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()).min(1),
  improvements: z.array(feedbackImprovementSchema).min(1),
  next_challenge: z.string().min(1),
});

export const magicLinkAuthSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
});

export const lessonPartSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['main-shape', 'secondary', 'detail', 'texture', 'shading', 'background']),
  box_2d: z.tuple([
    z.number().min(0).max(1000),
    z.number().min(0).max(1000),
    z.number().min(0).max(1000),
    z.number().min(0).max(1000),
  ]),
  approx_shape: z.enum(['circle', 'ellipse', 'rect', 'triangle', 'polygon', 'freeform']),
  draw_order: z.number().int().nonnegative(),
  tips: z.array(z.string()).default([]),
});

export const lessonAnalysisStepSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  part_ids: z.array(z.string()).default([]),
  instruction: z.string().min(1),
  narration: z.string().min(1),
  common_mistake: z.string().optional(),
  tip: z.string().optional(),
});

export const lessonAnalysisSchema = z.object({
  title: z.string().min(1),
  subject_summary: z.string().min(1),
  overall_proportions: z.string().min(1),
  parts: z.array(lessonPartSchema).min(1),
  steps: z.array(lessonAnalysisStepSchema).min(4),
}).refine(
  (data) => {
    const validPartIds = new Set(data.parts.map((p) => p.id));
    return data.steps.every((s) => s.part_ids.every((id) => validPartIds.has(id)));
  },
  {
    message: 'Every part_id in steps must exist in parts.',
  }
);

export const narrationRequestSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
});

