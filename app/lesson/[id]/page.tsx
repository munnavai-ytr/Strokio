'use client';

import React, { useState, useEffect, use, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Layers,
  Volume2,
  HardDrive,
  AlertCircle,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Lightbulb,
  AlertTriangle,
  Target,
  Trash2,
} from 'lucide-react';
import type { Lesson, LessonStep, LessonStage } from '@/types';
import { VectorDrawingPreview } from '@/components/vector-drawing-preview';
import { StepNarrationPlayer } from '@/components/step-narration-player';
import { LessonPlayerShell } from '@/components/lesson-player-shell';
import { isSupabaseConfigured } from '@/lib/supabase/client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LessonDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id: lessonId } = use(params);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [steps, setSteps] = useState<LessonStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Polling control
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<number>(2000);
  const fetchLessonRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

  const fetchLessonData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/lessons/${lessonId}`);
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (res.status === 404) {
          throw new Error('Lesson not found or you do not have permission to view it.');
        }
        throw new Error('Failed to retrieve lesson details.');
      }

      const data = await res.json();
      setLesson(data.lesson);
      setSteps(data.steps || []);

      // Adjust polling based on status
      const isStillWorking =
        data.lesson.status === 'queued' ||
        data.lesson.status === 'processing' ||
        (data.lesson.stage && data.lesson.stage !== 'ready' && data.lesson.stage !== 'failed');

      if (isStillWorking) {
        // Back off interval gradually up to 5000ms
        pollIntervalRef.current = Math.min(pollIntervalRef.current + 500, 5000);
        pollTimerRef.current = setTimeout(() => {
          fetchLessonRef.current?.(true);
        }, pollIntervalRef.current);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error fetching lesson');
    } finally {
      setIsLoading(false);
    }
  }, [lessonId, router]);

  useEffect(() => {
    fetchLessonRef.current = fetchLessonData;

    async function init() {
      await fetchLessonRef.current?.();
    }
    init();

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [fetchLessonData]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Retry failed');
      }

      // Reset polling interval and refetch immediately
      pollIntervalRef.current = 2000;
      await fetchLessonData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not retry lesson');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this lesson and its original image?')) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete lesson');
      }
      router.push('/library');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  if (isLoading && !lesson) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-40 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="skeleton h-72 rounded-3xl" />
          <div className="skeleton h-72 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (errorMessage && !lesson) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-[var(--danger)] mb-4">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text)]">Could Not Load Lesson</h2>
        <p className="mt-2 text-xs sm:text-sm text-[var(--text-muted)] max-w-sm">
          {errorMessage || 'The requested lesson does not exist in your account.'}
        </p>
        <Link
          href="/library"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--surface-secondary)] px-4 py-2.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--border)] transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Library</span>
        </Link>
      </div>
    );
  }

  if (!lesson) return null;

  const isWorking = lesson.status === 'queued' || lesson.status === 'processing';
  const isFailed = lesson.status === 'failed';
  const isReady = lesson.status === 'ready';

  const getStageTitle = (stage?: LessonStage) => {
    switch (stage) {
      case 'analyzing':
        return 'Analyzing photo & proportions with Gemini...';
      case 'tracing':
        return 'Tracing contours and vector shading layers...';
      case 'composing':
        return 'Composing pedagogical steps and geometry...';
      case 'ready':
        return 'Drawing lesson ready!';
      case 'failed':
        return 'Generation failed';
      case 'queued':
      default:
        return 'Waiting in queue...';
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/library"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)] transition shadow-sm"
            aria-label="Back to Library"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text)]">
              {lesson.title}
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Difficulty: <span className="capitalize font-semibold">{lesson.difficulty}</span> •{' '}
              {lesson.voice_language === 'bn' ? 'বাংলা (Bengali)' : 'English Voice'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isFailed && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition disabled:opacity-50"
            >
              <RotateCcw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Retrying...' : 'Retry Lesson'}</span>
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-[var(--danger-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-red-500/15 transition"
          >
            <Trash2 className="h-4 w-4" />
            <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
          </button>
        </div>
      </div>

      {/* Progress & Live Pipeline Stage Card */}
      {isWorking && (
        <div className="rounded-3xl border border-[var(--accent)]/30 bg-[var(--accent-subtle)] p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">
                  {getStageTitle(lesson.stage)}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  AI decomposition engine is generating your step-by-step lesson from this photo.
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-[var(--accent)]">
              {lesson.progress || 10}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[var(--border)] h-2 rounded-full overflow-hidden">
            <div
              className="bg-[var(--accent)] h-full transition-all duration-700 ease-out rounded-full"
              style={{ width: `${Math.max(lesson.progress || 10, 8)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 text-[10px] font-semibold text-[var(--text-muted)] text-center pt-1">
            <span className={lesson.stage === 'analyzing' ? 'text-[var(--accent)] font-bold' : ''}>
              1. Analyzing Proportions
            </span>
            <span className={lesson.stage === 'tracing' ? 'text-[var(--accent)] font-bold' : ''}>
              2. Tracing Vectors
            </span>
            <span className={lesson.stage === 'composing' ? 'text-[var(--accent)] font-bold' : ''}>
              3. Composing Steps
            </span>
          </div>
        </div>
      )}

      {/* Failed Card */}
      {isFailed && (
        <div className="rounded-3xl border border-red-500/30 bg-[var(--danger-subtle)] p-6 text-[var(--danger)] space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base">Lesson Generation Could Not Complete</h3>
              <p className="mt-1 text-xs opacity-90 leading-relaxed">
                {lesson.error_message ||
                  'The AI drawing engine encountered an issue processing this photo.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition active:scale-95"
          >
            <RotateCcw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>Try Generating Again</span>
          </button>
        </div>
      )}

      {/* Vector Drawing Preview & Photo Overlay (when ready) */}
      {isReady && (
        <VectorDrawingPreview
          photoUrl={lesson.signed_image_url || null}
          viewboxW={lesson.viewbox_w || 1024}
          viewboxH={lesson.viewbox_h || 1024}
          steps={steps}
        />
      )}

      {/* Structured Teaching Steps List (when ready) */}
      {isReady && steps.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text)]">
              Drawing Steps ({steps.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Follow along stroke by stroke. Narration is available in{' '}
              {lesson.voice_language === 'bn' ? 'Bengali (বাংলা)' : 'English'}.
            </p>
          </div>

          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div
                key={step.id || idx}
                className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-card space-y-4 transition hover:border-[var(--accent)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--accent)] text-white text-xs font-bold">
                      {idx + 1}
                    </span>
                    <h3 className="font-bold text-base text-[var(--text)]">{step.title}</h3>
                  </div>

                  {step.narration && (
                    <StepNarrationPlayer
                      lessonId={lesson.id}
                      stepIndex={step.step_index ?? idx}
                      narrationText={step.narration}
                      voiceLanguage={lesson.voice_language}
                    />
                  )}
                </div>

                {/* Step Goal & Instruction */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {step.goal && (
                    <div className="rounded-2xl bg-[var(--surface-secondary)] p-3.5 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-[var(--accent)]">
                        <Target className="h-4 w-4" />
                        <span>Objective</span>
                      </div>
                      <p className="text-[var(--text)] leading-relaxed">{step.goal}</p>
                    </div>
                  )}

                  <div className="rounded-2xl bg-[var(--surface-secondary)] p-3.5 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[var(--text)]">
                      <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                      <span>Instruction</span>
                    </div>
                    <p className="text-[var(--text)] leading-relaxed">{step.instruction}</p>
                  </div>
                </div>

                {/* Spoken Narration Script */}
                {step.narration && (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3.5 text-xs text-[var(--text)] italic leading-relaxed">
                    &ldquo;{step.narration}&rdquo;
                  </div>
                )}

                {/* Tips & Common Mistakes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {step.tip && (
                    <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-xl p-3">
                      <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Technique Tip:</span>
                        <span className="text-[11px] leading-relaxed opacity-95">{step.tip}</span>
                      </div>
                    </div>
                  )}

                  {step.common_mistake && (
                    <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-xl p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                      <div>
                        <span className="font-bold block">Watch Out:</span>
                        <span className="text-[11px] leading-relaxed opacity-95">
                          {step.common_mistake}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Push 3 Canvas Shell */}
      <LessonPlayerShell lesson={lesson} steps={steps} />
    </div>
  );
}
