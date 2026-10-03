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
 * Updates stage and progress in database across:
 * 1. Analyzing (Gemini breakdown)
 * 2. Tracing (Potrace vectorization)
 * 3. Composing (Geometry assignment & duration math)
 */
export async function processLesson(lessonId: string): Promise<void> {
  const lease = await globalConcurrencyGuard.acquire();
  // If concurrency limit reached, wait briefly before retrying
  if (!lease.allowed) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Use admin client if available (service role) or standard server client
  const adminClient = createAdminClient();
  const supabase = adminClient || (await createClient());

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

    // Mark as started & analyzing
    await supabase
      .from('lessons')
      .update({
        status: 'processing',
        stage: 'analyzing',
        progress: 15,
        started_at: new Date().toISOString(),
        attempts: (lesson.attempts || 0) + 1,
        error_message: null,
      })
      .eq('id', lessonId);

    // 2. Download original image from storage
    const storageClient = adminClient || supabase;
    const { data: fileData, error: downloadErr } = await storageClient.storage
      .from('originals')
      .download(lesson.image_path);

    if (downloadErr || !fileData) {
      throw new Error('Failed to retrieve original photo from storage.');
    }

    const rawBuffer = Buffer.from(await fileData.arrayBuffer());

    // Normalize with sharp: auto-orient EXIF, max 1024px on long edge, flatten on white
    const normalizedImage = await sharp(rawBuffer)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer({ resolveWithObject: true });

    // 3. Stage 1: Analyzing with Gemini
    const analysis = await analyzeDrawingPhoto(
      normalizedImage.data,
      lesson.difficulty,
      lesson.voice_language
    );

    // Update progress
    await supabase
      .from('lessons')
      .update({
        stage: 'tracing',
        progress: 50,
        title: analysis.title || lesson.title,
      })
      .eq('id', lessonId);

    // 4. Stage 2: Tracing vector paths with Potrace
    const traceResult = await traceImageToPaths(normalizedImage.data);

    // Update progress
    await supabase
      .from('lessons')
      .update({
        stage: 'composing',
        progress: 80,
        viewbox_w: traceResult.width,
        viewbox_h: traceResult.height,
      })
      .eq('id', lessonId);

    // 5. Stage 3: Composing step geometry
    // Generate guide geometry (center lines, thirds, block-in shapes)
    const guideGeometry = generateGuideGeometry(
      traceResult.width,
      traceResult.height,
      analysis.parts
    );

    // Assign contour, detail, and shade paths to steps
    const assignedPaths = assignPathsToSteps(
      traceResult.paths,
      analysis.steps,
      analysis.parts,
      traceResult.width,
      traceResult.height
    );

    // Inject guide geometry into step 0 (initial step)
    if (assignedPaths.length > 0) {
      // Prepend guide lines to the first step
      assignedPaths[0] = [...guideGeometry, ...assignedPaths[0]];
    }

    // Clear existing steps for this lesson (if retry)
    await supabase.from('lesson_steps').delete().eq('lesson_id', lessonId);

    // Insert steps into lesson_steps table
    const stepsToInsert = analysis.steps.map((step, idx) => {
      const stepPaths: StepPath[] = assignedPaths[idx] || [];
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

    const { error: stepsInsertErr } = await supabase
      .from('lesson_steps')
      .insert(stepsToInsert);

    if (stepsInsertErr) {
      throw new Error(`Failed to persist lesson steps: ${stepsInsertErr.message}`);
    }

    // Finalize lesson record
    await supabase
      .from('lessons')
      .update({
        status: 'ready',
        stage: 'ready',
        progress: 100,
        viewbox_w: traceResult.width,
        viewbox_h: traceResult.height,
        analysis: analysis,
        finished_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', lessonId);
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'An error occurred while generating your drawing lesson.';
    // Log server-side without user data
    console.error(`[Lesson Engine Error] Lesson ${lessonId} failed:`, errorMsg);

    await supabase
      .from('lessons')
      .update({
        status: 'failed',
        stage: 'failed',
        error_message: errorMsg,
        finished_at: new Date().toISOString(),
      })
      .eq('id', lessonId);
  } finally {
    lease.release();
  }
}
