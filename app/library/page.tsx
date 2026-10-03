'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Trash2,
  AlertTriangle,
  Plus,
  Clock,
  Sparkles,
  ExternalLink,
  Loader2,
  X,
  FileQuestion,
} from 'lucide-react';
import type { Lesson } from '@/types';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export default function LibraryPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Deletion modal state
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLibrary() {
      if (!isSupabaseConfigured()) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/lessons?limit=50');
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Failed to retrieve drawing lessons');
        }
        const data = await res.json();
        if (isMounted) {
          setLessons(data.lessons || []);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : 'Error loading library');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadLibrary();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const confirmDelete = async () => {
    if (!lessonToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/lessons/${lessonToDelete.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete lesson');
      }

      setLessons((prev) => prev.filter((l) => l.id !== lessonToDelete.id));
      setLessonToDelete(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (lesson: Lesson) => {
    if (lesson.status === 'ready') {
      return (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          Ready
        </span>
      );
    }
    if (lesson.status === 'failed') {
      return (
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
          Failed
        </span>
      );
    }
    if (lesson.stage === 'analyzing') {
      return (
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 animate-pulse">
          Analyzing...
        </span>
      );
    }
    if (lesson.stage === 'tracing') {
      return (
        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">
          Tracing...
        </span>
      );
    }
    if (lesson.stage === 'composing') {
      return (
        <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 animate-pulse">
          Composing...
        </span>
      );
    }
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
        Queued
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Top Title & CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)]">
            My Drawing Library
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-muted)]">
            Every photo and drawing lesson saved to your account in Supabase.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:opacity-95 transition active:scale-95 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Lesson</span>
        </Link>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/20 bg-[var(--danger-subtle)] p-4 text-xs text-[var(--danger)]">
          {errorMessage}
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
            >
              <div className="skeleton h-44 w-full rounded-xl" />
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : lessons.length === 0 ? (
        /* Honest Real Empty State */
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-secondary)] text-[var(--text-muted)] mb-4">
            <BookOpen className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text)]">No drawing lessons yet</h2>
          <p className="mt-2 max-w-sm text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
            Your saved lessons will appear here. Turn any photo into a step-by-step drawing lesson by uploading on the home screen.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:opacity-95 transition"
          >
            <Sparkles className="h-4 w-4" />
            <span>Create Your First Lesson</span>
          </Link>
        </div>
      ) : (
        /* Lessons Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {lessons.map((lesson) => (
            <div
              key={lesson.id}
              className="group rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card transition hover:border-[var(--accent)] hover:shadow-float flex flex-col justify-between"
            >
              <div>
                <Link href={`/lesson/${lesson.id}`} className="block relative aspect-video w-full overflow-hidden rounded-2xl bg-black/5 mb-3">
                  {lesson.signed_image_url ? (
                    <Image
                      src={lesson.signed_image_url}
                      alt={lesson.title}
                      fill
                      className="object-cover transition duration-300 group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
                      No Image
                    </div>
                  )}
                  <div className="absolute top-2.5 right-2.5">
                    {getStatusBadge(lesson)}
                  </div>
                </Link>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/lesson/${lesson.id}`}
                      className="font-bold text-base text-[var(--text)] hover:text-[var(--accent)] transition line-clamp-1"
                    >
                      {lesson.title}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="capitalize font-medium text-[var(--text)]">
                      {lesson.difficulty}
                    </span>
                    <span>•</span>
                    <span>{lesson.voice_language === 'bn' ? 'বাংলা (Bengali)' : 'English Voice'}</span>
                  </div>
                </div>
              </div>

              {/* Card Footer: Metadata and Delete Action */}
              <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(lesson.created_at).toLocaleDateString()}</span>
                </span>

                <div className="flex items-center gap-1">
                  <Link
                    href={`/lesson/${lesson.id}`}
                    aria-label="View lesson"
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text)] transition"
                    title="Open Lesson"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>

                  <button
                    onClick={() => setLessonToDelete(lesson)}
                    aria-label={`Delete ${lesson.title}`}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)] transition"
                    title="Delete Lesson"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {lessonToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-[var(--danger)] mb-4">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text)]">Delete Lesson?</h3>
            <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
              Are you sure you want to delete <strong className="text-[var(--text)]">&ldquo;{lessonToDelete.title}&rdquo;</strong>? This will permanently remove the drawing record and the image from storage.
            </p>

            {deleteError && (
              <p className="mt-3 text-xs text-[var(--danger)] font-medium">{deleteError}</p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setLessonToDelete(null)}
                disabled={isDeleting}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
