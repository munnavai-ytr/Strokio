'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Eye, Layers, Sliders, Image as ImageIcon } from 'lucide-react';
import type { LessonStep, StepPath } from '@/types';

interface VectorDrawingPreviewProps {
  photoUrl: string | null;
  viewboxW: number;
  viewboxH: number;
  steps: LessonStep[];
}

export function VectorDrawingPreview({
  photoUrl,
  viewboxW,
  viewboxH,
  steps,
}: VectorDrawingPreviewProps) {
  const [viewMode, setViewMode] = useState<'drawing' | 'overlay' | 'photo'>('overlay');
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.85);

  // Flatten all paths across all steps
  const allPaths: StepPath[] = [];
  for (const step of steps) {
    if (step.paths && Array.isArray(step.paths)) {
      allPaths.push(...step.paths);
    }
  }

  const w = viewboxW || 800;
  const h = viewboxH || 800;

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--text)]">
            Traced Vector Drawing &amp; Photo Overlay
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Generated pure vector geometry ({allPaths.length} paths) from Potrace &amp; sharp.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-1 self-start sm:self-auto">
          <button
            onClick={() => setViewMode('drawing')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'drawing'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Lines Only
          </button>
          <button
            onClick={() => setViewMode('overlay')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'overlay'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Overlay
          </button>
          <button
            onClick={() => setViewMode('photo')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'photo'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Photo Only
          </button>
        </div>
      </div>

      {/* Opacity slider for overlay */}
      {viewMode === 'overlay' && (
        <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-secondary)] px-4 py-2 text-xs">
          <Sliders className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-semibold text-[var(--text)]">Line Opacity:</span>
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
            className="w-32 accent-[var(--accent)]"
          />
          <span className="font-mono text-[var(--text-muted)]">
            {Math.round(overlayOpacity * 100)}%
          </span>
        </div>
      )}

      {/* Canvas Viewport */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] flex items-center justify-center"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        {/* Background Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(var(--text) 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        />

        {/* Original Photo Layer */}
        {photoUrl && (viewMode === 'overlay' || viewMode === 'photo') && (
          <div className="absolute inset-0 z-0">
            <Image
              src={photoUrl}
              alt="Original photograph"
              fill
              className={`object-contain transition-opacity duration-300 ${
                viewMode === 'overlay' ? 'opacity-85' : 'opacity-100'
              }`}
              unoptimized
            />
          </div>
        )}

        {/* Vector SVG Paths Layer */}
        {(viewMode === 'drawing' || viewMode === 'overlay') && (
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="absolute inset-0 z-10 w-full h-full pointer-events-none transition-opacity duration-300"
            style={{
              opacity: viewMode === 'overlay' ? overlayOpacity : 1,
            }}
          >
            {allPaths.map((p, idx) => {
              let strokeColor = '#0f172a';
              if (p.kind === 'guide') strokeColor = '#3b82f6';
              else if (p.kind === 'shape') strokeColor = '#f97316';
              else if (p.kind === 'shade') strokeColor = '#475569';

              return (
                <path
                  key={idx}
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
          </svg>
        )}
      </div>
    </div>
  );
}
