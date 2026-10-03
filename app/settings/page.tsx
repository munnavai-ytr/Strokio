'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sun,
  Moon,
  Laptop,
  Layers,
  Volume2,
  User,
  LogOut,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import type { ThemeMode, DifficultyLevel, VoiceLanguage, UserProfile } from '@/types';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [defaultDifficulty, setDefaultDifficulty] = useState<DifficultyLevel>('easy');
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('bn');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Delete data modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setIsLoading(true);
      setErrorMessage(null);

      if (!isSupabaseConfigured()) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/profile');
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Failed to retrieve user profile');
        }

        const data = await res.json();
        if (isMounted) {
          if (data.profile) {
            setProfile(data.profile);
            setDisplayName(data.profile.display_name || '');
            setDefaultDifficulty(data.profile.default_difficulty || 'easy');
            setVoiceLanguage(data.profile.voice_language || 'bn');
          }
          if (data.user) {
            setUserEmail(data.user.email || '');
            setUserId(data.user.id || '');
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : 'Error fetching profile');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleThemeChange = async (newTheme: ThemeMode) => {
    setTheme(newTheme);
    // Persist to profile if configured
    if (isSupabaseConfigured()) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme }),
      }).catch(() => {});
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim() || undefined,
          default_difficulty: defaultDifficulty,
          voice_language: voiceLanguage,
          theme,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save preferences');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  const handleDeleteAccountData = async () => {
    setIsDeletingData(true);
    setDeleteError(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete account data');
      }

      setShowDeleteModal(false);
      alert('All your drawing lessons and images have been deleted.');
      router.push('/');
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Error clearing data');
    } finally {
      setIsDeletingData(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-44 rounded-xl" />
        <div className="skeleton h-60 rounded-3xl" />
        <div className="skeleton h-60 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)]">
          Settings &amp; Preferences
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[var(--text-muted)]">
          Manage your appearance, drawing defaults, account profile, and data.
        </p>
      </div>

      {saveSuccess && (
        <div className="rounded-2xl border border-emerald-500/20 bg-[var(--success-subtle)] p-4 text-xs font-semibold text-[var(--success)] flex items-center gap-2 shadow-subtle animate-in fade-in">
          <CheckCircle2 className="h-4 w-4" />
          <span>Preferences successfully updated in Supabase.</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/20 bg-[var(--danger-subtle)] p-4 text-xs text-[var(--danger)]">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSavePreferences} className="space-y-6">
        {/* Appearance (Theme Switcher: 3 Options) */}
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-card space-y-4">
          <h2 className="text-base font-bold text-[var(--text)]">Appearance &amp; Theme</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Choose light, dark, or follow your system&apos;s prefers-color-scheme.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Laptop },
            ].map((item) => {
              const Icon = item.icon;
              const isSelected = theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleThemeChange(item.id as ThemeMode)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-4 border transition ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-bold shadow-sm'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Drawing Defaults */}
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-card space-y-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Drawing Defaults</h2>
            <p className="text-xs text-[var(--text-muted)]">
              These options pre-fill the creation screen when you upload photos.
            </p>
          </div>

          {/* Default Difficulty */}
          <div>
            <label className="block text-xs font-bold text-[var(--text)] mb-2 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-[var(--accent)]" />
              <span>Default Difficulty</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'easy', label: 'Easy', desc: '5–8 strokes' },
                { id: 'medium', label: 'Medium', desc: '9–14 strokes' },
                { id: 'detailed', label: 'Detailed', desc: '15+ strokes' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDefaultDifficulty(item.id as DifficultyLevel)}
                  className={`rounded-2xl p-3 text-left border transition ${
                    defaultDifficulty === item.id
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-bold'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)]'
                  }`}
                >
                  <div className="text-xs sm:text-sm">{item.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Default Voice Language */}
          <div>
            <label className="block text-xs font-bold text-[var(--text)] mb-2 flex items-center gap-1.5">
              <Volume2 className="h-4 w-4 text-[var(--accent)]" />
              <span>Default Voice Language</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'bn', label: 'Bengali (বাংলা)', sub: 'Native Bengali speech narration' },
                { id: 'en', label: 'English', sub: 'Standard English speech narration' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setVoiceLanguage(item.id as VoiceLanguage)}
                  className={`rounded-2xl p-3 text-left border transition ${
                    voiceLanguage === item.id
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-bold'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)]'
                  }`}
                >
                  <div className="text-xs sm:text-sm">{item.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Display Name Input */}
          <div>
            <label htmlFor="displayName" className="block text-xs font-bold text-[var(--text)] mb-1.5">
              Artist Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:opacity-95 transition disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            <span>Save Preferences</span>
          </button>
        </div>
      </form>

      {/* Account Info Card */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-card space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-secondary)] text-[var(--text)]">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Account Info</h2>
            <p className="text-xs text-[var(--text-muted)]">Authenticated via Supabase</p>
          </div>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-secondary)] p-3">
            <span className="text-[var(--text-muted)]">Email</span>
            <span className="font-semibold text-[var(--text)]">{userEmail || 'Not available'}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-secondary)] p-3">
            <span className="text-[var(--text-muted)]">User ID</span>
            <span className="font-mono text-[10px] text-[var(--text)] truncate max-w-[200px]">
              {userId || 'Anonymous'}
            </span>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition"
          >
            <LogOut className="h-4 w-4 text-[var(--text-muted)]" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Danger Zone: Delete Account Data */}
      <div className="rounded-3xl border border-red-500/20 bg-[var(--danger-subtle)] p-6 space-y-3">
        <div className="flex items-center gap-2 text-[var(--danger)]">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="text-base font-bold">Danger Zone</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Permanently delete all your drawing lessons and images from Supabase storage and the database.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition active:scale-95"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete Account Data</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-[var(--danger)] mb-4">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text)]">Delete All Data?</h3>
            <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
              This will permanently delete all your uploaded photos in storage and all lesson records from the database. This action cannot be undone.
            </p>

            {deleteError && (
              <p className="mt-3 text-xs text-[var(--danger)] font-medium">{deleteError}</p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingData}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccountData}
                disabled={isDeletingData}
                className="flex items-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {isDeletingData ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>Confirm &amp; Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
