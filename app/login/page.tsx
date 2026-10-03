'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles, Mail, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [loadingMagicLink, setLoadingMagicLink] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    urlError ? 'Authentication failed or expired. Please try signing in again.' : null
  );
  const [supabaseReady] = useState(() => isSupabaseConfigured());

  useEffect(() => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          router.push(redirectTo);
        }
      });
    }
  }, [router, redirectTo]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!supabaseReady) {
      setErrorMessage('Supabase is not configured yet. Please configure NEXT_PUBLIC_SUPABASE_URL in .env.local.');
      return;
    }

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoadingMagicLink(true);

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setMagicLinkSent(true);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setLoadingMagicLink(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);

    if (!supabaseReady) {
      setErrorMessage('Supabase is not configured yet. Please configure NEXT_PUBLIC_SUPABASE_URL in .env.local.');
      return;
    }

    setLoadingGoogle(true);

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setLoadingGoogle(false);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Google sign in failed');
      setLoadingGoogle(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 bg-[var(--background)]">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-orange-500/20 mb-4">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
            Welcome to Strokio
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Turn your real photos into beginner-friendly, step-by-step drawing lessons.
          </p>
        </div>

        {/* Supabase Notice if missing */}
        {!supabaseReady && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="font-bold">Supabase Credentials Required</p>
                <p className="mt-1 text-[11px] leading-relaxed">
                  Provide your Supabase URL &amp; Anon Key in <code className="font-mono font-bold">.env.local</code> to enable real authentication and database storage.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Auth Card */}
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-card">
          {errorMessage && (
            <div className="mb-6 rounded-xl border border-red-500/20 bg-[var(--danger-subtle)] p-3 text-xs text-[var(--danger)] flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {magicLinkSent ? (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-[var(--success)] mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold text-[var(--text)]">Check your inbox</h2>
              <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                We sent a secure magic link to <strong className="text-[var(--text)]">{email}</strong>. Click the link in your email to sign in directly.
              </p>
              <button
                onClick={() => {
                  setMagicLinkSent(false);
                  setEmail('');
                }}
                className="mt-6 text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Use a different email address
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loadingGoogle || loadingMagicLink}
                className="w-full flex items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-secondary)] transition disabled:opacity-50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {loadingGoogle ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
                ) : (
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="w-full border-t border-[var(--border)]"></div>
                <span className="absolute bg-[var(--surface)] px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  or magic link
                </span>
              </div>

              {/* Email Magic Link Form */}
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-[var(--text)] mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-3 pl-10 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loadingMagicLink || loadingGoogle}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition disabled:opacity-50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {loadingMagicLink ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>Send Magic Link</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="skeleton h-80 w-full max-w-md rounded-3xl" />
        </div>
      }
    >
      <LoginContent />
    </React.Suspense>
  );
}
