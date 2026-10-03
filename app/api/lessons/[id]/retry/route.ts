import { NextRequest, NextResponse, after } from 'next/server';
import { createClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { processLesson } from '@/lib/pipeline';
import { checkLessonCreationLimit } from '@/lib/rate-limit';

export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured on the server.' },
      { status: 503 }
    );
  }

  const { id: lessonId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Fetch lesson verifying ownership
    const { data: lesson, error: fetchErr } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !lesson) {
      return NextResponse.json({ error: 'Lesson not found or access denied.' }, { status: 404 });
    }

    // 2. Failed lessons only
    if (lesson.status !== 'failed') {
      return NextResponse.json(
        { error: `Lesson cannot be retried while in '${lesson.status}' status.` },
        { status: 400 }
      );
    }

    // Check rate limit
    const quotaCheck = await checkLessonCreationLimit(user.id);
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { error: quotaCheck.message, reason: quotaCheck.reason },
        { status: 429 }
      );
    }

    // 3. Reset lesson to queued
    await supabase
      .from('lessons')
      .update({
        status: 'queued',
        stage: 'queued',
        progress: 0,
        error_message: null,
      })
      .eq('id', lessonId);

    // 4. Trigger background processor using Next.js after()
    after(async () => {
      try {
        await processLesson(lessonId);
      } catch (err) {
        console.error(`[Lesson Retry Error] Background job for ${lessonId} failed:`, err);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Lesson retry initiated.',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retry lesson';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
