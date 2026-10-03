import { describe, it, expect } from 'vitest';
import { feedbackResultSchema } from '../validators';

describe('Feedback Schema Validation Tests', () => {
  it('validates a well-formed Gemini drawing feedback object', () => {
    const validFeedback = {
      summary: 'Excellent attempt! Your outer contour lines show strong confidence.',
      strengths: ['Great head-to-body proportion ratio', 'Smooth curved lines on the main body'],
      improvements: [
        {
          area: 'proportion' as const,
          what_you_did: 'The left ear is drawn slightly wider than the right ear.',
          how_to_fix: 'Use light vertical alignment guide lines before drawing the ear tips.',
          practice_tip: 'Practice drawing mirror-image teardrop shapes on scrap paper.',
        },
      ],
      next_challenge: 'Try shading the underside of the chin to create deep shadow volume.',
    };

    const parsed = feedbackResultSchema.safeParse(validFeedback);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.improvements[0].area).toBe('proportion');
      expect(parsed.data.strengths.length).toBe(2);
    }
  });

  it('rejects feedback without required fields or with invalid area enum', () => {
    const invalidFeedback = {
      summary: 'Nice drawing',
      strengths: [], // Empty array violates min(1)
      improvements: [
        {
          area: 'invalid-area', // Not a permitted area
          what_you_did: '',
          how_to_fix: '',
          practice_tip: '',
        },
      ],
      next_challenge: '',
    };

    const parsed = feedbackResultSchema.safeParse(invalidFeedback);
    expect(parsed.success).toBe(false);
  });
});
