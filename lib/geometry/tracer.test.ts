import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { traceImageToPaths } from './tracer';

describe('Vector Tracer (lib/geometry/tracer.ts)', () => {
  it('correctly processes and traces an encoded JPEG buffer without crashing', async () => {
    // Generate a 1200x900 JPEG with shapes on a light background
    const svg = `<svg width="1200" height="900" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="#f8fafc" />
      <circle cx="350" cy="450" r="160" fill="#0f172a" />
      <rect x="650" y="300" width="300" height="300" rx="30" fill="#1e293b" />
    </svg>`;

    const jpegBuffer = await sharp(Buffer.from(svg))
      .jpeg({ quality: 90 })
      .toBuffer();

    const result = await traceImageToPaths(jpegBuffer);

    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.width).toBeLessThanOrEqual(1024);
    expect(result.height).toBeLessThanOrEqual(1024);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);

    // Verify properties on paths
    const firstPath = result.paths[0];
    expect(firstPath).toHaveProperty('d');
    expect(firstPath).toHaveProperty('kind');
    expect(firstPath).toHaveProperty('stroke_width');
    expect(firstPath).toHaveProperty('opacity');
  });
});
