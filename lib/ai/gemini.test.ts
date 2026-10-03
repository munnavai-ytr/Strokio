import { describe, it, expect, vi } from 'vitest';
import {
  isNotFoundError,
  generateWithModelFallback,
  DEFAULT_ANALYSIS_MODEL,
  FALLBACK_ANALYSIS_MODEL,
  DEFAULT_TTS_MODEL,
  FALLBACK_TTS_MODEL,
  DEFAULT_TTS_VOICE,
} from './gemini';

describe('Gemini Model Fallback & Configuration Tests', () => {
  it('has safe default models and voices when env vars are unconfigured', () => {
    expect(DEFAULT_ANALYSIS_MODEL).toBe('gemini-2.5-flash');
    expect(FALLBACK_ANALYSIS_MODEL).toBe('gemini-2.5-flash-lite');
    expect(DEFAULT_TTS_MODEL).toBe('gemini-2.5-flash-preview-tts');
    expect(FALLBACK_TTS_MODEL).toBe('gemini-2.5-pro-preview-tts');
    expect(DEFAULT_TTS_VOICE).toBe('Kore');
  });

  it('correctly identifies 404 / model-not-found errors', () => {
    expect(isNotFoundError(new Error('404 Not Found: Model gemini-2.5-flash is not found'))).toBe(true);
    expect(isNotFoundError(new Error('RESOURCE_EXHAUSTED: 429 Rate limit reached'))).toBe(false);
    expect(isNotFoundError(new Error('model not found'))).toBe(true);
    expect(isNotFoundError(null)).toBe(false);
  });

  it('executes primary model when call succeeds without 404', async () => {
    const fn = vi.fn().mockImplementation(async (model: string) => {
      return `Result from ${model}`;
    });

    const result = await generateWithModelFallback(
      'Test Task',
      'primary-model',
      'fallback-model',
      fn
    );

    expect(result).toBe('Result from primary-model');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('primary-model');
  });

  it('retries with fallback model when primary model returns 404 / not found', async () => {
    const fn = vi.fn().mockImplementation(async (model: string) => {
      if (model === 'primary-model') {
        throw new Error('404 Model primary-model not found');
      }
      return `Result from ${model}`;
    });

    const result = await generateWithModelFallback(
      'Test Task',
      'primary-model',
      'fallback-model',
      fn
    );

    expect(result).toBe('Result from fallback-model');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'primary-model');
    expect(fn).toHaveBeenNthCalledWith(2, 'fallback-model');
  });

  it('re-throws non-404 errors without calling fallback model', async () => {
    const fn = vi.fn().mockImplementation(async (model: string) => {
      throw new Error('429 Rate limit exceeded');
    });

    await expect(
      generateWithModelFallback('Test Task', 'primary-model', 'fallback-model', fn)
    ).rejects.toThrow('429 Rate limit exceeded');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
