import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { traceImageToPaths } from '@/lib/geometry/tracer';

export const maxDuration = 60;

export async function GET() {
  const start = Date.now();
  try {
    // Generate a small synthetic 128x128 image in memory (filled circle on white)
    const svgCircle = `<svg width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" fill="white" />
      <circle cx="64" cy="64" r="40" fill="black" />
    </svg>`;
    
    const imageBuffer = await sharp(Buffer.from(svgCircle))
      .png()
      .toBuffer();

    const result = await traceImageToPaths(imageBuffer);
    const ms = Date.now() - start;

    return NextResponse.json({
      ok: true,
      paths: result.paths.length,
      width: result.width,
      height: result.height,
      ms
    });
  } catch (err: unknown) {
    console.error('[Health Pipeline] Failed:', err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}
