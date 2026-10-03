'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Grid,
  Eye,
  Camera,
  Maximize2,
  Minimize2,
  Sliders,
  Sparkles,
  CheckCircle2,
  List,
  X,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Download,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Lesson, LessonStep, StepPath, PerformanceMode } from '@/types';
import { calculatePacedDuration, getDashoffset } from '@/lib/player/timing';
import { resolvePerformanceTier } from '@/lib/performance';
import {
  saveLessonOffline,
  checkLessonIsOffline,
  removeLessonOffline,
} from '@/lib/offline-cache';

// Dynamically import Camera overlay to reduce initial bundle
const CameraOverlay = dynamic(
  () => import('./camera-overlay').then((mod) => mod.CameraOverlay),
  { ssr: false }
);

interface DrawingPlayerProps {
  lesson: Lesson;
  steps: LessonStep[];
  onOpenFeedback: () => void;
  perfMode?: PerformanceMode;
}

export function DrawingPlayer({
  lesson,
  steps,
  onOpenFeedback,
  perfMode = 'auto',
}: DrawingPlayerProps) {
  const tier = resolvePerformanceTier(perfMode);

  // Layout & Dimensions
  const viewboxW = lesson.viewbox_w || 1024;
  const viewboxH = lesson.viewbox_h || 1024;

  // Player State
  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    return lesson.user_progress?.last_step &&
      lesson.user_progress.last_step < steps.length
      ? lesson.user_progress.last_step
      : 0;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [playMode, setPlayMode] = useState<'follow' | 'auto'>('follow');
  const [isCompleted, setIsCompleted] = useState(
    Boolean(lesson.user_progress?.completed)
  );

  // Audio / Narration State
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [showCaptions, setShowCaptions] = useState(true);

  // Overlays State
  const [gridMode, setGridMode] = useState<'none' | 'thirds' | '4x4'>('none');
  const [ghostOpacity, setGhostOpacity] = useState(0); // 0 = off, 0.1-1 = ghost photo
  const [showCamera, setShowCamera] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showStepSheet, setShowStepSheet] = useState(false);
  const [showStepDoneCard, setShowStepDoneCard] = useState(false);

  // Fullscreen State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  // Offline Caching State
  const [isOfflineCached, setIsOfflineCached] = useState(false);
  const [isCaching, setIsCaching] = useState(false);

  // DOM Refs for requestAnimationFrame (never trigger React re-renders during frames)
  const pathElementsRef = useRef<(SVGPathElement | null)[]>([]);
  const pencilElementRef = useRef<SVGGElement | null>(null);
  const activeStepGroupRef = useRef<SVGGElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Animation Clock Refs
  const rafIdRef = useRef<number | null>(null);
  const stepStartTimeRef = useRef<number>(0);
  const stepDurationRef = useRef<number>(5000);
  const lastFrameTimeRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(true);

  const currentStep = steps[currentStepIndex] || steps[0];
  const currentCaption = currentStep?.narration || currentStep?.instruction || '';

  // Check offline status on mount
  useEffect(() => {
    checkLessonIsOffline(lesson.id).then(setIsOfflineCached);
  }, [lesson.id]);

  // Haptic feedback helper
  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }
  };

  // Debounced save progress to server
  const saveProgressDebounced = useRef<NodeJS.Timeout | null>(null);
  const persistProgress = useCallback(
    (stepIdx: number, done: boolean) => {
      if (saveProgressDebounced.current) {
        clearTimeout(saveProgressDebounced.current);
      }
      saveProgressDebounced.current = setTimeout(async () => {
        try {
          await fetch(`/api/lessons/${lesson.id}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_step: stepIdx, completed: done }),
          });
        } catch {
          // Ignore offline or transient network failures
        }
      }, 800);
    },
    [lesson.id]
  );

  // Screen Wake Lock API
  useEffect(() => {
    const acquireWakeLock = async () => {
      if ('wakeLock' in navigator && isPlaying && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          // wake lock denied
        }
      }
    };

    if (isPlaying) {
      acquireWakeLock();
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isPlaying]);

  // Prepare and reset active paths for the step
  const setupStepPaths = useCallback(() => {
    const paths = currentStep?.paths || [];
    pathElementsRef.current.forEach((pathEl, idx) => {
      if (pathEl) {
        const len = paths[idx]?.length || pathEl.getTotalLength() || 100;
        pathEl.style.strokeDasharray = `${len}`;
        pathEl.style.strokeDashoffset = `${len}`;
        pathEl.style.opacity = '1';
      }
    });

    if (pencilElementRef.current) {
      pencilElementRef.current.style.display = 'none';
    }
  }, [currentStep]);

  // Voice narration playback & synchronization
  const playNarration = useCallback(async () => {
    if (!currentStep) return;

    if (isMuted) return;

    try {
      // 1. Check if cached offline or fetch from narration API
      let url = currentStep.audio_url || null;
      let durationMs = currentStep.audio_duration_ms || null;

      if (!url) {
        const res = await fetch(`/api/lessons/${lesson.id}/narration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepIndex: currentStep.step_index }),
        });

        if (res.ok) {
          const data = await res.json();
          url = data.audioUrl;
          durationMs = data.durationMs;
        }
      }

      // Prefetch next step narration audio in background
      if (currentStepIndex + 1 < steps.length) {
        const nextStep = steps[currentStepIndex + 1];
        fetch(`/api/lessons/${lesson.id}/narration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepIndex: nextStep.step_index }),
        }).catch(() => {});
      }

      // Pacing adaptation
      const paced = calculatePacedDuration(
        currentStep.duration_ms || 6000,
        durationMs,
        playbackSpeed
      );
      stepDurationRef.current = paced;

      if (url) {
        if (!audioRef.current) {
          audioRef.current = new Audio(url);
        } else {
          audioRef.current.src = url;
        }
        audioRef.current.volume = volume;
        audioRef.current.playbackRate = playbackSpeed;
        await audioRef.current.play().catch(() => {});
      } else {
        // Fallback to SpeechSynthesis
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && currentStep.narration) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(currentStep.narration);
          utterance.lang = lesson.voice_language === 'bn' ? 'bn-BD' : 'en-US';
          utterance.rate = playbackSpeed;
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch {
      // Fallback to Web Speech API
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && currentStep?.narration) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(currentStep.narration);
        utterance.lang = lesson.voice_language === 'bn' ? 'bn-BD' : 'en-US';
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [currentStep, currentStepIndex, isMuted, lesson.id, lesson.voice_language, playbackSpeed, steps, volume]);

  // Navigation handlers
  const goToNextStep = useCallback(() => {
    setShowStepDoneCard(false);
    triggerHaptic();
    setCurrentStepIndex((prev) => {
      if (prev + 1 < steps.length) {
        setIsPlaying(true);
        return prev + 1;
      } else {
        setIsCompleted(true);
        return prev;
      }
    });
  }, [steps.length]);

  const goToPreviousStep = useCallback(() => {
    setShowStepDoneCard(false);
    triggerHaptic();
    setCurrentStepIndex((prev) => {
      if (prev > 0) {
        setIsPlaying(true);
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const replayCurrentStep = useCallback(() => {
    setShowStepDoneCard(false);
    triggerHaptic();
    setupStepPaths();
    setIsPlaying(true);
  }, [setupStepPaths]);

  // Handle step completion
  const handleStepFinished = useCallback(() => {
    setIsPlaying(false);
    isPausedRef.current = true;
    triggerHaptic();

    const isLastStep = currentStepIndex === steps.length - 1;

    // Fill all active paths completely
    const paths = currentStep?.paths || [];
    pathElementsRef.current.forEach((pathEl) => {
      if (pathEl) {
        pathEl.style.strokeDashoffset = '0';
      }
    });

    if (pencilElementRef.current) {
      pencilElementRef.current.style.display = 'none';
    }

    if (isLastStep) {
      setIsCompleted(true);
      persistProgress(currentStepIndex, true);
    } else {
      persistProgress(currentStepIndex, false);
      if (playMode === 'follow') {
        setShowStepDoneCard(true);
      } else {
        // Auto mode: pause 1.5s then continue
        setTimeout(() => {
          goToNextStep();
        }, 1500);
      }
    }
  }, [currentStep, currentStepIndex, goToNextStep, persistProgress, playMode, steps.length]);

  // Master requestAnimationFrame Loop
  useEffect(() => {
    isPausedRef.current = !isPlaying;

    if (!isPlaying) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.pause();
      }
      return;
    }

    stepStartTimeRef.current = performance.now();
    lastFrameTimeRef.current = performance.now();
    setupStepPaths();
    playNarration();

    const paths = currentStep?.paths || [];
    const totalStepLength = paths.reduce((acc, p) => acc + (p.length || 0), 0);

    const tick = (now: number) => {
      if (isPausedRef.current) return;

      // Lite mode: throttle to 30fps (approx 33ms)
      if (tier === 'lite' && now - lastFrameTimeRef.current < 33) {
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTimeRef.current = now;

      const elapsed = now - stepStartTimeRef.current;
      const progress = Math.min(elapsed / stepDurationRef.current, 1);

      // Distribute progress across paths in order
      let accumulatedLength = 0;
      let activePencilPoint: { x: number; y: number } | null = null;

      for (let i = 0; i < paths.length; i++) {
        const pathObj = paths[i];
        const pathEl = pathElementsRef.current[i];
        if (!pathEl) continue;

        const pLen = pathObj.length || 100;
        const pathStartRatio = totalStepLength > 0 ? accumulatedLength / totalStepLength : 0;
        const pathEndRatio = totalStepLength > 0 ? (accumulatedLength + pLen) / totalStepLength : 1;

        if (progress <= pathStartRatio) {
          // Hasn't started drawing yet
          pathEl.style.strokeDashoffset = `${pLen}`;
        } else if (progress >= pathEndRatio) {
          // Finished drawing
          pathEl.style.strokeDashoffset = '0';
        } else {
          // Currently drawing this path
          const localProgress = (progress - pathStartRatio) / (pathEndRatio - pathStartRatio);

          // In Lite mode: shade paths quick-fade instead of stroke animation
          if (tier === 'lite' && pathObj.kind === 'shade') {
            pathEl.style.strokeDashoffset = '0';
            pathEl.style.opacity = `${localProgress * 0.45}`;
          } else {
            const offset = getDashoffset(pLen, localProgress);
            pathEl.style.strokeDashoffset = `${offset}`;
          }

          try {
            const drawnLength = Math.max(0, Math.min(pLen, pLen * localProgress));
            activePencilPoint = pathEl.getPointAtLength(drawnLength);
          } catch {
            // getPointAtLength fallback
          }
        }

        accumulatedLength += pLen;
      }

      // Update pencil indicator position via direct DOM attribute (no React re-render)
      if (pencilElementRef.current) {
        if (activePencilPoint && tier !== 'lite') {
          pencilElementRef.current.style.display = 'block';
          pencilElementRef.current.setAttribute(
            'transform',
            `translate(${activePencilPoint.x}, ${activePencilPoint.y})`
          );
        } else {
          pencilElementRef.current.style.display = 'none';
        }
      }

      if (progress >= 1) {
        handleStepFinished();
      } else {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [
    isPlaying,
    currentStep,
    setupStepPaths,
    playNarration,
    handleStepFinished,
    tier,
  ]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        goToNextStep();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        goToPreviousStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextStep, goToPreviousStep]);

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    if (!playerContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await playerContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported/allowed
    }
  };

  // Offline save handler
  const handleToggleOfflineCache = async () => {
    if (isOfflineCached) {
      await removeLessonOffline(lesson.id);
      setIsOfflineCached(false);
    } else {
      setIsCaching(true);
      const audioUrls = steps.map((s) => s.audio_url || null);
      const success = await saveLessonOffline(
        lesson.id,
        lesson.signed_image_url,
        audioUrls
      );
      setIsCaching(false);
      if (success) setIsOfflineCached(true);
    }
  };

  // Memoize static completed steps layers
  const completedStepsLayers = useMemo(() => {
    return steps.slice(0, currentStepIndex).map((step, sIdx) => (
      <g key={step.id || sIdx} className="opacity-95">
        {(step.paths || []).map((p, pIdx) => {
          let strokeColor = '#0f172a';
          if (p.kind === 'guide') strokeColor = '#94a3b8';
          else if (p.kind === 'shape') strokeColor = '#ea580c';
          else if (p.kind === 'shade') strokeColor = '#475569';

          return (
            <path
              key={pIdx}
              d={p.d}
              fill="none"
              stroke={strokeColor}
              strokeWidth={p.stroke_width || 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={p.kind === 'guide' ? '4 4' : undefined}
              opacity={p.opacity || 0.9}
            />
          );
        })}
      </g>
    ));
  }, [steps, currentStepIndex]);

  return (
    <div
      ref={playerContainerRef}
      className={`relative w-full overflow-hidden bg-[var(--background)] rounded-3xl border border-[var(--border)] shadow-card flex flex-col ${
        isFullscreen ? 'h-screen rounded-none border-none' : 'aspect-[4/3] sm:aspect-[16/10]'
      }`}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2">
          <Link
            href="/library"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] text-[var(--text)] shadow-sm hover:bg-[var(--surface)]"
            title="Back to Library"
          >
            <X className="h-4 w-4" />
          </Link>

          {/* Offline Badge & Action */}
          <button
            onClick={handleToggleOfflineCache}
            disabled={isCaching}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold backdrop-blur-md border transition ${
              isOfflineCached
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-[var(--surface)]/90 text-[var(--text-muted)] border-[var(--border)]'
            }`}
            title={isOfflineCached ? 'Stored offline (click to remove)' : 'Save for offline'}
          >
            {isOfflineCached ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isOfflineCached ? 'Offline Ready' : isCaching ? 'Saving...' : 'Save Offline'}
            </span>
          </button>
        </div>

        {/* Step Sheet & Mode Toggles */}
        <div className="flex items-center gap-2">
          {/* Follow vs Auto Mode */}
          <button
            onClick={() => setPlayMode((m) => (m === 'follow' ? 'auto' : 'follow'))}
            className="rounded-xl bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-bold text-[var(--accent)] shadow-sm"
          >
            {playMode === 'follow' ? 'Follow Mode' : 'Auto Play'}
          </button>

          {/* Grid Toggle */}
          <button
            onClick={() => {
              setGridMode((g) => (g === 'none' ? 'thirds' : g === 'thirds' ? '4x4' : 'none'));
              triggerHaptic();
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-md border shadow-sm transition ${
              gridMode !== 'none'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--surface)]/90 border-[var(--border)] text-[var(--text)]'
            }`}
            title={`Grid: ${gridMode}`}
          >
            <Grid className="h-4 w-4" />
          </button>

          {/* Ghost Photo Toggle */}
          <button
            onClick={() => {
              setGhostOpacity((op) => (op === 0 ? 0.45 : op === 0.45 ? 0.85 : 0));
              triggerHaptic();
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-md border shadow-sm transition ${
              ghostOpacity > 0
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--surface)]/90 border-[var(--border)] text-[var(--text)]'
            }`}
            title={`Ghost Photo: ${Math.round(ghostOpacity * 100)}%`}
          >
            <Eye className="h-4 w-4" />
          </button>

          {/* Camera Overlay Toggle */}
          <button
            onClick={() => {
              setShowCamera((c) => !c);
              triggerHaptic();
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-md border shadow-sm transition ${
              showCamera
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-[var(--surface)]/90 border-[var(--border)] text-[var(--text)]'
            }`}
            title="AR Camera Overlay"
          >
            <Camera className="h-4 w-4" />
          </button>

          {/* Step List Sheet */}
          <button
            onClick={() => setShowStepSheet(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] text-[var(--text)] shadow-sm"
            title="Step List"
          >
            <List className="h-4 w-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] text-[var(--text)] shadow-sm"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Main Drawing Canvas Area */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
        {/* Rear Camera Overlay */}
        {showCamera && <CameraOverlay opacity={0.7} />}

        {/* Ghost Original Photo */}
        {lesson.signed_image_url && ghostOpacity > 0 && !showCamera && (
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0"
            style={{ opacity: ghostOpacity }}
          >
            <Image
              src={lesson.signed_image_url}
              alt="Reference ghost"
              fill
              sizes="100vw"
              referrerPolicy="no-referrer"
              className="object-contain"
            />
          </div>
        )}

        {/* Master SVG Canvas */}
        <svg
          viewBox={`0 0 ${viewboxW} ${viewboxH}`}
          className="w-full h-full pointer-events-none z-10 select-none"
        >
          {/* Grid Overlays */}
          {gridMode === 'thirds' && (
            <g stroke="#94a3b8" strokeWidth="1" strokeDasharray="6 6" opacity="0.3">
              <line x1={viewboxW / 3} y1="0" x2={viewboxW / 3} y2={viewboxH} />
              <line x1={(2 * viewboxW) / 3} y1="0" x2={(2 * viewboxW) / 3} y2={viewboxH} />
              <line x1="0" y1={viewboxH / 3} x2={viewboxW} y2={viewboxH / 3} />
              <line x1="0" y1={(2 * viewboxH) / 3} x2={viewboxW} y2={(2 * viewboxH) / 3} />
            </g>
          )}

          {gridMode === '4x4' && (
            <g stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" opacity="0.25">
              <line x1={viewboxW * 0.25} y1="0" x2={viewboxW * 0.25} y2={viewboxH} />
              <line x1={viewboxW * 0.5} y1="0" x2={viewboxW * 0.5} y2={viewboxH} />
              <line x1={viewboxW * 0.75} y1="0" x2={viewboxW * 0.75} y2={viewboxH} />
              <line x1="0" y1={viewboxH * 0.25} x2={viewboxW} y2={viewboxH * 0.25} />
              <line x1="0" y1={viewboxH * 0.5} x2={viewboxW} y2={viewboxH * 0.5} />
              <line x1="0" y1={viewboxH * 0.75} x2={viewboxW} y2={viewboxH * 0.75} />
            </g>
          )}

          {/* 1. Static Completed Steps Layers (Zero re-renders during frames) */}
          <g className="static-completed-steps">{completedStepsLayers}</g>

          {/* 2. Active Animating Step Layer */}
          <g ref={activeStepGroupRef} className="active-step-layer">
            {(currentStep?.paths || []).map((p, idx) => {
              let strokeColor = '#0f172a';
              if (p.kind === 'guide') strokeColor = '#3b82f6';
              else if (p.kind === 'shape') strokeColor = '#ea580c';
              else if (p.kind === 'shade') strokeColor = '#334155';

              return (
                <path
                  key={idx}
                  ref={(el) => {
                    pathElementsRef.current[idx] = el;
                  }}
                  d={p.d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={(p.stroke_width || 2) * 1.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={p.length || 100}
                  strokeDashoffset={p.length || 100}
                  opacity={p.opacity || 1}
                />
              );
            })}
          </g>

          {/* 3. Pencil Tip Indicator */}
          <g ref={pencilElementRef} style={{ display: 'none' }} className="pencil-tip-marker">
            <circle cx="0" cy="0" r="4.5" fill="#ea580c" />
            <circle cx="0" cy="0" r="10" fill="#ea580c" opacity="0.3" />
            <path
              d="M 0 0 L 14 -22 L 20 -16 Z"
              fill="#fb923c"
              stroke="#0f172a"
              strokeWidth="1.5"
            />
          </g>
        </svg>

        {/* Live Spoken Captions Bar */}
        {showCaptions && currentCaption && (
          <div className="absolute bottom-20 left-4 right-4 z-20 pointer-events-none flex justify-center">
            <div className="max-w-md rounded-2xl bg-black/75 px-4 py-2 text-center text-xs font-medium text-white backdrop-blur-md shadow-lg border border-white/10">
              {currentCaption}
            </div>
          </div>
        )}

        {/* Follow Mode Step Completion Card */}
        {showStepDoneCard && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5" />
                <span>Step {currentStepIndex + 1} Complete</span>
              </div>

              <div>
                <h4 className="font-bold text-base text-[var(--text)]">{currentStep.title}</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
                  {currentStep.instruction}
                </p>
              </div>

              {currentStep.tip && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                  <Lightbulb className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    <strong>Teacher Tip:</strong> {currentStep.tip}
                  </span>
                </div>
              )}

              {currentStep.common_mistake && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                  <span>
                    <strong>Watch out:</strong> {currentStep.common_mistake}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={replayCurrentStep}
                  className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Replay</span>
                </button>
                <button
                  onClick={goToNextStep}
                  className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95 transition flex items-center justify-center gap-1.5"
                >
                  <span>Done, Next</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lesson Completed Screen */}
        {isCompleted && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md text-white text-center">
            <div className="max-w-md space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--accent)] text-white shadow-lg mb-2">
                <Sparkles className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-extrabold tracking-tight">Drawing Finished!</h3>
              <p className="text-xs text-white/80 leading-relaxed">
                You drew every stroke from proportions to final details. Now photograph your paper drawing to get personalized feedback from our AI art mentor.
              </p>

              <div className="pt-4 flex flex-col gap-2.5">
                <button
                  onClick={onOpenFeedback}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3 px-4 text-sm font-bold text-white shadow-lg hover:opacity-95 transition"
                >
                  <Camera className="h-4 w-4" />
                  <span>Upload My Drawing for AI Feedback</span>
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsCompleted(false);
                      setCurrentStepIndex(0);
                      replayCurrentStep();
                    }}
                    className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition"
                  >
                    Replay Lesson
                  </button>
                  <Link
                    href="/"
                    className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition inline-flex items-center justify-center"
                  >
                    New Lesson
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Master Playback Controller */}
      <div className="p-3 sm:p-4 bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] shrink-0 z-20 space-y-2">
        {/* Progress Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-[var(--surface-secondary)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[var(--accent)] h-full transition-all duration-300"
              style={{
                width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
              }}
            />
          </div>
          <span className="font-mono text-xs font-semibold text-[var(--text-muted)] shrink-0">
            {currentStepIndex + 1} / {steps.length}
          </span>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={goToPreviousStep}
              disabled={currentStepIndex === 0}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text)] hover:bg-[var(--surface-secondary)] transition disabled:opacity-40"
              title="Previous Step (Left Arrow)"
              aria-label="Previous step"
            >
              <SkipBack className="h-5 w-5" />
            </button>

            <button
              onClick={() => {
                setIsPlaying((p) => !p);
                triggerHaptic();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-sm hover:opacity-95 transition active:scale-95"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              aria-label={isPlaying ? 'Pause drawing' : 'Play drawing'}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-white" />
              ) : (
                <Play className="h-5 w-5 fill-white translate-x-0.5" />
              )}
            </button>

            <button
              onClick={goToNextStep}
              disabled={currentStepIndex >= steps.length - 1}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text)] hover:bg-[var(--surface-secondary)] transition disabled:opacity-40"
              title="Next Step (Right Arrow)"
              aria-label="Next step"
            >
              <SkipForward className="h-5 w-5" />
            </button>

            <button
              onClick={replayCurrentStep}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text)] transition"
              title="Replay Current Step"
              aria-label="Replay step"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1">
            {[0.75, 1, 1.5].map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`rounded-lg px-2 py-1 text-[11px] font-mono font-bold transition ${
                  playbackSpeed === speed
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Audio & Mute */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted((m) => !m)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text)] transition"
              title={isMuted ? 'Unmute voice' : 'Mute voice'}
              aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            <button
              onClick={onOpenFeedback}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition"
            >
              <Camera className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Feedback</span>
            </button>
          </div>
        </div>
      </div>

      {/* Step List Drawer / Sheet */}
      {showStepSheet && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-h-[75vh] w-full rounded-t-3xl border-t border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] shrink-0">
              <h4 className="font-bold text-base text-[var(--text)]">Lesson Steps</h4>
              <button
                onClick={() => setShowStepSheet(false)}
                className="rounded-xl border border-[var(--border)] p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {steps.map((step, idx) => {
                const isSelected = idx === currentStepIndex;
                const isPassed = idx < currentStepIndex;
                return (
                  <button
                    key={step.id || idx}
                    onClick={() => {
                      setCurrentStepIndex(idx);
                      setShowStepSheet(false);
                      setIsPlaying(true);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl p-3 text-left transition border ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-bold'
                        : isPassed
                        ? 'border-[var(--border)] bg-[var(--surface-secondary)]/50 text-[var(--text)]'
                        : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold bg-[var(--surface-secondary)]">
                        {idx + 1}
                      </span>
                      <span className="text-xs truncate max-w-[220px]">{step.title}</span>
                    </div>
                    {isPassed && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
