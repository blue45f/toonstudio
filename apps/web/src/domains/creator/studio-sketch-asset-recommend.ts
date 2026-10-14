/**
 * 스케치 → 소재 추천 (STT 흡수) — 순수 코어.
 *
 * 낙서 스트로크의 기하 특징(닫힘·모서리·곡률·대칭·반경 변동·종횡비)을
 * 추출해 모양 가설을 세우고, 통합 소재 카탈로그(StudioUnifiedAssetItem)를
 * 그 가설과 대조해 닮은 소재를 순위와 "왜 닮았는지" 이유와 함께 돌려준다.
 * 텍스트 검색이 닿지 못하는 "머릿속 모양"을 그어서 찾는 동선이 목적이다.
 *
 * 전부 순수 함수다: 같은 스트로크·카탈로그는 언제나 같은 결과를 낸다
 * (난수·시각 없음). 좌표계는 호출부 자유(캔버스 px 등) — 특징은
 * 바운딩 박스 대각선으로 정규화해 스케일에 흔들리지 않는다.
 *
 * 빈 결과는 실패가 아니라 안내 대상이다: 상태(empty/too-small/no-match)와
 * 함께 `buildStudioSketchSearchGuidance`가 다음 행동(더 크게 그리기,
 * 닫힌 모양으로 그리기, 모양 이름으로 텍스트 검색 전환)을 돌려준다.
 */
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export interface StudioSketchPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioSketchStroke {
  readonly points: readonly StudioSketchPoint[];
}

export type StudioSketchShapeKind =
  | "circle"
  | "ellipse"
  | "rectangle"
  | "triangle"
  | "diamond"
  | "star"
  | "heart"
  | "line"
  | "blob"
  | "open-curve"
  | "scribble";

export interface StudioSketchShapeHypothesis {
  readonly kind: StudioSketchShapeKind;
  /** 한국어 모양 이름 (안내·텍스트 검색 폴백 쿼리로 그대로 쓴다). */
  readonly label: string;
  /** 0..1 — 기하 증거가 강할수록 높다. */
  readonly confidence: number;
}

export interface StudioSketchBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioSketchFeatures {
  readonly strokeCount: number;
  readonly pointCount: number;
  readonly bounds: StudioSketchBounds | null;
  /** width / height. 빈 스케치는 1. */
  readonly aspectRatio: number;
  /** 전체 획 길이 / 바운딩 박스 대각선. 스케일 불변 복잡도 지표. */
  readonly normalizedLength: number;
  /** 길이 가중 닫힌 획 비율 0..1. */
  readonly closedRatio: number;
  readonly isClosed: boolean;
  /** 날카로운 방향 전환(≥55°) 개수 — 다각형 모서리 수의 근사. */
  readonly cornerCount: number;
  /**
   * 대표 닫힌 획의 모서리 중 바운딩 박스 변의 중점 근처에 있는 비율 0..1.
   * 마름모는 1에 가깝고 축 정렬 사각형은 0에 가깝다. 모서리가 없으면 0.
   */
  readonly midpointVertexRatio: number;
  /** 완만한 방향 전환(15°~55°) 구간의 비율 0..1. */
  readonly curveRatio: number;
  /** 중심점 기준 반경의 변동계수. 원≈0, 별은 크다. 닫힌 획이 없으면 null. */
  readonly radialCv: number | null;
  /** 반경 극대점 수. 별의 뾰족 수·하트 볼록 수의 근사. */
  readonly radialPeaks: number;
  /**
   * 위쪽 오목 비율: 위 중앙 최소 반경 / 위 측면 최대 반경.
   * 하트의 노치는 0.42 이하, 타원은 0.5 안팎. 닫힌 획이 없으면 null.
   */
  readonly notchRatio: number | null;
  /** 0..1, 1 = 완전 좌우 대칭. */
  readonly horizontalSymmetry: number;
  /** 0..1, 1 = 완전 상하 대칭. */
  readonly verticalSymmetry: number;
  readonly dominantDirection: "horizontal" | "vertical" | "diagonal" | "mixed";
  /** 신뢰도 내림차순 모양 가설. 판정할 증거가 없으면 비어 있다. */
  readonly hypotheses: readonly StudioSketchShapeHypothesis[];
}

export const STUDIO_SKETCH_SHAPE_LABELS: Readonly<
  Record<StudioSketchShapeKind, string>
> = Object.freeze({
  circle: "원",
  ellipse: "타원",
  rectangle: "사각형",
  triangle: "삼각형",
  diamond: "마름모",
  star: "별",
  heart: "하트",
  line: "선",
  blob: "닫힌 모양",
  "open-curve": "곡선",
  scribble: "자유 낙서",
});

// ---------------------------------------------------------------------------
// 기하 유틸
// ---------------------------------------------------------------------------

function distance(a: StudioSketchPoint, b: StudioSketchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function strokeLength(points: readonly StudioSketchPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1]!, points[i]!);
  }
  return total;
}

/** 유한 좌표만 남기고, 사실상 같은 점이 연속되면 하나로 접는다. */
function cleanPoints(
  points: readonly StudioSketchPoint[],
): StudioSketchPoint[] {
  const out: StudioSketchPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const last = out[out.length - 1];
    if (last && distance(last, point) < 1e-9) continue;
    out.push({ x: point.x, y: point.y });
  }
  return out;
}

/** 호 길이 기준 등간격 재표본. 점 밀도가 달라도 각도 분석이 흔들리지 않는다. */
function resample(
  points: readonly StudioSketchPoint[],
  count: number,
): StudioSketchPoint[] {
  if (points.length === 0) return [];
  if (points.length === 1 || count <= 1) return [points[0]!];
  const total = strokeLength(points);
  if (total <= 0) return [points[0]!];
  const step = total / count;
  const out: StudioSketchPoint[] = [points[0]!];
  let walked = 0;
  let nextAt = step;
  for (let i = 1; i < points.length && out.length < count; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const seg = distance(prev, curr);
    while (seg > 0 && walked + seg >= nextAt && out.length < count) {
      const t = (nextAt - walked) / seg;
      out.push({
        x: prev.x + (curr.x - prev.x) * t,
        y: prev.y + (curr.y - prev.y) * t,
      });
      nextAt += step;
    }
    walked += seg;
  }
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** 두 벡터 사이 각도(도). 벡터가 퇴화하면 0. */
function turnDegrees(
  a: StudioSketchPoint,
  b: StudioSketchPoint,
  c: StudioSketchPoint,
): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 <= 0 || m2 <= 0) return 0;
  const cos = Math.min(
    1,
    Math.max(-1, (v1x * v2x + v1y * v2y) / (m1 * m2)),
  );
  return (Math.acos(cos) * 180) / Math.PI;
}

interface StrokeAnalysis {
  readonly points: readonly StudioSketchPoint[];
  readonly length: number;
  readonly closed: boolean;
  readonly corners: number;
  readonly cornerPoints: readonly StudioSketchPoint[];
  readonly gentleTurns: number;
  readonly sampledTurns: number;
}

/** 점과 선분의 거리 (RDP 단순화용). */
function pointSegmentDistance(
  point: StudioSketchPoint,
  a: StudioSketchPoint,
  b: StudioSketchPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) return distance(point, a);
  const t = Math.min(1, Math.max(0,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** Ramer–Douglas–Peucker 단순화. 손떨림을 걷어내고 의도한 꼭짓점만 남긴다. */
function simplifyRdp(
  points: readonly StudioSketchPoint[],
  epsilon: number,
): StudioSketchPoint[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let maxIndex = 0;
  for (let i = 1; i + 1 < points.length; i += 1) {
    const d = pointSegmentDistance(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = simplifyRdp(points.slice(0, maxIndex + 1), epsilon);
  const right = simplifyRdp(points.slice(maxIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

/**
 * 획의 꼭짓점 열. 닫힌 획은 시작점에서 가장 먼 점을 기준으로 두 사슬로
 * 나눠 단순화한다 (시작=끝인 퇴화 구간에서 RDP가 무너지는 것을 피하고,
 * 이음새에 있는 모서리도 꼭짓점으로 잡기 위해서다).
 */
function strokeVertices(
  points: readonly StudioSketchPoint[],
  closed: boolean,
  epsilon: number,
): StudioSketchPoint[] {
  if (!closed || points.length < 4) return simplifyRdp(points, epsilon);
  const ring = distance(points[0]!, points[points.length - 1]!) <= epsilon
    ? points.slice(0, -1)
    : points;
  // 꼭짓점이 이미 4개 이하면 그 자체가 단순화 결과다 (RDP 퇴화 방지).
  if (ring.length <= 4) return [...ring];
  let farIndex = 0;
  let farDist = 0;
  ring.forEach((point, index) => {
    const d = distance(point, ring[0]!);
    if (d > farDist) {
      farDist = d;
      farIndex = index;
    }
  });
  if (farIndex === 0) return simplifyRdp(points, epsilon);
  const chainA = ring.slice(0, farIndex + 1);
  const chainB = [...ring.slice(farIndex), ring[0]!];
  const simpleA = simplifyRdp(chainA, epsilon);
  const simpleB = simplifyRdp(chainB, epsilon);
  return [...simpleA, ...simpleB.slice(1, -1)];
}

function analyzeStroke(raw: readonly StudioSketchPoint[]): StrokeAnalysis | null {
  const points = cleanPoints(raw);
  if (points.length === 0) return null;
  const length = strokeLength(points);
  const endGap = points.length > 1
    ? distance(points[0]!, points[points.length - 1]!)
    : 0;
  const closed = length > 0 && endGap <= length * 0.18;
  // 곡률(완만한 회전 비율)은 거친 재표본(32)으로 읽는다.
  const sampled = resample(points, 32);
  let gentleTurns = 0;
  let sampledTurns = 0;
  for (let i = 1; i + 1 < sampled.length; i += 1) {
    const turn = turnDegrees(sampled[i - 1]!, sampled[i]!, sampled[i + 1]!);
    sampledTurns += 1;
    if (turn >= 12 && turn < 55) gentleTurns += 1;
  }
  // 모서리는 단순화 꼭짓점의 방향 전환(≥50°)으로 센다 — 재표본 간격에
  // 꼭짓점이 묻혀 각도가 희석되는 문제를 피한다.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  const epsilon = Math.hypot(maxX - minX, maxY - minY) * 0.025;
  const vertices = strokeVertices(points, closed, Math.max(epsilon, 1e-6));
  const cornerPoints: StudioSketchPoint[] = [];
  const vCount = vertices.length;
  const from = closed ? 0 : 1;
  const to = closed ? vCount - 1 : vCount - 2;
  for (let i = from; i <= to; i += 1) {
    const prev = vertices[(i - 1 + vCount) % vCount]!;
    const curr = vertices[i % vCount]!;
    const next = vertices[(i + 1) % vCount]!;
    if (turnDegrees(prev, curr, next) >= 50) cornerPoints.push(curr);
  }
  return {
    points,
    length,
    closed,
    corners: cornerPoints.length,
    cornerPoints,
    gentleTurns,
    sampledTurns,
  };
}

/** 대표 닫힌 획의 모서리가 변 중점에 몰려 있는지 (마름모 판정 보조). */
function midpointVertexRatio(
  strokes: readonly StrokeAnalysis[],
  bounds: StudioSketchBounds | null,
): number {
  if (!bounds) return 0;
  const dominant = strokes
    .filter((stroke) => stroke.closed && stroke.cornerPoints.length > 0)
    .sort((a, b) => b.length - a.length)[0];
  if (!dominant) return 0;
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal <= 0) return 0;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const midpoints = [
    { x: cx, y: bounds.minY },
    { x: cx, y: bounds.maxY },
    { x: bounds.minX, y: cy },
    { x: bounds.maxX, y: cy },
  ];
  const near = dominant.cornerPoints.filter((point) =>
    midpoints.some((mid) => distance(point, mid) <= diagonal * 0.14));
  return near.length / dominant.cornerPoints.length;
}

/** 닫힌 획들의 반경 통계. 가장 긴 닫힌 획 하나를 모양의 대표로 삼는다. */
function radialStats(
  strokes: readonly StrokeAnalysis[],
): { cv: number; peaks: number; notchRatio: number | null } | null {
  const closed = strokes
    .filter((stroke) => stroke.closed && stroke.points.length >= 4)
    .sort((a, b) => b.length - a.length)[0];
  if (!closed) return null;
  const sampled = resample(closed.points, 72);
  const cx = sampled.reduce((sum, p) => sum + p.x, 0) / sampled.length;
  const cy = sampled.reduce((sum, p) => sum + p.y, 0) / sampled.length;
  const radii = sampled.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  if (mean <= 0) return null;
  const variance =
    radii.reduce((sum, r) => sum + (r - mean) * (r - mean), 0) / radii.length;
  const cv = Math.sqrt(variance) / mean;
  let peaks = 0;
  for (let i = 0; i < radii.length; i += 1) {
    const prev = radii[(i - 1 + radii.length) % radii.length]!;
    const curr = radii[i]!;
    const next = radii[(i + 1) % radii.length]!;
    if (curr >= prev && curr > next && curr > mean * 1.06) peaks += 1;
  }
  // 하트의 위쪽 오목(노치) 판정: 위 중앙 구역의 최소 반경이 위 측면
  // 구역의 최대 반경보다 확연히 작으면 오목이 있는 것이다. 타원은
  // 위 중앙이 최소여도 측면과 비율이 완만해(≥0.7) 여기서 갈린다.
  let topMin = Number.POSITIVE_INFINITY;
  let sideMax = 0;
  sampled.forEach((point, index) => {
    const deg = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI;
    const r = radii[index]!;
    if (deg >= -120 && deg <= -60) topMin = Math.min(topMin, r);
    if ((deg >= -160 && deg < -120) || (deg > -60 && deg <= -20)) {
      sideMax = Math.max(sideMax, r);
    }
  });
  const notchRatio = Number.isFinite(topMin) && sideMax > 0
    ? topMin / sideMax
    : null;
  return { cv, peaks, notchRatio };
}

/** 축 대칭 점수: 점을 축으로 접어 최근접 짝과의 평균 거리를 정규화한다. */
function symmetryScore(
  points: readonly StudioSketchPoint[],
  axis: "x" | "y",
  center: number,
  diagonal: number,
): number {
  if (points.length < 4 || diagonal <= 0) return 0;
  const sampled = resample(points, 48);
  let total = 0;
  for (const point of sampled) {
    const mirrored = axis === "x"
      ? { x: center * 2 - point.x, y: point.y }
      : { x: point.x, y: center * 2 - point.y };
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of sampled) {
      const d = distance(mirrored, candidate);
      if (d < best) best = d;
    }
    total += best;
  }
  const mean = total / sampled.length;
  return Math.min(1, Math.max(0, 1 - (mean / diagonal) * 2.4));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ---------------------------------------------------------------------------
// 특징 추출 + 모양 분류
// ---------------------------------------------------------------------------

function classify(features: Omit<StudioSketchFeatures, "hypotheses">): StudioSketchShapeHypothesis[] {
  const hypotheses: StudioSketchShapeHypothesis[] = [];
  const push = (kind: StudioSketchShapeKind, confidence: number) => {
    if (confidence > 0.05) {
      hypotheses.push({
        kind,
        label: STUDIO_SKETCH_SHAPE_LABELS[kind],
        confidence: Math.round(clamp01(confidence) * 1000) / 1000,
      });
    }
  };
  const { aspectRatio, cornerCount, curveRatio, radialCv, radialPeaks } = features;
  const nearSquare = aspectRatio >= 0.78 && aspectRatio <= 1.28;

  if (features.strokeCount >= 3 || features.normalizedLength > 7) {
    push("scribble", 0.72);
  }

  if (features.isClosed) {
    const cv = radialCv ?? 0.3;
    if (radialPeaks >= 4 && cv >= 0.2) {
      push("star", 0.55 + Math.min(0.35, (radialPeaks - 4) * 0.06 + cv * 0.3));
    }
    if (
      cornerCount <= 2 && cv <= 0.13 && nearSquare
    ) {
      push("circle", 0.62 + (0.13 - cv) * 1.6 + (features.horizontalSymmetry + features.verticalSymmetry) * 0.06);
    } else if (cornerCount <= 2 && cv <= 0.4 && !nearSquare) {
      push("ellipse", 0.55 + Math.max(0, 0.3 - cv) * 0.5);
    }
    if (cornerCount >= 3 && cornerCount <= 5) {
      if (cornerCount === 3) {
        push("triangle", 0.66 + features.horizontalSymmetry * 0.12);
      } else if (cornerCount === 4) {
        // 마름모는 꼭짓점이 변 중점에 온 사각형 — 모서리 위치로 가른다.
        if (features.midpointVertexRatio >= 0.5) {
          push("diamond", 0.64 + features.midpointVertexRatio * 0.12);
          push("rectangle", 0.4);
        } else {
          push("rectangle", 0.6 + (features.horizontalSymmetry + features.verticalSymmetry) * 0.08);
          if (nearSquare && cv >= 0.14) push("diamond", 0.42);
        }
      } else {
        push("rectangle", 0.4);
      }
    }
    if (
      features.notchRatio !== null && features.notchRatio <= 0.42
      && radialPeaks >= 2 && radialPeaks <= 3
      && features.verticalSymmetry >= 0.5
      && cv >= 0.14 && cv <= 0.5 && cornerCount <= 3
    ) {
      push("heart", 0.52 + features.verticalSymmetry * 0.18 + (0.42 - features.notchRatio) * 0.3);
    }
    if (hypotheses.length === 0 || hypotheses[0]!.confidence < 0.45) {
      push("blob", Math.max(0.42, 0.6 - curveRatio * 0.1));
    }
  } else if (features.strokeCount >= 1 && features.pointCount >= 3) {
    const thin = features.bounds
      ? Math.min(features.bounds.width, features.bounds.height)
        / Math.max(1e-9, Math.max(features.bounds.width, features.bounds.height))
      : 1;
    if (cornerCount <= 1 && curveRatio <= 0.25 && thin <= 0.3) {
      push("line", 0.68);
    } else if (curveRatio > 0.2) {
      push("open-curve", 0.5 + curveRatio * 0.25);
    } else {
      push("line", 0.4);
    }
  }

  return hypotheses.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

export function extractStudioSketchFeatures(
  strokes: readonly StudioSketchStroke[],
): StudioSketchFeatures {
  const analyses = strokes
    .map((stroke) => analyzeStroke(stroke.points))
    .filter((entry): entry is StrokeAnalysis => entry !== null);
  const allPoints = analyses.flatMap((stroke) => [...stroke.points]);
  const pointCount = allPoints.length;
  const totalLength = analyses.reduce((sum, s) => sum + s.length, 0);
  const closedLength = analyses
    .filter((s) => s.closed)
    .reduce((sum, s) => sum + s.length, 0);
  const closedRatio = totalLength > 0 ? closedLength / totalLength : 0;

  let bounds: StudioSketchBounds | null = null;
  if (allPoints.length > 0) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of allPoints) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
    bounds = {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  const diagonal = bounds ? Math.hypot(bounds.width, bounds.height) : 0;
  const radial = radialStats(analyses);
  const pooled = analyses.length === 1
    ? [...analyses[0]!.points]
    : allPoints;
  const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const centerY = bounds ? (bounds.minY + bounds.maxY) / 2 : 0;

  const base: Omit<StudioSketchFeatures, "hypotheses"> = {
    strokeCount: analyses.length,
    pointCount,
    bounds,
    aspectRatio: bounds && bounds.height > 1e-9
      ? bounds.width / bounds.height
      : 1,
    normalizedLength: diagonal > 0 ? totalLength / diagonal : 0,
    closedRatio,
    isClosed: closedRatio >= 0.6,
    cornerCount: analyses.reduce((sum, s) => sum + s.corners, 0),
    midpointVertexRatio: midpointVertexRatio(analyses, bounds),
    curveRatio: (() => {
      const turns = analyses.reduce((sum, s) => sum + s.sampledTurns, 0);
      const gentle = analyses.reduce((sum, s) => sum + s.gentleTurns, 0);
      return turns > 0 ? gentle / turns : 0;
    })(),
    radialCv: radial ? Math.round(radial.cv * 1000) / 1000 : null,
    radialPeaks: radial ? radial.peaks : 0,
    notchRatio: radial && radial.notchRatio !== null
      ? Math.round(radial.notchRatio * 1000) / 1000
      : null,
    horizontalSymmetry: bounds
      ? symmetryScore(pooled, "x", centerX, diagonal)
      : 0,
    verticalSymmetry: bounds
      ? symmetryScore(pooled, "y", centerY, diagonal)
      : 0,
    dominantDirection: (() => {
      if (!bounds) return "mixed";
      const { width, height } = bounds;
      if (height <= width * 0.35) return "horizontal";
      if (width <= height * 0.35) return "vertical";
      if (analyses.length === 1 && analyses[0]!.points.length >= 2) {
        const pts = analyses[0]!.points;
        const dx = Math.abs(pts[pts.length - 1]!.x - pts[0]!.x);
        const dy = Math.abs(pts[pts.length - 1]!.y - pts[0]!.y);
        if (dx > 0 && dy > 0 && Math.min(dx, dy) / Math.max(dx, dy) >= 0.45) {
          return "diagonal";
        }
      }
      return "mixed";
    })(),
  };
  return { ...base, hypotheses: classify(base) };
}

/** 패널·접근성 문구용 한 줄 요약. 증거가 없으면 빈 문자열. */
export function describeStudioSketchFeatures(
  features: StudioSketchFeatures,
): string {
  const primary = features.hypotheses[0];
  if (!primary) return "";
  const parts = [
    features.isClosed ? "닫힌 모양" : "열린 획",
    features.cornerCount > 0 ? `모서리 ${features.cornerCount}개` : null,
    `${primary.label}에 가까워요`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** SVG path 문자열 (패널 미리보기 렌더 공용). */
export function studioSketchStrokePath(
  points: readonly StudioSketchPoint[],
): string {
  const cleaned = cleanPoints(points);
  if (cleaned.length === 0) return "";
  return cleaned
    .map((point, index) =>
      `${index === 0 ? "M" : "L"}${round2(point.x)},${round2(point.y)}`)
    .join(" ");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// 카탈로그 대조·추천
// ---------------------------------------------------------------------------

/** 모양 가설 → 카탈로그 텍스트에서 찾을 동의어 집합 (한국어·영어). */
export const STUDIO_SKETCH_SHAPE_LEXICON: Readonly<
  Record<StudioSketchShapeKind, readonly string[]>
> = Object.freeze({
  // 주의: 한 글자 부분 문자열("구")은 "구름" 같은 무관한 단어에 걸려 뺐다.
  circle: ["원", "동그라미", "원형", "circle", "ring", "링", "고리", "ball"],
  ellipse: ["타원", "ellipse", "oval", "알약", "pill", "capsule"],
  rectangle: [
    "사각", "네모", "직사각", "정사각", "rect", "box", "상자",
    "프레임", "frame", "창", "window", "문", "door", "책", "book",
    "티켓", "ticket", "카드", "card", "폴라로이드", "액자",
  ],
  triangle: ["삼각", "triangle", "산", "mountain", "지붕", "roof", "깃발", "flag"],
  diamond: ["마름모", "다이아", "diamond", "보석", "gem", "rhombus"],
  star: ["별", "star", "반짝", "sparkle", "별점"],
  heart: ["하트", "heart", "사랑", "love"],
  line: ["선", "라인", "line", "구분선", "밑줄", "화살표", "arrow", "꺾쇠"],
  blob: ["모양", "도형", "shape", "스티커", "장식", "decor"],
  "open-curve": ["곡선", "물결", "wave", "언덕", "hill", "구름", "cloud", "무지개", "rainbow"],
  scribble: ["낙서", "자유", "손그림", "doodle", "스케치"],
});

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function itemHaystack(item: StudioUnifiedAssetItem): string {
  return normalizeText([
    item.id,
    item.title,
    item.description,
    item.categoryLabel,
    ...item.keywords,
    ...item.badges,
  ].join(" "));
}

/**
 * 아이템이 어떤 모양을 담고 있는지 추정한다.
 * 요소(element) 소스는 카탈로그 카테고리·id 접두가 정본 신호이고,
 * 그 외 소스는 키워서·제목의 모양 단어로 판정한다.
 */
export function studioSketchShapeKindsOfItem(
  item: StudioUnifiedAssetItem,
): ReadonlySet<StudioSketchShapeKind> {
  const kinds = new Set<StudioSketchShapeKind>();
  const haystack = itemHaystack(item);
  for (const kind of Object.keys(STUDIO_SKETCH_SHAPE_LEXICON) as StudioSketchShapeKind[]) {
    const terms = STUDIO_SKETCH_SHAPE_LEXICON[kind];
    if (terms.some((term) => haystack.includes(normalizeText(term)))) {
      kinds.add(kind);
    }
  }
  if (item.source.kind === "element") {
    const category = item.source.value.category;
    if (category === "shape") {
      // 도형 요소는 세부 id가 가설과 직접 닿지 않아도 blob 가설과는 닿는다.
      kinds.add("blob");
    }
    if (category === "frame") kinds.add("rectangle");
    if (category === "arrow") kinds.add("line");
    if (category === "line") kinds.add("line");
    if (category === "bubble") kinds.add("blob");
  }
  if (item.category === "scene") kinds.add("rectangle");
  return kinds;
}

/** 아이템 자체의 종횡비 (알 수 있는 소스만). 없으면 null. */
function itemAspectRatio(item: StudioUnifiedAssetItem): number | null {
  const source = item.source;
  if (source.kind === "element") {
    return source.value.height > 0
      ? source.value.width / source.value.height
      : null;
  }
  if (source.kind === "background") {
    return source.value.width && source.value.height
      ? source.value.width / source.value.height
      : null;
  }
  if (source.kind === "local") {
    return source.value.height > 0
      ? source.value.width / source.value.height
      : null;
  }
  if (source.kind === "builtin-raster") {
    return source.value.height > 0
      ? source.value.width / source.value.height
      : null;
  }
  return null;
}

export interface StudioSketchAssetRecommendation {
  readonly item: StudioUnifiedAssetItem;
  /** 0..1 종합 점수. */
  readonly score: number;
  /** 가장 강하게 닿은 모양 가설. */
  readonly matchedShape: StudioSketchShapeHypothesis;
  /** 한국어 이유 문구 (최대 3개, 점수 기여 순). */
  readonly reasons: readonly string[];
}

export type StudioSketchRecommendStatus =
  | "empty"
  | "too-small"
  | "ok"
  | "no-match";

export interface StudioSketchRecommendResult {
  readonly status: StudioSketchRecommendStatus;
  readonly features: StudioSketchFeatures;
  readonly recommendations: readonly StudioSketchAssetRecommendation[];
}

export interface RecommendStudioAssetsForSketchInput {
  readonly strokes?: readonly StudioSketchStroke[];
  /** strokes 대신 이미 추출한 특징을 직접 줄 수도 있다. */
  readonly features?: StudioSketchFeatures;
  readonly catalog: readonly StudioUnifiedAssetItem[];
  readonly limit?: number;
  /** 이 점수 미만은 추천에서 제외한다 (기본 0.28). */
  readonly minScore?: number;
}

const HYPOTHESIS_RANK_WEIGHTS = [1, 0.55, 0.3] as const;

export function recommendStudioAssetsForSketch(
  input: RecommendStudioAssetsForSketchInput,
): StudioSketchRecommendResult {
  const features = input.features
    ?? extractStudioSketchFeatures(input.strokes ?? []);
  const limit = Math.max(1, Math.min(24, Math.floor(input.limit ?? 8)));
  const minScore = input.minScore ?? 0.28;

  if (features.strokeCount === 0 || features.pointCount === 0) {
    return { status: "empty", features, recommendations: [] };
  }
  if (features.pointCount < 3 || features.normalizedLength < 0.3) {
    return { status: "too-small", features, recommendations: [] };
  }
  const primary = features.hypotheses[0];
  if (!primary) {
    return { status: "no-match", features, recommendations: [] };
  }

  const scored: StudioSketchAssetRecommendation[] = [];
  for (const item of input.catalog) {
    const kinds = studioSketchShapeKindsOfItem(item);
    let shapeScore = 0;
    let matched: StudioSketchShapeHypothesis | null = null;
    for (let rank = 0; rank < features.hypotheses.length; rank += 1) {
      const hypothesis = features.hypotheses[rank]!;
      if (!kinds.has(hypothesis.kind)) continue;
      const contribution = 0.62
        * (HYPOTHESIS_RANK_WEIGHTS[rank] ?? 0.2)
        * (0.45 + hypothesis.confidence * 0.55);
      if (contribution > 0) {
        shapeScore += contribution;
        if (matched === null) matched = hypothesis;
      }
    }
    if (!matched) continue;

    const reasons: string[] = [
      `그린 ${matched.label} 모양과 닮았어요`,
    ];
    let score = shapeScore;
    // 제목 자체가 모양 이름이면 동점에서 이긴다 ("원" vs "구름"의 원 매치 등).
    if (normalizeText(item.title) === normalizeText(matched.label)) {
      score += 0.06;
    }

    const itemAspect = itemAspectRatio(item);
    if (itemAspect !== null && features.bounds) {
      const diff = Math.abs(
        Math.log(Math.max(1e-6, itemAspect) / Math.max(1e-6, features.aspectRatio)),
      );
      const aspectBonus = Math.max(0, 0.12 - diff * 0.1);
      if (aspectBonus > 0) {
        score += aspectBonus;
        if (aspectBonus >= 0.07) reasons.push("가로·세로 비율이 비슷해요");
      }
    }
    if (features.isClosed && item.category === "element") {
      score += 0.03;
      reasons.push("닫힌 도형이라 크기를 바꿔 쓰기 좋아요");
    }
    if (item.discoverability === "featured") score += 0.04;
    if (item.discoverability === "caution") score -= 0.05;
    score += Math.min(1000, Math.max(0, item.sortPriority)) / 1000 * 0.02;
    score = Math.round(clamp01(score) * 1000) / 1000;
    if (score < minScore) continue;
    scored.push({
      item,
      score,
      matchedShape: matched,
      reasons: Object.freeze(reasons.slice(0, 3)),
    });
  }

  scored.sort((a, b) =>
    b.score - a.score
    || b.item.sortPriority - a.item.sortPriority
    || a.item.title.localeCompare(b.item.title, "ko"));
  const recommendations = Object.freeze(scored.slice(0, limit));
  return {
    status: recommendations.length > 0 ? "ok" : "no-match",
    features,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// 빈 결과 안내
// ---------------------------------------------------------------------------

export interface StudioSketchSearchGuidance {
  readonly headline: string;
  readonly tips: readonly string[];
  /** 텍스트 검색으로 전환할 때 쓸 쿼리. 모양 가설이 있을 때만 있다. */
  readonly fallbackQuery: string | null;
}

/** 받침 유무에 따라 "과/와"를 고른다 (원→과, 하트→와). */
function withGwaParticle(label: string): string {
  const last = label[label.length - 1];
  if (!last) return `${label}와`;
  const code = last.charCodeAt(0);
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${label}${hasFinal ? "과" : "와"}`;
}

export function buildStudioSketchSearchGuidance(
  result: StudioSketchRecommendResult,
): StudioSketchSearchGuidance {
  const primary = result.features.hypotheses[0];
  switch (result.status) {
    case "empty":
      return {
        headline: "그리고 싶은 모양을 그어 보세요",
        tips: [
          "원·사각형·별처럼 한 획으로 크게 그리면 더 잘 찾아요.",
          "텍스트로 찾기 어렵던 모양도 스케치로 찾을 수 있어요.",
        ],
        fallbackQuery: null,
      };
    case "too-small":
      return {
        headline: "조금 더 크게 그어 주세요",
        tips: [
          "획이 너무 짧으면 모양을 판정할 수 없어요.",
          "패드 가운데에 크게, 한 획으로 이어 그어 보세요.",
        ],
        fallbackQuery: null,
      };
    case "no-match":
      return {
        headline: "닮은 소재를 찾지 못했어요",
        tips: [
          "시작점과 끝점을 이어 닫힌 모양으로 그어 보세요.",
          "획을 나눠 그렸다면 한 획으로 이어 그어 보세요.",
          primary
            ? `모양 이름 “${primary.label}”로 텍스트 검색도 해 보세요.`
            : "모양 이름으로 텍스트 검색도 해 보세요.",
        ],
        fallbackQuery: primary ? primary.label : null,
      };
    case "ok":
      return {
        headline: primary
          ? `${withGwaParticle(primary.label)} 닮은 소재예요`
          : "닮은 소재예요",
        tips: [],
        fallbackQuery: primary ? primary.label : null,
      };
  }
}
