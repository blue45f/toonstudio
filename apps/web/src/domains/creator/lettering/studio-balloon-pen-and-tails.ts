/**
 * CSP 말풍선 펜(var 163)·곡선 말풍선(var 161) 및 다관절 말풍선 꼬리/생각 꼬리(vars 157, 159) 엔진.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 클린룸 수학 구현 원칙:
 * - 자유획 폐곡선(RDP + Chaikin 코너 스무딩) 및 제어점 폐곡선(주기 Catmull–Rom 스플라인)을
 *   BubbleEl.customShapePoints 규약의 로컬 다각형으로 변환한다.
 * - 적응형 격자 세분화 기반 난접근성 극점(Pole of Inaccessibility) 탐색으로 오목·비정형 말풍선에서도
 *   외곽선을 침범하지 않는 최대 내부 대사 텍스트 상자를 산출한다.
 * - 1~3개 꺾임 관절(joints)을 갖는 일반 대사 꼬리, 전파·번개 꼬리, 생각 방울 체인을 생성한다.
 */

export interface BalloonPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface PoleOfInaccessibilityResult {
  readonly x: number;
  readonly y: number;
  readonly maxInscribedRadius: number;
}

export interface BalloonInteriorTextBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly inscribedRadius: number;
}

export interface AuthoredCustomBalloonShape {
  /** 캔버스 상의 말풍선 바운딩 박스 원점·크기. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** BubbleEl.customShapePoints 호환 로컬 평탄 좌표 [x0, y0, ...]. */
  readonly customShapePoints: number[];
  readonly localVertices: readonly BalloonPoint2D[];
  /** 로컬 좌표계 기준 최적 대사 텍스트 안전 영역. */
  readonly interiorTextBox: BalloonInteriorTextBox;
}

export interface BalloonPenStrokeOptions {
  readonly simplifyEpsilonPx?: number;
  readonly chaikinIterations?: number;
  readonly polePrecisionPx?: number;
  readonly paddingPx?: number;
}

export interface CurveBalloonSplineOptions {
  readonly samplesPerSegment?: number;
  readonly tension?: number;
  readonly polePrecisionPx?: number;
  readonly paddingPx?: number;
}

export type MultiJointTailKind = "speech" | "radio" | "lightning" | "thought";

export interface ThoughtTailDot {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly svgPath: string;
}

export interface MultiJointTailInput {
  readonly kind: MultiJointTailKind;
  /** 말풍선 본체 쪽 꼬리 시작점. */
  readonly root: BalloonPoint2D;
  /** 화자 입 근처의 꼬리 끝점. */
  readonly tip: BalloonPoint2D;
  /** 중간 꺾임 관절 목록(1~3개 권장; 빈 배열이면 직선 0관절, 3개 초과 시 앞 3개로 클램프). */
  readonly joints?: readonly BalloonPoint2D[];
  /** 꼬리 밑동 폭(px, 기본 22). */
  readonly baseWidthPx?: number;
  /** 생각 방울 개수(3..12, 기본 5). */
  readonly thoughtDotCount?: number;
  /** 생각 방울 시작 반지름(px, 기본 11). */
  readonly thoughtStartRadiusPx?: number;
  /** 생각 방울 끝 반지름(px, 기본 3.5). */
  readonly thoughtEndRadiusPx?: number;
  /** 전파·번개 꼬리의 지그재그 진폭(px, 기본 6). */
  readonly zigzagAmplitudePx?: number;
}

export interface MultiJointTailPlan {
  readonly kind: MultiJointTailKind;
  readonly effectiveJoints: readonly BalloonPoint2D[];
  readonly spinePolyline: readonly BalloonPoint2D[];
  /** speech / radio / lightning 일 때 닫힌 외곽 다각형 정점. thought 일 때는 빈 배열. */
  readonly polygonVertices: readonly BalloonPoint2D[];
  readonly polygonPoints: number[];
  /** thought 일 때 크기 감소 방울 목록. */
  readonly thoughtDots: readonly ThoughtTailDot[];
  /** 렌더링·미리보기용 단일 SVG path d 문자열. */
  readonly svgPathData: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pointToSegmentDistSq(p: BalloonPoint2D, a: BalloonPoint2D, b: BalloonPoint2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return px * px + py * py;
  }
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return (p.x - projX) ** 2 + (p.y - projY) ** 2;
}

/** 점과 닫힌 다각형 사이의 부호 있는 최단 거리(내부 > 0, 외부 < 0). */
export function signedDistanceToPolygon(
  point: BalloonPoint2D,
  polygon: readonly BalloonPoint2D[],
): number {
  let inside = false;
  let minDistSq = Infinity;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x
    ) {
      inside = !inside;
    }
    const dSq = pointToSegmentDistSq(point, a, b);
    if (dSq < minDistSq) minDistSq = dSq;
  }
  const dist = Math.sqrt(minDistSq);
  return inside ? dist : -dist;
}

interface ProbeCell {
  readonly x: number;
  readonly y: number;
  readonly half: number;
  readonly dist: number;
  readonly maxPotential: number;
}

function createProbeCell(
  x: number,
  y: number,
  half: number,
  polygon: readonly BalloonPoint2D[],
): ProbeCell {
  const dist = signedDistanceToPolygon({ x, y }, polygon);
  return {
    x,
    y,
    half,
    dist,
    maxPotential: dist + half * Math.SQRT2,
  };
}

function polygonAreaCentroid(polygon: readonly BalloonPoint2D[]): BalloonPoint2D {
  let areaAcc = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    const cross = a.x * b.y - b.x * a.y;
    areaAcc += cross;
    cxAcc += (a.x + b.x) * cross;
    cyAcc += (a.y + b.y) * cross;
  }
  if (Math.abs(areaAcc) < 1e-6) {
    return polygon[0] ?? { x: 0, y: 0 };
  }
  return {
    x: cxAcc / (3 * areaAcc),
    y: cyAcc / (3 * areaAcc),
  };
}

/**
 * 적응형 사분트리 분기한정법(Branch-and-Bound)으로 다각형 내부의 난접근성 극점
 * (최대 내접원 중심)을 정밀도 precisionPx 이내로 탐색한다.
 */
export function computePolygonPoleOfInaccessibility(
  polygon: readonly BalloonPoint2D[],
  precisionPx = 1.0,
): PoleOfInaccessibilityResult {
  if (polygon.length < 3) {
    const pt = polygon[0] ?? { x: 0, y: 0 };
    return { x: pt.x, y: pt.y, maxInscribedRadius: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (cellSize <= 1e-6) {
    return { x: minX, y: minY, maxInscribedRadius: 0 };
  }

  const halfInit = cellSize * 0.5;
  const queue: ProbeCell[] = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(createProbeCell(x + halfInit, y + halfInit, halfInit, polygon));
    }
  }

  const centroid = polygonAreaCentroid(polygon);
  let best = createProbeCell(centroid.x, centroid.y, 0, polygon);
  const bboxCenter = createProbeCell(minX + width * 0.5, minY + height * 0.5, 0, polygon);
  if (bboxCenter.dist > best.dist) best = bboxCenter;

  const eps = Math.max(0.2, precisionPx);
  let guard = 0;
  while (queue.length > 0 && guard < 4000) {
    guard += 1;
    // 가장 잠재 반지름(maxPotential)이 큰 셀을 꺼낸다.
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i]!.maxPotential > queue[bestIdx]!.maxPotential) {
        bestIdx = i;
      }
    }
    const cell = queue[bestIdx]!;
    queue[bestIdx] = queue[queue.length - 1]!;
    queue.pop();

    if (cell.dist > best.dist) best = cell;
    if (cell.maxPotential - best.dist <= eps) continue;

    const h = cell.half * 0.5;
    queue.push(
      createProbeCell(cell.x - h, cell.y - h, h, polygon),
      createProbeCell(cell.x + h, cell.y - h, h, polygon),
      createProbeCell(cell.x - h, cell.y + h, h, polygon),
      createProbeCell(cell.x + h, cell.y + h, h, polygon),
    );
  }

  return {
    x: round2(best.x),
    y: round2(best.y),
    maxInscribedRadius: round2(Math.max(0, best.dist)),
  };
}

/** 난접근성 극점을 중심으로 외곽선 내부에 안전하게 들어가는 최대 대사 텍스트 박스를 계산한다. */
export function computeBalloonInteriorTextBox(
  localPolygon: readonly BalloonPoint2D[],
  paddingPx = 6,
  precisionPx = 1.0,
): BalloonInteriorTextBox {
  const pole = computePolygonPoleOfInaccessibility(localPolygon, precisionPx);
  const safePad = Math.max(0, paddingPx);

  // 극점에서 좌/우/상/하 광선을 쏘아 가로·세로 여유 폭을 측정한다.
  const castRayDist = (dx: number, dy: number): number => {
    let minHit = Infinity;
    for (let i = 0; i < localPolygon.length; i += 1) {
      const a = localPolygon[i]!;
      const b = localPolygon[(i + 1) % localPolygon.length]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const rx = a.x - pole.x;
      const ry = a.y - pole.y;
      const t = (rx * ey - ry * ex) / denom;
      const u = (rx * dy - ry * dx) / denom;
      if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6 && t < minHit) {
        minHit = t;
      }
    }
    return Number.isFinite(minHit) ? minHit : pole.maxInscribedRadius;
  };

  const halfHoriz = Math.max(
    pole.maxInscribedRadius * Math.SQRT1_2,
    Math.min(castRayDist(-1, 0), castRayDist(1, 0)) * 0.78,
  );
  const halfVert = Math.max(
    pole.maxInscribedRadius * Math.SQRT1_2,
    Math.min(castRayDist(0, -1), castRayDist(0, 1)) * 0.78,
  );

  const usableHalfW = Math.max(4, halfHoriz - safePad);
  const usableHalfH = Math.max(4, halfVert - safePad);

  return {
    x: round2(pole.x - usableHalfW),
    y: round2(pole.y - usableHalfH),
    width: round2(usableHalfW * 2),
    height: round2(usableHalfH * 2),
    centerX: pole.x,
    centerY: pole.y,
    inscribedRadius: pole.maxInscribedRadius,
  };
}

function simplifyClosedStroke(points: readonly BalloonPoint2D[], eps: number): BalloonPoint2D[] {
  const deduped: BalloonPoint2D[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const prev = deduped.at(-1);
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 1.5) {
      deduped.push(pt);
    }
  }
  if (deduped.length <= 4) return deduped;

  const rdp = (arr: readonly BalloonPoint2D[]): BalloonPoint2D[] => {
    if (arr.length <= 2) return [...arr];
    let maxD = -1;
    let idx = -1;
    const first = arr[0]!;
    const last = arr[arr.length - 1]!;
    for (let i = 1; i < arr.length - 1; i += 1) {
      const d = Math.sqrt(pointToSegmentDistSq(arr[i]!, first, last));
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      const l = rdp(arr.slice(0, idx + 1));
      const r = rdp(arr.slice(idx));
      return [...l.slice(0, -1), ...r];
    }
    return [first, last];
  };

  const closed = [...deduped, deduped[0]!];
  const simplified = rdp(closed);
  if (simplified.length >= 2) simplified.pop();
  return simplified;
}

function smoothClosedChaikin(
  vertices: readonly BalloonPoint2D[],
  iterations: number,
): BalloonPoint2D[] {
  let current = [...vertices];
  const iters = clamp(Math.round(iterations), 0, 4);
  for (let iter = 0; iter < iters; iter += 1) {
    if (current.length < 3 || current.length > 240) break;
    const next: BalloonPoint2D[] = [];
    for (let i = 0; i < current.length; i += 1) {
      const p0 = current[i]!;
      const p1 = current[(i + 1) % current.length]!;
      next.push(
        { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y },
        { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y },
      );
    }
    current = next;
  }
  return current;
}

function packAuthoredBalloon(
  globalVertices: readonly BalloonPoint2D[],
  paddingPx: number,
  polePrecisionPx: number,
): AuthoredCustomBalloonShape {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of globalVertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  const x = round2(minX);
  const y = round2(minY);
  const width = Math.max(12, round2(maxX - minX));
  const height = Math.max(12, round2(maxY - minY));
  const localVertices: BalloonPoint2D[] = [];
  const customShapePoints: number[] = [];
  for (const v of globalVertices) {
    const lx = round2(v.x - x);
    const ly = round2(v.y - y);
    localVertices.push({ x: lx, y: ly });
    customShapePoints.push(lx, ly);
  }
  const interiorTextBox = computeBalloonInteriorTextBox(
    localVertices,
    paddingPx,
    polePrecisionPx,
  );

  return {
    x,
    y,
    width,
    height,
    customShapePoints,
    localVertices,
    interiorTextBox,
  };
}

/** CSP 말풍선 펜(Balloon pen, var 163) — 닫힌 자유곡선 획을 매끄러운 customShapePoints로 변환한다. */
export function authorBalloonFromFreehandStroke(
  strokePoints: readonly BalloonPoint2D[],
  options: BalloonPenStrokeOptions = {},
): AuthoredCustomBalloonShape | null {
  const simplified = simplifyClosedStroke(strokePoints, options.simplifyEpsilonPx ?? 2.5);
  if (simplified.length < 3) return null;
  const smoothed = smoothClosedChaikin(simplified, options.chaikinIterations ?? 2);
  return packAuthoredBalloon(
    smoothed,
    options.paddingPx ?? 6,
    options.polePrecisionPx ?? 1.0,
  );
}

/** CSP 곡선 말풍선(Curve balloon, var 161) — 제어점 시퀀스를 닫힌 주기 Catmull–Rom 스플라인으로 보간한다. */
export function authorBalloonFromCurveControlPoints(
  controlPoints: readonly BalloonPoint2D[],
  options: CurveBalloonSplineOptions = {},
): AuthoredCustomBalloonShape | null {
  if (controlPoints.length < 3) return null;
  const n = controlPoints.length;
  const samples = clamp(Math.round(options.samplesPerSegment ?? 10), 4, 28);
  const tension = clamp(options.tension ?? 0.5, 0.1, 1);
  const sampled: BalloonPoint2D[] = [];

  for (let i = 0; i < n; i += 1) {
    const p0 = controlPoints[(i - 1 + n) % n]!;
    const p1 = controlPoints[i]!;
    const p2 = controlPoints[(i + 1) % n]!;
    const p3 = controlPoints[(i + 2) % n]!;

    for (let s = 0; s < samples; s += 1) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const m1x = tension * (p2.x - p0.x);
      const m1y = tension * (p2.y - p0.y);
      const m2x = tension * (p3.x - p1.x);
      const m2y = tension * (p3.y - p1.y);

      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      sampled.push({
        x: h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x,
        y: h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y,
      });
    }
  }

  return packAuthoredBalloon(
    sampled,
    options.paddingPx ?? 6,
    options.polePrecisionPx ?? 1.0,
  );
}

function subdividePolyline(
  nodes: readonly BalloonPoint2D[],
  substeps = 6,
): BalloonPoint2D[] {
  if (nodes.length <= 2) return [...nodes];
  const out: BalloonPoint2D[] = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const p0 = nodes[Math.max(0, i - 1)]!;
    const p1 = nodes[i]!;
    const p2 = nodes[i + 1]!;
    const p3 = nodes[Math.min(nodes.length - 1, i + 2)]!;
    for (let s = 0; s < substeps; s += 1) {
      const t = s / substeps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(nodes[nodes.length - 1]!);
  return out;
}

/**
 * CSP 다관절 말풍선 꼬리(var 157: speech / radio / lightning) 및 생각 꼬리(var 159: thought)를 생성한다.
 * 최대 3개의 중간 관절(1~3 bends)을 지원한다.
 */
export function buildMultiJointBalloonTail(input: MultiJointTailInput): MultiJointTailPlan {
  const effectiveJoints = (input.joints ?? []).slice(0, 3);
  const rawNodes: BalloonPoint2D[] = [input.root, ...effectiveJoints, input.tip];
  const baseWidth = clamp(input.baseWidthPx ?? 22, 4, 120);

  if (input.kind === "thought") {
    const smoothSpine = subdividePolyline(rawNodes, 8);
    const dotCount = clamp(Math.round(input.thoughtDotCount ?? 5), 3, 12);
    const rStart = clamp(input.thoughtStartRadiusPx ?? 11, 3, 48);
    const rEnd = clamp(input.thoughtEndRadiusPx ?? 3.5, 1.5, rStart);
    const dots: ThoughtTailDot[] = [];
    const svgParts: string[] = [];

    for (let i = 0; i < dotCount; i += 1) {
      const u = dotCount === 1 ? 0.5 : (i + 0.35) / dotCount;
      const idx = Math.min(smoothSpine.length - 1, Math.floor(u * (smoothSpine.length - 1)));
      const pt = smoothSpine[idx]!;
      const radius = round2(rStart + (rEnd - rStart) * (i / Math.max(1, dotCount - 1)));
      const rx = radius;
      const ry = round2(radius * 0.9);
      const svgPath =
        `M ${round2(pt.x - rx)} ${round2(pt.y)} ` +
        `A ${rx} ${ry} 0 1 0 ${round2(pt.x + rx)} ${round2(pt.y)} ` +
        `A ${rx} ${ry} 0 1 0 ${round2(pt.x - rx)} ${round2(pt.y)} Z`;
      dots.push({ index: i, cx: round2(pt.x), cy: round2(pt.y), rx, ry, svgPath });
      svgParts.push(svgPath);
    }

    return {
      kind: "thought",
      effectiveJoints,
      spinePolyline: smoothSpine,
      polygonVertices: [],
      polygonPoints: [],
      thoughtDots: dots,
      svgPathData: svgParts.join(" "),
    };
  }

  const isAngular = input.kind === "radio" || input.kind === "lightning";
  const spine: BalloonPoint2D[] = [];
  if (isAngular) {
    const zigAmp = clamp(input.zigzagAmplitudePx ?? 6, 0, 28);
    if (effectiveJoints.length === 0) {
      // 관절 미지정 시 전파/번개 특유의 기본 2단 지그재그 절곡점을 생성한다.
      const dx = input.tip.x - input.root.x;
      const dy = input.tip.y - input.root.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      spine.push(
        input.root,
        { x: input.root.x + dx * 0.38 + nx * zigAmp, y: input.root.y + dy * 0.38 + ny * zigAmp },
        { x: input.root.x + dx * 0.64 - nx * zigAmp, y: input.root.y + dy * 0.64 - ny * zigAmp },
        input.tip,
      );
    } else {
      spine.push(...rawNodes);
    }
  } else {
    spine.push(...subdividePolyline(rawNodes, 6));
  }

  const leftSide: BalloonPoint2D[] = [];
  const rightSide: BalloonPoint2D[] = [];
  const m = spine.length;

  for (let i = 0; i < m - 1; i += 1) {
    const t = i / Math.max(1, m - 1);
    const curr = spine[i]!;
    const prev = spine[Math.max(0, i - 1)]!;
    const next = spine[Math.min(m - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const nx = -ty / tLen;
    const ny = tx / tLen;
    const taperFactor = isAngular ? (1 - t) ** 0.85 : (1 - t) ** 1.15;
    const halfW = baseWidth * 0.5 * taperFactor;

    leftSide.push({ x: round2(curr.x + nx * halfW), y: round2(curr.y + ny * halfW) });
    rightSide.push({ x: round2(curr.x - nx * halfW), y: round2(curr.y - ny * halfW) });
  }

  const tipPt = { x: round2(input.tip.x), y: round2(input.tip.y) };
  const polygonVertices: BalloonPoint2D[] = [...leftSide, tipPt, ...rightSide.reverse()];
  const polygonPoints: number[] = [];
  const pathParts: string[] = [];
  for (let i = 0; i < polygonVertices.length; i += 1) {
    const v = polygonVertices[i]!;
    polygonPoints.push(v.x, v.y);
    pathParts.push(i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`);
  }
  pathParts.push("Z");

  return {
    kind: input.kind,
    effectiveJoints,
    spinePolyline: spine,
    polygonVertices,
    polygonPoints,
    thoughtDots: [],
    svgPathData: pathParts.join(" "),
  };
}
