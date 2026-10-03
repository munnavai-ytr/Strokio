import { NextRequest, NextResponse, after } from 'next/server';
import { createClient, createAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { createLessonSchema } from '@/lib/validators';
import { checkLessonCreationLimit, rateLimiter } from '@/lib/rate-limit';
import { processLesson } from '@/lib/pipeline';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured on the server. Please check .env.local.' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in to create a lesson.' }, { status: 401 });
  }

  // Rate Limiting & Daily Quota check
  const quotaCheck = await checkLessonCreationLimit(user.id);
  if (!quotaCheck.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((quotaCheck.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: quotaCheck.message,
        reason: quotaCheck.reason,
        remaining: quotaCheck.remaining,
        resetAt: quotaCheck.resetAt,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfterSec.toString(),
          'X-RateLimit-Remaining': quotaCheck.remaining.toString(),
          'X-RateLimit-Reset': quotaCheck.resetAt.toString(),
        },
      }
    );
  }

  try {
    let fileBuffer: Buffer | null = null;
    let title = 'Drawing Lesson';
    let difficulty: 'easy' | 'medium' | 'detailed' = 'easy';
    let voice_language: 'bn' | 'en' = 'bn';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      title = (formData.get('title') as string) || 'Drawing Lesson';
      difficulty = (formData.get('difficulty') as 'easy' | 'medium' | 'detailed') || 'easy';
      voice_language = (formData.get('voice_language') as 'bn' | 'en') || 'bn';

      if (!file) {
        return NextResponse.json({ error: 'No image file provided in upload request.' }, { status: 400 });
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image exceeds maximum allowed size (10 MB).' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else if (contentType.includes('application/json')) {
      const json = await request.json();
      title = json.title || 'Drawing Lesson';
      difficulty = json.difficulty || 'easy';
      voice_language = json.voice_language || 'bn';

      if (!json.imageBase64) {
        return NextResponse.json({ error: 'No imageBase64 data provided.' }, { status: 400 });
      }

      const base64Data = json.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      fileBuffer = Buffer.from(base64Data, 'base64');
      if (fileBuffer.length > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image exceeds maximum allowed size (10 MB).' }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported Content-Type. Use multipart/form-data or application/json.' },
        { status: 400 }
      );
    }

    // Validate parameters with Zod
    const validation = createLessonSchema.safeParse({
      title: title || 'Drawing Lesson',
      difficulty,
      voice_language,
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const lessonId = crypto.randomUUID();
    const storagePath = `${user.id}/${lessonId}.webp`;

    // Upload to private Supabase Storage bucket 'originals'
    const storageClient = createAdminClient() || supabase;
    const { error: storageError } = await storageClient.storage
      .from('originals')
      .upload(storagePath, fileBuffer!, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (storageError) {
      console.error('Supabase storage upload error:', storageError);
      return NextResponse.json(
        { error: `Failed to upload image to storage: ${storageError.message}` },
        { status: 500 }
      );
    }

    // Create row in 'lessons' table
    const { data: lesson, error: dbError } = await supabase
      .from('lessons')
      .insert({
        id: lessonId,
        user_id: user.id,
        title: validation.data.title,
        image_path: storagePath,
        difficulty: validation.data.difficulty,
        voice_language: validation.data.voice_language,
        status: 'queued',
        stage: 'queued',
        progress: 0,
        attempts: 0,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Supabase database insert error:', dbError);
      await storageClient.storage.from('originals').remove([storagePath]);
      return NextResponse.json(
        { error: `Failed to save lesson record: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Trigger AI lesson engine in the background using Next.js after()
    after(async () => {
      try {
        await processLesson(lessonId);
      } catch (pipelineErr) {
        console.error(`[Background Lesson Error] Failed to process ${lessonId}:`, pipelineErr);
      }
    });

    return NextResponse.json(
      {
        id: lessonId,
        lesson,
        remainingDaily: quotaCheck.remaining,
        message: 'Lesson created and background generation started.',
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal server error';
    console.error('Create lesson unhandled error:', err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured on the server.' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate Limiting per user (60/min)
  const rateLimit = await rateLimiter.check(`get_lessons:${user.id}`, 60, 60000);
  if (!rateLimit.success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 100);
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);
  const offset = (page - 1) * limit;

  try {
    const { data: lessons, error, count } = await supabase
      .from('lessons')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Attach signed URLs (valid for 1 hour) for private storage images
    const storageClient = createAdminClient() || supabase;
    const lessonsWithSignedUrls = await Promise.all(
      (lessons || []).map(async (lesson) => {
        let signed_image_url: string | null = null;
        if (lesson.image_path) {
          const { data: signedData } = await storageClient.storage
            .from('originals')
            .createSignedUrl(lesson.image_path, 3600);
          signed_image_url = signedData?.signedUrl || null;
        }
        return {
          ...lesson,
          signed_image_url,
        };
      })
    );

    return NextResponse.json({
      lessons: lessonsWithSignedUrls,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch lessons';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
