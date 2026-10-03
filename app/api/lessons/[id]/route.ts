import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { globalRateLimiter } from '@/lib/rate-limit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
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

  const rateLimit = await globalRateLimiter.check(user.id);
  if (!rateLimit.success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    // 1. Fetch lesson verifying ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .eq('user_id', user.id)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found or access denied.' }, { status: 404 });
    }

    // 2. Fetch steps (for Push 3 animation player integration)
    const { data: steps } = await supabase
      .from('lesson_steps')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('step_index', { ascending: true });

    // 3. Generate signed URL for private original image (1 hour expiry)
    let signed_image_url: string | null = null;
    if (lesson.image_path) {
      const storageClient = createAdminClient() || supabase;
      const { data: signedData } = await storageClient.storage
        .from('originals')
        .createSignedUrl(lesson.image_path, 3600);
      signed_image_url = signedData?.signedUrl || null;
    }

    return NextResponse.json({
      lesson: {
        ...lesson,
        signed_image_url,
      },
      steps: steps || [],
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve lesson';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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
    // 1. Retrieve lesson to know the image path
    const { data: lesson, error: fetchError } = await supabase
      .from('lessons')
      .select('id, image_path, user_id')
      .eq('id', lessonId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found or access denied.' }, { status: 404 });
    }

    // 2. Delete database record
    const { error: deleteDbError } = await supabase
      .from('lessons')
      .delete()
      .eq('id', lessonId)
      .eq('user_id', user.id);

    if (deleteDbError) {
      return NextResponse.json({ error: deleteDbError.message }, { status: 500 });
    }

    // 3. Remove storage object
    if (lesson.image_path) {
      const storageClient = createAdminClient() || supabase;
      await storageClient.storage.from('originals').remove([lesson.image_path]);
    }

    return NextResponse.json({
      success: true,
      message: 'Lesson and storage asset deleted successfully.',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete lesson';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
