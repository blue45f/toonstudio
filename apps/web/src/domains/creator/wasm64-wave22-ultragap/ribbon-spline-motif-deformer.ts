/**
 * Wasm64 Wave 22 Ultragap — 5점 가우스-르장드르 호길이 곡률 안전(`r·κ < 1`) 리본·체인·레이스 브러시 변형기.
 *
 * - 임의의 3차 베지어 스플라인 열에 대해 5점 가우스-르장드르 구적 누적 호길이 테이블과
 *   뉴턴-랩슨 역매핑으로 사슬·땋은 끈·레이스 프릴·지퍼 이빨 장식 모티프를 등속 배치한다.
 * - 변곡점에서도 뒤집히지 않는 평행 이동 연속 법선과 안쪽 오목면 `C^2` 포화 클램핑(`r·κ < 1`)으로
 *   급격한 헤어핀 커브 자가 교차를 원천 방지하고 필압·원근 깊이 테이퍼를 반영한다.
 */

const GL5_NODES = [-0.906179845938664, -0.5384693101056831, 0, 0.5384693101056831, 0.906179845938664] as const;
const GL5_WEIGHTS = [0.23692688505618908, 0.47862867049936647, 0.5688888888888889, 0.47862867049936647, 0.23692688505618908] as const;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export type RibbonMotifKind = "chain" | "braid" | "lace" | "zipper";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface CubicRibbonSplineSegment {
  readonly p0: Point2D;
  readonly p1: Point2D;
  readonly p2: Point2D;
  readonly p3: Point2D;
  readonly pressureStart?: number;
  readonly pressureEnd?: number;
  readonly perspectiveScaleStart?: number;
  readonly perspectiveScaleEnd?: number;
}

export interface ArcLengthSampleEntry {
  readonly segmentIndex: number;
  readonly localT: number;
  readonly cumulativeArcLength: number;
}

export interface GaussLegendreArcLengthTable {
  readonly segments: readonly CubicRibbonSplineSegment[];
  readonly subdivisionsPerSegment: number;
  readonly entries: readonly ArcLengthSampleEntry[];
  readonly totalArcLength: number;
}

export interface SplineDifferentialFrame2D {
  readonly segmentIndex: number;
  readonly localT: number;
  readonly arcLength: number;
  readonly position: Point2D;
  readonly tangent: Point2D;
  /** 방향 연속성이 보장되는 평행 이동 2D 단위 법선(`(-tangent.y, tangent.x)`). */
  readonly normal: Point2D;
  /** 부호 있는 곡률 `κ(s)` (`+`는 `+normal` 방향 굽힘, `-`는 `-normal` 방향 굽힘). */
  readonly signedCurvature: number;
  readonly pressure: number;
  readonly perspectiveScale: number;
}

export interface RibbonMotifVertex {
  /** 모티프 타일 진행 방향 정규화 좌표 (`[0, 1]`). */
  readonly u: number;
  /** 중심선 대비 횡방향 정규화 오프셋 (`[-1, 1]`). */
  readonly v: number;
  readonly role: "spine" | "inner-detail" | "edge";
}

export interface RibbonMotifTemplate {
  readonly kind: RibbonMotifKind | "custom";
  readonly labelKo: string;
  readonly nominalTileLengthPx: number;
  readonly vertices: readonly RibbonMotifVertex[];
  readonly triangleIndices: readonly number[];
}

export interface DeformedRibbonVertex {
  readonly x: number;
  readonly y: number;
  readonly arcLength: number;
  readonly motifIndex: number;
  readonly u: number;
  readonly v: number;
  readonly signedCurvature: number;
  readonly effectiveOffsetPx: number;
  /** 안쪽 오목면 자가 교차 판정값 `effectiveOffsetPx * signedCurvature` (항상 `< 1`). */
  readonly radiusCurvatureProduct: number;
  /** 국소 종방향 야코비안 스케일 `1 - effectiveOffsetPx * signedCurvature` (항상 `> 0`). */
  readonly longitudinalJacobian: number;
  readonly innerFoldClamped: boolean;
}

export interface RibbonBrushDeformInput {
  readonly segments: readonly CubicRibbonSplineSegment[];
  readonly motifKind?: RibbonMotifKind;
  readonly customTemplate?: RibbonMotifTemplate;
  readonly baseHalfWidthPx: number;
  readonly subdivisionsPerSegment?: number;
  readonly fitWholeMotifs?: boolean;
  readonly pressureGamma?: number;
  readonly minTaperRatio?: number;
  /** 안쪽 굽힘 구간에서 허용하는 최대 `r·κ` 비율 (`(0.1, 0.98)`, 기본값 `0.85 < 1`). */
  readonly maxInnerRadiusKappa?: number;
}

export interface RibbonBrushDeformResult {
  readonly motifLabelKo: string;
  readonly tileCount: number;
  readonly totalArcLengthPx: number;
  readonly vertices: readonly DeformedRibbonVertex[];
  readonly triangleIndices: readonly number[];
  readonly clampedInnerVertexCount: number;
  readonly maxObservedInnerRadiusKappa: number;
  readonly minLongitudinalJacobian: number;
  readonly serverCostKrw: 0;
}

function evalCubicPoint(seg: CubicRibbonSplineSegment, t: number): Point2D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const b0 = mt2 * mt;
  const b1 = 3 * mt2 * t;
  const b2 = 3 * mt * t2;
  const b3 = t2 * t;
  return {
    x: b0 * seg.p0.x + b1 * seg.p1.x + b2 * seg.p2.x + b3 * seg.p3.x,
    y: b0 * seg.p0.y + b1 * seg.p1.y + b2 * seg.p2.y + b3 * seg.p3.y,
  };
}

function evalCubicFirstDerivative(seg: CubicRibbonSplineSegment, t: number): Point2D {
  const mt = 1 - t;
  const c0 = 3 * mt * mt;
  const c1 = 6 * mt * t;
  const c2 = 3 * t * t;
  return {
    x: c0 * (seg.p1.x - seg.p0.x) + c1 * (seg.p2.x - seg.p1.x) + c2 * (seg.p3.x - seg.p2.x),
    y: c0 * (seg.p1.y - seg.p0.y) + c1 * (seg.p2.y - seg.p1.y) + c2 * (seg.p3.y - seg.p2.y),
  };
}

function evalCubicSecondDerivative(seg: CubicRibbonSplineSegment, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: 6 * mt * (seg.p2.x - 2 * seg.p1.x + seg.p0.x) + 6 * t * (seg.p3.x - 2 * seg.p2.x + seg.p1.x),
    y: 6 * mt * (seg.p2.y - 2 * seg.p1.y + seg.p0.y) + 6 * t * (seg.p3.y - 2 * seg.p2.y + seg.p1.y),
  };
}

function integrateCubicArcLengthGL5(seg: CubicRibbonSplineSegment, tStart: number, tEnd: number): number {
  const halfSpan = 0.5 * (tEnd - tStart);
  if (halfSpan <= 0) return 0;
  const mid = 0.5 * (tStart + tEnd);
  let sum = 0;
  for (let i = 0; i < 5; i += 1) {
    const t = mid + halfSpan * (GL5_NODES[i] ?? 0);
    const d1 = evalCubicFirstDerivative(seg, t);
    sum += (GL5_WEIGHTS[i] ?? 0) * Math.hypot(d1.x, d1.y);
  }
  return halfSpan * sum;
}

/** 3차 베지어 스플라인 열에 대해 5점 가우스-르장드르 구적 누적 호길이 테이블을 생성한다. */
export function buildGaussLegendreArcLengthTable(
  segments: readonly CubicRibbonSplineSegment[],
  subdivisionsPerSegment = 32,
): GaussLegendreArcLengthTable {
  if (segments.length === 0) {
    throw new Error("최소 1개 이상의 3차 스플라인 구간이 필요합니다.");
  }
  const subdiv = Math.max(4, Math.trunc(subdivisionsPerSegment));
  const entries: ArcLengthSampleEntry[] = [{ segmentIndex: 0, localT: 0, cumulativeArcLength: 0 }];
  let cumulative = 0;

  for (let sIdx = 0; sIdx < segments.length; sIdx += 1) {
    const seg = segments[sIdx]!;
    for (let step = 1; step <= subdiv; step += 1) {
      cumulative += integrateCubicArcLengthGL5(seg, (step - 1) / subdiv, step / subdiv);
      entries.push({ segmentIndex: sIdx, localT: step / subdiv, cumulativeArcLength: cumulative });
    }
  }

  return { segments, subdivisionsPerSegment: subdiv, entries, totalArcLength: cumulative };
}

/** 목표 호길이 `targetArcLength`에서 뉴턴-랩슨 보정을 포함한 정밀 미분 프레임을 샘플링한다. */
export function sampleSplineAtArcLength(
  table: GaussLegendreArcLengthTable,
  targetArcLength: number,
  fallbackTangent: Point2D = { x: 1, y: 0 },
): SplineDifferentialFrame2D {
  const clampedS = clamp(targetArcLength, 0, table.totalArcLength);
  const entries = table.entries;

  let lo = 0;
  let hi = entries.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if ((entries[mid]?.cumulativeArcLength ?? 0) <= clampedS) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const lower = entries[lo]!;
  const upper = entries[hi] ?? lower;
  const segIndex = upper.segmentIndex;
  const seg = table.segments[segIndex]!;

  const t0 = lower.segmentIndex === segIndex ? lower.localT : 0;
  const s0 = lower.cumulativeArcLength;
  const t1 = upper.localT;
  const spanS = Math.max(1e-9, upper.cumulativeArcLength - s0);
  let t = clamp(t0 + ((clampedS - s0) / spanS) * (t1 - t0), t0, t1);

  for (let iter = 0; iter < 3; iter += 1) {
    const currentS = s0 + integrateCubicArcLengthGL5(seg, t0, t);
    const err = currentS - clampedS;
    if (Math.abs(err) <= 1e-6) break;
    const d1 = evalCubicFirstDerivative(seg, t);
    const speed = Math.hypot(d1.x, d1.y);
    if (speed <= 1e-8) break;
    t = clamp(t - err / speed, t0, t1);
  }

  const pos = evalCubicPoint(seg, t);
  const d1 = evalCubicFirstDerivative(seg, t);
  const d2 = evalCubicSecondDerivative(seg, t);
  const speed = Math.hypot(d1.x, d1.y);

  const tangent: Point2D = speed > 1e-8 ? { x: d1.x / speed, y: d1.y / speed } : fallbackTangent;
  const normal: Point2D = { x: -tangent.y, y: tangent.x };
  const signedCurvature = speed > 1e-6 ? (d1.x * d2.y - d1.y * d2.x) / (speed * speed * speed) : 0;

  const pStart = seg.pressureStart ?? 1;
  const pEnd = seg.pressureEnd ?? 1;
  const depthStart = seg.perspectiveScaleStart ?? 1;
  const depthEnd = seg.perspectiveScaleEnd ?? 1;
  const smoothT = smoothstep01(t);

  return {
    segmentIndex: segIndex,
    localT: t,
    arcLength: clampedS,
    position: pos,
    tangent,
    normal,
    signedCurvature,
    pressure: clamp(pStart + (pEnd - pStart) * smoothT, 0.05, 1.5),
    perspectiveScale: clamp(depthStart + (depthEnd - depthStart) * smoothT, 0.05, 4.0),
  };
}

/** 사슬·땋은 끈·레이스 프릴·지퍼 이빨 기본 장식 모티프 템플릿을 생성한다. */
export function createOrnamentalMotifTemplate(
  kind: RibbonMotifKind,
  nominalTileLengthPx = 24,
): RibbonMotifTemplate {
  const tileLen = Math.max(4, nominalTileLengthPx);
  if (kind === "chain") {
    return {
      kind: "chain",
      labelKo: "사슬 체인",
      nominalTileLengthPx: tileLen,
      vertices: [
        { u: 0.0, v: -0.35, role: "spine" },
        { u: 0.0, v: 0.35, role: "spine" },
        { u: 0.25, v: -0.95, role: "edge" },
        { u: 0.25, v: -0.42, role: "inner-detail" },
        { u: 0.25, v: 0.42, role: "inner-detail" },
        { u: 0.25, v: 0.95, role: "edge" },
        { u: 0.75, v: -0.95, role: "edge" },
        { u: 0.75, v: -0.42, role: "inner-detail" },
        { u: 0.75, v: 0.42, role: "inner-detail" },
        { u: 0.75, v: 0.95, role: "edge" },
        { u: 1.0, v: -0.35, role: "spine" },
        { u: 1.0, v: 0.35, role: "spine" },
      ],
      triangleIndices: [0, 2, 3, 2, 6, 7, 2, 7, 3, 6, 10, 7, 1, 4, 5, 4, 8, 9, 4, 9, 5, 8, 11, 9],
    };
  }
  if (kind === "braid") {
    return {
      kind: "braid",
      labelKo: "제복 땋은 끈",
      nominalTileLengthPx: tileLen,
      vertices: [
        { u: 0.0, v: -0.9, role: "edge" },
        { u: 0.0, v: 0.0, role: "spine" },
        { u: 0.0, v: 0.9, role: "edge" },
        { u: 0.5, v: -0.95, role: "edge" },
        { u: 0.5, v: -0.25, role: "inner-detail" },
        { u: 0.5, v: 0.25, role: "inner-detail" },
        { u: 0.5, v: 0.95, role: "edge" },
        { u: 1.0, v: -0.9, role: "edge" },
        { u: 1.0, v: 0.0, role: "spine" },
        { u: 1.0, v: 0.9, role: "edge" },
      ],
      triangleIndices: [0, 3, 4, 0, 4, 1, 1, 5, 6, 1, 6, 2, 3, 7, 8, 3, 8, 4, 5, 8, 9, 5, 9, 6],
    };
  }
  if (kind === "lace") {
    return {
      kind: "lace",
      labelKo: "레이스 프릴",
      nominalTileLengthPx: tileLen,
      vertices: [
        { u: 0.0, v: -0.45, role: "edge" },
        { u: 0.0, v: 0.35, role: "inner-detail" },
        { u: 0.25, v: 0.82, role: "edge" },
        { u: 0.5, v: -0.45, role: "edge" },
        { u: 0.5, v: 0.0, role: "spine" },
        { u: 0.5, v: 1.0, role: "edge" },
        { u: 0.75, v: 0.82, role: "edge" },
        { u: 1.0, v: -0.45, role: "edge" },
        { u: 1.0, v: 0.35, role: "inner-detail" },
      ],
      triangleIndices: [0, 3, 4, 0, 4, 1, 1, 4, 2, 2, 4, 5, 4, 6, 5, 3, 7, 8, 3, 8, 4, 4, 8, 6],
    };
  }
  return {
    kind: "zipper",
    labelKo: "지퍼 이빨",
    nominalTileLengthPx: tileLen,
    vertices: [
      { u: 0.0, v: -0.85, role: "edge" },
      { u: 0.0, v: -0.12, role: "spine" },
      { u: 0.45, v: -0.85, role: "edge" },
      { u: 0.45, v: 0.28, role: "inner-detail" },
      { u: 0.55, v: -0.28, role: "inner-detail" },
      { u: 0.55, v: 0.85, role: "edge" },
      { u: 1.0, v: 0.12, role: "spine" },
      { u: 1.0, v: 0.85, role: "edge" },
    ],
    triangleIndices: [0, 2, 3, 0, 3, 1, 4, 6, 7, 4, 7, 5],
  };
}

/**
 * 장식 모티프를 등속 호길이 스플라인 위에 반복 배치하며,
 * 급커브 안쪽 오목면에서 `r·κ < maxInnerRadiusKappa < 1` 부드러운 포화 클램핑을 적용해 뒤집힘을 막는다.
 */
export function deformRibbonMotifAlongSpline(input: RibbonBrushDeformInput): RibbonBrushDeformResult {
  const baseHalfWidthPx = Math.max(0.5, input.baseHalfWidthPx);
  const maxInnerRadiusKappa = clamp(input.maxInnerRadiusKappa ?? 0.85, 0.1, 0.98);
  const pressureGamma = clamp(input.pressureGamma ?? 0.85, 0.2, 3.0);
  const minTaperRatio = clamp(input.minTaperRatio ?? 0.12, 0.02, 1.0);
  const fitWholeMotifs = input.fitWholeMotifs ?? true;

  const template = input.customTemplate ?? createOrnamentalMotifTemplate(input.motifKind ?? "chain");
  const table = buildGaussLegendreArcLengthTable(input.segments, input.subdivisionsPerSegment ?? 32);
  const totalLen = table.totalArcLength;

  const rawTiles = totalLen / Math.max(1, template.nominalTileLengthPx);
  const tileCount = fitWholeMotifs ? Math.max(1, Math.round(rawTiles)) : Math.max(1, Math.ceil(rawTiles));
  const effectiveTileLen = totalLen > 0 ? totalLen / tileCount : template.nominalTileLengthPx;

  const deformedVertices: DeformedRibbonVertex[] = [];
  const triangleIndices: number[] = [];
  let clampedInnerVertexCount = 0;
  let maxObservedInnerRadiusKappa = 0;
  let minLongitudinalJacobian = Number.POSITIVE_INFINITY;
  let prevTangent: Point2D = { x: 1, y: 0 };

  for (let tileIdx = 0; tileIdx < tileCount; tileIdx += 1) {
    const baseVertexOffset = deformedVertices.length;
    for (let vIdx = 0; vIdx < template.vertices.length; vIdx += 1) {
      const mv = template.vertices[vIdx]!;
      const arcS = clamp((tileIdx + clamp(mv.u, 0, 1)) * effectiveTileLen, 0, totalLen);
      const frame = sampleSplineAtArcLength(table, arcS, prevTangent);
      prevTangent = frame.tangent;

      const taperRatio = Math.max(
        minTaperRatio,
        Math.pow(frame.pressure, pressureGamma) * frame.perspectiveScale,
      );
      const desiredOffset = clamp(mv.v, -1, 1) * baseHalfWidthPx * taperRatio;

      const rawProduct = desiredOffset * frame.signedCurvature;
      let effectiveOffset = desiredOffset;
      let innerFoldClamped = false;

      if (rawProduct > 0 && Math.abs(frame.signedCurvature) > 1e-9) {
        const safeProduct = maxInnerRadiusKappa * Math.tanh(rawProduct / maxInnerRadiusKappa);
        effectiveOffset = safeProduct / frame.signedCurvature;
        if (safeProduct < rawProduct * 0.985) {
          innerFoldClamped = true;
          clampedInnerVertexCount += 1;
        }
      }

      const finalProduct = effectiveOffset * frame.signedCurvature;
      const jacobian = 1 - finalProduct;
      if (finalProduct > maxObservedInnerRadiusKappa) maxObservedInnerRadiusKappa = finalProduct;
      if (jacobian < minLongitudinalJacobian) minLongitudinalJacobian = jacobian;

      deformedVertices.push({
        x: frame.position.x + effectiveOffset * frame.normal.x,
        y: frame.position.y + effectiveOffset * frame.normal.y,
        arcLength: arcS,
        motifIndex: tileIdx,
        u: mv.u,
        v: mv.v,
        signedCurvature: frame.signedCurvature,
        effectiveOffsetPx: effectiveOffset,
        radiusCurvatureProduct: finalProduct,
        longitudinalJacobian: jacobian,
        innerFoldClamped,
      });
    }

    for (let iIdx = 0; iIdx < template.triangleIndices.length; iIdx += 1) {
      triangleIndices.push(baseVertexOffset + (template.triangleIndices[iIdx] ?? 0));
    }
  }

  return {
    motifLabelKo: template.labelKo,
    tileCount,
    totalArcLengthPx: totalLen,
    vertices: deformedVertices,
    triangleIndices,
    clampedInnerVertexCount,
    maxObservedInnerRadiusKappa,
    minLongitudinalJacobian: Number.isFinite(minLongitudinalJacobian) ? minLongitudinalJacobian : 1,
    serverCostKrw: 0,
  };
}
