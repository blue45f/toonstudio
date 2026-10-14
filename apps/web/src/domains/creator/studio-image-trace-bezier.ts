/**
 * Studio Image Trace — 베지어 곡선 피팅 (후속: 색상별 분리 + 곡선 피팅).
 *
 * 기존 트레이스(`studio-image-trace.ts`)는 색상 레이어 분리까지 됐지만 윤곽은
 * OpenCV 단순화 폴리곤(직선 근사) 그대로였고, 벡터 레이어 주입도 직선 큐빅
 * (제어점 1/3·2/3)으로 기하만 흉내 냈다. 이 모듈이 그 빈틈을 메운다:
 * 색상 레이어별로 분리된 닫힌 윤곽을 편집 가능한 3차 베지어 세그먼트 열로
 * 피팅해, 그대로 VectorCubicSegment(벡터 레이어)·SVG `C` 명령으로 쓸 수 있게 한다.
 *
 * 알고리즘: Schneider(1990) 최소제곱 큐빅 피팅 + 코너 검출 분리.
 *  - 코너(인접 변 사이 각도가 임계 미만으로 꺾인 정점)는 앵커로 고정하고
 *    구간을 나눠 피팅한다 — 로고의 각진 모서리가 둥글어지지 않는다.
 *  - 각 구간은 chord-length 파라미터화 → 최소제곱 → Newton 재파라미터화
 *    (최대 maxIterations회) → 최대 오차가 허용치를 넘으면 가장 먼 지점에서
 *    나눠 재귀 피팅한다.
 *  - 직선 구간은 제어점이 직선 위에 놓여 기하가 정확히 일치한다(회귀 없음).
 *
 * 순수 모듈: DOM/시간/난수 의존 없음, 입력 변형 없음, 결정적.
 * 라이선스: 알고리즘은 공개 논문(Schneider, Graphics Gems)의 표준 기법을
 * 자체 구현한 것으로 외부 라이브러리를 도입하지 않는다.
 */

export interface TraceBezierPoint {
  readonly x: number;
  readonly y: number;
}

/** VectorCubicSegment 와 구조가 동일한 3차 베지어 세그먼트. */
export interface TraceBezierSegment {
  readonly p0: TraceBezierPoint;
  readonly p1: TraceBezierPoint;
  readonly p2: TraceBezierPoint;
  readonly p3: TraceBezierPoint;
}

export interface TraceBezierFitOptions {
  /** 허용 최대 오차(입력 좌표 단위, 보통 페이지 px). 기본 1.5. */
  readonly maxError?: number;
  /** 진행 방향이 이 각도(도) 이상 꺾이면 코너로 보고 앵커로 고정한다. 기본 60. */
  readonly cornerAngleDeg?: number;
  /** 재파라미터화 반복 상한. 기본 4. */
  readonly maxIterations?: number;
}

const DEFAULT_MAX_ERROR = 1.5;
const DEFAULT_CORNER_ANGLE_DEG = 60;
const DEFAULT_MAX_ITERATIONS = 4;

// ---------------------------------------------------------------------------
// 기본 기하
// ---------------------------------------------------------------------------

function sub(a: TraceBezierPoint, b: TraceBezierPoint): TraceBezierPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}
function dot(a: TraceBezierPoint, b: TraceBezierPoint): number {
  return a.x * b.x + a.y * b.y;
}
function norm(a: TraceBezierPoint): number {
  return Math.hypot(a.x, a.y);
}
function normalize(a: TraceBezierPoint): TraceBezierPoint {
  const n = norm(a);
  return n === 0 ? { x: 0, y: 0 } : { x: a.x / n, y: a.y / n };
}

/** t에서의 큐빅 베지어 점. */
export function evaluateTraceBezier(segment: TraceBezierSegment, t: number): TraceBezierPoint {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * segment.p0.x + b1 * segment.p1.x + b2 * segment.p2.x + b3 * segment.p3.x,
    y: b0 * segment.p0.y + b1 * segment.p1.y + b2 * segment.p2.y + b3 * segment.p3.y,
  };
}

function cubicAt(
  p0: TraceBezierPoint, p1: TraceBezierPoint, p2: TraceBezierPoint, p3: TraceBezierPoint, t: number,
): TraceBezierPoint {
  return evaluateTraceBezier({ p0, p1, p2, p3 }, t);
}

function cubicDerivative1(
  p0: TraceBezierPoint, p1: TraceBezierPoint, p2: TraceBezierPoint, p3: TraceBezierPoint, t: number,
): TraceBezierPoint {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

function cubicDerivative2(
  p0: TraceBezierPoint, p1: TraceBezierPoint, p2: TraceBezierPoint, p3: TraceBezierPoint, t: number,
): TraceBezierPoint {
  const u = 1 - t;
  return {
    x: 6 * u * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
    y: 6 * u * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
  };
}

/** Newton법으로 점 point에 가장 가까운 곡선 파라미터 t를 찾는다(Schneider). */
function nearestT(
  seg: TraceBezierSegment, point: TraceBezierPoint, tGuess: number,
): number {
  let t = Math.min(1, Math.max(0, tGuess));
  for (let i = 0; i < 8; i += 1) {
    const q = cubicAt(seg.p0, seg.p1, seg.p2, seg.p3, t);
    const d1 = cubicDerivative1(seg.p0, seg.p1, seg.p2, seg.p3, t);
    const d2 = cubicDerivative2(seg.p0, seg.p1, seg.p2, seg.p3, t);
    const diff = sub(q, point);
    const numerator = dot(diff, d1);
    const denominator = dot(d1, d1) + dot(diff, d2);
    if (Math.abs(denominator) < 1e-12) break;
    const next = t - numerator / denominator;
    if (!Number.isFinite(next)) break;
    const clamped = Math.min(1, Math.max(0, next));
    if (Math.abs(clamped - t) < 1e-9) { t = clamped; break; }
    t = clamped;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Schneider 최소제곱 피팅 (열린 체인)
// ---------------------------------------------------------------------------

function chordLengthParams(points: readonly TraceBezierPoint[]): number[] {
  const params = [0];
  for (let i = 1; i < points.length; i += 1) {
    params.push(params[i - 1]! + norm(sub(points[i]!, points[i - 1]!)));
  }
  const total = params[params.length - 1]!;
  return total === 0 ? params.map(() => 0) : params.map((v) => v / total);
}

function fitCubicOnce(
  points: readonly TraceBezierPoint[],
  params: readonly number[],
  leftTangent: TraceBezierPoint,
  rightTangent: TraceBezierPoint,
): TraceBezierSegment | null {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  // 2점뿐이면 직선 큐빅이 정확하다.
  if (points.length === 2) {
    const dist = norm(sub(last, first)) / 3;
    return {
      p0: first,
      p1: { x: first.x + leftTangent.x * dist, y: first.y + leftTangent.y * dist },
      p2: { x: last.x + rightTangent.x * dist, y: last.y + rightTangent.y * dist },
      p3: last,
    };
  }
  let c00 = 0; let c01 = 0; let c11 = 0; let x0 = 0; let x1 = 0;
  for (let i = 0; i < points.length; i += 1) {
    const t = params[i]!;
    const u = 1 - t;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const a1 = { x: leftTangent.x * b1, y: leftTangent.y * b1 };
    const a2 = { x: rightTangent.x * b2, y: rightTangent.y * b2 };
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
    const b0 = u * u * u; const b3 = t * t * t;
    const tmp = {
      x: points[i]!.x - (b0 + b1) * first.x - (b2 + b3) * last.x,
      y: points[i]!.y - (b0 + b1) * first.y - (b2 + b3) * last.y,
    };
    x0 += dot(a1, tmp); x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alphaL = 0; let alphaR = 0;
  if (Math.abs(det) > 1e-12) {
    alphaL = (x0 * c11 - x1 * c01) / det;
    alphaR = (c00 * x1 - c01 * x0) / det;
  }
  const segLength = norm(sub(last, first));
  const epsilon = 1e-6 * Math.max(1, segLength);
  if (alphaL < epsilon || alphaR < epsilon || !Number.isFinite(alphaL) || !Number.isFinite(alphaR)) {
    // 퇴화하면 chord 1/3 직선 큐빅으로 폴백(기하 오차는 호출측 검사가 잡는다).
    const dist = segLength / 3;
    return {
      p0: first,
      p1: { x: first.x + leftTangent.x * dist, y: first.y + leftTangent.y * dist },
      p2: { x: last.x + rightTangent.x * dist, y: last.y + rightTangent.y * dist },
      p3: last,
    };
  }
  return {
    p0: first,
    p1: { x: first.x + leftTangent.x * alphaL, y: first.y + leftTangent.y * alphaL },
    p2: { x: last.x + rightTangent.x * alphaR, y: last.y + rightTangent.y * alphaR },
    p3: last,
  };
}

function maxErrorOf(
  points: readonly TraceBezierPoint[], params: readonly number[], seg: TraceBezierSegment,
): { error: number; splitIndex: number } {
  let maxError = 0;
  let splitIndex = Math.floor(points.length / 2);
  for (let i = 1; i < points.length - 1; i += 1) {
    const q = evaluateTraceBezier(seg, params[i]!);
    const err = norm(sub(q, points[i]!));
    if (err > maxError) { maxError = err; splitIndex = i; }
  }
  return { error: maxError, splitIndex };
}

function reparameterize(
  points: readonly TraceBezierPoint[], params: readonly number[], seg: TraceBezierSegment,
): number[] {
  return points.map((p, i) => nearestT(seg, p, params[i]!));
}

function fitChain(
  points: readonly TraceBezierPoint[],
  leftTangent: TraceBezierPoint,
  rightTangent: TraceBezierPoint,
  maxError: number,
  maxIterations: number,
  out: TraceBezierSegment[],
): void {
  if (points.length < 2) return;
  let params = chordLengthParams(points);
  let seg = fitCubicOnce(points, params, leftTangent, rightTangent);
  if (!seg) return;
  let { error, splitIndex } = maxErrorOf(points, params, seg);
  // 재파라미터화로 개선을 시도한다.
  for (let iter = 0; iter < maxIterations && error > maxError; iter += 1) {
    const nextParams = reparameterize(points, params, seg);
    const nextSeg = fitCubicOnce(points, nextParams, leftTangent, rightTangent);
    if (!nextSeg) break;
    const next = maxErrorOf(points, nextParams, nextSeg);
    if (next.error >= error) break;
    params = nextParams; seg = nextSeg; error = next.error; splitIndex = next.splitIndex;
  }
  if (error <= maxError || points.length <= 2) { out.push(seg); return; }
  // 가장 먼 지점에서 나눠 재귀 — 분할 지점 접선은 이웃 방향으로 잡는다.
  const split = Math.min(points.length - 2, Math.max(1, splitIndex));
  const centerTangent = normalize(sub(points[split + 1]!, points[split - 1]!));
  fitChain(points.slice(0, split + 1), leftTangent, { x: -centerTangent.x, y: -centerTangent.y }, maxError, maxIterations, out);
  fitChain(points.slice(split), centerTangent, rightTangent, maxError, maxIterations, out);
}

/**
 * 열린 점열 → 베지어 세그먼트 열. 양끝 접선은 이웃 점 방향.
 * 점이 2개 미만이면 빈 배열, 직선이면 세그먼트 1개(기하 정확).
 */
export function fitOpenChainToBezier(
  points: readonly TraceBezierPoint[],
  options: TraceBezierFitOptions = {},
): TraceBezierSegment[] {
  const clean = dedupePoints(points, 1e-9);
  if (clean.length < 2) return [];
  const maxError = Math.max(1e-6, options.maxError ?? DEFAULT_MAX_ERROR);
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const left = normalize(sub(clean[1]!, clean[0]!));
  const lastIdx = clean.length - 1;
  const rightIn = normalize(sub(clean[lastIdx]!, clean[lastIdx - 1]!));
  const out: TraceBezierSegment[] = [];
  fitChain(clean, left, { x: -rightIn.x, y: -rightIn.y }, maxError, maxIterations, out);
  return out;
}

// ---------------------------------------------------------------------------
// 닫힌 윤곽: 코너 검출 + 구간별 피팅
// ---------------------------------------------------------------------------

export function dedupePoints(
  points: readonly TraceBezierPoint[], epsilon: number,
): TraceBezierPoint[] {
  const out: TraceBezierPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) <= epsilon && Math.abs(last.y - p.y) <= epsilon) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** 정점 i가 코너인지 — 진행 방향 꺾임(도, 0=직선·90=직각)이 cornerAngleDeg 이상이면 코너. */
export function isTraceCorner(
  prev: TraceBezierPoint, curr: TraceBezierPoint, next: TraceBezierPoint, cornerAngleDeg: number,
): boolean {
  const v1 = normalize(sub(curr, prev));
  const v2 = normalize(sub(next, curr));
  const cos = Math.min(1, Math.max(-1, dot(v1, v2)));
  const turnDeg = (Math.acos(cos) * 180) / Math.PI; // 꺾인 각도(0=직선 진행)
  return turnDeg >= cornerAngleDeg;
}

/**
 * 닫힌 윤곽(앵커 순환) → 닫힌 베지어 세그먼트 열.
 * 마지막 세그먼트의 p3는 첫 세그먼트의 p0와 같아 닫힘이 보장된다.
 * 코너에서는 구간을 끊어 C0 연속(각진 모서리)을 유지하고, 비코너 연결점은
 * 양쪽 구간이 같은 접선을 공유해 매끄럽게 이어진다.
 */
export function fitClosedContourToBezier(
  input: readonly TraceBezierPoint[],
  options: TraceBezierFitOptions = {},
): TraceBezierSegment[] {
  const cornerAngleDeg = options.cornerAngleDeg ?? DEFAULT_CORNER_ANGLE_DEG;
  let points = dedupePoints(input, 1e-9);
  // 닫힘 반복점 제거
  if (points.length > 1) {
    const f = points[0]!; const l = points[points.length - 1]!;
    if (Math.abs(f.x - l.x) <= 1e-9 && Math.abs(f.y - l.y) <= 1e-9) points = points.slice(0, -1);
  }
  if (points.length < 3) return [];
  const n = points.length;
  const corners: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (isTraceCorner(points[(i - 1 + n) % n]!, points[i]!, points[(i + 1) % n]!, cornerAngleDeg)) {
      corners.push(i);
    }
  }
  // 앵커: 코너 전부. 코너가 없으면(원 등) 가장 먼 쌍 중 한 점을 시작 앵커로.
  const anchors = corners.length > 0 ? corners : [0];
  const segments: TraceBezierSegment[] = [];
  for (let a = 0; a < anchors.length; a += 1) {
    const start = anchors[a]!;
    const end = anchors[(a + 1) % anchors.length]!;
    // start→end 순환 체인 수집 (앵커가 1개뿐이면 한 바퀴 돌아 시작점으로 닫는다)
    const chain: TraceBezierPoint[] = [points[start]!];
    if (anchors.length === 1) {
      for (let k = 1; k <= n; k += 1) chain.push(points[(start + k) % n]!);
    } else {
      let idx = start;
      while (idx !== end) {
        idx = (idx + 1) % n;
        chain.push(points[idx]!);
      }
    }
    if (anchors.length === 1 && corners.length === 0) {
      // 닫힌 단일 구간: 시작점으로 돌아오는 체인 전체를 한 번에 피팅하되
      // 접선이 순환 방향과 맞도록 양끝 접선을 같은 방향으로 둔다.
      const tangent = normalize(sub(points[1]!, points[n - 1]!));
      const out: TraceBezierSegment[] = [];
      const maxError = Math.max(1e-6, options.maxError ?? DEFAULT_MAX_ERROR);
      fitChain(chain, tangent, { x: -tangent.x, y: -tangent.y }, maxError, options.maxIterations ?? DEFAULT_MAX_ITERATIONS, out);
      segments.push(...out);
    } else {
      segments.push(...fitOpenChainToBezier(chain, options));
    }
  }
  return segments;
}

// ---------------------------------------------------------------------------
// 평탄 점열·SVG·색상 레이어 조립
// ---------------------------------------------------------------------------

/** [x,y,…] 평탄 점열 → 점 목록. */
export function flatPointsToBezierPoints(flat: readonly number[]): TraceBezierPoint[] {
  const out: TraceBezierPoint[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
  return out;
}

function fmt(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** 베지어 세그먼트 열 → SVG path data (C 명령, 닫힘이면 Z). 직선 L 경로의 곡선판. */
export function bezierSegmentsToSvgPathData(
  segments: readonly TraceBezierSegment[], closed = true,
): string {
  if (segments.length === 0) return "";
  const first = segments[0]!;
  const parts = [`M ${fmt(first.p0.x)} ${fmt(first.p0.y)}`];
  for (const seg of segments) {
    parts.push(`C ${fmt(seg.p1.x)} ${fmt(seg.p1.y)} ${fmt(seg.p2.x)} ${fmt(seg.p2.y)} ${fmt(seg.p3.x)} ${fmt(seg.p3.y)}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/** 피팅 결과의 실측 최대 오차 — 조밀 샘플링으로 각 원본 정점의 최근접 거리 상한을 잰다. */
export function measureBezierFitError(
  points: readonly TraceBezierPoint[], segments: readonly TraceBezierSegment[],
): number {
  if (segments.length === 0) return Infinity;
  let worst = 0;
  for (const p of points) {
    let best = Infinity;
    for (const seg of segments) {
      // 여러 초기값에서 Newton 최근접점을 찾아 점→곡선 실제 거리를 잰다.
      for (const guess of [0, 0.25, 0.5, 0.75, 1]) {
        const t = nearestT(seg, p, guess);
        best = Math.min(best, norm(sub(evaluateTraceBezier(seg, t), p)));
      }
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

export interface TraceBezierColorLayerInput {
  readonly color: string;
  /** 이 색상 레이어에 속한 닫힌 윤곽들의 평탄 점열 목록(조각 단위). */
  readonly contours: readonly (readonly number[])[];
}

export interface TraceBezierColorLayer {
  readonly color: string;
  readonly segments: readonly TraceBezierSegment[];
  /** 이 레이어의 모든 윤곽을 이은 SVG path data (C 명령). */
  readonly pathData: string;
  readonly segmentCount: number;
}

/**
 * 색상별 분리 트레이스의 곡선 착지: 레이어(색상)마다 윤곽을 베지어로 피팅해
 * 색상 경계를 유지한 채 레이어별로 돌려준다. 색상 순서는 입력 순서를 따른다
 * (트레이스 본체의 면적 내림차순 = 아래→위 삽입 순서와 동일).
 */
export function fitTraceColorLayersToBezier(
  layers: readonly TraceBezierColorLayerInput[],
  options: TraceBezierFitOptions = {},
): TraceBezierColorLayer[] {
  const out: TraceBezierColorLayer[] = [];
  for (const layer of layers) {
    const segments: TraceBezierSegment[] = [];
    const pathParts: string[] = [];
    for (const contour of layer.contours) {
      const fitted = fitClosedContourToBezier(flatPointsToBezierPoints(contour), options);
      if (fitted.length === 0) continue;
      segments.push(...fitted);
      const d = bezierSegmentsToSvgPathData(fitted, true);
      if (d) pathParts.push(d);
    }
    if (segments.length === 0) continue;
    out.push(Object.freeze({
      color: layer.color,
      segments: Object.freeze(segments),
      pathData: pathParts.join(" "),
      segmentCount: segments.length,
    }));
  }
  return out;
}
