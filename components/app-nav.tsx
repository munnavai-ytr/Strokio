'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Home,
  BookOpen,
  Settings,
  Sun,
  Moon,
  LogOut,
  WifiOff,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useTheme } from './theme-provider';
import { PWAInstallButton } from './pwa-install';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export function AppNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => (typeof window !== 'undefined' ? navigator.onLine : true));
  const [supabaseReady] = useState(() => isSupabaseConfigured());

  // Check online status and Supabase session on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      if (isSupabaseConfigured()) {
        const supabase = createClient();
        supabase.auth.getSession().then(({ data }) => {
          if (data?.session?.user) {
            setUserEmail(data.session.user.email ?? null);
          }
        });

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          setUserEmail(session?.user?.email ?? null);
        });

        return () => {
          subscription.unsubscribe();
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        };
      }

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const handleSignOut = async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/');

  // If on login/auth page, don't show the full app shell navigation
  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col">
        {/* Quick theme toggle top right on login screen */}
        <header className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <PWAInstallButton variant="compact" />
          <button
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)] transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-700" />}
          </button>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/library', label: 'Library', icon: BookOpen },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col md:flex-row">
      {/* Offline Toast */}
      {!isOnline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg animate-bounce">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline mode active. Showing cached assets.</span>
        </div>
      )}

      {/* Supabase Not Configured Banner */}
      {!supabaseReady && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-300 flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <strong>Supabase Setup Required:</strong> Add <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">NEXT_PUBLIC_SUPABASE_URL</code> &amp; keys to <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">.env.local</code> and run <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">supabase/schema.sql</code>.
          </span>
        </div>
      )}

      {/* Desktop Sidebar (visible on md+) */}
      <aside className={`hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-[var(--border)] bg-[var(--surface)] z-30 ${!supabaseReady ? 'mt-9' : ''}`}>
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm transition group-hover:scale-105">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-[var(--text)] block leading-none">
                Strokio
              </span>
              <span className="text-[10px] font-semibold text-[var(--accent)] tracking-wider uppercase">
                Step-by-Step Drawing
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-6" aria-label="Main navigation">
          {navLinks.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-[var(--accent)]' : ''}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Sidebar Footer */}
        <div className="p-4 border-t border-[var(--border)] space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-secondary)] transition"
              title="Toggle Light / Dark mode"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700" />
              )}
            </button>
            <PWAInstallButton />
          </div>

          {userEmail && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--surface-secondary)] p-2.5">
              <div className="truncate pr-2">
                <p className="text-[11px] text-[var(--text-muted)]">Signed in</p>
                <p className="truncate text-xs font-semibold text-[var(--text)]">{userEmail}</p>
              </div>
              <button
                onClick={handleSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className={`md:hidden flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 sticky top-0 z-30 ${!supabaseReady ? 'mt-9' : ''}`}>
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-bold text-base text-[var(--text)]">Strokio</span>
        </Link>

        <div className="flex items-center gap-2">
          <PWAInstallButton variant="compact" />
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className={`flex-1 md:pl-64 flex flex-col pb-20 md:pb-6 ${!supabaseReady ? 'mt-9 md:mt-9' : ''}`}>
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] pb-safe backdrop-blur-md"
        aria-label="Mobile bottom navigation"
      >
        <div className="grid grid-cols-3 h-16">
          {navLinks.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition active:scale-95 ${
                  isActive
                    ? 'text-[var(--accent)] font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[11px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
