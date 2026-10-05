import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { traceImageToPaths } from '@/lib/geometry/tracer';

export const maxDuration = 60;

export async function GET() {
  const start = Date.now();
  try {
    // Generate a synthetic 1200x900 JPEG with filled shapes on a light background
    const svg = `<svg width="1200" height="900" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="#f8fafc" />
      <circle cx="400" cy="450" r="180" fill="#1e293b" />
      <rect x="700" y="300" width="300" height="300" rx="40" fill="#334155" />
      <polygon points="600,150 700,280 500,280" fill="#0f172a" />
    </svg>`;
    
    const imageBuffer = await sharp(Buffer.from(svg))
      .jpeg({ quality: 90 })
      .toBuffer();

    const result = await traceImageToPaths(imageBuffer);
    const ms = Date.now() - start;

    return NextResponse.json({
      ok: true,
      paths: result.paths.length,
      ms,
    });
  } catch (err: unknown) {
    console.error('[Health Pipeline] Failed:', err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}
