'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  UploadCloud,
  Camera,
  Sparkles,
  ArrowRight,
  Layers,
  Volume2,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileQuestion,
  ChevronRight,
} from 'lucide-react';
import { processAndResizeImage, type ProcessedImageResult } from '@/lib/image-processing';
import type { Lesson, DifficultyLevel, VoiceLanguage } from '@/types';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processedImage, setProcessedImage] = useState<ProcessedImageResult | null>(null);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('easy');
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('bn');

  // UI / Progress State
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStage, setProcessStage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);

  // Recent Lessons from Supabase
  const [recentLessons, setRecentLessons] = useState<Lesson[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);

  const getStatusBadge = (lesson: Lesson) => {
    if (lesson.status === 'ready') {
      return (
        <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          Ready
        </span>
      );
    }
    if (lesson.status === 'failed') {
      return (
        <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          Failed
        </span>
      );
    }
    if (lesson.stage === 'analyzing') {
      return (
        <span className="rounded-full bg-blue-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm animate-pulse">
          Analyzing...
        </span>
      );
    }
    if (lesson.stage === 'tracing') {
      return (
        <span className="rounded-full bg-indigo-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm animate-pulse">
          Tracing...
        </span>
      );
    }
    if (lesson.stage === 'composing') {
      return (
        <span className="rounded-full bg-purple-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm animate-pulse">
          Planning...
        </span>
      );
    }
    return (
      <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        Queued
      </span>
    );
  };

  // Load user profile defaults and recent 3 lessons
  useEffect(() => {
    // Fallback case: If user lands on "/" with a `code` query param, forward to /auth/callback with the same query string
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('code')) {
        window.location.href = `/auth/callback${url.search}`;
        return;
      }
    }

    let isMounted = true;

    async function loadData() {
      if (!isSupabaseConfigured()) {
        setIsLoadingLessons(false);
        return;
      }

      try {
        // 1. Fetch user defaults from profile
        fetch('/api/profile')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.profile && isMounted) {
              if (data.profile.default_difficulty) {
                setDifficulty(data.profile.default_difficulty);
              }
              if (data.profile.voice_language) {
                setVoiceLanguage(data.profile.voice_language);
              }
            }
          })
          .catch(() => {});

        // 2. Fetch 3 most recent lessons
        const res = await fetch('/api/lessons?limit=3');
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Could not load recent lessons');
        }
        const data = await res.json();
        if (isMounted) {
          setRecentLessons(data.lessons || []);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setLessonsError(err instanceof Error ? err.message : 'Error loading lessons');
        }
      } finally {
        if (isMounted) {
          setIsLoadingLessons(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Handle file selection and resize
  const handleFile = async (file: File) => {
    setErrorMessage(null);
    setIsProcessing(true);
    setProcessStage('Preparing image...');

    try {
      setSelectedFile(file);
      if (!title) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }

      const result = await processAndResizeImage(file, (stage) => setProcessStage(stage));
      setProcessedImage(result);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Image processing failed');
      setSelectedFile(null);
      setProcessedImage(null);
    } finally {
      setIsProcessing(false);
      setProcessStage('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setProcessedImage(null);
    setTitle('');
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // Submit and create lesson
  const handleCreateLesson = async () => {
    if (!processedImage) return;

    setIsProcessing(true);
    setProcessStage('Uploading to secure storage...');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append(
        'file',
        new File([processedImage.blob], 'drawing.webp', { type: 'image/webp' })
      );
      formData.append('title', title.trim() || 'Drawing Lesson');
      formData.append('difficulty', difficulty);
      formData.append('voice_language', voiceLanguage);

      setProcessStage('Creating lesson record in Supabase...');

      const response = await fetch('/api/lessons', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create lesson');
      }

      // Successfully created and queued, navigate to lesson shell
      router.push(`/lesson/${data.id}`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Creation failed');
      setIsProcessing(false);
      setProcessStage('');
    }
  };

  return (
    <div className="space-y-10">
      {/* Header section */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-subtle)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Push 2 • AI Lesson &amp; Vector Tracing Engine</span>
          </div>
          {quotaRemaining !== null && (
            <div className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
              <span>{quotaRemaining} / 3 daily lessons left</span>
            </div>
          )}
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[var(--text)]">
          Create a Drawing Lesson
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[var(--text-muted)] max-w-2xl leading-relaxed">
          Upload any photo—a sketch, object, pet, or landmark. Our AI engine analyzes proportions, traces vector contours with Potrace, and plans beginner-friendly steps with voice narration.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/20 bg-[var(--danger-subtle)] p-4 text-xs sm:text-sm text-[var(--danger)] flex items-start gap-3 shadow-subtle">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Unable to process photo</p>
            <p className="mt-0.5 text-xs opacity-90">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="rounded-lg p-1 text-[var(--danger)] hover:bg-red-500/10"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Upload Card */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-card space-y-6">
        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        {!processedImage ? (
          /* Dropzone Area */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center cursor-pointer transition ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-secondary)]'
            }`}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] mb-4">
              <UploadCloud className="h-8 w-8" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--text)]">
              Tap to choose photo or drag &amp; drop
            </h3>
            <p className="mt-1.5 text-xs text-[var(--text-muted)] max-w-sm">
              Supports JPEG, PNG, WebP up to 10 MB. Automatically resized to 1024px WebP.
            </p>

            {/* Mobile camera trigger */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition shadow-sm active:scale-95"
              >
                <Camera className="h-4 w-4 text-[var(--accent)]" />
                <span>Take Photo with Camera</span>
              </button>
            </div>
          </div>
        ) : (
          /* Preview & Configuration Area */
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-black/5">
                  <Image
                    src={processedImage.dataUrl}
                    alt="Uploaded preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-[var(--text)]">
                    Photo Processed &amp; Ready
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="rounded-md bg-[var(--surface-secondary)] px-2 py-0.5 font-mono">
                      {processedImage.width} × {processedImage.height}px
                    </span>
                    <span className="rounded-md bg-[var(--surface-secondary)] px-2 py-0.5 font-mono">
                      WebP {(processedImage.processedSize / 1024).toFixed(0)} KB
                    </span>
                    <span className="rounded-md bg-emerald-500/10 text-[var(--success)] px-2 py-0.5 font-medium">
                      {(
                        ((processedImage.originalSize - processedImage.processedSize) /
                          processedImage.originalSize) *
                        100
                      ).toFixed(0)}
                      % smaller
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={clearSelection}
                disabled={isProcessing}
                aria-label="Remove photo"
                className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--danger)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lesson Title */}
            <div>
              <label htmlFor="lesson-title" className="block text-xs font-bold text-[var(--text)] mb-1.5">
                Lesson Title
              </label>
              <input
                id="lesson-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Mountain Cottage, Sleeping Cat..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>

            {/* Difficulty Selector */}
            <div>
              <label className="block text-xs font-bold text-[var(--text)] mb-2 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Drawing Difficulty</span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'easy', label: 'Easy', desc: '5–8 strokes' },
                  { id: 'medium', label: 'Medium', desc: '9–14 strokes' },
                  { id: 'detailed', label: 'Detailed', desc: '15+ strokes' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDifficulty(item.id as DifficultyLevel)}
                    className={`rounded-2xl p-3 text-left border transition ${
                      difficulty === item.id
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)]'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold">{item.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Language Selector */}
            <div>
              <label className="block text-xs font-bold text-[var(--text)] mb-2 flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Voice Narration Language</span>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'bn', label: 'Bengali (বাংলা)', sub: 'Native Bengali guidance' },
                  { id: 'en', label: 'English', sub: 'Standard English voice' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVoiceLanguage(item.id as VoiceLanguage)}
                    className={`rounded-2xl p-3 text-left border transition ${
                      voiceLanguage === item.id
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)]'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold">{item.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Create CTA Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreateLesson}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 px-6 text-sm font-bold text-white shadow-sm hover:opacity-95 transition disabled:opacity-50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {isProcessing ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>{processStage || 'Processing...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Create Lesson</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Lessons Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text)]">
              Recent Lessons
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Your 3 most recently created lessons from Supabase.
            </p>
          </div>
          <Link
            href="/library"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            <span>View Library</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Loading Skeletons */}
        {isLoadingLessons ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
              >
                <div className="skeleton h-36 w-full rounded-xl" />
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : lessonsError ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-xs text-[var(--danger)]">
            {lessonsError}
          </div>
        ) : recentLessons.length === 0 ? (
          /* Honest Empty State */
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-secondary)] text-[var(--text-muted)] mb-3">
              <FileQuestion className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-[var(--text)]">No drawing lessons yet</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm mx-auto">
              Upload your first photo above. Your created lessons and progress will appear here in real time.
            </p>
          </div>
        ) : (
          /* 3 Recent Lessons Cards */
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/lesson/${lesson.id}`}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 transition hover:shadow-card hover:border-[var(--accent)] flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/5 mb-3">
                    {lesson.signed_image_url ? (
                      <Image
                        src={lesson.signed_image_url}
                        alt={lesson.title}
                        fill
                        className="object-cover transition group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
                        No Preview
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      {getStatusBadge(lesson)}
                    </div>
                  </div>
                  <h3 className="font-bold text-sm text-[var(--text)] line-clamp-1 group-hover:text-[var(--accent)] transition">
                    {lesson.title}
                  </h3>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-muted)]">
                  <span className="capitalize">{lesson.difficulty} • {lesson.voice_language === 'bn' ? 'বাংলা' : 'EN'}</span>
                  <span>{new Date(lesson.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
