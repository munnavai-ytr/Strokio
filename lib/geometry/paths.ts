import type { LessonPart, StepPath, ApproxShape, PathKind } from '@/types';

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centroidX: number;
  centroidY: number;
}

/**
 * Standard Ramer-Douglas-Peucker polyline simplification algorithm.
 */
export function simplifyPoints(points: Point[], tolerance = 1.5): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance);
    const right = simplifyPoints(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }

  return [start, end];
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lineLenSq = dx * dx + dy * dy;

  if (lineLenSq === 0) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return Math.sqrt(px * px + py * py);
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lineLenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;

  const rx = p.x - projX;
  const ry = p.y - projY;
  return Math.sqrt(rx * rx + ry * ry);
}

/**
 * Parses approximate points from SVG path command string.
 * Supports M, L, C, S, Q, T, Z commands (both absolute and relative).
 */
export function extractPointsFromPath(d: string): Point[] {
  const points: Point[] = [];
  const commands = d.match(/[a-df-z][^a-df-z]*/gi) || [];

  let curX = 0;
  let curY = 0;

  for (const cmd of commands) {
    const type = cmd[0];
    const isRel = type >= 'a' && type <= 'z';
    const nums = (cmd.slice(1).trim().match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);

    const uc = type.toUpperCase();

    if (uc === 'M' || uc === 'L' || uc === 'T') {
      for (let i = 0; i < nums.length; i += 2) {
        if (i + 1 < nums.length) {
          curX = isRel ? curX + nums[i] : nums[i];
          curY = isRel ? curY + nums[i + 1] : nums[i + 1];
          points.push({ x: curX, y: curY });
        }
      }
    } else if (uc === 'H') {
      for (const val of nums) {
        curX = isRel ? curX + val : val;
        points.push({ x: curX, y: curY });
      }
    } else if (uc === 'V') {
      for (const val of nums) {
        curY = isRel ? curY + val : val;
        points.push({ x: curX, y: curY });
      }
    } else if (uc === 'C') {
      for (let i = 0; i < nums.length; i += 6) {
        if (i + 5 < nums.length) {
          curX = isRel ? curX + nums[i + 4] : nums[i + 4];
          curY = isRel ? curY + nums[i + 5] : nums[i + 5];
          points.push({ x: curX, y: curY });
        }
      }
    } else if (uc === 'S' || uc === 'Q') {
      for (let i = 0; i < nums.length; i += 4) {
        if (i + 3 < nums.length) {
          curX = isRel ? curX + nums[i + 2] : nums[i + 2];
          curY = isRel ? curY + nums[i + 3] : nums[i + 3];
          points.push({ x: curX, y: curY });
        }
      }
    }
  }

  return points;
}

/**
 * Calculates bounding box and centroid of a path string.
 */
export function getPathBoundingBox(d: string): BoundingBox {
  const points = extractPointsFromPath(d);
  if (points.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centroidX: 0,
      centroidY: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    sumX += pt.x;
    sumY += pt.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    centroidX: sumX / points.length,
    centroidY: sumY / points.length,
  };
}

/**
 * Computes approximate path arc length.
 */
export function computePathLength(d: string): number {
  const points = extractPointsFromPath(d);
  if (points.length < 2) return 10;

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.round(total * 10) / 10;
}

/**
 * Generates geometric guide paths for canvas proportions (thirds, centerlines, bounding shapes).
 */
export function generateGuideGeometry(
  width: number,
  height: number,
  parts: LessonPart[]
): StepPath[] {
  const guides: StepPath[] = [];
  let order = 1;

  // 1. Center Crosshair Guidelines
  guides.push({
    d: `M ${Math.round(width / 2)} 0 L ${Math.round(width / 2)} ${height}`,
    kind: 'guide',
    length: height,
    order: order++,
    stroke_width: 1.5,
    opacity: 0.35,
  });

  guides.push({
    d: `M 0 ${Math.round(height / 2)} L ${width} ${Math.round(height / 2)}`,
    kind: 'guide',
    length: width,
    order: order++,
    stroke_width: 1.5,
    opacity: 0.35,
  });

  // 2. Rule of Thirds
  const thirdW1 = Math.round(width / 3);
  const thirdW2 = Math.round((2 * width) / 3);
  const thirdH1 = Math.round(height / 3);
  const thirdH2 = Math.round((2 * height) / 3);

  guides.push({
    d: `M ${thirdW1} 0 L ${thirdW1} ${height}`,
    kind: 'guide',
    length: height,
    order: order++,
    stroke_width: 1,
    opacity: 0.25,
  });
  guides.push({
    d: `M ${thirdW2} 0 L ${thirdW2} ${height}`,
    kind: 'guide',
    length: height,
    order: order++,
    stroke_width: 1,
    opacity: 0.25,
  });
  guides.push({
    d: `M 0 ${thirdH1} L ${width} ${thirdH1}`,
    kind: 'guide',
    length: width,
    order: order++,
    stroke_width: 1,
    opacity: 0.25,
  });
  guides.push({
    d: `M 0 ${thirdH2} L ${width} ${thirdH2}`,
    kind: 'guide',
    length: width,
    order: order++,
    stroke_width: 1,
    opacity: 0.25,
  });

  // 3. Approximate geometric block-in shapes for major parts
  for (const part of parts) {
    if (part.kind === 'main-shape' || part.kind === 'secondary') {
      const [ymin, xmin, ymax, xmax] = part.box_2d;
      const px = Math.round((xmin / 1000) * width);
      const py = Math.round((ymin / 1000) * height);
      const pw = Math.round(((xmax - xmin) / 1000) * width);
      const ph = Math.round(((ymax - ymin) / 1000) * height);

      const shapePath = createShapePath(px, py, pw, ph, part.approx_shape);
      if (shapePath) {
        guides.push({
          d: shapePath,
          kind: 'shape',
          length: computePathLength(shapePath),
          order: order++,
          stroke_width: 2,
          opacity: 0.5,
        });
      }
    }
  }

  return guides;
}

/**
 * Creates SVG path for standard geometric shape primitive.
 */
export function createShapePath(
  x: number,
  y: number,
  w: number,
  h: number,
  shape: ApproxShape
): string {
  const cx = Math.round(x + w / 2);
  const cy = Math.round(y + h / 2);
  const rx = Math.round(w / 2);
  const ry = Math.round(h / 2);

  switch (shape) {
    case 'circle':
    case 'ellipse': {
      const r = shape === 'circle' ? Math.min(rx, ry) : rx;
      const rY = shape === 'circle' ? r : ry;
      return `M ${cx - r} ${cy} A ${r} ${rY} 0 1 0 ${cx + r} ${cy} A ${r} ${rY} 0 1 0 ${cx - r} ${cy} Z`;
    }
    case 'rect': {
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    }
    case 'triangle': {
      return `M ${cx} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    }
    case 'polygon': {
      // Hexagon polygon inside box
      const p1x = Math.round(x + w * 0.25);
      const p2x = Math.round(x + w * 0.75);
      return `M ${p1x} ${y} L ${p2x} ${y} L ${x + w} ${cy} L ${p2x} ${y + h} L ${p1x} ${y + h} L ${x} ${cy} Z`;
    }
    case 'freeform':
    default: {
      // Rounded smooth lozenge
      const r = Math.min(rx, ry, 16);
      return `M ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} L ${x + r} ${y + h} A ${r} ${r} 0 0 1 ${x} ${y + h - r} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
    }
  }
}

/**
 * Calculates step playback duration proportional to drawing path length,
 * clamped between 4,000ms (4s) and 25,000ms (25s).
 */
export function calculateStepDurationMs(paths: StepPath[]): number {
  const totalLength = paths.reduce((sum, p) => sum + (p.length || 0), 0);
  // Drawing speed: roughly 120 pixels per second = 0.12 px/ms
  const rawMs = (totalLength / 120) * 1000;
  // Base setup time: 3.5 seconds
  const combinedMs = Math.round(3500 + rawMs);
  return Math.min(Math.max(combinedMs, 4000), 25000);
}

/**
 * Assigns vector paths to lesson steps based on spatial overlap between path centroids
 * and part bounding boxes, ordered largest to smallest inside each step.
 */
export function assignPathsToSteps(
  paths: { d: string; kind: PathKind; stroke_width: number; opacity: number }[],
  steps: { part_ids: string[] }[],
  parts: LessonPart[],
  viewboxW: number,
  viewboxH: number
): StepPath[][] {
  const result: StepPath[][] = steps.map(() => []);

  // Map parts by ID
  const partsMap = new Map<string, LessonPart>();
  for (const part of parts) {
    partsMap.set(part.id, part);
  }

  // Precompute pixel bounding box for each part
  const partBoxes = new Map<
    string,
    { minX: number; minY: number; maxX: number; maxY: number; area: number }
  >();

  for (const part of parts) {
    const [ymin, xmin, ymax, xmax] = part.box_2d;
    const minX = (xmin / 1000) * viewboxW;
    const maxX = (xmax / 1000) * viewboxW;
    const minY = (ymin / 1000) * viewboxH;
    const maxY = (ymax / 1000) * viewboxH;
    const area = (maxX - minX) * (maxY - minY);
    partBoxes.set(part.id, { minX, minY, maxX, maxY, area });
  }

  // Assign each path
  for (const pathObj of paths) {
    const length = computePathLength(pathObj.d);
    if (length < 8) continue; // Drop tiny noise artifacts

    const bbox = getPathBoundingBox(pathObj.d);

    let bestStepIdx = -1;
    let minDistance = Infinity;

    // Check which step's parts best contain or are closest to the path centroid
    for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const step = steps[stepIdx];
      for (const partId of step.part_ids) {
        const box = partBoxes.get(partId);
        if (!box) continue;

        // Inside bounding box?
        const isInside =
          bbox.centroidX >= box.minX &&
          bbox.centroidX <= box.maxX &&
          bbox.centroidY >= box.minY &&
          bbox.centroidY <= box.maxY;

        if (isInside) {
          bestStepIdx = stepIdx;
          minDistance = 0;
          break;
        }

        // Distance from centroid to box center
        const boxCx = (box.minX + box.maxX) / 2;
        const boxCy = (box.minY + box.maxY) / 2;
        const dist = Math.hypot(bbox.centroidX - boxCx, bbox.centroidY - boxCy);

        if (dist < minDistance) {
          minDistance = dist;
          bestStepIdx = stepIdx;
        }
      }

      if (minDistance === 0) break;
    }

    // Default to middle or appropriate contour step if no part match
    if (bestStepIdx === -1) {
      bestStepIdx = Math.min(Math.floor(steps.length / 2), steps.length - 1);
    }

    result[bestStepIdx].push({
      d: pathObj.d,
      kind: pathObj.kind,
      length,
      order: 0,
      stroke_width: pathObj.stroke_width,
      opacity: pathObj.opacity,
    });
  }

  // Inside each step, sort paths from large to small, and assign order numbers
  for (let i = 0; i < result.length; i++) {
    result[i].sort((a, b) => b.length - a.length);
    result[i].forEach((p, idx) => {
      p.order = idx + 1;
    });
  }

  return result;
}
