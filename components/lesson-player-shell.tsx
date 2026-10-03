'use client';

import React from 'react';
import { Play, SkipBack, SkipForward, Volume2, Sparkles, Pencil, Maximize2 } from 'lucide-react';
import type { Lesson, LessonStep } from '@/types';

interface LessonPlayerShellProps {
  lesson: Lesson;
  steps: LessonStep[];
}

/**
 * Structured Player Container Shell ready for Push 3 animated canvas & voice narration.
 */
export function LessonPlayerShell({ lesson, steps }: LessonPlayerShellProps) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
            <Pencil className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">Animated Drawing Canvas</h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Push 3 Interactive Player Slot
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <span className="rounded-md bg-[var(--surface-secondary)] px-2 py-0.5 font-mono">
            {steps.length > 0 ? `${steps.length} Steps` : '0 Steps Generated'}
          </span>
        </div>
      </div>

      {/* Canvas Viewport Area */}
      <div className="relative aspect-[4/3] sm:aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] flex flex-col items-center justify-center p-6 text-center">
        {/* Subtle background grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(var(--text) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }}
        />

        <div className="relative z-10 max-w-sm space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] shadow-sm">
            <Sparkles className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-bold text-[var(--text)]">
            Player Slot Ready for Push 3
          </h4>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            In Push 2, Gemini will decompose this photo into SVG strokes and Bengali/English narration. In Push 3, this canvas will play animated step-by-step guidance.
          </p>
        </div>

        {/* Mock/Disabled Timeline Bar */}
        <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between rounded-xl bg-[var(--surface)]/90 backdrop-blur-sm border border-[var(--border)] px-4 py-2 opacity-60">
          <div className="flex items-center gap-2">
            <button disabled className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Previous step">
              <SkipBack className="h-4 w-4" />
            </button>
            <button disabled className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white" aria-label="Play animation">
              <Play className="h-3.5 w-3.5 fill-white" />
            </button>
            <button disabled className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Next step">
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono">
            <span>Step 0 / {steps.length || 0}</span>
          </div>

          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="text-[10px] text-[var(--text-muted)] font-medium">
              {lesson.voice_language === 'bn' ? 'বাংলা' : 'EN'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
