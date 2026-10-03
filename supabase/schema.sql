-- ==============================================================================
-- Strokio Database Schema (Push 1 of 3: Foundation, Auth, Storage)
-- Paste this script into your Supabase SQL Editor and run it.
-- ==============================================================================

-- 1. Enable Required Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 2. Profiles Table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  default_difficulty text not null default 'easy' check (default_difficulty in ('easy', 'medium', 'detailed')),
  voice_language text not null default 'bn' check (voice_language in ('bn', 'en')),
  created_at timestamptz not null default now()
);

-- 3. Lessons Table
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Drawing Lesson',
  image_path text not null,
  difficulty text not null default 'easy' check (difficulty in ('easy', 'medium', 'detailed')),
  voice_language text not null default 'bn' check (voice_language in ('bn', 'en')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  error_message text,
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Lesson Steps Table (Structure ready for Push 2 AI & Push 3 Animation Player)
create table if not exists public.lesson_steps (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  step_index int not null,
  title text,
  instruction text,
  narration text,
  paths jsonb,
  duration_ms int,
  unique(lesson_id, step_index)
);

-- 5. Feedback Table (Structure ready for Push 3 Practice & Feedback)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text,
  result jsonb,
  created_at timestamptz not null default now()
);

-- 6. Indexes for Performance
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_lessons_user_id on public.lessons(user_id);
create index if not exists idx_lessons_created_at on public.lessons(created_at desc);
create index if not exists idx_lesson_steps_lesson_id on public.lesson_steps(lesson_id);
create index if not exists idx_feedback_user_id on public.feedback(user_id);
create index if not exists idx_feedback_lesson_id on public.feedback(lesson_id);

-- 7. Trigger: Update `updated_at` Timestamp on Lessons
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_lessons_updated_at on public.lessons;
create trigger set_lessons_updated_at
  before update on public.lessons
  for each row
  execute function public.handle_updated_at();

-- 8. Trigger: Auto-create Profile on Auth User Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 9. Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_steps enable row level security;
alter table public.feedback enable row level security;

-- Profiles Policies
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete
  using (auth.uid() = id);

-- Lessons Policies
drop policy if exists "Users can view own lessons" on public.lessons;
create policy "Users can view own lessons"
  on public.lessons for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own lessons" on public.lessons;
create policy "Users can insert own lessons"
  on public.lessons for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own lessons" on public.lessons;
create policy "Users can update own lessons"
  on public.lessons for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own lessons" on public.lessons;
create policy "Users can delete own lessons"
  on public.lessons for delete
  using (auth.uid() = user_id);

-- Lesson Steps Policies (inherits permissions via parent lesson)
drop policy if exists "Users can view steps of own lessons" on public.lesson_steps;
create policy "Users can view steps of own lessons"
  on public.lesson_steps for select
  using (
    exists (
      select 1 from public.lessons
      where lessons.id = lesson_steps.lesson_id
        and lessons.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert steps of own lessons" on public.lesson_steps;
create policy "Users can insert steps of own lessons"
  on public.lesson_steps for insert
  with check (
    exists (
      select 1 from public.lessons
      where lessons.id = lesson_steps.lesson_id
        and lessons.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update steps of own lessons" on public.lesson_steps;
create policy "Users can update steps of own lessons"
  on public.lesson_steps for update
  using (
    exists (
      select 1 from public.lessons
      where lessons.id = lesson_steps.lesson_id
        and lessons.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete steps of own lessons" on public.lesson_steps;
create policy "Users can delete steps of own lessons"
  on public.lesson_steps for delete
  using (
    exists (
      select 1 from public.lessons
      where lessons.id = lesson_steps.lesson_id
        and lessons.user_id = auth.uid()
    )
  );

-- Feedback Policies
drop policy if exists "Users can view own feedback" on public.feedback;
create policy "Users can view own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own feedback" on public.feedback;
create policy "Users can insert own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own feedback" on public.feedback;
create policy "Users can delete own feedback"
  on public.feedback for delete
  using (auth.uid() = user_id);

-- 10. Storage Buckets (Private)
insert into storage.buckets (id, name, public)
values ('originals', 'originals', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attempts', 'attempts', false)
on conflict (id) do nothing;

-- Storage Policies: allow users to operate strictly within folder named by their auth.uid()
drop policy if exists "Users can upload original images into their folder" on storage.objects;
create policy "Users can upload original images into their folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('originals', 'attempts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read own images" on storage.objects;
create policy "Users can read own images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('originals', 'attempts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own images" on storage.objects;
create policy "Users can delete own images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('originals', 'attempts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
