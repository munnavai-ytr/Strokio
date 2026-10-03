import { describe, it, expect } from 'vitest';
import { calculatePacedDuration, getDashoffset } from './timing';

describe('Player Timing & Pacing Logic Tests', () => {
  describe('calculatePacedDuration', () => {
    it('returns base duration divided by speed when no narration is provided', () => {
      const duration = calculatePacedDuration(6000, null, 1.0);
      expect(duration).toBe(6000);

      const fastDuration = calculatePacedDuration(6000, null, 2.0);
      expect(fastDuration).toBe(3000);
    });

    it('paces step animation to match narration length within 0.7x to 1.6x clamp', () => {
      // Step is 8000ms, narration is 7500ms
      const paced = calculatePacedDuration(8000, 7500, 1.0);
      expect(paced).toBeGreaterThanOrEqual(6000);
      expect(paced).toBeLessThanOrEqual(9000);
    });

    it('clamps adaptation factor when narration is excessively long', () => {
      // Step is 5000ms, narration is 50000ms
      const paced = calculatePacedDuration(5000, 50000, 1.0);
      // Clamped at 0.7x maximum stretch
      expect(paced).toBeLessThan(10000);
    });

    it('clamps adaptation factor when narration is excessively short', () => {
      // Step is 10000ms, narration is 1000ms
      const paced = calculatePacedDuration(10000, 1000, 1.0);
      // Clamped at 1.6x maximum compression
      expect(paced).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('getDashoffset', () => {
    it('returns pathLength at progress 0', () => {
      expect(getDashoffset(200, 0)).toBe(200);
    });

    it('returns 0 at progress 1', () => {
      expect(getDashoffset(200, 1)).toBe(0);
    });

    it('returns midpoint at progress 0.5', () => {
      expect(getDashoffset(200, 0.5)).toBe(100);
    });
  });
});
