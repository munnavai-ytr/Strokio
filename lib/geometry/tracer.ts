import sharp from 'sharp';
import potrace from 'potrace';
import type { PathKind } from '@/types';
import { extractPointsFromPath, simplifyPoints, computePathLength } from './paths';

export interface TracedPath {
  d: string;
  kind: PathKind;
  stroke_width: number;
  opacity: number;
}

export interface TraceResult {
  paths: TracedPath[];
  width: number;
  height: number;
}

/**
 * Traces a bitmap buffer into SVG vector paths using Potrace
 */
function traceBuffer(
  buffer: Buffer,
  options: {
    threshold?: number;
    turdSize?: number;
    alphaMax?: number;
    optCurve?: boolean;
  }
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    potrace.trace(buffer, options, (err: Error | null, svg: string) => {
      if (err) return reject(err);
      const pathMatches = svg.match(/<path[^>]*d=["']([^"']+)["'][^>]*>/gi) || [];
      const dStrings: string[] = [];

      for (const match of pathMatches) {
        const dMatch = match.match(/d=["']([^"']+)["']/i);
        if (dMatch && dMatch[1]) {
          dStrings.push(dMatch[1].trim());
        }
      }
      resolve(dStrings);
    });
  });
}

/**
 * Converts a sequence of points back into a clean SVG polyline path string
 */
function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  let d = `M ${Math.round(first.x * 10) / 10} ${Math.round(first.y * 10) / 10}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${Math.round(points[i].x * 10) / 10} ${Math.round(points[i].y * 10) / 10}`;
  }
  return d;
}

/**
 * Generates vector geometry from normalized photo bitmap using layered Potrace thresholding.
 * Creates coarse contours, fine details, and luminance shading layers.
 * Caps total points across all paths at ~25,000 for smooth low-end phone rendering.
 */
export async function traceImageToPaths(imageBuffer: Buffer): Promise<TraceResult> {
  // 1. Normalize image with sharp: auto-rotate by EXIF, max 1024px, flatten on white
  const normalized = await sharp(imageBuffer)
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = normalized.info;
  const rawPng = normalized.data;

  // 2. Prepare preprocessed bitmap variations for Potrace layers
  // Layer A: Coarse Contours (blurred, high threshold)
  const contourBuf = await sharp(rawPng)
    .grayscale()
    .blur(1.8)
    .threshold(140)
    .png()
    .toBuffer();

  // Layer B: Detailed Lines (sharpened, mid threshold)
  const detailBuf = await sharp(rawPng)
    .grayscale()
    .sharpen({ sigma: 1.2 })
    .threshold(110)
    .png()
    .toBuffer();

  // Layer C: Mid Shading (darker luminance)
  const shadeMidBuf = await sharp(rawPng)
    .grayscale()
    .threshold(75)
    .png()
    .toBuffer();

  // Layer D: Deep Shadow (very dark luminance)
  const shadeDeepBuf = await sharp(rawPng)
    .grayscale()
    .threshold(45)
    .png()
    .toBuffer();

  // 3. Trace each layer asynchronously
  const [contourPaths, detailPaths, shadeMidPaths, shadeDeepPaths] = await Promise.all([
    traceBuffer(contourBuf, { threshold: 128, turdSize: 20, optCurve: true, alphaMax: 0.9 }),
    traceBuffer(detailBuf, { threshold: 128, turdSize: 10, optCurve: true, alphaMax: 1.2 }),
    traceBuffer(shadeMidBuf, { threshold: 128, turdSize: 25, optCurve: true }),
    traceBuffer(shadeDeepBuf, { threshold: 128, turdSize: 30, optCurve: true }),
  ]);

  const rawTraced: TracedPath[] = [];

  for (const d of contourPaths) {
    rawTraced.push({ d, kind: 'contour', stroke_width: 2.2, opacity: 0.9 });
  }
  for (const d of detailPaths) {
    rawTraced.push({ d, kind: 'detail', stroke_width: 1.5, opacity: 0.75 });
  }
  for (const d of shadeMidPaths) {
    rawTraced.push({ d, kind: 'shade', stroke_width: 1.0, opacity: 0.45 });
  }
  for (const d of shadeDeepPaths) {
    rawTraced.push({ d, kind: 'shade', stroke_width: 1.0, opacity: 0.35 });
  }

  // 4. Drop tiny noise paths and simplify
  const filtered: TracedPath[] = [];
  let totalPoints = 0;

  for (const item of rawTraced) {
    const pts = extractPointsFromPath(item.d);
    if (pts.length < 3) continue;

    const length = computePathLength(item.d);
    if (length < 12) continue; // Drop tiny noise artifacts

    filtered.push(item);
    totalPoints += pts.length;
  }

  // 5. Point Capping: If points > 25,000, simplify with RDP
  const MAX_POINTS = 25000;
  let finalPaths: TracedPath[] = [];

  if (totalPoints > MAX_POINTS) {
    // Determine required simplification tolerance
    const tolerance = totalPoints > 50000 ? 2.5 : 1.5;
    for (const item of filtered) {
      const pts = extractPointsFromPath(item.d);
      const simplified = simplifyPoints(pts, tolerance);
      if (simplified.length >= 2) {
        const newD = pointsToSvgPath(simplified);
        finalPaths.push({
          ...item,
          d: newD,
        });
      }
    }
  } else {
    finalPaths = filtered;
  }

  return {
    paths: finalPaths,
    width,
    height,
  };
}
