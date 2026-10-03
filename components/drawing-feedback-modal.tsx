'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import {
  Camera,
  UploadCloud,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  History,
  Target,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { processAndResizeImage } from '@/lib/image-processing';
import type { FeedbackResult, LessonFeedback } from '@/types';

interface DrawingFeedbackModalProps {
  lessonId: string;
  referenceImageUrl: string | null;
  lessonTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DrawingFeedbackModal({
  lessonId,
  referenceImageUrl,
  lessonTitle,
  isOpen,
  onClose,
}: DrawingFeedbackModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result state
  const [currentFeedback, setCurrentFeedback] = useState<LessonFeedback | null>(null);
  const [attempts, setAttempts] = useState<LessonFeedback[]>([]);
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const fetchAttempts = async () => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/feedback`);
      if (res.ok) {
        const data = await res.json();
        setAttempts(data.attempts || []);
      }
    } catch {
      // ignore history load error
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const loadAttempts = async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/feedback`);
        if (res.ok && active) {
          const data = await res.json();
          setAttempts(data.attempts || []);
        }
      } catch {
        // ignore history load error
      }
    };

    void loadAttempts();

    return () => {
      active = false;
    };
  }, [isOpen, lessonId]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setErrorMessage(null);
    try {
      const processed = await processAndResizeImage(file);
      setSelectedFile(file);
      setPreviewUrl(processed.dataUrl);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not process photo');
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;

    setIsSubmitting(true);
    setSubmitStage('Preparing drawing image...');
    setErrorMessage(null);

    try {
      const processed = await processAndResizeImage(selectedFile, (stage) =>
        setSubmitStage(stage)
      );

      setSubmitStage('Uploading drawing attempt to secure storage...');
      const formData = new FormData();
      formData.append(
        'file',
        new File([processed.blob], 'drawing.webp', { type: 'image/webp' })
      );

      setSubmitStage('AI art mentor analyzing your drawing...');
      const res = await fetch(`/api/lessons/${lessonId}/feedback`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze drawing attempt');
      }

      setCurrentFeedback(data.feedback);
      fetchAttempts();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsSubmitting(false);
      setSubmitStage('');
    }
  };

  const getAreaLabel = (area: string) => {
    switch (area) {
      case 'proportion':
        return 'Proportions & Scale';
      case 'line-quality':
        return 'Line Quality & Confidence';
      case 'shape-accuracy':
        return 'Shape Accuracy';
      case 'detail':
        return 'Features & Details';
      case 'shading':
        return 'Shading & Values';
      case 'composition':
        return 'Placement & Composition';
      default:
        return area;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 shrink-0 bg-[var(--surface)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-[var(--text)]">
                AI Drawing Feedback
              </h3>
              <p className="text-xs text-[var(--text-muted)] line-clamp-1">{lessonTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'upload' ? 'history' : 'upload')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition"
            >
              <History className="h-3.5 w-3.5" />
              <span>{activeTab === 'upload' ? `History (${attempts.length})` : 'New Upload'}</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-xl border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="rounded-2xl border border-red-500/20 bg-[var(--danger-subtle)] p-4 text-xs sm:text-sm text-[var(--danger)] flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Feedback Request Issue</p>
                <p className="mt-0.5 text-xs opacity-90">{errorMessage}</p>
              </div>
            </div>
          )}

          {activeTab === 'history' ? (
            /* Attempt History Tab */
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-[var(--text)]">Previous Drawing Attempts</h4>
              {isLoadingAttempts ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="skeleton h-24 rounded-2xl w-full" />
                  ))}
                </div>
              ) : attempts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--text-muted)]">
                  No previous attempts recorded. Upload a photo of your paper sketch to receive feedback!
                </div>
              ) : (
                <div className="space-y-4">
                  {attempts.map((att) => (
                    <div
                      key={att.id}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)]">
                          {new Date(att.created_at).toLocaleString()}
                        </span>
                        <button
                          onClick={() => {
                            setCurrentFeedback(att);
                            setActiveTab('upload');
                          }}
                          className="font-bold text-[var(--accent)] hover:underline"
                        >
                          View Evaluation
                        </button>
                      </div>
                      {att.result?.summary && (
                        <p className="text-xs text-[var(--text)] leading-relaxed italic">
                          &ldquo;{att.result.summary}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : currentFeedback ? (
            /* Feedback Review View */
            <div className="space-y-6">
              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-[var(--text-muted)]">Original Reference</span>
                  <div className="relative aspect-square w-full rounded-2xl border border-[var(--border)] overflow-hidden bg-black/5">
                    {referenceImageUrl && (
                      <Image
                        src={referenceImageUrl}
                        alt="Reference original"
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-[var(--text-muted)]">Your Hand Drawing</span>
                  <div className="relative aspect-square w-full rounded-2xl border border-[var(--border)] overflow-hidden bg-black/5">
                    {currentFeedback.signed_image_url || previewUrl ? (
                      <Image
                        src={currentFeedback.signed_image_url || previewUrl!}
                        alt="Your hand-drawn sketch"
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
                        Drawing preview
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Encouraging Summary */}
              {currentFeedback.result?.summary && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                    <Sparkles className="h-4 w-4" />
                    <span>Teacher Feedback</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--text)] leading-relaxed">
                    {currentFeedback.result.summary}
                  </p>
                </div>
              )}

              {/* Strengths */}
              {currentFeedback.result?.strengths && currentFeedback.result.strengths.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    What You Did Well
                  </h4>
                  <div className="space-y-1.5">
                    {currentFeedback.result.strengths.map((st, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 rounded-xl bg-[var(--surface-secondary)] p-3 text-xs text-[var(--text)]"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span>{st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tappable Improvement Cards */}
              {currentFeedback.result?.improvements &&
                currentFeedback.result.improvements.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      Technique Adjustments &amp; Tips
                    </h4>
                    <div className="space-y-2.5">
                      {currentFeedback.result.improvements.map((imp, i) => {
                        const isExpanded = selectedArea === imp.area || selectedArea === null;
                        return (
                          <div
                            key={i}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 space-y-2 transition"
                          >
                            <button
                              onClick={() =>
                                setSelectedArea(selectedArea === imp.area ? null : imp.area)
                              }
                              className="flex w-full items-center justify-between text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className="rounded-lg bg-[var(--accent-subtle)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                                  {getAreaLabel(imp.area)}
                                </span>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="space-y-2 pt-1 text-xs">
                                <div>
                                  <span className="font-semibold text-[var(--text-muted)]">
                                    Observation:{' '}
                                  </span>
                                  <span className="text-[var(--text)]">{imp.what_you_did}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-[var(--text-muted)]">
                                    How to adjust:{' '}
                                  </span>
                                  <span className="text-[var(--text)]">{imp.how_to_fix}</span>
                                </div>
                                <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-200">
                                  <Lightbulb className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                                  <span>
                                    <strong>Practice exercise:</strong> {imp.practice_tip}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Next Challenge */}
              {currentFeedback.result?.next_challenge && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--accent)]">
                    <Target className="h-4 w-4" />
                    <span>Next Drawing Challenge</span>
                  </div>
                  <p className="text-[var(--text)]">{currentFeedback.result.next_challenge}</p>
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={() => {
                    setCurrentFeedback(null);
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className="w-full rounded-xl border border-[var(--border)] py-2.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition"
                >
                  Upload Another Attempt
                </button>
              </div>
            </div>
          ) : (
            /* Upload Paper Drawing Area */
            <div className="space-y-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
                }}
              />

              {!previewUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] p-8 text-center cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--surface-secondary)] transition"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] mb-3">
                    <UploadCloud className="h-7 w-7" />
                  </div>
                  <h4 className="font-bold text-sm sm:text-base text-[var(--text)]">
                    Take or Upload a Photo of Your Paper Drawing
                  </h4>
                  <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
                    Hold your phone steady above your paper sketch under good lighting.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cameraInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition shadow-sm"
                    >
                      <Camera className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>Take Photo</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative aspect-video sm:aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black/5">
                    <Image
                      src={previewUrl}
                      alt="Uploaded sketch preview"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="absolute top-2 right-2 rounded-xl bg-black/60 p-1.5 text-white hover:bg-black/80 transition"
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3 px-4 text-sm font-bold text-white shadow-sm hover:opacity-95 transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{submitStage || 'Analyzing...'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Get AI Teacher Feedback</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
