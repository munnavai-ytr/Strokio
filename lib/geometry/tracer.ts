import sharp, { type Sharp } from 'sharp';
import type { PathKind } from '@/types';
import { extractPointsFromPath, simplifyPoints, computePathLength } from './paths';
import { maskFromGray, traceMaskToPaths } from './contours';

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
 * Converts a sequence of points back into a clean SVG polyline path string
 */
function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M ${r(points[0].x)} ${r(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${r(points[i].x)} ${r(points[i].y)}`;
  }
  return d + ' Z';
}

/**
 * Generates vector geometry from normalized photo bitmap using layered thresholding.
 * Creates coarse contours, fine details, and luminance shading layers.
 * Caps total points across all paths at ~25,000 for smooth low-end phone rendering.
 */
export async function traceImageToPaths(
  imageBuffer: Buffer,
  options: { startTime?: number; timeBudgetSeconds?: number } = {}
): Promise<TraceResult> {
  const start = options.startTime || Date.now();
  const budget = options.timeBudgetSeconds || 35;

  // Decode to RAW RGB pixels (never an encoded JPEG/PNG)
  const { data: rawPixels, info } = await sharp(imageBuffer)
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  async function getLayerMask(process: (s: Sharp) => Sharp): Promise<Uint8Array> {
    // grayscale + normalise FIRST (stretches contrast), then the layer operation
    const { data } = await process(
      sharp(rawPixels, { raw: { width, height, channels } }).grayscale().normalise()
    )
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (data.length !== width * height) {
      throw new Error(`Mask size mismatch: expected ${width * height}, got ${data.length}`);
    }
    return maskFromGray(data, 128);
  }

  const rawTraced: TracedPath[] = [];

  // Layer A: Coarse Contours
  const contourMask = await getLayerMask(s => s.blur(1.8).threshold(140));
  const contourDs = traceMaskToPaths(contourMask, width, height, { tolerance: 1.4, minArea: 20 });
  for (const d of contourDs) {
    rawTraced.push({ d, kind: 'contour', stroke_width: 2.2, opacity: 0.9 });
  }

  // Layer B: Detailed Lines
  const detailMask = await getLayerMask(s => s.sharpen({ sigma: 1.2 }).threshold(110));
  const detailDs = traceMaskToPaths(detailMask, width, height, { tolerance: 1.0, minArea: 10 });
  for (const d of detailDs) {
    rawTraced.push({ d, kind: 'detail', stroke_width: 1.5, opacity: 0.75 });
  }
  
  if (rawTraced.length === 0) {
    throw new Error('Photo has too little contrast to trace');
  }

  // Time check before starting shading layers
  const elapsed = (Date.now() - start) / 1000;
  if (elapsed < budget) {
    // Layer C: Mid Shading
    const shadeMidMask = await getLayerMask(s => s.threshold(75));
    const shadeMidDs = traceMaskToPaths(shadeMidMask, width, height, { tolerance: 1.6, minArea: 25 });
    for (const d of shadeMidDs) {
      rawTraced.push({ d, kind: 'shade', stroke_width: 1.0, opacity: 0.45 });
    }

    // Layer D: Deep Shadow
    const shadeDeepMask = await getLayerMask(s => s.threshold(45));
    const shadeDeepDs = traceMaskToPaths(shadeDeepMask, width, height, { tolerance: 1.6, minArea: 30 });
    for (const d of shadeDeepDs) {
      rawTraced.push({ d, kind: 'shade', stroke_width: 1.0, opacity: 0.35 });
    }
  } else {
    console.warn(`[Tracer] Time budget exceeded (${elapsed.toFixed(1)}s), skipping shading layers.`);
  }

  // 3. Drop tiny noise paths and simplify
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

  // 4. Point Capping: If points > 25,000, simplify with RDP
  const MAX_POINTS = 25000;
  let finalPaths: TracedPath[] = [];

  if (totalPoints > MAX_POINTS) {
    let currentTolerance = 1.5;
    let currentPaths = filtered;
    let safety = 0;
    
    while (totalPoints > MAX_POINTS && safety < 5) {
      finalPaths = [];
      totalPoints = 0;
      for (const item of currentPaths) {
        const pts = extractPointsFromPath(item.d);
        const simplified = simplifyPoints(pts, currentTolerance);
        if (simplified.length >= 2) {
          const newD = pointsToSvgPath(simplified);
          finalPaths.push({ ...item, d: newD });
          totalPoints += simplified.length;
        }
      }
      currentTolerance += 0.5;
      safety++;
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
