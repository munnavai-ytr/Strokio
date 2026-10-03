'use client';

import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <WifiOff className="h-10 w-10" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
        You are currently offline
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--text-muted)] leading-relaxed">
        DrawAlong needs an active internet connection to load lessons, sync your profile, and upload new photos to Supabase.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={handleReload}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition active:scale-[0.98]"
        >
          <RefreshCw className="h-4 w-4" />
          Try Reconnecting
        </button>
      </div>
    </div>
  );
}
