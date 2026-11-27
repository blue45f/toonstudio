/**
 * Wave-35: 구심성(Centripetal) Catmull-Rom 기반 벡터 가이드 선화 초해상도 스케일러 및 다중 엔진 획 동기화 검증기.
 *
 * 만화·웹툰 먹선 중심선을 임의 목표 해상도(2x·4x·8x 및 인쇄 DPI)로 확대할 때
 * 구심성 매개변수화(alpha = 0.5)로 급격한 방향 전환 구간의 뾰족점(Cusp)과 자기교차를 원천 차단하고,
 * 필압 테이퍼 비율과 예각 마이터/베벨 제한(miterLimit) 및 엔진 간 FNV-1a 기하 다이제스트 일관성을 보장한다.
 */

export type StrokeEngineTarget = "canvas2d" | "webgpu" | "export";

export interface StrokeControlSample {
  readonly x: number;
  readonly y: number;
  /** 정규화 필압 [0..1] */
  readonly pressure: number;
  /** 펜 기울기 또는 캘리그래피 닙 배율 (기본값 1) */
  readonly tiltScale?: number;
}

export interface StrokeScalerOptions {
  /** 명시적 배율 (생략 시 targetDpi / sourceDpi 비율 사용) */
  readonly scaleFactor?: number;
  readonly sourceDpi?: number;
  readonly targetDpi?: number;
  /** 원본 좌표계 기준 최대 필압(1.0)일 때의 기본 반폭(px) */
  readonly baseHalfWidthPx: number;
  /** 시작점 펜 터치 테이퍼 구간 비율 [0..0.45] (기본값 0.12) */
  readonly startTaperFraction?: number;
  /** 끝점 펜 날림(Flick) 테이퍼 구간 비율 [0..0.45] (기본값 0.16) */
  readonly endTaperFraction?: number;
  /** 테이퍼 곡선 지수 (기본값 1.35) */
  readonly taperExponent?: number;
  /** 펜 끝 최소 두께 비율 [0.01..0.5] (기본값 0.06) */
  readonly minTipWidthRatio?: number;
  /** 장치 최소 헤어라인 반폭 하한(px, 기본값 0) */
  readonly deviceHairlineFloorPx?: number;
  /** 제어 구간당 기본 분할 수 (기본값 8, 확대 배율에 비례해 자동 증분) */
  readonly samplesPerSegment?: number;
  /** Catmull-Rom 매듭 지수: 0.5 = 구심성(Centripetal, 무첨점 보장 기본값) */
  readonly alpha?: number;
  /** 예각 코너 마이터 한계 비율 (초과 시 베벨 조인으로 전환, 기본값 3.5) */
  readonly miterLimit?: number;
}

export interface ScaledCenterlineSample {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly pressure: number;
  readonly arcLength: number;
  readonly normalizedArc: number;
  readonly tangentX: number;
  readonly tangentY: number;
}

export interface ScaledStrokeCenterlineResult {
  readonly effectiveScale: number;
  readonly totalArcLength: number;
  readonly samples: readonly ScaledCenterlineSample[];
  readonly maxCurvature: number;
  readonly taperRatioStartToMid: number;
  readonly taperRatioEndToMid: number;
}

export interface RibbonVertex {
  readonly x: number;
  readonly y: number;
}

export interface StrokeBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface StrokeRibbonGeometry {
  readonly effectiveScale: number;
  readonly leftRail: readonly RibbonVertex[];
  readonly rightRail: readonly RibbonVertex[];
  /** WebGPU·Canvas2D·익스포트 공용 인터리브 트라이앵글 스트립 버퍼 [lx, ly, rx, ry, ...] */
  readonly triangleStripPositions: Float32Array;
  readonly miterJoinCount: number;
  readonly bevelFallbackCount: number;
  readonly maxMiterRatioObserved: number;
  readonly boundingBox: StrokeBoundingBox;
}

export interface EngineStrokeSubmission {
  readonly engine: StrokeEngineTarget;
  readonly ribbon: StrokeRibbonGeometry;
}

export interface CrossEngineDigestEntry {
  readonly engine: StrokeEngineTarget;
  readonly fnv1aHex: string;
  readonly canonicalSignature: string;
  readonly vertexCount: number;
  readonly maxPositionDeviationPx: number;
}

export interface CrossEngineStrokeDigestReport {
  readonly referenceEngine: StrokeEngineTarget;
  readonly referenceDigestHex: string;
  readonly isSynchronized: boolean;
  readonly quantizationStepPx: number;
  readonly entries: readonly CrossEngineDigestEntry[];
  readonly driftedEngines: readonly StrokeEngineTarget[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function resolveEffectiveScale(options: StrokeScalerOptions): number {
  if (options.scaleFactor !== undefined && Number.isFinite(options.scaleFactor)) {
    return clamp(options.scaleFactor, 0.125, 64);
  }
  if (
    options.sourceDpi !== undefined &&
    options.targetDpi !== undefined &&
    options.sourceDpi > 0 &&
    options.targetDpi > 0
  ) {
    return clamp(options.targetDpi / options.sourceDpi, 0.125, 64);
  }
  return 1;
}

function evaluateBarryGoldmanPoint(
  p0: RibbonVertex,
  p1: RibbonVertex,
  p2: RibbonVertex,
  p3: RibbonVertex,
  alpha: number,
  u: number,
): RibbonVertex {
  const d01 = Math.max(1e-5, Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), alpha));
  const d12 = Math.max(1e-5, Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), alpha));
  const d23 = Math.max(1e-5, Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), alpha));

  const t1 = d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const t = t1 + clamp(u, 0, 1) * d12;

  const a1x = ((t1 - t) / t1) * p0.x + (t / t1) * p1.x;
  const a1y = ((t1 - t) / t1) * p0.y + (t / t1) * p1.y;
  const a2x = ((t2 - t) / d12) * p1.x + ((t - t1) / d12) * p2.x;
  const a2y = ((t2 - t) / d12) * p1.y + ((t - t1) / d12) * p2.y;
  const a3x = ((t3 - t) / d23) * p2.x + ((t - t2) / d23) * p3.x;
  const a3y = ((t3 - t) / d23) * p2.y + ((t - t2) / d23) * p3.y;

  const b1x = ((t2 - t) / t2) * a1x + (t / t2) * a2x;
  const b1y = ((t2 - t) / t2) * a1y + (t / t2) * a2y;
  const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x;
  const b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;

  return {
    x: ((t2 - t) / d12) * b1x + ((t - t1) / d12) * b2x,
    y: ((t2 - t) / d12) * b1y + ((t - t1) / d12) * b2y,
  };
}

function hashFnv1a32Hex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 제어점 배열을 구심성 Catmull-Rom 곡선으로 보간하고 목표 배율에서도 필압·끝단 테이퍼 실루엣 비율을 보존한다.
 */
export function scaleStrokeCenterlineTaperPreserving(
  controlSamples: readonly StrokeControlSample[],
  options: StrokeScalerOptions,
): ScaledStrokeCenterlineResult {
  const effectiveScale = resolveEffectiveScale(options);
  const scaledBaseHalfWidth = Math.max(0.05, options.baseHalfWidthPx) * effectiveScale;
  const startTaper = clamp(options.startTaperFraction ?? 0.12, 0, 0.45);
  const endTaper = clamp(options.endTaperFraction ?? 0.16, 0, 0.45);
  const taperExp = clamp(options.taperExponent ?? 1.35, 0.25, 4);
  const minTipRatio = clamp(options.minTipWidthRatio ?? 0.06, 0.01, 0.5);
  const hairlineFloor = Math.max(0, options.deviceHairlineFloorPx ?? 0);
  const alpha = clamp(options.alpha ?? 0.5, 0, 1);

  if (controlSamples.length === 0) {
    return {
      effectiveScale,
      totalArcLength: 0,
      samples: [],
      maxCurvature: 0,
      taperRatioStartToMid: 1,
      taperRatioEndToMid: 1,
    };
  }

  const scaledControls = controlSamples.map((pt) => ({
    x: pt.x * effectiveScale,
    y: pt.y * effectiveScale,
    pressure: clamp(pt.pressure, 0, 1),
    tiltScale: clamp(pt.tiltScale ?? 1, 0.25, 4),
  }));

  if (scaledControls.length === 1) {
    const only = scaledControls[0];
    const hw = Math.max(
      hairlineFloor,
      scaledBaseHalfWidth * Math.max(minTipRatio, only.pressure) * only.tiltScale,
    );
    return {
      effectiveScale,
      totalArcLength: 0,
      samples: [
        {
          x: only.x,
          y: only.y,
          halfWidth: hw,
          pressure: only.pressure,
          arcLength: 0,
          normalizedArc: 0,
          tangentX: 1,
          tangentY: 0,
        },
      ],
      maxCurvature: 0,
      taperRatioStartToMid: 1,
      taperRatioEndToMid: 1,
    };
  }

  const baseSubdiv = Math.max(2, Math.round(options.samplesPerSegment ?? 8));
  const subdiv = Math.min(
    64,
    Math.max(baseSubdiv, Math.ceil(baseSubdiv * Math.sqrt(Math.max(1, effectiveScale)))),
  );

  const rawPoints: Array<{
    x: number;
    y: number;
    pressure: number;
    tiltScale: number;
    arcLength: number;
  }> = [];

  const n = scaledControls.length;
  let cumulativeArc = 0;

  for (let seg = 0; seg < n - 1; seg += 1) {
    const p1 = scaledControls[seg];
    const p2 = scaledControls[seg + 1];
    const p0 =
      seg > 0 ? scaledControls[seg - 1] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 =
      seg + 2 < n ? scaledControls[seg + 2] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };

    const stepsInSeg = seg === n - 2 ? subdiv : subdiv - 1;
    for (let step = 0; step <= stepsInSeg; step += 1) {
      const u = step / subdiv;
      const smoothU = u * u * (3 - 2 * u);
      const pos = evaluateBarryGoldmanPoint(p0, p1, p2, p3, alpha, u);
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * smoothU;
      const tiltScale = p1.tiltScale + (p2.tiltScale - p1.tiltScale) * smoothU;

      if (rawPoints.length > 0) {
        const prev = rawPoints[rawPoints.length - 1];
        const ds = Math.hypot(pos.x - prev.x, pos.y - prev.y);
        if (ds < 1e-6 && !(seg === n - 2 && step === stepsInSeg)) continue;
        cumulativeArc += ds;
      }
      rawPoints.push({ x: pos.x, y: pos.y, pressure, tiltScale, arcLength: cumulativeArc });
    }
  }

  const totalArcLength = cumulativeArc;
  let maxCurvature = 0;
  const samples: ScaledCenterlineSample[] = [];

  for (let i = 0; i < rawPoints.length; i += 1) {
    const curr = rawPoints[i];
    const prev = rawPoints[Math.max(0, i - 1)];
    const next = rawPoints[Math.min(rawPoints.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dLen = Math.hypot(dx, dy);
    const tangentX = dLen > 1e-7 ? dx / dLen : 1;
    const tangentY = dLen > 1e-7 ? dy / dLen : 0;

    if (i > 0 && i < rawPoints.length - 1) {
      const inDx = curr.x - prev.x;
      const inDy = curr.y - prev.y;
      const outDx = next.x - curr.x;
      const outDy = next.y - curr.y;
      const inLen = Math.hypot(inDx, inDy);
      const outLen = Math.hypot(outDx, outDy);
      if (inLen > 1e-6 && outLen > 1e-6) {
        const dot = clamp((inDx * outDx + inDy * outDy) / (inLen * outLen), -1, 1);
        maxCurvature = Math.max(maxCurvature, Math.acos(dot) / (0.5 * (inLen + outLen)));
      }
    }

    const normalizedArc = totalArcLength > 1e-7 ? curr.arcLength / totalArcLength : 0;
    let taperEnvelope = 1;
    if (startTaper > 0 && normalizedArc < startTaper) {
      taperEnvelope = Math.min(taperEnvelope, Math.pow(normalizedArc / startTaper, taperExp));
    }
    if (endTaper > 0 && 1 - normalizedArc < endTaper) {
      taperEnvelope = Math.min(taperEnvelope, Math.pow((1 - normalizedArc) / endTaper, taperExp));
    }

    const effectiveFactor = Math.max(minTipRatio, curr.pressure * taperEnvelope);
    const halfWidth = Math.max(hairlineFloor, scaledBaseHalfWidth * effectiveFactor * curr.tiltScale);
    samples.push({
      x: curr.x,
      y: curr.y,
      halfWidth,
      pressure: curr.pressure,
      arcLength: curr.arcLength,
      normalizedArc,
      tangentX,
      tangentY,
    });
  }

  const midWidth = Math.max(1e-6, samples[Math.floor(samples.length / 2)].halfWidth);
  return {
    effectiveScale,
    totalArcLength,
    samples,
    maxCurvature,
    taperRatioStartToMid: samples[0].halfWidth / midWidth,
    taperRatioEndToMid: samples[samples.length - 1].halfWidth / midWidth,
  };
}

/**
 * 구심성 Catmull-Rom 중심선으로부터 가변 반폭과 예각 마이터/베벨 제한(miterLimit)을 적용한 리본 메쉬를 생성한다.
 */
export function evaluateCentripetalCatmullRomRibbon(
  controlSamples: readonly StrokeControlSample[],
  options: StrokeScalerOptions,
): StrokeRibbonGeometry {
  const centerline = scaleStrokeCenterlineTaperPreserving(controlSamples, options);
  const miterLimit = clamp(options.miterLimit ?? 3.5, 1, 16);
  const pts = centerline.samples;

  if (pts.length === 0) {
    return {
      effectiveScale: centerline.effectiveScale,
      leftRail: [],
      rightRail: [],
      triangleStripPositions: new Float32Array(0),
      miterJoinCount: 0,
      bevelFallbackCount: 0,
      maxMiterRatioObserved: 0,
      boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  const leftRail: RibbonVertex[] = [];
  const rightRail: RibbonVertex[] = [];
  const stripCoords: number[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const pushPair = (px: number, py: number, nx: number, ny: number, offset: number): void => {
    const lx = px + nx * offset;
    const ly = py + ny * offset;
    const rx = px - nx * offset;
    const ry = py - ny * offset;
    leftRail.push({ x: lx, y: ly });
    rightRail.push({ x: rx, y: ry });
    stripCoords.push(lx, ly, rx, ry);
    minX = Math.min(minX, lx, rx);
    minY = Math.min(minY, ly, ry);
    maxX = Math.max(maxX, lx, rx);
    maxY = Math.max(maxY, ly, ry);
  };

  if (pts.length === 1) {
    const p = pts[0];
    pushPair(p.x, p.y - p.halfWidth, -1, 0, p.halfWidth);
    pushPair(p.x, p.y + p.halfWidth, -1, 0, p.halfWidth);
    return {
      effectiveScale: centerline.effectiveScale,
      leftRail,
      rightRail,
      triangleStripPositions: new Float32Array(stripCoords),
      miterJoinCount: 0,
      bevelFallbackCount: 0,
      maxMiterRatioObserved: 1,
      boundingBox: { minX, minY, maxX, maxY },
    };
  }

  const segNormals: RibbonVertex[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    segNormals.push(len > 1e-7 ? { x: -dy / len, y: dx / len } : { x: -a.tangentY, y: a.tangentX });
  }

  let miterJoinCount = 0;
  let bevelFallbackCount = 0;
  let maxMiterRatioObserved = 1;

  pushPair(pts[0].x, pts[0].y, segNormals[0].x, segNormals[0].y, pts[0].halfWidth);

  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i];
    const nIn = segNormals[i - 1];
    const nOut = segNormals[i];
    const bx = nIn.x + nOut.x;
    const by = nIn.y + nOut.y;
    const bLen = Math.hypot(bx, by);

    if (bLen > 1e-5) {
      const mx = bx / bLen;
      const my = by / bLen;
      const cosHalf = mx * nOut.x + my * nOut.y;
      const miterRatio = cosHalf > 1e-5 ? 1 / cosHalf : Number.POSITIVE_INFINITY;
      if (miterRatio <= miterLimit) {
        miterJoinCount += 1;
        maxMiterRatioObserved = Math.max(maxMiterRatioObserved, miterRatio);
        pushPair(p.x, p.y, mx, my, p.halfWidth * miterRatio);
        continue;
      }
    }

    bevelFallbackCount += 1;
    pushPair(p.x, p.y, nIn.x, nIn.y, p.halfWidth);
    pushPair(p.x, p.y, nOut.x, nOut.y, p.halfWidth);
  }

  const lastPt = pts[pts.length - 1];
  const lastN = segNormals[segNormals.length - 1];
  pushPair(lastPt.x, lastPt.y, lastN.x, lastN.y, lastPt.halfWidth);

  return {
    effectiveScale: centerline.effectiveScale,
    leftRail,
    rightRail,
    triangleStripPositions: new Float32Array(stripCoords),
    miterJoinCount,
    bevelFallbackCount,
    maxMiterRatioObserved,
    boundingBox: { minX, minY, maxX, maxY },
  };
}

/**
 * Canvas2D, WebGPU, 익스포트 엔진이 산출한 리본 스트로크 정점 스트림을 정규 양자화한 뒤
 * 32비트 FNV-1a 다이제스트와 최대 정점 이탈 거리를 비교해 엔진 간 동기화 무결성을 판정한다.
 */
export function reconcileCrossEngineStrokeDigest(
  submissions: readonly EngineStrokeSubmission[],
  quantizationStepPx = 1e-3,
): CrossEngineStrokeDigestReport {
  const step = Math.max(1e-6, quantizationStepPx);
  if (submissions.length === 0) {
    return {
      referenceEngine: "canvas2d",
      referenceDigestHex: hashFnv1a32Hex("v:0|"),
      isSynchronized: true,
      quantizationStepPx: step,
      entries: [],
      driftedEngines: [],
    };
  }

  const buildCanonicalSignature = (positions: Float32Array): string => {
    const quantized = new Array<number>(positions.length);
    for (let i = 0; i < positions.length; i += 1) {
      const raw = Math.round((positions[i] ?? 0) / step);
      quantized[i] = raw === 0 ? 0 : raw;
    }
    return `v:${positions.length / 2}|${quantized.join(",")}`;
  };

  const refSub = submissions[0];
  const refPositions = refSub.ribbon.triangleStripPositions;
  const refDigest = hashFnv1a32Hex(buildCanonicalSignature(refPositions));
  const entries: CrossEngineDigestEntry[] = [];
  const driftedEngines: StrokeEngineTarget[] = [];

  for (const sub of submissions) {
    const pos = sub.ribbon.triangleStripPositions;
    const signature = buildCanonicalSignature(pos);
    const fnv1aHex = hashFnv1a32Hex(signature);

    let maxDev = 0;
    if (pos.length !== refPositions.length) {
      maxDev = Number.POSITIVE_INFINITY;
    } else {
      for (let i = 0; i < pos.length; i += 2) {
        maxDev = Math.max(maxDev, Math.hypot(pos[i] - refPositions[i], pos[i + 1] - refPositions[i + 1]));
      }
    }

    if (fnv1aHex !== refDigest) driftedEngines.push(sub.engine);
    entries.push({
      engine: sub.engine,
      fnv1aHex,
      canonicalSignature: signature,
      vertexCount: pos.length / 2,
      maxPositionDeviationPx: maxDev,
    });
  }

  return {
    referenceEngine: refSub.engine,
    referenceDigestHex: refDigest,
    isSynchronized: driftedEngines.length === 0,
    quantizationStepPx: step,
    entries,
    driftedEngines,
  };
}
