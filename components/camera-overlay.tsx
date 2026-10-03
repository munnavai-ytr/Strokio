'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, AlertCircle, RefreshCw } from 'lucide-react';

interface CameraOverlayProps {
  opacity: number;
}

export function CameraOverlay({ opacity }: CameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    let active = true;

    const requestStream = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera is not supported on this device/browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setErrorMessage(null);
        setHasPermission(true);
      } catch (err: unknown) {
        if (!active) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not access rear camera. Permission denied or no camera available.';
        setErrorMessage(msg);
        setHasPermission(false);
      }
    };

    void requestStream();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [retryTrigger]);

  if (hasPermission === false || errorMessage) {
    return (
      <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center text-white">
        <CameraOff className="h-10 w-10 text-amber-400 mb-3" />
        <h4 className="text-sm font-bold">Camera Unavailable</h4>
        <p className="mt-1 text-xs text-white/70 max-w-xs">{errorMessage}</p>
        <button
          onClick={() => setRetryTrigger((r) => r + 1)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/30 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
      style={{ opacity }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="w-full h-full object-cover"
      />
    </div>
  );
}
