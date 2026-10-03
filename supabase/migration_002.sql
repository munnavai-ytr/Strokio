-- ==============================================================================
-- Strokio Database Migration 002 (Push 2: AI Engine, Vector Tracing & Narration)
-- Run this in your Supabase SQL Editor.
-- ==============================================================================

-- 1. Extend lessons table with pipeline tracking columns
alter table public.lessons
  add column if not exists stage text default 'queued',
  add column if not exists progress int default 0,
  add column if not exists attempts int default 0,
  add column if not exists viewbox_w int,
  add column if not exists viewbox_h int,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

-- Ensure check constraint allows new stages if validated
alter table public.lessons
  drop constraint if exists lessons_stage_check;

alter table public.lessons
  add constraint lessons_stage_check
  check (stage in ('queued', 'analyzing', 'tracing', 'composing', 'ready', 'failed'));

-- 2. Extend lesson_steps with audio narration fields
alter table public.lesson_steps
  add column if not exists audio_path text,
  add column if not exists audio_duration_ms int;

-- 3. Create private storage bucket 'narrations'
insert into storage.buckets (id, name, public)
values ('narrations', 'narrations', false)
on conflict (id) do nothing;

-- 4. Storage read policy for 'narrations': user can read within their folder
drop policy if exists "Users can read own narration audio" on storage.objects;
create policy "Users can read own narration audio"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role will handle server-side writes for narration generation
drop policy if exists "Users can delete own narration audio" on storage.objects;
create policy "Users can delete own narration audio"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
