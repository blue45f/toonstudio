/**
 * Compute Pressure(`PressureObserver`) + 프레임 타임(ms) 기반 60fps 동적 LOD 자동 조절기 및
 * 셰이더 기반 벡터 잉크(Shader-based Vector Ink) Bezier → GPU 리본 버텍스 테셀레이션 순수 수학 커널.
 */

export const VECTOR_INK_VERTEX_STRIDE_FLOATS = 6 as const;
export const LOD_RECOVERY_STABLE_FRAME_THRESHOLD = 12 as const;

export type ComputePressureState = "nominal" | "fair" | "serious" | "critical" | "unavailable";
export type DynamicLodTier = "ultra" | "high" | "balanced" | "performance";
export type DynamicLodAaMode = "msaa-4x" | "msaa-2x" | "fxaa" | "off";

export interface DynamicLodInput {
  readonly pressureState: ComputePressureState;
  readonly frameTimeMs: number;
  readonly targetFps?: 60 | 120;
  readonly previousTier?: DynamicLodTier;
  readonly consecutiveStableFrames?: number;
  readonly consecutiveOverBudgetFrames?: number;
}

export interface DynamicLodProfile {
  readonly tier: DynamicLodTier;
  readonly tierIndex: 0 | 1 | 2 | 3;
  readonly labelKo: string;
  readonly direction: "hold" | "downgraded" | "recovered";
  readonly pressureState: ComputePressureState;
  readonly targetFps: 60 | 120;
  readonly frameBudgetMs: number;
  readonly observedFrameTimeMs: number;
  readonly headroomMs: number;
  readonly particleDensityScale: number;
  readonly shadowMapResolution: 2048 | 1024 | 512 | 256;
  readonly watercolorSubsteps: 8 | 5 | 3 | 1;
  readonly aaMode3d: DynamicLodAaMode;
  readonly vectorRibbonSubdivisions: 16 | 12 | 8 | 4;
  readonly estimatedFrameSavingMs: number;
  readonly reasonKo: string;
}

export interface PressureRecordLike {
  readonly state: "nominal" | "fair" | "serious" | "critical";
}

export interface PressureObserverLike {
  observe: (source: "cpu", options?: { readonly sampleInterval?: number }) => Promise<void> | void;
  disconnect: () => void;
}

export type PressureObserverConstructorLike = new (
  callback: (records: readonly PressureRecordLike[]) => void,
) => PressureObserverLike;

export interface VectorInkPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface VectorInkBezierSegment {
  readonly p0: VectorInkPoint2D;
  readonly p1: VectorInkPoint2D;
  readonly p2: VectorInkPoint2D;
  readonly p3: VectorInkPoint2D;
  readonly pressureStart: number;
  readonly pressureEnd: number;
  readonly baseRadiusPx: number;
  readonly tiltScale?: number;
}

export interface VectorInkTessellationOptions {
  readonly subdivisions?: number;
  readonly zoomScale?: number;
}

export interface VectorInkRibbonMesh {
  /** 인터리브 GPU 버텍스 버퍼: [x, y, u, v, signedEdgeDist, pressure] × vertexCount */
  readonly vertices: Float32Array;
  /** CCW 삼각형 인덱스 버퍼 */
  readonly indices: Uint32Array;
  readonly strideFloats: typeof VECTOR_INK_VERTEX_STRIDE_FLOATS;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly segmentCount: number;
  readonly arcLengthPx: number;
  readonly aaFeatherPx: number;
  readonly gpuBufferBytes: number;
  readonly boundingBox: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

const LOD_TIER_ORDER: readonly DynamicLodTier[] = Object.freeze([
  "ultra",
  "high",
  "balanced",
  "performance",
]);

const LOD_SPEC_BY_TIER: Readonly<
  Record<
    DynamicLodTier,
    {
      readonly tierIndex: 0 | 1 | 2 | 3;
      readonly labelKo: string;
      readonly particleDensityScale: number;
      readonly shadowMapResolution: 2048 | 1024 | 512 | 256;
      readonly watercolorSubsteps: 8 | 5 | 3 | 1;
      readonly aaMode3d: DynamicLodAaMode;
      readonly vectorRibbonSubdivisions: 16 | 12 | 8 | 4;
      readonly estimatedFrameSavingMs: number;
    }
  >
> = Object.freeze({
  ultra: Object.freeze({
    tierIndex: 0,
    labelKo: "L0 울트라 (네이티브 풀 품질)",
    particleDensityScale: 1.0,
    shadowMapResolution: 2048,
    watercolorSubsteps: 8,
    aaMode3d: "msaa-4x",
    vectorRibbonSubdivisions: 16,
    estimatedFrameSavingMs: 0,
  }),
  high: Object.freeze({
    tierIndex: 1,
    labelKo: "L1 하이 (60fps 균형 가속)",
    particleDensityScale: 0.72,
    shadowMapResolution: 1024,
    watercolorSubsteps: 5,
    aaMode3d: "msaa-2x",
    vectorRibbonSubdivisions: 12,
    estimatedFrameSavingMs: 2.8,
  }),
  balanced: Object.freeze({
    tierIndex: 2,
    labelKo: "L2 밸런스 (열·부하 완화)",
    particleDensityScale: 0.42,
    shadowMapResolution: 512,
    watercolorSubsteps: 3,
    aaMode3d: "fxaa",
    vectorRibbonSubdivisions: 8,
    estimatedFrameSavingMs: 5.9,
  }),
  performance: Object.freeze({
    tierIndex: 3,
    labelKo: "L3 퍼포먼스 (60fps 방어 모드)",
    particleDensityScale: 0.15,
    shadowMapResolution: 256,
    watercolorSubsteps: 1,
    aaMode3d: "off",
    vectorRibbonSubdivisions: 4,
    estimatedFrameSavingMs: 9.4,
  }),
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute Pressure(`PressureObserver`) 상태와 실측 프레임 타임(ms)을 결합해
 * 60fps(또는 120fps) 목표를 지키는 4단계 동적 LOD 계단 프로파일을 계산한다.
 */
export function computeDynamicLodProfile(input: DynamicLodInput): DynamicLodProfile {
  const targetFps: 60 | 120 = input.targetFps ?? 60;
  const frameBudgetMs = round2(1_000 / targetFps);
  const observedFrameTimeMs = round2(clamp(input.frameTimeMs, 0.5, 250));
  const previousIndex = LOD_TIER_ORDER.indexOf(input.previousTier ?? "ultra");
  const currentIndex = previousIndex >= 0 ? previousIndex : 0;
  const stableFrames = Math.max(0, Math.round(input.consecutiveStableFrames ?? 0));
  const overBudgetFrames = Math.max(0, Math.round(input.consecutiveOverBudgetFrames ?? 1));

  let nextIndex = currentIndex;
  let direction: "hold" | "downgraded" | "recovered" = "hold";
  let reasonKo = "목표 프레임 예산 내에서 현재 LOD 등급을 안정적으로 유지합니다.";

  const severeOverBudget = observedFrameTimeMs > frameBudgetMs * 1.6;
  const moderateOverBudget = observedFrameTimeMs > frameBudgetMs * 1.12;
  const comfortableHeadroom = observedFrameTimeMs <= frameBudgetMs * 0.82;

  if (input.pressureState === "critical") {
    nextIndex = 3;
    direction = nextIndex > currentIndex ? "downgraded" : "hold";
    reasonKo = "Compute Pressure critical 감지 — 60fps 방어를 위해 L3 퍼포먼스 등급으로 즉시 강등합니다.";
  } else if (input.pressureState === "serious") {
    const floorIndex = Math.max(2, currentIndex + (moderateOverBudget ? 1 : 0));
    nextIndex = Math.min(3, floorIndex);
    direction = nextIndex > currentIndex ? "downgraded" : "hold";
    reasonKo = "Compute Pressure serious 감지 — 그림자·파티클·수채화 서브스텝을 단계 하향합니다.";
  } else if (severeOverBudget) {
    nextIndex = Math.min(3, currentIndex + 2);
    direction = nextIndex > currentIndex ? "downgraded" : "hold";
    reasonKo = `프레임 타임(${observedFrameTimeMs}ms)이 예산(${frameBudgetMs}ms)의 160%를 초과해 2단계 즉시 강등합니다.`;
  } else if (moderateOverBudget && overBudgetFrames >= 1) {
    nextIndex = Math.min(3, currentIndex + 1);
    direction = nextIndex > currentIndex ? "downgraded" : "hold";
    reasonKo = `프레임 타임(${observedFrameTimeMs}ms) 초과로 파티클·그림자·수채화 서브스텝을 1단계 낮춥니다.`;
  } else if (input.pressureState === "fair") {
    if (currentIndex === 0 && observedFrameTimeMs > frameBudgetMs * 0.92) {
      nextIndex = 1;
      direction = "downgraded";
      reasonKo = "Compute Pressure fair 상태에서 프레임 여유가 좁아 L1 하이 등급으로 선제 조정합니다.";
    } else {
      reasonKo = "Compute Pressure fair 상태 — 상승 복구를 보류하고 현재 등급을 유지합니다.";
    }
  } else if (
    (input.pressureState === "nominal" || input.pressureState === "unavailable")
    && comfortableHeadroom
    && stableFrames >= LOD_RECOVERY_STABLE_FRAME_THRESHOLD
    && currentIndex > 0
  ) {
    nextIndex = currentIndex - 1;
    direction = "recovered";
    reasonKo = `안정 프레임 ${stableFrames}회 연속 달성(${observedFrameTimeMs}ms) — 품질을 1단계 점진 복구합니다.`;
  }

  const tier = LOD_TIER_ORDER[nextIndex] ?? "balanced";
  const spec = LOD_SPEC_BY_TIER[tier];

  return Object.freeze({
    tier,
    tierIndex: spec.tierIndex,
    labelKo: spec.labelKo,
    direction,
    pressureState: input.pressureState,
    targetFps,
    frameBudgetMs,
    observedFrameTimeMs,
    headroomMs: round2(frameBudgetMs - observedFrameTimeMs),
    particleDensityScale: spec.particleDensityScale,
    shadowMapResolution: spec.shadowMapResolution,
    watercolorSubsteps: spec.watercolorSubsteps,
    aaMode3d: spec.aaMode3d,
    vectorRibbonSubdivisions: spec.vectorRibbonSubdivisions,
    estimatedFrameSavingMs: spec.estimatedFrameSavingMs,
    reasonKo,
  });
}

/** `PressureObserver` API가 있을 때만 안전하게 구독하고, 미지원 환경에서는 no-op 해제기를 반환한다. */
export function createComputePressureMonitor(options: {
  readonly onChange: (state: ComputePressureState) => void;
  readonly sampleIntervalMs?: number;
  readonly observerConstructor?: PressureObserverConstructorLike | null;
}): { readonly supported: boolean; readonly stop: () => void } {
  const g = typeof globalThis !== "undefined" ? (globalThis as Record<string, unknown>) : {};
  const ObserverCtor =
    options.observerConstructor !== undefined
      ? options.observerConstructor
      : typeof g.PressureObserver === "function"
        ? (g.PressureObserver as PressureObserverConstructorLike)
        : null;

  if (!ObserverCtor) {
    options.onChange("unavailable");
    return Object.freeze({ supported: false, stop: () => undefined });
  }

  let stopped = false;

  try {
    const observer = new ObserverCtor((records) => {
      if (stopped) return;
      const latest = records[records.length - 1];
      if (latest) options.onChange(latest.state);
    });
    const maybePromise = observer.observe("cpu", {
      sampleInterval: clamp(options.sampleIntervalMs ?? 1_000, 250, 10_000),
    });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        if (!stopped) options.onChange("unavailable");
      });
    }
    return Object.freeze({
      supported: true,
      stop: () => {
        if (stopped) return;
        stopped = true;
        try {
          observer.disconnect();
        } catch {
          // 이미 해제된 옵저버는 조용히 무시한다.
        }
      },
    });
  } catch {
    if (!stopped) options.onChange("unavailable");
    return Object.freeze({ supported: false, stop: () => undefined });
  }
}

function evaluateCubicBezier(seg: VectorInkBezierSegment, t: number): VectorInkPoint2D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * seg.p0.x + b * seg.p1.x + c * seg.p2.x + d * seg.p3.x,
    y: a * seg.p0.y + b * seg.p1.y + c * seg.p2.y + d * seg.p3.y,
  };
}

function evaluateCubicBezierTangent(seg: VectorInkBezierSegment, t: number): VectorInkPoint2D {
  const mt = 1 - t;
  const dx =
    3 * mt * mt * (seg.p1.x - seg.p0.x)
    + 6 * mt * t * (seg.p2.x - seg.p1.x)
    + 3 * t * t * (seg.p3.x - seg.p2.x);
  const dy =
    3 * mt * mt * (seg.p1.y - seg.p0.y)
    + 6 * mt * t * (seg.p2.y - seg.p1.y)
    + 3 * t * t * (seg.p3.y - seg.p2.y);
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) return { x: dx / len, y: dy / len };

  const chordDx = seg.p3.x - seg.p0.x;
  const chordDy = seg.p3.y - seg.p0.y;
  const chordLen = Math.hypot(chordDx, chordDy);
  if (chordLen > 1e-6) return { x: chordDx / chordLen, y: chordDy / chordLen };
  return { x: 1, y: 0 };
}

/**
 * 셰이더 기반 벡터 잉크(Shader-based Vector Ink) Bezier 세그먼트 배열을
 * GPU 리본 버텍스 버퍼(`Float32Array`, stride 6)와 CCW 인덱스 버퍼(`Uint32Array`)로 테셀레이션한다.
 */
export function tessellateShaderVectorInkRibbon(
  segments: readonly VectorInkBezierSegment[],
  options: VectorInkTessellationOptions = {},
): VectorInkRibbonMesh {
  const subdivisions = Math.round(clamp(options.subdivisions ?? 12, 2, 64));
  const zoomScale = clamp(options.zoomScale ?? 1, 0.25, 32);
  const aaFeatherPx = round2(1 / zoomScale);

  if (segments.length === 0) {
    return Object.freeze({
      vertices: new Float32Array(0),
      indices: new Uint32Array(0),
      strideFloats: VECTOR_INK_VERTEX_STRIDE_FLOATS,
      vertexCount: 0,
      triangleCount: 0,
      segmentCount: 0,
      arcLengthPx: 0,
      aaFeatherPx,
      gpuBufferBytes: 0,
      boundingBox: Object.freeze({ minX: 0, minY: 0, maxX: 0, maxY: 0 }),
    });
  }

  const samplesPerSegment = subdivisions + 1;
  const vertexCount = segments.length * samplesPerSegment * 2;
  const triangleCount = segments.length * subdivisions * 2;
  const vertices = new Float32Array(vertexCount * VECTOR_INK_VERTEX_STRIDE_FLOATS);
  const indices = new Uint32Array(triangleCount * 3);

  let vCursor = 0;
  let iCursor = 0;
  let arcLengthPx = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let segIdx = 0; segIdx < segments.length; segIdx += 1) {
    const seg = segments[segIdx];
    const baseVertexIndex = segIdx * samplesPerSegment * 2;
    const tiltScale = clamp(seg.tiltScale ?? 1, 0.4, 2.5);
    const pStart = clamp(seg.pressureStart, 0.05, 1.5);
    const pEnd = clamp(seg.pressureEnd, 0.05, 1.5);
    const baseRadius = clamp(seg.baseRadiusPx, 0.25, 256);

    let prevPt: VectorInkPoint2D | null = null;

    for (let step = 0; step <= subdivisions; step += 1) {
      const t = step / subdivisions;
      const pt = evaluateCubicBezier(seg, t);
      if (prevPt) {
        arcLengthPx += Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);
      }
      prevPt = pt;

      const tangent = evaluateCubicBezierTangent(seg, t);
      const nx = -tangent.y;
      const ny = tangent.x;
      const pressure = pStart + (pEnd - pStart) * t;
      const halfWidth = Math.max(0.35, baseRadius * pressure * tiltScale) + aaFeatherPx * 0.5;
      const u = (segIdx + t) / segments.length;

      const lx = pt.x + nx * halfWidth;
      const ly = pt.y + ny * halfWidth;
      const rx = pt.x - nx * halfWidth;
      const ry = pt.y - ny * halfWidth;

      minX = Math.min(minX, lx, rx);
      minY = Math.min(minY, ly, ry);
      maxX = Math.max(maxX, lx, rx);
      maxY = Math.max(maxY, ly, ry);

      vertices[vCursor++] = lx;
      vertices[vCursor++] = ly;
      vertices[vCursor++] = u;
      vertices[vCursor++] = 0;
      vertices[vCursor++] = -halfWidth;
      vertices[vCursor++] = pressure;

      vertices[vCursor++] = rx;
      vertices[vCursor++] = ry;
      vertices[vCursor++] = u;
      vertices[vCursor++] = 1;
      vertices[vCursor++] = halfWidth;
      vertices[vCursor++] = pressure;

      if (step < subdivisions) {
        const quadStart = baseVertexIndex + step * 2;
        const l0 = quadStart;
        const r0 = quadStart + 1;
        const l1 = quadStart + 2;
        const r1 = quadStart + 3;
        indices[iCursor++] = l0;
        indices[iCursor++] = r0;
        indices[iCursor++] = l1;
        indices[iCursor++] = l1;
        indices[iCursor++] = r0;
        indices[iCursor++] = r1;
      }
    }
  }

  return Object.freeze({
    vertices,
    indices,
    strideFloats: VECTOR_INK_VERTEX_STRIDE_FLOATS,
    vertexCount,
    triangleCount,
    segmentCount: segments.length,
    arcLengthPx: round2(arcLengthPx),
    aaFeatherPx,
    gpuBufferBytes: vertices.byteLength + indices.byteLength,
    boundingBox: Object.freeze({
      minX: round2(minX),
      minY: round2(minY),
      maxX: round2(maxX),
      maxY: round2(maxY),
    }),
  });
}
