/**
 * Perfect Freehand 개념 구현(원본 코드 미참조, MIT 라이선스 전체 내재화 대상).
 * 입력 샘플 시퀀스를 받아 압력·속도 기반 다이내믹 폭과 테이퍼를 적용한
 * 아웃라인 폴리곤을 생성한다.
 *
 * 원본 Perfect Freehand 코드는 복사하지 않고 동작·수식만 우리 언어로
 * 재구현한다(license-policy.md 4.5절, 1절 ok(MIT) → 전체 내재화 허용).
 */

export interface FreehandPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number; // 0 .. 1
  readonly time: number;     // ms
}

export interface FreehandOptions {
  readonly size: number;       // 0 .. 1, 기준 폭(직경 비율)
  readonly thinning: number;   // 0 .. 1, 속도가 클수록 폭 감소 강도
  readonly smoothing: number;  // 0 .. 1, 포인트 보간 강도
  readonly simulatePressure: boolean;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  readonly taper: boolean;     // true면 양끝 폭을 0으로 수축(원본 Perfect Freehand 테이퍼)
}

export interface OutlinePoint {
  readonly x: number;
  readonly y: number;
}

const DEFAULT_OPTIONS: FreehandOptions = {
  size: 1,
  thinning: 0.4,
  smoothing: 0.3,
  simulatePressure: true,
  easing: "ease-in-out",
  taper: true,
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function ease(t: number, mode: FreehandOptions["easing"]): number {
  const tt = clamp01(t);
  switch (mode) {
    case "linear":
      return tt;
    case "ease-in":
      return tt * tt;
    case "ease-out":
      return 1 - (1 - tt) * (1 - tt);
    case "ease-in-out":
      return tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt;
  }
}

/** 입력 샘플을 시간 기준 정렬·중복 제거·선택적 보간한다. */
export function getStrokePoints(points: readonly FreehandPoint[], options: FreehandOptions): FreehandPoint[] {
  if (points.length === 0) return [];
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const sorted = [...points].sort((a, b) => a.time - b.time);

  const deduped: FreehandPoint[] = [];
  for (const p of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.x === p.x && last.y === p.y && last.time === p.time) continue;
    deduped.push(p);
  }
  if (deduped.length === 0) return [];

  if (opts.smoothing <= 0) return deduped;
  const w = opts.smoothing / 2;
  const smoothed: FreehandPoint[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = deduped[i - 1];
    const cur = deduped[i];
    const next = deduped[i + 1];
    smoothed.push({
      x: cur.x + w * (prev.x + next.x - 2 * cur.x),
      y: cur.y + w * (prev.y + next.y - 2 * cur.y),
      pressure: cur.pressure + w * (prev.pressure + next.pressure - 2 * cur.pressure),
      time: cur.time,
    });
  }
  smoothed.push(deduped[deduped.length - 1]);
  return smoothed;
}

/** 점 i에서의 접선 방향의 단위 법선(왼쪽). */
function normalAt(points: readonly FreehandPoint[], i: number): { x: number; y: number } {
  const n = points.length;
  const dx =
    i === 0
      ? points[1].x - points[i].x
      : i === n - 1
      ? points[i].x - points[i - 1].x
      : points[i + 1].x - points[i - 1].x;
  const dy =
    i === 0
      ? points[1].y - points[i].y
      : i === n - 1
      ? points[i].y - points[i - 1].y
      : points[i + 1].y - points[i - 1].y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** 점 i에서의 테이퍼 계수(양끝 0, 중간 1). */
function taperFactor(i: number, n: number, options: FreehandOptions): number {
  if (!options.taper || n <= 1) return 1;
  const t = (Math.min(i, n - 1 - i) / Math.max(n - 1, 1)) * 2;
  return ease(Math.min(1, t), options.easing);
}

/** 점 i에서의 폭. */
function pointWidth(
  p: FreehandPoint,
  speedNorm: number,
  taper: number,
  options: FreehandOptions,
): number {
  const pressure = clamp01(p.pressure);
  const base = (optsSize(options) / 2) * pressure * (1 - options.thinning * speedNorm) * taper;
  return base < 0 ? 0 : base;
}

function optsSize(options: FreehandOptions): number {
  const s = options.size;
  return s < 0 ? 0 : s;
}

/** 점 시퀀스를 받아 아웃라인 폴리곤을 생성한다(Perfect Freehand 메인 함수). */
export function getOutlinePoints(points: readonly FreehandPoint[], options: FreehandOptions): OutlinePoint[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) {
    const p = points[0];
    const half = pointWidth(p, 0, 1, opts);
    return [
      { x: p.x - half, y: p.y - half },
      { x: p.x + half, y: p.y - half },
      { x: p.x + half, y: p.y + half },
      { x: p.x - half, y: p.y + half },
    ];
  }

  const speeds: number[] = [];
  for (let i = 0; i < n; i++) {
    let dist = 0;
    let dt = 0;
    if (i > 0) {
      dist += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      dt += points[i].time - points[i - 1].time;
    }
    if (i < n - 1) {
      dist += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      dt += points[i + 1].time - points[i].time;
    }
    speeds.push(dt > 0 ? dist / dt : 0);
  }
  const maxSpeed = Math.max(...speeds) || 1;

  const left: OutlinePoint[] = [];
  const right: OutlinePoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const { x: nx, y: ny } = normalAt(points, i);
    const speedNorm = clamp01(speeds[i] / (maxSpeed * 2));
    const taper = taperFactor(i, n, opts);
    const half = pointWidth(p, speedNorm, taper, opts);
    left.push({ x: p.x + nx * half, y: p.y + ny * half });
    right.push({ x: p.x - nx * half, y: p.y - ny * half });
  }
  return [...left, ...right.reverse()];
}

/** 점 시퀀스를 받아 아웃라인 폴리곤을 생성한다(Perfect Freehand 메인 함수). */
export function perfectFreehand(
  points: readonly FreehandPoint[],
  options?: Partial<FreehandOptions>,
): OutlinePoint[] {
  const stroked = getStrokePoints(points, { ...DEFAULT_OPTIONS, ...options });
  return getOutlinePoints(stroked, { ...DEFAULT_OPTIONS, ...options });
}
