-- ==============================================================================
-- DrawAlong Database Migration 003 (Push 3: Player Progress & Feedback Status)
-- Run this in your Supabase SQL Editor.
-- ==============================================================================

-- 1. Create lesson_progress table for debounced state tracking
create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  last_step int not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Index for quick lookups
create index if not exists idx_lesson_progress_user on public.lesson_progress(user_id);
create index if not exists idx_lesson_progress_lesson on public.lesson_progress(lesson_id);

-- 2. Add status to feedback table
alter table public.feedback
  add column if not exists status text not null default 'completed';

-- 3. Row Level Security for lesson_progress
alter table public.lesson_progress enable row level security;

drop policy if exists "Users can view own progress" on public.lesson_progress;
create policy "Users can view own progress"
  on public.lesson_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress" on public.lesson_progress;
create policy "Users can insert own progress"
  on public.lesson_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on public.lesson_progress;
create policy "Users can update own progress"
  on public.lesson_progress for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own progress" on public.lesson_progress;
create policy "Users can delete own progress"
  on public.lesson_progress for delete
  using (auth.uid() = user_id);
