/**
 * Wave 105 — 액션 집중선·속도선용 인물 안전 타원·말풍선 금지 영역 정밀 기하 커널.
 *
 * - 결정적 시드 PRNG(`mulberry32`), 유한수 클램핑
 * - 레이-타원 교차, 레이-AABB 슬랩 교차, 구간 차집합
 * - 폴리곤 정점·변·내부 포함 전수 무침범 판정(`doesPolygonIntrudeKeepOuts`)
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface PanelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SafeEllipse {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly marginPx?: number;
}

export interface BalloonKeepOutBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly paddingPx?: number;
}

export interface ScalarInterval {
  readonly start: number;
  readonly end: number;
}

export interface ResolvedBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ResolvedEllipse {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function createSeededRng(seed: number): () => number {
  const safeSeed = Number.isFinite(seed) ? Math.floor(seed) : 10501;
  let state = (safeSeed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveEllipse(ellipse: SafeEllipse, extraPadPx = 0): ResolvedEllipse {
  const margin = Math.max(0, clampFinite(ellipse.marginPx ?? 0, 0, 2000, 0));
  return {
    cx: clampFinite(ellipse.cx, -1e6, 1e6, 0),
    cy: clampFinite(ellipse.cy, -1e6, 1e6, 0),
    rx: Math.max(1, clampFinite(ellipse.rx, 1, 1e6, 40) + margin + extraPadPx),
    ry: Math.max(1, clampFinite(ellipse.ry, 1, 1e6, 40) + margin + extraPadPx),
  };
}

export function resolveBalloonBox(box: BalloonKeepOutBox, extraPadPx = 0): ResolvedBox | null {
  const w = clampFinite(box.width, 0, 1e6, 0);
  const h = clampFinite(box.height, 0, 1e6, 0);
  if (w <= 0 || h <= 0) return null;
  const x = clampFinite(box.x, -1e6, 1e6, 0);
  const y = clampFinite(box.y, -1e6, 1e6, 0);
  const pad = Math.max(0, clampFinite(box.paddingPx ?? 0, 0, 2000, 0)) + extraPadPx;
  return {
    minX: x - pad,
    minY: y - pad,
    maxX: x + w + pad,
    maxY: y + h + pad,
  };
}

export function resolvePanelBox(panel: PanelRect): ResolvedBox {
  const x = clampFinite(panel.x, -1e6, 1e6, 0);
  const y = clampFinite(panel.y, -1e6, 1e6, 0);
  const w = Math.max(16, clampFinite(panel.width, 16, 1e6, 800));
  const h = Math.max(16, clampFinite(panel.height, 16, 1e6, 600));
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

export function intersectRayEllipse(
  origin: Vec2,
  dir: Vec2,
  ellipse: SafeEllipse,
  extraPadPx = 0,
): ScalarInterval | null {
  const e = resolveEllipse(ellipse, extraPadPx);
  const ox = (origin.x - e.cx) / e.rx;
  const oy = (origin.y - e.cy) / e.ry;
  const dx = dir.x / e.rx;
  const dy = dir.y / e.ry;
  const a = dx * dx + dy * dy;
  if (a <= 1e-12) return null;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  return t0 <= t1 ? { start: t0, end: t1 } : { start: t1, end: t0 };
}

export function intersectRayAabb(
  origin: Vec2,
  dir: Vec2,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): ScalarInterval | null {
  let tMin = -Infinity;
  let tMax = Infinity;

  if (Math.abs(dir.x) < 1e-12) {
    if (origin.x < minX || origin.x > maxX) return null;
  } else {
    const invX = 1 / dir.x;
    let tx1 = (minX - origin.x) * invX;
    let tx2 = (maxX - origin.x) * invX;
    if (tx1 > tx2) {
      const tmp = tx1;
      tx1 = tx2;
      tx2 = tmp;
    }
    tMin = Math.max(tMin, tx1);
    tMax = Math.min(tMax, tx2);
    if (tMin > tMax) return null;
  }

  if (Math.abs(dir.y) < 1e-12) {
    if (origin.y < minY || origin.y > maxY) return null;
  } else {
    const invY = 1 / dir.y;
    let ty1 = (minY - origin.y) * invY;
    let ty2 = (maxY - origin.y) * invY;
    if (ty1 > ty2) {
      const tmp = ty1;
      ty1 = ty2;
      ty2 = tmp;
    }
    tMin = Math.max(tMin, ty1);
    tMax = Math.min(tMax, ty2);
    if (tMin > tMax) return null;
  }

  return { start: tMin, end: tMax };
}

export function subtractForbiddenIntervals(
  base: ScalarInterval,
  forbidden: readonly ScalarInterval[],
): ScalarInterval[] {
  if (base.end <= base.start) return [];
  let segments: ScalarInterval[] = [base];
  for (const cut of forbidden) {
    if (cut.end <= cut.start) continue;
    const next: ScalarInterval[] = [];
    for (const seg of segments) {
      if (cut.end <= seg.start || cut.start >= seg.end) {
        next.push(seg);
      } else {
        if (cut.start > seg.start) next.push({ start: seg.start, end: cut.start });
        if (cut.end < seg.end) next.push({ start: cut.end, end: seg.end });
      }
    }
    segments = next;
    if (segments.length === 0) break;
  }
  return segments;
}

export function isPointInsideSafeEllipse(point: Vec2, ellipse: SafeEllipse, extraPadPx = 0): boolean {
  const e = resolveEllipse(ellipse, extraPadPx);
  const nx = (point.x - e.cx) / e.rx;
  const ny = (point.y - e.cy) / e.ry;
  return nx * nx + ny * ny <= 1;
}

export function doesSegmentIntrudeEllipse(
  a: Vec2,
  b: Vec2,
  ellipse: SafeEllipse,
  extraPadPx = 0,
): boolean {
  const e = resolveEllipse(ellipse, extraPadPx);
  const ax = (a.x - e.cx) / e.rx;
  const ay = (a.y - e.cy) / e.ry;
  const bx = (b.x - e.cx) / e.rx;
  const by = (b.y - e.cy) / e.ry;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const tStar = lenSq <= 1e-12 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  const px = ax + dx * tStar;
  const py = ay + dy * tStar;
  return px * px + py * py <= 1;
}

export function isPointInsideBalloonBox(
  point: Vec2,
  box: BalloonKeepOutBox,
  extraPadPx = 0,
): boolean {
  const b = resolveBalloonBox(box, extraPadPx);
  if (!b) return false;
  return point.x >= b.minX && point.x <= b.maxX && point.y >= b.minY && point.y <= b.maxY;
}

export function doesSegmentIntrudeBalloonBox(
  a: Vec2,
  b: Vec2,
  box: BalloonKeepOutBox,
  extraPadPx = 0,
): boolean {
  const resolved = resolveBalloonBox(box, extraPadPx);
  if (!resolved) return false;
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const hit = intersectRayAabb(a, dir, resolved.minX, resolved.minY, resolved.maxX, resolved.maxY);
  if (!hit) return false;
  return hit.end >= 0 && hit.start <= 1;
}

function isPointInsidePolygon(point: Vec2, vertices: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const vi = vertices[i];
    const vj = vertices[j];
    const intersects =
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y + 1e-12) + vi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function doesPolygonIntrudeKeepOuts(
  vertices: readonly Vec2[],
  subjectSafeEllipse: SafeEllipse,
  balloonKeepOutBoxes: readonly BalloonKeepOutBox[],
): boolean {
  if (vertices.length < 3) return false;
  for (let i = 0; i < vertices.length; i += 1) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y)) return true;
    if (isPointInsideSafeEllipse(curr, subjectSafeEllipse)) return true;
    if (doesSegmentIntrudeEllipse(curr, next, subjectSafeEllipse)) return true;
    for (const box of balloonKeepOutBoxes) {
      if (isPointInsideBalloonBox(curr, box)) return true;
      if (doesSegmentIntrudeBalloonBox(curr, next, box)) return true;
    }
  }
  const e = resolveEllipse(subjectSafeEllipse);
  if (isPointInsidePolygon({ x: e.cx, y: e.cy }, vertices)) return true;
  for (const box of balloonKeepOutBoxes) {
    const b = resolveBalloonBox(box);
    if (b && isPointInsidePolygon({ x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5 }, vertices)) {
      return true;
    }
  }
  return false;
}
