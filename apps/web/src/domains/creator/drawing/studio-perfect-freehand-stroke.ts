/**
 * 압력 반응형 프리핸드 스트로크 윤곽 생성기. perfect-freehand 1.2.3과 같은 수치를 낸다.
 *
 * 이식 근거
 * - perfect-freehand 1.2.3 (MIT, Copyright (c) 2021 Stephen Ruiz Ltd)이 배포한 `dist` 동작을
 *   읽고 새로 적었다. perfect-freehand는 프로덕션 의존성이라 MIT 고지 원문은 THIRD_PARTY_NOTICES.md의
 *   표와 릴리스 고지 산출물(dist/legal/THIRD_PARTY_NOTICES.generated.md)에 실린다.
 * - 같은 입력과 옵션에서 윤곽 좌표가 업스트림과 일치함은
 *   `__tests__/studio-upstream-parity.test.ts`가 설치된 perfect-freehand를 직접 실행해 확인한다.
 *
 * 업스트림 동작 중 의도해서 그대로 둔 것
 * - 점이 둘이면 첫 점과 끝 점 사이를 4등분한 보간점으로 바꾸고, 보간점에는 압력이 없어 기본 0.5가 된다.
 * - 첫 점의 압력은 배열 입력에서 비어 있으면 0.25, 객체 입력에서는 기본 0.5다.
 * - 윤곽 오프셋 계산은 곱셈·덧셈 순서까지 같게 두어 부동소수 결과가 비트 단위로 일치한다.
 */

export type PerfectFreehandVec2 = [number, number];

export interface PerfectFreehandStrokePoint {
  point: PerfectFreehandVec2;
  pressure: number;
  distance: number;
  vector: PerfectFreehandVec2;
  runningLength: number;
}

export interface PerfectFreehandCapOptions {
  cap?: boolean;
  taper?: number | boolean;
  easing?: (t: number) => number;
}

export interface PerfectFreehandOptions {
  size?: number;
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  easing?: (pressure: number) => number;
  simulatePressure?: boolean;
  start?: PerfectFreehandCapOptions;
  end?: PerfectFreehandCapOptions;
  last?: boolean;
}

export interface PerfectFreehandXYP {
  x: number;
  y: number;
  pressure?: number;
}

export type PerfectFreehandInputPoint = readonly number[] | PerfectFreehandXYP;

/** 윤곽을 만드는 동안 쓴 반지름을 바깥에서 집계하고 싶을 때 받는 관찰자. */
export interface PerfectFreehandOutlineObserver {
  onRadius?: (radius: number) => void;
}

const FIXED_PI = Math.PI + 0.0001;
const DEFAULT_PRESSURE = 0.5;
const UNIT_OFFSET: PerfectFreehandVec2 = [1, 1];
const RATE_OF_PRESSURE_CHANGE = 0.275;
const CORNER_STEP = 0.07692307692307693;

const identity = (t: number): number => t;
const defaultStartTaperEasing = (t: number): number => t * (2 - t);
const defaultEndTaperEasing = (t: number): number => {
  const u = t - 1;
  return u * u * u + 1;
};

const add = (a: readonly number[], b: readonly number[]): PerfectFreehandVec2 => [a[0]! + b[0]!, a[1]! + b[1]!];
const sub = (a: readonly number[], b: readonly number[]): PerfectFreehandVec2 => [a[0]! - b[0]!, a[1]! - b[1]!];
const mul = (a: readonly number[], n: number): PerfectFreehandVec2 => [a[0]! * n, a[1]! * n];
const per = (a: readonly number[]): PerfectFreehandVec2 => [a[1]!, -a[0]!];
const dpr = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]!;
const len = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!);
const uni = (a: readonly number[]): PerfectFreehandVec2 => {
  const l = len(a);
  return [a[0]! / l, a[1]! / l];
};
const dist2 = (a: readonly number[], b: readonly number[]): number => {
  const dx = a[0]! - b[0]!;
  const dy = a[1]! - b[1]!;
  return dx * dx + dy * dy;
};
const lrp = (a: readonly number[], b: readonly number[], t: number): PerfectFreehandVec2 => add(a, mul(sub(b, a), t));
const prj = (a: readonly number[], b: readonly number[], c: number): PerfectFreehandVec2 => add(a, mul(b, c));

function rotAround(a: readonly number[], c: readonly number[], r: number): PerfectFreehandVec2 {
  const s = Math.sin(r);
  const co = Math.cos(r);
  const px = a[0]! - c[0]!;
  const py = a[1]! - c[1]!;
  const nx = px * co - py * s;
  const ny = px * s + py * co;
  return [nx + c[0]!, ny + c[1]!];
}

const isValidPressure = (p: number | null | undefined): p is number => p != null && p >= 0;

function getStrokeRadius(size: number, thinning: number, pressure: number, easing: (t: number) => number = identity): number {
  return size * easing(0.5 - thinning * (0.5 - pressure));
}

function simulatePressure(prevPressure: number, distance: number, size: number): number {
  const sp = Math.min(1, distance / size);
  const rp = Math.min(1, 1 - sp);
  return Math.min(1, prevPressure + (rp - prevPressure) * (sp * RATE_OF_PRESSURE_CHANGE));
}

function resolveTaper(taper: number | boolean | undefined, size: number, totalLength: number): number {
  if (taper === false || taper === undefined) return 0;
  if (taper === true) return Math.max(size, totalLength);
  return taper;
}

function drawDot(center: PerfectFreehandVec2, radius: number): PerfectFreehandVec2[] {
  const offsetPoint = add(center, UNIT_OFFSET);
  const start = prj(center, uni(per(sub(center, offsetPoint))), -radius);
  const points: PerfectFreehandVec2[] = [];
  const step = 1 / 13;
  for (let t = step; t <= 1; t += step) points.push(rotAround(start, center, FIXED_PI * 2 * t));
  return points;
}

function drawRoundStartCap(center: PerfectFreehandVec2, rightPoint: PerfectFreehandVec2, sides: number): PerfectFreehandVec2[] {
  const points: PerfectFreehandVec2[] = [];
  const step = 1 / sides;
  for (let t = step; t <= 1; t += step) points.push(rotAround(rightPoint, center, FIXED_PI * t));
  return points;
}

function drawFlatStartCap(center: PerfectFreehandVec2, leftPoint: PerfectFreehandVec2, rightPoint: PerfectFreehandVec2): PerfectFreehandVec2[] {
  const cornersVector = sub(leftPoint, rightPoint);
  const offsetA = mul(cornersVector, 0.5);
  const offsetB = mul(cornersVector, 0.51);
  return [sub(center, offsetA), sub(center, offsetB), add(center, offsetB), add(center, offsetA)];
}

function drawRoundEndCap(center: PerfectFreehandVec2, direction: PerfectFreehandVec2, radius: number, sides: number): PerfectFreehandVec2[] {
  const points: PerfectFreehandVec2[] = [];
  const start = prj(center, direction, radius);
  const step = 1 / sides;
  for (let t = step; t < 1; t += step) points.push(rotAround(start, center, FIXED_PI * 3 * t));
  return points;
}

function drawFlatEndCap(center: PerfectFreehandVec2, direction: PerfectFreehandVec2, radius: number): PerfectFreehandVec2[] {
  return [add(center, mul(direction, radius)), add(center, mul(direction, radius * 0.99)), sub(center, mul(direction, radius * 0.99)), sub(center, mul(direction, radius))];
}

function computeInitialPressure(points: readonly PerfectFreehandStrokePoint[], shouldSimulatePressure: boolean, size: number): number {
  return points.slice(0, 10).reduce((acc, curr) => {
    let pressure = curr.pressure;
    if (shouldSimulatePressure) pressure = simulatePressure(acc, curr.distance, size);
    return (acc + pressure) / 2;
  }, points[0]!.pressure);
}

/** 입력 점열을 거리·압력·진행 방향이 붙은 스트로크 점으로 바꾼다. */
export function getPerfectFreehandStrokePoints(
  points: readonly PerfectFreehandInputPoint[],
  options: PerfectFreehandOptions = {},
): PerfectFreehandStrokePoint[] {
  const { streamline = 0.5, size = 16, last: isComplete = false } = options;
  if (points.length === 0) return [];

  const t = 0.15 + (1 - streamline) * 0.85;
  let pts: (number | undefined)[][] = Array.isArray(points[0])
    ? (points as readonly number[][]).map((p) => [...p])
    : (points as readonly PerfectFreehandXYP[]).map(({ x, y, pressure = DEFAULT_PRESSURE }) => [x, y, pressure]);

  if (pts.length === 2) {
    const lastPoint = pts[1]!;
    pts = pts.slice(0, -1);
    for (let i = 1; i < 5; i += 1) pts.push(lrp(pts[0] as number[], lastPoint as number[], i / 4));
  }
  if (pts.length === 1) {
    pts = [...pts, [...add(pts[0] as number[], UNIT_OFFSET), ...pts[0]!.slice(2)]];
  }

  const strokePoints: PerfectFreehandStrokePoint[] = [
    {
      point: [pts[0]![0]!, pts[0]![1]!],
      pressure: isValidPressure(pts[0]![2]) ? pts[0]![2]! : 0.25,
      vector: [...UNIT_OFFSET],
      distance: 0,
      runningLength: 0,
    },
  ];

  let hasReachedMinimumLength = false;
  let runningLength = 0;
  let prev = strokePoints[0]!;
  const max = pts.length - 1;

  for (let i = 1; i < pts.length; i += 1) {
    const point: PerfectFreehandVec2 =
      isComplete && i === max ? [pts[i]![0]!, pts[i]![1]!] : lrp(prev.point, pts[i] as number[], t);
    if (prev.point[0] === point[0] && prev.point[1] === point[1]) continue;

    const distance = Math.hypot(point[1] - prev.point[1], point[0] - prev.point[0]);
    runningLength += distance;
    if (i < max && !hasReachedMinimumLength) {
      if (runningLength < size) continue;
      hasReachedMinimumLength = true;
    }

    prev = {
      point,
      pressure: isValidPressure(pts[i]![2]) ? pts[i]![2]! : DEFAULT_PRESSURE,
      vector: uni(sub(prev.point, point)),
      distance,
      runningLength,
    };
    strokePoints.push(prev);
  }

  strokePoints[0]!.vector = strokePoints[1]?.vector || [0, 0];
  return strokePoints;
}

/** 스트로크 점을 닫힌 윤곽 다각형 좌표로 바꾼다. */
export function getPerfectFreehandOutlinePoints(
  points: readonly PerfectFreehandStrokePoint[],
  options: PerfectFreehandOptions = {},
  observer?: PerfectFreehandOutlineObserver,
): PerfectFreehandVec2[] {
  const {
    size = 16,
    smoothing = 0.5,
    thinning = 0.5,
    simulatePressure: shouldSimulatePressure = true,
    easing = identity,
    start = {},
    end = {},
    last: isComplete = false,
  } = options;
  const { cap: capStart = true, easing: taperStartEase = defaultStartTaperEasing } = start;
  const { cap: capEnd = true, easing: taperEndEase = defaultEndTaperEasing } = end;

  if (points.length === 0 || size <= 0) return [];

  const totalLength = points[points.length - 1]!.runningLength;
  const taperStart = resolveTaper(start.taper, size, totalLength);
  const taperEnd = resolveTaper(end.taper, size, totalLength);
  const minDistance = (size * smoothing) ** 2;

  const leftPts: PerfectFreehandVec2[] = [];
  const rightPts: PerfectFreehandVec2[] = [];

  let prevPressure = computeInitialPressure(points, shouldSimulatePressure, size);
  let radius = getStrokeRadius(size, thinning, points[points.length - 1]!.pressure, easing);
  let firstRadius: number | undefined;
  let prevVector = points[0]!.vector;
  let pl: PerfectFreehandVec2 = points[0]!.point;
  let pr: PerfectFreehandVec2 = pl;
  let tl: PerfectFreehandVec2 = pl;
  let tr: PerfectFreehandVec2 = pr;
  let isPrevPointSharpCorner = false;

  for (let i = 0; i < points.length; i += 1) {
    let { pressure } = points[i]!;
    const { point, vector, distance, runningLength } = points[i]!;
    const isLastPoint = i === points.length - 1;

    if (!isLastPoint && totalLength - runningLength < 3) continue;

    if (thinning) {
      if (shouldSimulatePressure) pressure = simulatePressure(prevPressure, distance, size);
      radius = getStrokeRadius(size, thinning, pressure, easing);
    } else {
      radius = size / 2;
    }
    if (firstRadius === undefined) firstRadius = radius;

    const ts = runningLength < taperStart ? taperStartEase(runningLength / taperStart) : 1;
    const te = totalLength - runningLength < taperEnd ? taperEndEase((totalLength - runningLength) / taperEnd) : 1;
    radius = Math.max(0.01, radius * Math.min(ts, te));
    observer?.onRadius?.(radius);

    const nextVector = (isLastPoint ? points[i]! : points[i + 1]!).vector;
    const nextDpr = isLastPoint ? 1 : dpr(vector, nextVector);
    const isPointSharpCorner = dpr(vector, prevVector) < 0 && !isPrevPointSharpCorner;
    const isNextPointSharpCorner = nextDpr < 0;

    if (isPointSharpCorner || isNextPointSharpCorner) {
      const offset = mul(per(prevVector), radius);
      for (let step = 0; step <= 1; step += CORNER_STEP) {
        tl = rotAround(sub(point, offset), point, FIXED_PI * step);
        leftPts.push(tl);
        tr = rotAround(add(point, offset), point, FIXED_PI * -step);
        rightPts.push(tr);
      }
      pl = tl;
      pr = tr;
      if (isNextPointSharpCorner) isPrevPointSharpCorner = true;
      continue;
    }

    isPrevPointSharpCorner = false;

    if (isLastPoint) {
      const offset = mul(per(vector), radius);
      leftPts.push(sub(point, offset));
      rightPts.push(add(point, offset));
      continue;
    }

    const offset = mul(per(lrp(nextVector, vector, nextDpr)), radius);
    tl = sub(point, offset);
    if (i <= 1 || dist2(pl, tl) > minDistance) {
      leftPts.push(tl);
      pl = tl;
    }
    tr = add(point, offset);
    if (i <= 1 || dist2(pr, tr) > minDistance) {
      rightPts.push(tr);
      pr = tr;
    }

    prevPressure = pressure;
    prevVector = vector;
  }

  const firstPoint: PerfectFreehandVec2 = [points[0]!.point[0], points[0]!.point[1]];
  const lastPoint: PerfectFreehandVec2 =
    points.length > 1 ? [points[points.length - 1]!.point[0], points[points.length - 1]!.point[1]] : add(points[0]!.point, UNIT_OFFSET);

  const startCap: PerfectFreehandVec2[] = [];
  const endCap: PerfectFreehandVec2[] = [];

  if (points.length === 1) {
    if (!(taperStart || taperEnd) || isComplete) return drawDot(firstPoint, firstRadius || radius);
  } else {
    if (!(taperStart || (taperEnd && points.length === 1))) {
      if (capStart) startCap.push(...drawRoundStartCap(firstPoint, rightPts[0]!, 13));
      else startCap.push(...drawFlatStartCap(firstPoint, leftPts[0]!, rightPts[0]!));
    }
    const direction = per(mul(points[points.length - 1]!.vector, -1));
    if (taperEnd || (taperStart && points.length === 1)) endCap.push(lastPoint);
    else if (capEnd) endCap.push(...drawRoundEndCap(lastPoint, direction, radius, 29));
    else endCap.push(...drawFlatEndCap(lastPoint, direction, radius));
  }

  return leftPts.concat(endCap, rightPts.reverse(), startCap);
}

/** 점열에서 바로 윤곽 좌표를 얻는다. */
export function getPerfectFreehandStroke(
  points: readonly PerfectFreehandInputPoint[],
  options: PerfectFreehandOptions = {},
  observer?: PerfectFreehandOutlineObserver,
): PerfectFreehandVec2[] {
  return getPerfectFreehandOutlinePoints(getPerfectFreehandStrokePoints(points, options), options, observer);
}
