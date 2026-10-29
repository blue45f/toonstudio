/**
 * Philip J. Schneider의 곡선 피팅("An Algorithm for Automatically Fitting Digitized Curves",
 * Graphics Gems, 1990)을 fit-curve 0.2.0과 같은 수치로 따르는 2차원 구현.
 *
 * 이식 근거
 * - fit-curve 0.2.0 (MIT, Copyright (c) 2014 Volker Poplawski)의 `src/fit-curve.js` 동작을 따랐다.
 *   fit-curve는 프로덕션 의존성이라 MIT 고지 원문은 릴리스 고지 산출물
 *   (dist/legal/THIRD_PARTY_NOTICES.generated.md)에 실린다.
 * - 같은 입력에 대한 세그먼트 수와 제어점이 업스트림과 일치함은
 *   `__tests__/studio-upstream-parity.test.ts`가 설치된 fit-curve를 직접 실행해 확인한다.
 *
 * 정석 Schneider와 다른 점(업스트림 수치를 맞추려고 그대로 둔다)
 * - 오차 측정: 곡선 매개변수 u가 아니라 곡선의 호 길이 비율(10분할 표)로 t를 찾아 점과 비교한다.
 * - 재매개화 반복 조건은 `maxError < error * error`다(error는 이미 제곱 허용오차).
 * - 뉴턴 단계의 분모는 `|q'|² + 2·(q-p)·q''`다(정석은 `+ (q-p)·q''`, 계수 2가 없다).
 * - 재매개화한 u로 곡선을 만들되 오차는 처음 chord-length u로 잰다.
 *
 * 우리 쪽 변경(수치 일치를 깨지 않는 것만)
 * - 분할점이 양 끝이면 업스트림은 undefined를 읽어 던진다. 여기서는 안쪽 점으로 당겨 항상 더 짧은
 *   구간으로만 나뉘게 한다.
 * - 재귀 대신 명시적 스택을 써서 점이 많고 들쭉날쭉해도 호출 스택이 넘치지 않는다. 세그먼트 순서는
 *   업스트림의 재귀 순서(왼쪽 구간 먼저)와 같다.
 * - 점 형식은 `{x, y}`이며 시작·끝점 객체는 그대로 돌려줘 `pressure01` 같은 부가 필드를 보존한다.
 */

export interface FitCurvePoint {
  readonly x: number;
  readonly y: number;
}

export interface FitCurveSegment<P extends FitCurvePoint = FitCurvePoint> {
  readonly p0: P;
  readonly ctrl1: FitCurvePoint;
  readonly ctrl2: FitCurvePoint;
  readonly p3: P;
}

export interface FitCurveStats {
  /** 재매개화(뉴턴) 반복 총 횟수. */
  reparameterizations: number;
  /** 채택된 세그먼트들의 최대 제곱오차. */
  maxAcceptedErrorSq: number;
}

const MAX_ITERATIONS = 20;
const DISTANCE_TABLE_PARTS = 10;

type Vec2 = readonly [number, number];
type Bezier = readonly [Vec2, Vec2, Vec2, Vec2];

const dot = (a: Vec2, b: Vec2): number => 0 + a[0] * b[0] + a[1] * b[1];

function tangentBetween(a: FitCurvePoint, b: FitCurvePoint): Vec2 {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
}

function bezierPoint(bez: Bezier, t: number): Vec2 {
  const [c0, c1, c2, c3] = bez;
  const tx = 1.0 - t;
  const w0 = tx * tx * tx;
  const w1 = 3 * tx * tx * t;
  const w2 = 3 * tx * t * t;
  const w3 = t * t * t;
  return [
    c0[0] * w0 + c1[0] * w1 + (c2[0] * w2 + c3[0] * w3),
    c0[1] * w0 + c1[1] * w1 + (c2[1] * w2 + c3[1] * w3),
  ];
}

function bezierFirstDerivative(bez: Bezier, t: number): Vec2 {
  const [c0, c1, c2, c3] = bez;
  const tx = 1.0 - t;
  const wa = 3 * tx * tx;
  const wb = 6 * tx * t;
  const wc = 3 * t * t;
  return [
    (c1[0] - c0[0]) * wa + (c2[0] - c1[0]) * wb + (c3[0] - c2[0]) * wc,
    (c1[1] - c0[1]) * wa + (c2[1] - c1[1]) * wb + (c3[1] - c2[1]) * wc,
  ];
}

function bezierSecondDerivative(bez: Bezier, t: number): Vec2 {
  const [c0, c1, c2, c3] = bez;
  const wl = 6 * (1.0 - t);
  const wr = 6 * t;
  return [
    (c2[0] - c1[0] * 2 + c0[0]) * wl + (c3[0] - c2[0] * 2 + c1[0]) * wr,
    (c2[1] - c1[1] * 2 + c0[1]) * wl + (c3[1] - c2[1] * 2 + c1[1]) * wr,
  ];
}

function chordLengthParameterize(points: readonly FitCurvePoint[]): number[] {
  const u: number[] = [];
  let prevU = 0;
  let prev = points[0]!;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const curr = i ? prevU + Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
    u.push(curr);
    prevU = curr;
    prev = p;
  }
  return u.map((x) => x / prevU);
}

function generateBezier(
  points: readonly FitCurvePoint[],
  parameters: readonly number[],
  leftTangent: Vec2,
  rightTangent: Vec2,
): Bezier {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const firstV: Vec2 = [first.x, first.y];
  const lastV: Vec2 = [last.x, last.y];
  const ends: Bezier = [firstV, firstV, lastV, lastV];

  let c00 = 0;
  let c01 = 0;
  let c10 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < points.length; i += 1) {
    const u = parameters[i]!;
    const ux = 1 - u;
    const k0 = 3 * u * (ux * ux);
    const k1 = 3 * ux * (u * u);
    const a0: Vec2 = [leftTangent[0] * k0, leftTangent[1] * k0];
    const a1: Vec2 = [rightTangent[0] * k1, rightTangent[1] * k1];
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c10 += dot(a0, a1);
    c11 += dot(a1, a1);
    const base = bezierPoint(ends, u);
    const tmp: Vec2 = [points[i]!.x - base[0], points[i]!.y - base[1]];
    x0 += dot(a0, tmp);
    x1 += dot(a1, tmp);
  }

  const detC0C1 = c00 * c11 - c10 * c01;
  const detC0X = c00 * x1 - c10 * x0;
  const detXC1 = x0 * c11 - x1 * c01;
  const alphaL = detC0C1 === 0 ? 0 : detXC1 / detC0C1;
  const alphaR = detC0C1 === 0 ? 0 : detC0X / detC0C1;

  const segLength = Math.hypot(firstV[0] - lastV[0], firstV[1] - lastV[1]);
  const epsilon = 1.0e-6 * segLength;
  if (alphaL < epsilon || alphaR < epsilon) {
    const third = segLength / 3.0;
    return [
      firstV,
      [firstV[0] + leftTangent[0] * third, firstV[1] + leftTangent[1] * third],
      [lastV[0] + rightTangent[0] * third, lastV[1] + rightTangent[1] * third],
      lastV,
    ];
  }
  return [
    firstV,
    [firstV[0] + leftTangent[0] * alphaL, firstV[1] + leftTangent[1] * alphaL],
    [lastV[0] + rightTangent[0] * alphaR, lastV[1] + rightTangent[1] * alphaR],
    lastV,
  ];
}

function newtonRaphsonRootFind(bez: Bezier, point: FitCurvePoint, u: number): number {
  const q = bezierPoint(bez, u);
  const d: Vec2 = [q[0] - point.x, q[1] - point.y];
  const qp = bezierFirstDerivative(bez, u);
  const qpp = bezierSecondDerivative(bez, u);
  const numerator = dot(d, qp);
  const denominator = qp[0] * qp[0] + qp[1] * qp[1] + 2 * dot(d, qpp);
  return denominator === 0 ? u : u - numerator / denominator;
}

function mapTToRelativeDistances(bez: Bezier): number[] {
  const dist: number[] = [0];
  let prev: Vec2 = bez[0];
  let sumLen = 0;
  for (let i = 1; i <= DISTANCE_TABLE_PARTS; i += 1) {
    const curr = bezierPoint(bez, i / DISTANCE_TABLE_PARTS);
    sumLen += Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
    dist.push(sumLen);
    prev = curr;
  }
  return dist.map((x) => x / sumLen);
}

function findT(param: number, distTable: readonly number[]): number {
  if (param < 0) return 0;
  if (param > 1) return 1;
  let t = Number.NaN;
  for (let i = 1; i <= DISTANCE_TABLE_PARTS; i += 1) {
    if (param <= distTable[i]!) {
      const tMin = (i - 1) / DISTANCE_TABLE_PARTS;
      const tMax = i / DISTANCE_TABLE_PARTS;
      const lenMin = distTable[i - 1]!;
      const lenMax = distTable[i]!;
      t = ((param - lenMin) / (lenMax - lenMin)) * (tMax - tMin) + tMin;
      break;
    }
  }
  return t;
}

function computeMaxError(
  points: readonly FitCurvePoint[],
  bez: Bezier,
  parameters: readonly number[],
): { readonly maxDist: number; readonly splitPoint: number } {
  let maxDist = 0;
  let splitPoint = Math.floor(points.length / 2);
  const distTable = mapTToRelativeDistances(bez);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    const q = bezierPoint(bez, findT(parameters[i]!, distTable));
    const vx = q[0] - point.x;
    const vy = q[1] - point.y;
    const dist = vx * vx + vy * vy;
    if (dist > maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }
  return { maxDist, splitPoint };
}

function toSegment<P extends FitCurvePoint>(bez: Bezier, first: P, last: P): FitCurveSegment<P> {
  return {
    p0: first,
    ctrl1: { x: bez[1][0], y: bez[1][1] },
    ctrl2: { x: bez[2][0], y: bez[2][1] },
    p3: last,
  };
}

interface FitTask<P extends FitCurvePoint> {
  readonly points: readonly P[];
  readonly leftTangent: Vec2;
  readonly rightTangent: Vec2;
}

type FitStep<P extends FitCurvePoint> =
  | { readonly kind: "segment"; readonly segment: FitCurveSegment<P> }
  | { readonly kind: "split"; readonly left: FitTask<P>; readonly right: FitTask<P> };

/** 한 구간을 곡선 하나로 맞추거나, 안 되면 오차가 가장 큰 점에서 둘로 나눈다. */
function fitStep<P extends FitCurvePoint>(task: FitTask<P>, error: number, stats: FitCurveStats): FitStep<P> {
  const { points, leftTangent, rightTangent } = task;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  if (points.length === 2) {
    const dist = Math.hypot(first.x - last.x, first.y - last.y) / 3.0;
    return {
      kind: "segment",
      segment: {
        p0: first,
        ctrl1: { x: first.x + leftTangent[0] * dist, y: first.y + leftTangent[1] * dist },
        ctrl2: { x: last.x + rightTangent[0] * dist, y: last.y + rightTangent[1] * dist },
        p3: last,
      },
    };
  }

  const u = chordLengthParameterize(points);
  let bez = generateBezier(points, u, leftTangent, rightTangent);
  let { maxDist: maxError, splitPoint } = computeMaxError(points, bez, u);

  if (maxError === 0 || maxError < error) {
    stats.maxAcceptedErrorSq = Math.max(stats.maxAcceptedErrorSq, maxError);
    return { kind: "segment", segment: toSegment(bez, first, last) };
  }

  if (maxError < error * error) {
    let uPrime = u;
    let prevErr = maxError;
    let prevSplit = splitPoint;
    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      stats.reparameterizations += 1;
      const current = bez;
      uPrime = uPrime.map((p, idx) => newtonRaphsonRootFind(current, points[idx]!, p));
      bez = generateBezier(points, uPrime, leftTangent, rightTangent);
      ({ maxDist: maxError, splitPoint } = computeMaxError(points, bez, u));
      if (maxError < error) {
        stats.maxAcceptedErrorSq = Math.max(stats.maxAcceptedErrorSq, maxError);
        return { kind: "segment", segment: toSegment(bez, first, last) };
      }
      if (splitPoint === prevSplit) {
        const errChange = maxError / prevErr;
        if (errChange > 0.9999 && errChange < 1.0001) break;
      }
      prevErr = maxError;
      prevSplit = splitPoint;
    }
  }

  // 양 끝 점은 곡선이 정확히 지나므로 오차가 0이다. 부동소수 잡음으로 끝점이 뽑히면 업스트림은
  // undefined를 읽어 던지므로, 안쪽 점으로 당겨 항상 더 짧은 구간으로만 나뉘게 한다.
  const split = Math.min(Math.max(splitPoint, 1), points.length - 2);
  const before = points[split - 1]!;
  const after = points[split + 1]!;
  let cx = before.x - after.x;
  let cy = before.y - after.y;
  if (cx === 0 && cy === 0) {
    const center = points[split]!;
    const px = before.x - center.x;
    const py = before.y - center.y;
    cx = -py;
    cy = px;
  }
  const len = Math.hypot(cx, cy);
  const toCenter: Vec2 = [cx / len, cy / len];
  const fromCenter: Vec2 = [toCenter[0] * -1, toCenter[1] * -1];

  return {
    kind: "split",
    left: { points: points.slice(0, split + 1), leftTangent, rightTangent: toCenter },
    right: { points: points.slice(split), leftTangent: fromCenter, rightTangent },
  };
}

/**
 * 점열에 3차 베지어 세그먼트들을 맞춘다.
 *
 * @param maxSquaredError 점과 곡선 사이 허용 제곱오차(fit-curve의 `maxError`와 같은 단위)
 */
export function fitCurveSchneider<P extends FitCurvePoint>(
  points: readonly P[],
  maxSquaredError: number,
  stats: FitCurveStats = { reparameterizations: 0, maxAcceptedErrorSq: 0 },
): FitCurveSegment<P>[] {
  const distinct = points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
  if (distinct.length < 2) return [];

  const segments: FitCurveSegment<P>[] = [];
  const pending: FitTask<P>[] = [
    {
      points: distinct,
      leftTangent: tangentBetween(distinct[1]!, distinct[0]!),
      rightTangent: tangentBetween(distinct[distinct.length - 2]!, distinct[distinct.length - 1]!),
    },
  ];
  // 왼쪽 구간 결과가 먼저 나오도록 오른쪽을 먼저 쌓는다.
  while (pending.length > 0) {
    const step = fitStep(pending.pop()!, maxSquaredError, stats);
    if (step.kind === "segment") segments.push(step.segment);
    else pending.push(step.right, step.left);
  }
  return segments;
}
