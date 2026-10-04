import sharp from 'sharp';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { analyzeDrawingPhoto } from '@/lib/ai/gemini';
import { traceImageToPaths } from '@/lib/geometry/tracer';
import {
  generateGuideGeometry,
  assignPathsToSteps,
  calculateStepDurationMs,
} from '@/lib/geometry/paths';
import { globalConcurrencyGuard } from '@/lib/rate-limit';
import type { Lesson, StepPath } from '@/types';

/**
 * End-to-end background lesson generator.
 */
export async function processLesson(lessonId: string): Promise<void> {
  const startTime = Date.now();
  const lease = await globalConcurrencyGuard.acquire();
  if (!lease.allowed) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const adminClient = createAdminClient();
  const supabase = adminClient || (await createClient());

  let currentStage = 'initializing';

  try {
    // 1. Fetch lesson
    const { data: lesson, error: fetchErr } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .single();

    if (fetchErr || !lesson) {
      throw new Error(`Lesson ${lessonId} could not be found.`);
    }

    const updateStage = async (stage: string, progress: number, extra: any = {}) => {
      currentStage = stage;
      await supabase
        .from('lessons')
        .update({ stage, progress, ...extra })
        .eq('id', lessonId);
    };

    await supabase
      .from('lessons')
      .update({
        status: 'processing',
        stage: 'downloading',
        progress: 5,
        started_at: new Date().toISOString(),
        attempts: (lesson.attempts || 0) + 1,
        error_message: null,
      })
      .eq('id', lessonId);

    // 2. Download original image
    const storageClient = adminClient || supabase;
    const { data: fileData, error: downloadErr } = await storageClient.storage
      .from('originals')
      .download(lesson.image_path);

    if (downloadErr || !fileData) {
      throw new Error('Could not download photo from storage.');
    }

    const rawBuffer = Buffer.from(await fileData.arrayBuffer());

    // Normalize
    const normalizedImage = await sharp(rawBuffer)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer({ resolveWithObject: true });

    // 3. Stage: Analyzing
    await updateStage('analyzing', 15);
    const analysis = await analyzeDrawingPhoto(
      normalizedImage.data,
      lesson.difficulty,
      lesson.voice_language
    );

    // 4. Stage: Tracing
    await updateStage('tracing', 40, { title: analysis.title || lesson.title });
    
    // Time check before starting tracing
    const traceResult = await traceImageToPaths(normalizedImage.data, { startTime });
    const traceElapsed = (Date.now() - startTime) / 1000;

    // 5. Stage: Composing
    await updateStage('composing', 75, {
      viewbox_w: traceResult.width,
      viewbox_h: traceResult.height,
    });

    const guideGeometry = generateGuideGeometry(
      traceResult.width,
      traceResult.height,
      analysis.parts
    );

    const assignedPaths = assignPathsToSteps(
      traceResult.paths,
      analysis.steps,
      analysis.parts,
      traceResult.width,
      traceResult.height
    );

    // Inject guide geometry into step 0
    if (assignedPaths.length > 0) {
      assignedPaths[0] = [...guideGeometry, ...assignedPaths[0]];
    }

    await supabase.from('lesson_steps').delete().eq('lesson_id', lessonId);

    const stepsToInsert = analysis.steps.map((step, idx) => {
      const stepPaths: StepPath[] = assignedPaths[idx] || [];
      
      // Fallback: If no paths assigned to this step, use guide shapes if they belong to this part
      if (stepPaths.length === 0 && idx === 0) {
        // Step 0 always gets the guides
        stepPaths.push(...guideGeometry);
      }

      const durationMs = calculateStepDurationMs(stepPaths);

      return {
        lesson_id: lessonId,
        step_index: idx,
        title: step.title,
        instruction: step.instruction,
        narration: step.narration,
        paths: stepPaths,
        duration_ms: durationMs,
      };
    });

    if (stepsToInsert.length === 0) {
      throw new Error('Lesson has no steps to display.');
    }

    const { error: stepsInsertErr } = await supabase
      .from('lesson_steps')
      .insert(stepsToInsert);

    if (stepsInsertErr) {
      throw new Error(`Failed to save steps: ${stepsInsertErr.message}`);
    }

    // Finalize
    await updateStage('ready', 100, {
      status: 'ready',
      analysis: analysis,
      finished_at: new Date().toISOString(),
      error_message: null,
    });

  } catch (err: unknown) {
    const technicalError = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline Failure] Stage: ${currentStage}, Lesson: ${lessonId}, Error:`, technicalError);

    let friendlyMessage = 'Something went wrong while generating, please retry';
    if (technicalError.includes('too little contrast')) {
      friendlyMessage = 'Could not trace this photo, try a clearer picture';
    } else if (technicalError.toLowerCase().includes('model') || technicalError.toLowerCase().includes('quota')) {
      friendlyMessage = 'AI model is temporarily unavailable, please retry';
    }

    await supabase
      .from('lessons')
      .update({
        status: 'failed',
        stage: 'failed',
        error_message: friendlyMessage,
        finished_at: new Date().toISOString(),
      })
      .eq('id', lessonId);
  } finally {
    lease.release();
  }
}

