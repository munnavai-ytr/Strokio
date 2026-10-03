import { GoogleGenAI, Type } from '@google/genai';
import { lessonAnalysisSchema, feedbackResultSchema } from '../validators';
import type { LessonAnalysis, DifficultyLevel, VoiceLanguage, FeedbackResult } from '../../types';

// Safe server-side initialization with fallback so import never crashes if GEMINI_API_KEY is missing
const apiKey = process.env.GEMINI_API_KEY || 'placeholder-gemini-api-key';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Optional environment variables with safe defaults in code
export const DEFAULT_ANALYSIS_MODEL =
  process.env.GEMINI_ANALYSIS_MODEL?.trim() || 'gemini-2.5-flash';
export const FALLBACK_ANALYSIS_MODEL = 'gemini-2.5-flash-lite';

export const DEFAULT_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-2.5-flash-preview-tts';
export const FALLBACK_TTS_MODEL = 'gemini-2.5-pro-preview-tts';

export const DEFAULT_TTS_VOICE =
  process.env.GEMINI_TTS_VOICE?.trim() || 'Kore';

// Backwards-compatibility exports
export const ANALYSIS_MODEL = DEFAULT_ANALYSIS_MODEL;
export const TTS_MODEL = DEFAULT_TTS_MODEL;
export const TTS_VOICE = DEFAULT_TTS_VOICE;

/**
 * Helper to detect 404 / model-not-found errors from Gemini API
 */

export function isNotFoundError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('404') ||
      msg.includes('not_found') ||
      msg.includes('not found') ||
      msg.includes('is not found') ||
      msg.includes('model not found')
    );
  }
  return false;
}

/**
 * Exponential backoff helper for handling rate limits (429) and transient errors.
 */
async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1500
): Promise<T> {
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes('429') ||
          err.message.includes('RESOURCE_EXHAUSTED') ||
          err.message.includes('quota'));

      if (attempt === maxRetries || !isRateLimit) {
        throw err;
      }
      console.warn(`[Gemini Backoff] Attempt ${attempt} rate-limited. Retrying in ${delay}ms...`);
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Executes a Gemini request with a strict 40s timeout via AbortController.
 */
async function callWithTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 40000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await promiseFactory(controller.signal);
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'AbortError' || controller.signal.aborted)) {
      throw new Error(`Gemini request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes a model task trying primaryModel first, and retrying once with fallbackModel if 404 / not found occurs.
 */
export async function generateWithModelFallback<T>(
  taskName: string,
  primaryModel: string,
  fallbackModel: string | null,
  fn: (modelToUse: string) => Promise<T>
): Promise<T> {
  console.log(`[${taskName}] Executing request with model: ${primaryModel}`);
  try {
    const result = await fn(primaryModel);
    console.log(`[${taskName}] Successfully completed request using model: ${primaryModel}`);
    return result;
  } catch (err: unknown) {
    if (fallbackModel && isNotFoundError(err)) {
      console.warn(
        `[${taskName}] Model "${primaryModel}" failed with 404 / NOT_FOUND error. Retrying once with fallback model "${fallbackModel}"...`
      );
      console.log(`[${taskName}] Retrying request with model: ${fallbackModel}`);
      const fallbackResult = await fn(fallbackModel);
      console.log(`[${taskName}] Successfully completed request using fallback model: ${fallbackModel}`);
      return fallbackResult;
    }
    throw err;
  }
}

/**
 * Structured Response Schema for Lesson Analysis
 */
const lessonAnalysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Engaging, beginner-friendly title for the drawing lesson' },
    subject_summary: { type: Type.STRING, description: '1-2 sentence description of the subject and main shapes' },
    overall_proportions: { type: Type.STRING, description: 'Overall width-to-height ratio and guide placement' },
    parts: {
      type: Type.ARRAY,
      description: 'Decomposed structural parts of the subject from major shapes to fine details',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'Unique part id, e.g. p_head, p_body' },
          name: { type: Type.STRING, description: 'Plain English name of the part' },
          kind: {
            type: Type.STRING,
            enum: ['main-shape', 'secondary', 'detail', 'texture', 'shading', 'background'],
          },
          box_2d: {
            type: Type.ARRAY,
            description: '[ymin, xmin, ymax, xmax] coordinates normalized 0 to 1000',
            items: { type: Type.INTEGER },
          },
          approx_shape: {
            type: Type.STRING,
            enum: ['circle', 'ellipse', 'rect', 'triangle', 'polygon', 'freeform'],
          },
          draw_order: { type: Type.INTEGER, description: 'Drawing sequence order, starting at 1' },
          tips: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Actionable tips for blocking in this part',
          },
        },
        required: ['id', 'name', 'kind', 'box_2d', 'approx_shape', 'draw_order', 'tips'],
      },
    },
    steps: {
      type: Type.ARRAY,
      description: 'Ordered sequence of drawing steps following real art teacher methodology',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Short step title, e.g., Step 1: Block in the Head' },
          goal: { type: Type.STRING, description: 'What the student accomplishes in this step' },
          part_ids: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of part ids introduced or refined in this step (must match parts array)',
          },
          instruction: { type: Type.STRING, description: 'Clear instruction using simple beginner vocabulary' },
          narration: {
            type: Type.STRING,
            description:
              'Warm spoken teacher narration (2-4 sentences) in the requested voice language with technique tips',
          },
          common_mistake: { type: Type.STRING, description: 'Frequent mistake beginners make in this step' },
          tip: { type: Type.STRING, description: 'Helpful drawing tip for pencil angle or line weight' },
        },
        required: ['title', 'goal', 'part_ids', 'instruction', 'narration', 'common_mistake', 'tip'],
      },
    },
  },
  required: ['title', 'subject_summary', 'overall_proportions', 'parts', 'steps'],
};

/**
 * Analyzes normalized image with Gemini to decompose it into beginner drawing steps.
 */
export async function analyzeDrawingPhoto(
  imageBuffer: Buffer,
  difficulty: DifficultyLevel,
  voiceLanguage: VoiceLanguage
): Promise<LessonAnalysis> {
  const stepTarget =
    difficulty === 'easy' ? '6 to 8' : difficulty === 'medium' ? '8 to 11' : '11 to 15';

  const languagePrompt =
    voiceLanguage === 'bn'
      ? 'The narration text for each step MUST be in warm, natural spoken Bengali (বাংলা), providing supportive advice like "খুব হালকা পেন্সিল দিয়ে শুরু করুন". Other fields (title, instruction, tips) can be in English or Bengali.'
      : 'The narration text for each step must be in warm, spoken English (2-4 sentences), encouraging light pencil pressure and proportion checks.';

  const systemPrompt = `You are a patient, world-class beginner drawing teacher.
Your goal is to guide a complete beginner in drawing this exact photo from scratch.
You teach using proper artistic sequence:
1. Proportion and guide lines (rule of thirds, center lines, height vs width comparison)
2. Big basic geometric shapes (circles, ovals, boxes, triangles)
3. Secondary interlocking forms
4. Outer contour and silhouette lines
5. Internal features and details
6. Surface texture and line variation
7. Shading and value gradients
8. Final cleanup and contrast

Rules:
- Step count: exactly ${stepTarget} steps.
- Every "part_id" referenced in the "steps" array MUST exist in the "parts" list.
- Normalized box_2d coordinates must be strictly in 0..1000 range: [ymin, xmin, ymax, xmax].
- ${languagePrompt}`;

  const base64Data = imageBuffer.toString('base64');
  const imagePart = {
    inlineData: {
      mimeType: 'image/png',
      data: base64Data,
    },
  };

  const executeAnalysis = async (modelToUse: string) => {
    const generateWithPrompt = async (additionalContext?: string): Promise<LessonAnalysis> => {
      return retryWithBackoff(async () => {
        return callWithTimeout(async () => {
          const promptText = additionalContext
            ? `Analyze this photo for a ${difficulty} drawing lesson. Note the previous validation feedback: ${additionalContext}`
            : `Analyze this photo and create a ${difficulty} drawing lesson with ${stepTarget} steps.`;

          const response = await ai.models.generateContent({
            model: modelToUse,
            contents: {
              parts: [imagePart, { text: promptText }],
            },
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: 'application/json',
              responseSchema: lessonAnalysisResponseSchema,
              temperature: 0.2,
            },
          });

          const rawText = response.text?.trim();
          if (!rawText) {
            throw new Error('Gemini returned an empty response or safety block.');
          }

          const parsedJson = JSON.parse(rawText);
          const validated = lessonAnalysisSchema.parse(parsedJson);
          return validated as LessonAnalysis;
        }, 40000);
      });
    };

    try {
      return await generateWithPrompt();
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        throw err;
      }
      console.warn('[Gemini Analysis] First attempt failed validation or timed out:', err);
      const errorDetails = err instanceof Error ? err.message : 'Invalid schema';
      try {
        return await generateWithPrompt(`Ensure strict schema compliance and valid part IDs: ${errorDetails}`);
      } catch (secondErr: unknown) {
        if (isNotFoundError(secondErr)) {
          throw secondErr;
        }
        console.error('[Gemini Analysis] Second attempt failed:', secondErr);
        throw new Error('Failed to generate structured drawing lesson from photo.');
      }
    }
  };

  return generateWithModelFallback(
    'Gemini Analysis',
    DEFAULT_ANALYSIS_MODEL,
    FALLBACK_ANALYSIS_MODEL,
    executeAnalysis
  );
}

/**
 * Formats PCM buffer into standard 44-byte RIFF WAV format (24kHz, 16-bit mono)
 */
export function ensureWavHeader(buffer: Buffer): { wavBuffer: Buffer; durationMs: number } {
  if (buffer.length > 44 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    const dataSize = buffer.length - 44;
    const durationMs = Math.round((dataSize / (24000 * 2)) * 1000);
    return { wavBuffer: buffer, durationMs };
  }

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = buffer.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const wavBuffer = Buffer.concat([header, buffer]);
  const durationMs = Math.round((dataSize / (sampleRate * 2)) * 1000);

  return { wavBuffer, durationMs };
}

/**
 * Generates teacher voice narration using Gemini TTS.
 */
export async function generateStepNarrationAudio(
  narrationText: string,
  voiceLanguage: VoiceLanguage
): Promise<{ wavBuffer: Buffer; durationMs: number }> {
  const languageStyle =
    voiceLanguage === 'bn'
      ? 'Warm, gentle Bengali drawing teacher speaking clearly to a student.'
      : 'Calm, patient, friendly drawing instructor giving gentle encouragement.';

  const executeTTS = async (modelToUse: string) => {
    return retryWithBackoff(async () => {
      return callWithTimeout(async () => {
        const response = await ai.models.generateContent({
          model: modelToUse,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: narrationText,
                  speechMetadata: {
                    style: languageStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: DEFAULT_TTS_VOICE },
              },
            },
          },
        });

        const audioBase64 =
          response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!audioBase64) {
          throw new Error('TTS response contained no audio payload');
        }

        const rawBuffer = Buffer.from(audioBase64, 'base64');
        return ensureWavHeader(rawBuffer);
      }, 30000);
    });
  };

  return generateWithModelFallback(
    'Gemini TTS',
    DEFAULT_TTS_MODEL,
    FALLBACK_TTS_MODEL,
    executeTTS
  );
}

/**
 * Structured schema for AI Drawing Feedback
 */
const feedbackResponseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: 'An encouraging, warm overall summary of the student sketch compared to the reference photo',
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'List of specific strengths demonstrated in the user drawing',
    },
    improvements: {
      type: Type.ARRAY,
      description: 'List of actionable improvement recommendations',
      items: {
        type: Type.OBJECT,
        properties: {
          area: {
            type: Type.STRING,
            enum: ['proportion', 'line-quality', 'shape-accuracy', 'detail', 'shading', 'composition'],
          },
          what_you_did: { type: Type.STRING, description: 'Objective observation of the student drawing' },
          how_to_fix: { type: Type.STRING, description: 'Clear instruction on how to adjust or improve' },
          practice_tip: { type: Type.STRING, description: 'Actionable technique exercise to build confidence' },
        },
        required: ['area', 'what_you_did', 'how_to_fix', 'practice_tip'],
      },
    },
    next_challenge: {
      type: Type.STRING,
      description: 'An inspiring challenge or subject to draw next',
    },
  },
  required: ['summary', 'strengths', 'improvements', 'next_challenge'],
};

/**
 * Evaluates the user's hand-drawn paper sketch against the reference photo using Gemini.
 */
export async function analyzeDrawingFeedback(
  referenceImageBuffer: Buffer,
  userDrawingBuffer: Buffer,
  lessonAnalysis: LessonAnalysis | null,
  voiceLanguage: VoiceLanguage
): Promise<FeedbackResult> {
  const languageInstruction =
    voiceLanguage === 'bn'
      ? 'The feedback summary, strengths, improvements, and next challenge MUST be written in natural, supportive Bengali (বাংলা), praising effort and offering gentle guidance.'
      : 'The feedback must be written in warm, encouraging English, celebrating effort and providing concrete tips.';

  const systemPrompt = `You are a world-class, nurturing art teacher reviewing a beginner student's hand-drawn sketch on paper.
You are comparing two images:
1. The first image is the ORIGINAL REFERENCE photo the student was trying to draw.
2. The second image is the STUDENT'S HAND-DRAWN PAPER SKETCH.

Your task is to give uplifting, constructive, and accurate feedback.
Rules:
- NEVER invent numeric scores or arbitrary letter grades. Focus on visual qualities.
- Celebrate what the student did well (e.g. bold strokes, accurate silhouette, good observation).
- Identify 2 to 4 specific areas of improvement (proportion, line-quality, shape-accuracy, detail, shading, composition).
- For each improvement, describe objectively what they did, how to adjust it, and a quick practice tip.
- ${languageInstruction}`;

  const refPart = {
    inlineData: {
      mimeType: 'image/png',
      data: referenceImageBuffer.toString('base64'),
    },
  };

  const userPart = {
    inlineData: {
      mimeType: 'image/png',
      data: userDrawingBuffer.toString('base64'),
    },
  };

  const lessonContextText = lessonAnalysis
    ? `The lesson taught: ${lessonAnalysis.title}. Summary: ${lessonAnalysis.subject_summary}. Key proportions: ${lessonAnalysis.overall_proportions}.`
    : 'Beginner drawing lesson.';

  const executeFeedback = async (modelToUse: string) => {
    return retryWithBackoff(async () => {
      return callWithTimeout(async () => {
        const response = await ai.models.generateContent({
          model: modelToUse,
          contents: {
            parts: [
              refPart,
              userPart,
              {
                text: `Review the student drawing (second image) against the reference photo (first image). ${lessonContextText}`,
              },
            ],
          },
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: feedbackResponseSchema,
            temperature: 0.3,
          },
        });

        const rawText = response.text?.trim();
        if (!rawText) {
          throw new Error('Gemini feedback returned empty response or safety block.');
        }

        const parsed = JSON.parse(rawText);
        const validated = feedbackResultSchema.parse(parsed);
        return validated as FeedbackResult;
      }, 40000);
    });
  };

  return generateWithModelFallback(
    'Gemini Feedback',
    DEFAULT_ANALYSIS_MODEL,
    FALLBACK_ANALYSIS_MODEL,
    executeFeedback
  );
}
