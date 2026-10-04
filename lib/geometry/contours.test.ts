import { describe, it, expect } from 'vitest';
import { maskFromGray, traceMaskToPaths } from './contours';

describe('Contour Tracing (lib/geometry/contours.ts)', () => {
  it('identifies 1 loop for a filled square', () => {
    const size = 10;
    const mask = new Uint8Array(size * size).fill(0);
    // 4x4 square in the middle
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        mask[y * size + x] = 1;
      }
    }
    const paths = traceMaskToPaths(mask, size, size, { minArea: 1 });
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('M 3 3');
  });

  it('identifies 2 loops for a ring (outer and hole)', () => {
    const size = 20;
    const mask = new Uint8Array(size * size).fill(0);
    // 10x10 outer square
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        mask[y * size + x] = 1;
      }
    }
    // 4x4 hole in the middle
    for (let y = 8; y < 12; y++) {
      for (let x = 8; x < 12; x++) {
        mask[y * size + x] = 0;
      }
    }
    const paths = traceMaskToPaths(mask, size, size, { minArea: 1 });
    // Note: our traceMaskToPaths finds all boundaries of 1-pixels.
    // The hole is bounded by 1-pixels, so it should be found as a separate loop.
    expect(paths).toHaveLength(2);
  });

  it('returns 0 paths for an empty mask', () => {
    const size = 10;
    const mask = new Uint8Array(size * size).fill(0);
    const paths = traceMaskToPaths(mask, size, size);
    expect(paths).toHaveLength(0);
  });

  it('terminates and handles random noise', () => {
    const size = 50;
    const mask = new Uint8Array(size * size);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = Math.random() > 0.5 ? 1 : 0;
    }
    // Should not hang or crash
    const paths = traceMaskToPaths(mask, size, size, { minArea: 1, maxLoops: 100 });
    expect(Array.isArray(paths)).toBe(true);
  });

  it('finishes a 1024x1024 mask in under 2 seconds', () => {
    const size = 1024;
    const mask = new Uint8Array(size * size).fill(0);
    // Checkerboard pattern for complexity
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 4; dx++) {
            mask[(y + dy) * size + (x + dx)] = 1;
          }
        }
      }
    }
    
    const start = Date.now();
    const paths = traceMaskToPaths(mask, size, size, { minArea: 10, maxLoops: 1000 });
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(2000);
    expect(paths.length).toBeGreaterThan(0);
  });
});
