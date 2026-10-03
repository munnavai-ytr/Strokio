import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { narrationRequestSchema } from '@/lib/validators';
import { checkNarrationLimit } from '@/lib/rate-limit';
import { generateStepNarrationAudio } from '@/lib/ai/gemini';

export const maxDuration = 45;

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

  // Rate Limiting (30/min/user)
  const rateLimit = await checkNarrationLimit(user.id);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Narration generation rate limit reached. Please wait a moment.' },
      { status: 429 }
    );
  }

  try {
    const json = await request.json();
    const validation = narrationRequestSchema.safeParse(json);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid step index provided', issues: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { stepIndex } = validation.data;

    // 1. Fetch lesson verifying ownership
    const { data: lesson, error: lessonErr } = await supabase
      .from('lessons')
      .select('id, user_id, voice_language')
      .eq('id', lessonId)
      .eq('user_id', user.id)
      .single();

    if (lessonErr || !lesson) {
      return NextResponse.json({ error: 'Lesson not found or access denied.' }, { status: 404 });
    }

    // 2. Fetch specific step
    const { data: step, error: stepErr } = await supabase
      .from('lesson_steps')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('step_index', stepIndex)
      .single();

    if (stepErr || !step) {
      return NextResponse.json({ error: 'Lesson step not found.' }, { status: 404 });
    }

    const storageClient = createAdminClient() || supabase;

    // 3. If audio_path already exists, return signed URL directly
    if (step.audio_path) {
      const { data: signedData, error: signErr } = await storageClient.storage
        .from('narrations')
        .createSignedUrl(step.audio_path, 3600);

      if (!signErr && signedData?.signedUrl) {
        return NextResponse.json({
          audioUrl: signedData.signedUrl,
          durationMs: step.audio_duration_ms || 5000,
          cached: true,
        });
      }
    }

    // 4. If no narration text, fallback
    if (!step.narration) {
      return NextResponse.json(
        { error: 'Step contains no narration script.', code: 'TTS_UNAVAILABLE' },
        { status: 503 }
      );
    }

    // 5. Generate audio with Gemini TTS
    let wavBuffer: Buffer;
    let durationMs: number;

    try {
      const audioResult = await generateStepNarrationAudio(
        step.narration,
        lesson.voice_language
      );
      wavBuffer = audioResult.wavBuffer;
      durationMs = audioResult.durationMs;
    } catch (ttsErr: unknown) {
      console.warn(`[TTS Engine Warning] Gemini TTS unavailable for step ${stepIndex}:`, ttsErr);
      return NextResponse.json(
        {
          error: 'Gemini TTS currently unavailable. Falling back to browser speech synthesis.',
          code: 'TTS_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    // 6. Upload to private bucket "narrations" under {user_id}/{lesson_id}/step-{n}.wav
    const audioPath = `${user.id}/${lessonId}/step-${stepIndex}.wav`;

    const { error: uploadErr } = await storageClient.storage
      .from('narrations')
      .upload(audioPath, wavBuffer, {
        contentType: 'audio/wav',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[TTS Storage Error] Failed to upload narration audio:', uploadErr);
      return NextResponse.json(
        { error: 'Failed to store narration file.', code: 'TTS_UNAVAILABLE' },
        { status: 503 }
      );
    }

    // 7. Update lesson_steps record
    await supabase
      .from('lesson_steps')
      .update({
        audio_path: audioPath,
        audio_duration_ms: durationMs,
      })
      .eq('id', step.id);

    // 8. Generate short-lived signed URL
    const { data: signedData } = await storageClient.storage
      .from('narrations')
      .createSignedUrl(audioPath, 3600);

    return NextResponse.json({
      audioUrl: signedData?.signedUrl,
      durationMs,
      cached: false,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to process narration';
    return NextResponse.json(
      { error: errorMsg, code: 'TTS_UNAVAILABLE' },
      { status: 503 }
    );
  }
}
