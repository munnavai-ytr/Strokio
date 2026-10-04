export interface ContourOptions {
  minArea?: number;
  tolerance?: number;
  maxLoops?: number;
}
interface Pt { x: number; y: number }

export function maskFromGray(gray: Uint8Array | Buffer, cutoff = 128): Uint8Array {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < cutoff ? 1 : 0;
  return mask;
}

function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(a / 2);
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdp(points: Pt[], tolerance: number): Pt[] {
  const n = points.length;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function simplifyClosed(loop: Pt[], tolerance: number): Pt[] {
  if (loop.length <= 4) return loop;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i].x - loop[0].x, loop[i].y - loop[0].y);
    if (d > farD) { farD = d; far = i; }
  }
  const first = rdp(loop.slice(0, far + 1), tolerance);
  const second = rdp(loop.slice(far).concat([loop[0]]), tolerance);
  return first.slice(0, -1).concat(second.slice(0, -1));
}

function toPathD(loop: Pt[]): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M ${r(loop[0].x)} ${r(loop[0].y)}`;
  for (let i = 1; i < loop.length; i++) d += ` L ${r(loop[i].x)} ${r(loop[i].y)}`;
  return d + ' Z';
}

export function traceMaskToPaths(
  mask: Uint8Array, width: number, height: number, options: ContourOptions = {}
): string[] {
  const minArea = options.minArea ?? 12;
  const tolerance = options.tolerance ?? 1.1;
  const maxLoops = options.maxLoops ?? 4000;
  if (mask.length !== width * height) throw new Error('Mask size does not match width x height.');

  const W = width + 1;
  const vertexCount = W * (height + 1);
  const next1 = new Int32Array(vertexCount).fill(-1);
  const next2 = new Int32Array(vertexCount).fill(-1);
  const addEdge = (from: number, to: number) => {
    if (next1[from] === -1) next1[from] = to; else next2[from] = to;
  };
  const ink = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] !== 1) continue;
      const tl = y * W + x, tr = tl + 1, bl = tl + W, br = bl + 1;
      if (!ink(x, y - 1)) addEdge(tl, tr);
      if (!ink(x + 1, y)) addEdge(tr, br);
      if (!ink(x, y + 1)) addEdge(br, bl);
      if (!ink(x - 1, y)) addEdge(bl, tl);
    }
  }

  const loops: Array<{ pts: Pt[]; area: number }> = [];
  const guardLimit = vertexCount * 2 + 8;
  for (let v = 0; v < vertexCount; v++) {
    while (next1[v] !== -1 || next2[v] !== -1) {
      const raw: Pt[] = [];
      let cur = v;
      let steps = 0;
      do {
        raw.push({ x: cur % W, y: Math.floor(cur / W) });
        let nxt: number;
        if (next1[cur] !== -1) { nxt = next1[cur]; next1[cur] = -1; }
        else { nxt = next2[cur]; next2[cur] = -1; }
        if (nxt === -1 || ++steps > guardLimit) { cur = v; break; }
        cur = nxt;
      } while (cur !== v);
      const area = polygonArea(raw);
      if (raw.length >= 4 && area >= minArea) loops.push({ pts: raw, area });
    }
  }
  loops.sort((a, b) => b.area - a.area);
  const out: string[] = [];
  for (const loop of loops.slice(0, maxLoops)) {
    const simple = simplifyClosed(loop.pts, tolerance);
    if (simple.length >= 3) out.push(toPathD(simple));
  }
  return out;
}
