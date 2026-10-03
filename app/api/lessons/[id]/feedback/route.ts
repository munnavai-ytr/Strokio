import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createClient, createAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { checkFeedbackLimit } from '@/lib/rate-limit';
import { analyzeDrawingFeedback } from '@/lib/ai/gemini';

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

  // Rate Limiting (10 / hour / user)
  const rateLimit = await checkFeedbackLimit(user.id);
  if (!rateLimit.success) {
    const retryAfterSec = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'Feedback rate limit reached (max 10 requests per hour). Please practice and try again later.',
        remaining: 0,
        resetAt: rateLimit.resetAt,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfterSec.toString(),
        },
      }
    );
  }

  try {
    // 1. Fetch lesson verifying ownership
    const { data: lesson, error: lessonErr } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .eq('user_id', user.id)
      .single();

    if (lessonErr || !lesson) {
      return NextResponse.json({ error: 'Lesson not found or access denied.' }, { status: 404 });
    }

    // 2. Parse uploaded drawing image
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No drawing image file provided.' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Drawing image exceeds 10 MB limit.' }, { status: 400 });
    }

    const rawDrawingBuffer = Buffer.from(await file.arrayBuffer());

    // Normalize user drawing with sharp (auto-rotate, max 1024px, WebP and PNG)
    const normalizedDrawing = await sharp(rawDrawingBuffer)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .toBuffer({ resolveWithObject: true });

    const drawingWebpBuffer = await sharp(normalizedDrawing.data).webp({ quality: 85 }).toBuffer();
    const drawingPngBuffer = await sharp(normalizedDrawing.data).png().toBuffer();

    // 3. Download reference image from "originals" bucket
    const storageClient = createAdminClient() || supabase;
    const { data: refFileData, error: refDownloadErr } = await storageClient.storage
      .from('originals')
      .download(lesson.image_path);

    if (refDownloadErr || !refFileData) {
      return NextResponse.json({ error: 'Failed to retrieve original reference photo.' }, { status: 500 });
    }

    const refRawBuffer = Buffer.from(await refFileData.arrayBuffer());
    const refPngBuffer = await sharp(refRawBuffer)
      .rotate()
      .resize(1024, 1024, { fit: 'inside' })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();

    // 4. Store user drawing in private "attempts" bucket
    const attemptId = crypto.randomUUID();
    const attemptStoragePath = `${user.id}/${lessonId}/attempt-${Date.now()}.webp`;

    const { error: attemptUploadErr } = await storageClient.storage
      .from('attempts')
      .upload(attemptStoragePath, drawingWebpBuffer, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (attemptUploadErr) {
      console.error('[Feedback Storage Error]', attemptUploadErr);
      return NextResponse.json({ error: 'Failed to upload drawing attempt to storage.' }, { status: 500 });
    }

    // 5. Call Gemini AI Feedback comparison
    const feedbackResult = await analyzeDrawingFeedback(
      refPngBuffer,
      drawingPngBuffer,
      lesson.analysis || null,
      lesson.voice_language
    );

    // 6. Save record to "feedback" table
    const { data: feedbackRow, error: feedbackDbErr } = await supabase
      .from('feedback')
      .insert({
        id: attemptId,
        lesson_id: lessonId,
        user_id: user.id,
        image_path: attemptStoragePath,
        result: feedbackResult,
        status: 'completed',
      })
      .select()
      .single();

    if (feedbackDbErr) {
      console.error('[Feedback DB Error]', feedbackDbErr);
      return NextResponse.json({ error: 'Failed to save feedback record.' }, { status: 500 });
    }

    // 7. Generate signed URL for user's drawing attempt
    const { data: signedData } = await storageClient.storage
      .from('attempts')
      .createSignedUrl(attemptStoragePath, 3600);

    return NextResponse.json(
      {
        feedback: {
          ...feedbackRow,
          signed_image_url: signedData?.signedUrl || null,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to generate drawing feedback.';
    console.error('[Feedback Error]', err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured.' },
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
    const { data: attempts, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const storageClient = createAdminClient() || supabase;
    const attemptsWithSignedUrls = await Promise.all(
      (attempts || []).map(async (attempt) => {
        let signed_image_url: string | null = null;
        if (attempt.image_path) {
          const { data: signedData } = await storageClient.storage
            .from('attempts')
            .createSignedUrl(attempt.image_path, 3600);
          signed_image_url = signedData?.signedUrl || null;
        }
        return {
          ...attempt,
          signed_image_url,
        };
      })
    );

    return NextResponse.json({ attempts: attemptsWithSignedUrls });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch attempts';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
