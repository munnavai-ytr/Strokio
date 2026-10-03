'use client';

import React, { useState, useRef } from 'react';
import { Volume2, VolumeX, Loader2, Play, Pause } from 'lucide-react';
import type { VoiceLanguage } from '@/types';

interface StepNarrationPlayerProps {
  lessonId: string;
  stepIndex: number;
  narrationText: string;
  voiceLanguage: VoiceLanguage;
}

export function StepNarrationPlayer({
  lessonId,
  stepIndex,
  narrationText,
  voiceLanguage,
}: StepNarrationPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isWebSpeechFallback, setIsWebSpeechFallback] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speakWithBrowser = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Audio playback is not supported on this browser.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(narrationText);
    utterance.lang = voiceLanguage === 'bn' ? 'bn-BD' : 'en-US';
    utterance.rate = 0.95;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsWebSpeechFallback(true);
    };
    utterance.onend = () => {
      setIsPlaying(false);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePlayToggle = async () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    // If audio URL already fetched
    if (audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => setIsPlaying(false);
        audioRef.current.onerror = () => speakWithBrowser();
      }
      audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    // Fetch audio from server
    setIsLoading(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/narration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex }),
      });

      const data = await res.json();

      if (res.ok && data.audioUrl) {
        setAudioUrl(data.audioUrl);
        const audio = new Audio(data.audioUrl);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => speakWithBrowser();
        await audio.play();
        setIsPlaying(true);
      } else {
        // Fall back to Web Speech API
        speakWithBrowser();
      }
    } catch {
      speakWithBrowser();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePlayToggle}
        disabled={isLoading}
        aria-label={isPlaying ? 'Pause voice narration' : 'Play voice narration'}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--border)] transition active:scale-95"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
        ) : isPlaying ? (
          <Pause className="h-3.5 w-3.5 text-[var(--accent)]" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-[var(--text)] text-[var(--text)]" />
        )}
        <span>{isPlaying ? 'Pause Narration' : 'Listen'}</span>
      </button>

      {isWebSpeechFallback && isPlaying && (
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          (Browser Voice)
        </span>
      )}
    </div>
  );
}
