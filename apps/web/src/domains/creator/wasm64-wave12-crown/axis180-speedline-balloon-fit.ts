/**
 * 180도 연출 축(Line-of-Action) 연속성 검증기, 절차적 집중선·성게알 플래시(베타플래시)·법선 교차 해칭 벡터 엔진,
 * 그리고 다국어 대사 팽창 대응 이방성(Anisotropic) 말풍선 자동 맞춤 솔버.
 *
 * - 외부 서버 호출 0회(₩0), 순수 수치 기하·벡터 연산 기반 결정론 엔진.
 * - 연속 컷 사이에서 인물 간 상호작용 축(`A -> B`)에 대한 카메라 반구 부호와 화면 좌우 투영 순서를 추적해
 *   중립 정면/축상 컷 없이 시선이 뒤집히는 180도 축 침범을 검출하고 교정 카메라 좌표를 제안한다.
 * - 래스터 블러 없이 1ms 미만으로 소실점 집중선, 감정 베타플래시(유니플래시), 곡률·법선 정렬 교차 해칭
 *   테이퍼드 벡터 폴리라인을 결정론적으로 생성한다.
 * - 한국어 원문에서 영·서·독·불 번역 시 대사 길이가 35%~60% 늘어날 때 인물 얼굴 보호 영역(Keep-Out Box)을
 *   침범하지 않도록 타원·둥근사각형 말풍선의 가로·세로 반경과 중심 이동(`rx, ry, dx, dy`)을 이방성으로 푼다.
 */

export type ActionGroundPlane = "xz" | "xy";
export type CameraAxisSide = "positive-half" | "negative-half" | "neutral-on-axis" | "degenerate";

export interface Point2D { readonly x: number; readonly y: number }
export interface Vec3Point { readonly x: number; readonly y: number; readonly z: number }
export interface Rect2D { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface ActionCutShot {
  readonly cutId: string; readonly cutIndex: number;
  readonly actorA: Vec3Point; readonly actorB: Vec3Point;
  readonly cameraPosition: Vec3Point; readonly cameraLookAt?: Vec3Point; readonly fovDeg?: number;
  /** 소품 인서트·정면 클로즈업·조감 컷처럼 의도적으로 축을 초기화하는 중립 브리지 컷 여부. */
  readonly explicitNeutralBridge?: boolean;
}

export interface ActionAxisContinuityInput {
  readonly cuts: readonly ActionCutShot[];
  readonly groundPlane?: ActionGroundPlane;
  readonly onAxisToleranceDeg?: number;
  readonly minRecommendedAngleDeltaDeg?: number;
}

export interface ActionCutEvaluation {
  readonly cutId: string; readonly cutIndex: number;
  readonly axisLength: number; readonly signedCrossProduct: number; readonly perpendicularDistance: number;
  readonly cameraAzimuthDeg: number; readonly side: CameraAxisSide;
  readonly screenXActorA: number; readonly screenXActorB: number; readonly actorAAppearsLeftOfB: boolean;
}

export interface CameraCorrectionSuggestion {
  readonly mirroredCameraPosition: Vec3Point; readonly neutralBridgeCameraPosition: Vec3Point;
  readonly suggestedAzimuthDeg: number; readonly preservesThirtyDegreeRule: boolean; readonly guideKo: string;
}

export interface ActionAxisViolation {
  readonly fromCutId: string; readonly toCutId: string;
  readonly fromCutIndex: number; readonly toCutIndex: number;
  readonly previousSide: "positive-half" | "negative-half";
  readonly offendingSide: "positive-half" | "negative-half";
  readonly azimuthJumpDeg: number; readonly screenOrderFlipped: boolean;
  readonly suggestion: CameraCorrectionSuggestion; readonly messageKo: string;
}

export interface ActionAxisContinuityReport {
  readonly groundPlane: ActionGroundPlane;
  readonly evaluations: readonly ActionCutEvaluation[];
  readonly violations: readonly ActionAxisViolation[];
  readonly bridgedCrossingCount: number; readonly continuityPass: boolean; readonly serverCostKrw: 0;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function wrapAngleDeg(deg: number): number {
  let wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  if (wrapped <= -180) wrapped += 360;
  return wrapped;
}

function projectGround(pt: Vec3Point, plane: ActionGroundPlane): Point2D {
  return plane === "xz" ? { x: pt.x, y: pt.z } : { x: pt.x, y: pt.y };
}

function liftGround(pt2d: Point2D, heightCoord: number, plane: ActionGroundPlane): Vec3Point {
  return plane === "xz"
    ? { x: pt2d.x, y: heightCoord, z: pt2d.y }
    : { x: pt2d.x, y: pt2d.y, z: heightCoord };
}

function getHeightCoord(pt: Vec3Point, plane: ActionGroundPlane): number {
  return plane === "xz" ? pt.y : pt.z;
}

function computeScreenLeftRightOrder(
  shot: ActionCutShot,
  plane: ActionGroundPlane,
): { readonly screenXA: number; readonly screenXB: number } {
  const lookAt: Vec3Point = shot.cameraLookAt ?? {
    x: (shot.actorA.x + shot.actorB.x) * 0.5,
    y: (shot.actorA.y + shot.actorB.y) * 0.5,
    z: (shot.actorA.z + shot.actorB.z) * 0.5,
  };
  let fx = lookAt.x - shot.cameraPosition.x;
  let fy = lookAt.y - shot.cameraPosition.y;
  let fz = lookAt.z - shot.cameraPosition.z;
  const fLen = Math.hypot(fx, fy, fz);
  if (fLen <= EPSILON) return { screenXA: 0, screenXB: 0 };
  fx /= fLen; fy /= fLen; fz /= fLen;

  const up: Vec3Point = plane === "xz" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  let rx = fy * up.z - fz * up.y;
  let ry = fz * up.x - fx * up.z;
  let rz = fx * up.y - fy * up.x;
  const rLen = Math.hypot(rx, ry, rz);
  if (rLen <= EPSILON) return { screenXA: 0, screenXB: 0 };
  rx /= rLen; ry /= rLen; rz /= rLen;

  const projectActor = (actor: Vec3Point): number => {
    const dx = actor.x - shot.cameraPosition.x;
    const dy = actor.y - shot.cameraPosition.y;
    const dz = actor.z - shot.cameraPosition.z;
    const depth = Math.max(0.05, dx * fx + dy * fy + dz * fz);
    return (dx * rx + dy * ry + dz * rz) / depth;
  };
  return { screenXA: projectActor(shot.actorA), screenXB: projectActor(shot.actorB) };
}

/** 연속된 연출 컷들의 180도 액션 축 연속성을 검증하고 거울 반사·중립 브리지 카메라 좌표를 산출한다. */
export function analyzeActionAxisContinuity(input: ActionAxisContinuityInput): ActionAxisContinuityReport {
  const plane: ActionGroundPlane = input.groundPlane ?? "xz";
  const onAxisToleranceDeg = Math.max(0.5, input.onAxisToleranceDeg ?? 8);
  const minRecommendedAngleDeltaDeg = Math.max(5, input.minRecommendedAngleDeltaDeg ?? 30);

  const orderedCuts = [...input.cuts].sort((a, b) => a.cutIndex - b.cutIndex);
  const evaluations: ActionCutEvaluation[] = [];
  const violations: ActionAxisViolation[] = [];

  let establishedEval: ActionCutEvaluation | null = null;
  let pendingNeutralBridge = false;
  let lastNonNeutralBeforeBridge: ActionCutEvaluation | null = null;
  let bridgedCrossingCount = 0;

  for (const cut of orderedCuts) {
    const a2 = projectGround(cut.actorA, plane);
    const b2 = projectGround(cut.actorB, plane);
    const c2 = projectGround(cut.cameraPosition, plane);
    const ux = b2.x - a2.x;
    const uy = b2.y - a2.y;
    const axisLength = Math.hypot(ux, uy);
    const { screenXA, screenXB } = computeScreenLeftRightOrder(cut, plane);

    if (axisLength <= EPSILON) {
      evaluations.push({
        cutId: cut.cutId, cutIndex: cut.cutIndex, axisLength: 0, signedCrossProduct: 0,
        perpendicularDistance: 0, cameraAzimuthDeg: 0, side: "degenerate",
        screenXActorA: screenXA, screenXActorB: screenXB, actorAAppearsLeftOfB: screenXA <= screenXB,
      });
      continue;
    }

    const vx = c2.x - a2.x;
    const vy = c2.y - a2.y;
    const signedCross = ux * vy - uy * vx;
    const midX = (a2.x + b2.x) * 0.5;
    const midY = (a2.y + b2.y) * 0.5;
    const wx = c2.x - midX;
    const wy = c2.y - midY;
    const azimuthDeg = Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy) * RAD_TO_DEG;
    const angleFromAxisLineDeg = Math.min(Math.abs(azimuthDeg), Math.abs(180 - Math.abs(azimuthDeg)));

    const isNeutral =
      cut.explicitNeutralBridge === true ||
      Math.hypot(wx, wy) <= EPSILON ||
      angleFromAxisLineDeg <= onAxisToleranceDeg;
    const side: CameraAxisSide = isNeutral
      ? "neutral-on-axis"
      : signedCross > 0 ? "positive-half" : "negative-half";

    const evaluation: ActionCutEvaluation = {
      cutId: cut.cutId, cutIndex: cut.cutIndex, axisLength, signedCrossProduct: signedCross,
      perpendicularDistance: signedCross / axisLength, cameraAzimuthDeg: azimuthDeg, side,
      screenXActorA: screenXA, screenXActorB: screenXB, actorAAppearsLeftOfB: screenXA < screenXB,
    };
    evaluations.push(evaluation);

    if (side === "neutral-on-axis") {
      if (establishedEval !== null) {
        lastNonNeutralBeforeBridge = establishedEval;
        pendingNeutralBridge = true;
      }
      establishedEval = null;
      continue;
    }

    if (pendingNeutralBridge && lastNonNeutralBeforeBridge !== null) {
      if (
        (lastNonNeutralBeforeBridge.side === "positive-half" ||
          lastNonNeutralBeforeBridge.side === "negative-half") &&
        lastNonNeutralBeforeBridge.side !== side
      ) {
        bridgedCrossingCount += 1;
      }
      pendingNeutralBridge = false;
      lastNonNeutralBeforeBridge = null;
    }

    if (
      establishedEval !== null &&
      (establishedEval.side === "positive-half" || establishedEval.side === "negative-half") &&
      establishedEval.side !== side
    ) {
      const dirX = ux / axisLength;
      const dirY = uy / axisLength;
      const projOnAxis = vx * dirX + vy * dirY;
      const footX = a2.x + projOnAxis * dirX;
      const footY = a2.y + projOnAxis * dirY;
      let mirror2dX = footX - (c2.x - footX);
      let mirror2dY = footY - (c2.y - footY);
      let suggestedAzimuthDeg = -azimuthDeg;

      const angleDiffFromPrev = Math.abs(wrapAngleDeg(suggestedAzimuthDeg - establishedEval.cameraAzimuthDeg));
      let preservesThirty = angleDiffFromPrev >= minRecommendedAngleDeltaDeg;
      const radiusFromMid = Math.max(0.5, Math.hypot(wx, wy));

      if (!preservesThirty) {
        const sign = establishedEval.side === "positive-half" ? 1 : -1;
        const nudgedMag = clamp(
          Math.abs(establishedEval.cameraAzimuthDeg) + minRecommendedAngleDeltaDeg,
          onAxisToleranceDeg + 12,
          168 - onAxisToleranceDeg,
        );
        suggestedAzimuthDeg = sign * nudgedMag;
        const worldAngleRad = Math.atan2(dirY, dirX) + suggestedAzimuthDeg * DEG_TO_RAD;
        mirror2dX = midX + Math.cos(worldAngleRad) * radiusFromMid;
        mirror2dY = midY + Math.sin(worldAngleRad) * radiusFromMid;
        preservesThirty = true;
      }

      const camHeight = getHeightCoord(cut.cameraPosition, plane);
      const bridgeSign = projOnAxis >= 0 ? 1 : -1;
      const bridge2d: Point2D = {
        x: midX + dirX * radiusFromMid * bridgeSign,
        y: midY + dirY * radiusFromMid * bridgeSign,
      };
      const azimuthJumpDeg = Math.abs(wrapAngleDeg(azimuthDeg - establishedEval.cameraAzimuthDeg));

      violations.push({
        fromCutId: establishedEval.cutId, toCutId: cut.cutId,
        fromCutIndex: establishedEval.cutIndex, toCutIndex: cut.cutIndex,
        previousSide: establishedEval.side, offendingSide: side, azimuthJumpDeg,
        screenOrderFlipped: evaluation.actorAAppearsLeftOfB !== establishedEval.actorAAppearsLeftOfB,
        suggestion: {
          mirroredCameraPosition: liftGround({ x: mirror2dX, y: mirror2dY }, camHeight, plane),
          neutralBridgeCameraPosition: liftGround(bridge2d, camHeight, plane),
          suggestedAzimuthDeg, preservesThirtyDegreeRule: preservesThirty,
          guideKo: "카메라를 상호작용 축 건너편 거울 위치로 되돌리거나, 두 컷 사이에 정면·축상 중립 컷을 한 컷 배치해 시선 방향을 자연스럽게 전환하세요.",
        },
        messageKo: `${establishedEval.cutId}에서 ${cut.cutId}로 넘어갈 때 180도 연출 축을 가로질러 인물 좌우 배치가 뒤집혔습니다(방위각 변화 ${azimuthJumpDeg.toFixed(1)}도).`,
      });
    }
    establishedEval = evaluation;
  }

  return {
    groundPlane: plane, evaluations, violations, bridgedCrossingCount,
    continuityPass: violations.length === 0, serverCostKrw: 0,
  };
}

// ============================================================================
// 2. 절차적 집중선 · 베타플래시(유니플래시) · 법선 정렬 교차 해칭 벡터 엔진
// ============================================================================

export interface VectorStrokeSample { readonly x: number; readonly y: number; readonly widthPx: number }
export interface TaperedVectorPolyline {
  readonly strokeId: string; readonly layerIndex: number; readonly points: readonly VectorStrokeSample[];
}

export interface RadialSpeedlineOptions {
  readonly frame: Rect2D; readonly vanishingPoint: Point2D; readonly lineCount: number;
  readonly innerClearRadiusX: number; readonly innerClearRadiusY?: number;
  readonly outerStrokeWidthPx?: number; readonly tipStrokeWidthPx?: number;
  readonly lengthJitterRatio?: number; readonly angleJitterRatio?: number; readonly seed?: number;
}

export interface BetaFlashFrameOptions {
  readonly frame: Rect2D; readonly center?: Point2D; readonly spikeCount: number;
  readonly innerRadiusX: number; readonly innerRadiusY: number;
  readonly outerRadiusX: number; readonly outerRadiusY: number;
  readonly baseSpikeWidthPx?: number; readonly solidOuterRim?: boolean;
  readonly doubleRingUniFlash?: boolean; readonly seed?: number;
}

export interface ShadeNormalGrid {
  readonly originX: number; readonly originY: number;
  readonly cols: number; readonly rows: number; readonly cellSizePx: number;
  readonly luminance01: Float32Array; readonly normalX: Float32Array; readonly normalY: Float32Array;
}

export interface CrossHatchOptions {
  readonly grid: ShadeNormalGrid;
  readonly seedSpacingPx?: number; readonly stepLengthPx?: number; readonly stepsPerSide?: number;
  readonly maxStrokeWidthPx?: number; readonly primaryShadowThreshold?: number;
  readonly secondaryShadowThreshold?: number; readonly deepShadowThreshold?: number;
  readonly secondaryCrossAngleDeg?: number;
}

export interface ProceduralEffectVectorBatch {
  readonly kind: "speedlines" | "beta-flash" | "cross-hatching";
  readonly polylines: readonly TaperedVectorPolyline[];
  readonly totalVertexCount: number; readonly elapsedMs: number; readonly rasterBlurPx: 0;
}

function createMulberry32(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function rayFrameExitDistance(origin: Point2D, dirX: number, dirY: number, frame: Rect2D): number {
  const minX = frame.x;
  const maxX = frame.x + frame.width;
  const minY = frame.y;
  const maxY = frame.y + frame.height;
  let bestT = Infinity;

  if (Math.abs(dirX) > EPSILON) {
    for (const boundX of [minX, maxX]) {
      const t = (boundX - origin.x) / dirX;
      if (t > 0) {
        const yAt = origin.y + t * dirY;
        if (yAt >= minY - EPSILON && yAt <= maxY + EPSILON && t < bestT) bestT = t;
      }
    }
  }
  if (Math.abs(dirY) > EPSILON) {
    for (const boundY of [minY, maxY]) {
      const t = (boundY - origin.y) / dirY;
      if (t > 0) {
        const xAt = origin.x + t * dirX;
        if (xAt >= minX - EPSILON && xAt <= maxX + EPSILON && t < bestT) bestT = t;
      }
    }
  }
  return Number.isFinite(bestT) ? bestT : Math.hypot(frame.width, frame.height);
}

/** 소실점 기준 테이퍼드 방사형 집중선 벡터 폴리라인 배치를 결정론적으로 생성한다. */
export function generateRadialSpeedlines(options: RadialSpeedlineOptions): ProceduralEffectVectorBatch {
  const startedAt = nowMs();
  const count = Math.max(1, Math.floor(options.lineCount));
  const rx = Math.max(2, options.innerClearRadiusX);
  const ry = Math.max(2, options.innerClearRadiusY ?? rx);
  const outerW = Math.max(0.4, options.outerStrokeWidthPx ?? 3.4);
  const tipW = Math.max(0.05, options.tipStrokeWidthPx ?? 0.18);
  const lenJitter = clamp(options.lengthJitterRatio ?? 0.24, 0, 0.75);
  const angJitter = clamp(options.angleJitterRatio ?? 0.35, 0, 0.9);
  const rng = createMulberry32(options.seed ?? 20261127);

  const polylines: TaperedVectorPolyline[] = [];
  let totalVertices = 0;
  const stepAngle = (Math.PI * 2) / count;

  for (let i = 0; i < count; i += 1) {
    const angle = i * stepAngle + (rng() - 0.5) * stepAngle * angJitter;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const invEllipse = Math.hypot(dirX / rx, dirY / ry);
    const baseInnerT = invEllipse > EPSILON ? 1 / invEllipse : rx;
    const outerT = rayFrameExitDistance(options.vanishingPoint, dirX, dirY, options.frame);
    const jitteredInnerT = baseInnerT * (1 + (rng() - 0.35) * lenJitter);
    if (outerT <= jitteredInnerT + 1.5) continue;

    const widthScale = 0.65 + rng() * 0.7;
    const midT = jitteredInnerT + (outerT - jitteredInnerT) * 0.38;
    const vp = options.vanishingPoint;
    const points: readonly VectorStrokeSample[] = [
      { x: vp.x + dirX * outerT, y: vp.y + dirY * outerT, widthPx: outerW * widthScale },
      { x: vp.x + dirX * midT, y: vp.y + dirY * midT, widthPx: outerW * widthScale * 0.58 },
      { x: vp.x + dirX * jitteredInnerT, y: vp.y + dirY * jitteredInnerT, widthPx: tipW },
    ];
    polylines.push({ strokeId: `speedline-${i}`, layerIndex: 0, points });
    totalVertices += points.length;
  }

  return {
    kind: "speedlines", polylines, totalVertexCount: totalVertices,
    elapsedMs: Math.max(0, nowMs() - startedAt), rasterBlurPx: 0,
  };
}

/** 만화·웹툰 회상·감정 강조용 베타플래시(성게알 플래시 / 유니플래시) 벡터 스트로크 배치를 생성한다. */
export function generateBetaFlashFrame(options: BetaFlashFrameOptions): ProceduralEffectVectorBatch {
  const startedAt = nowMs();
  const center: Point2D = options.center ?? {
    x: options.frame.x + options.frame.width * 0.5,
    y: options.frame.y + options.frame.height * 0.5,
  };
  const spikeCount = Math.max(8, Math.floor(options.spikeCount));
  const baseWidth = Math.max(0.6, options.baseSpikeWidthPx ?? 3.8);
  const rng = createMulberry32(options.seed ?? 918273);
  const rings = options.doubleRingUniFlash === true ? 2 : 1;

  const polylines: TaperedVectorPolyline[] = [];
  let totalVertices = 0;

  for (let ring = 0; ring < rings; ring += 1) {
    const ringScale = ring === 0 ? 1 : 0.84;
    const phaseShift = ring === 0 ? 0 : Math.PI / spikeCount;
    const stepAngle = (Math.PI * 2) / spikeCount;

    for (let i = 0; i < spikeCount; i += 1) {
      const angle = i * stepAngle + phaseShift + (rng() - 0.5) * stepAngle * 0.18;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const harmonic = i % 2 === 0 ? 1 : 0.78 + rng() * 0.16;
      const innerFactor = (0.92 + rng() * 0.16) / harmonic;
      const outerFactor = options.solidOuterRim === true ? 1.18 : 1.0 + rng() * 0.08;

      const startX = center.x + cosA * options.outerRadiusX * ringScale * outerFactor;
      const startY = center.y + sinA * options.outerRadiusY * ringScale * outerFactor;
      const endX = center.x + cosA * options.innerRadiusX * ringScale * innerFactor;
      const endY = center.y + sinA * options.innerRadiusY * ringScale * innerFactor;
      const w0 = baseWidth * (i % 2 === 0 ? 1.15 : 0.82);

      const points: readonly VectorStrokeSample[] = [
        { x: startX, y: startY, widthPx: w0 },
        { x: startX + (endX - startX) * 0.55, y: startY + (endY - startY) * 0.55, widthPx: w0 * 0.48 },
        { x: endX, y: endY, widthPx: 0.12 },
      ];
      polylines.push({ strokeId: `betaflash-r${ring}-${i}`, layerIndex: ring, points });
      totalVertices += points.length;
    }
  }

  return {
    kind: "beta-flash", polylines, totalVertexCount: totalVertices,
    elapsedMs: Math.max(0, nowMs() - startedAt), rasterBlurPx: 0,
  };
}

function sampleGridField(
  grid: ShadeNormalGrid, worldX: number, worldY: number,
): { readonly inside: boolean; readonly lum: number; readonly nx: number; readonly ny: number } {
  const gx = (worldX - grid.originX) / grid.cellSizePx - 0.5;
  const gy = (worldY - grid.originY) / grid.cellSizePx - 0.5;
  if (gx < -0.5 || gy < -0.5 || gx >= grid.cols - 0.5 || gy >= grid.rows - 0.5) {
    return { inside: false, lum: 1, nx: 0, ny: 1 };
  }
  const idx = clamp(Math.round(gy), 0, grid.rows - 1) * grid.cols + clamp(Math.round(gx), 0, grid.cols - 1);
  const lum = grid.luminance01[idx] ?? 1;
  const rawNx = grid.normalX[idx] ?? 0;
  const rawNy = grid.normalY[idx] ?? 1;
  const nLen = Math.hypot(rawNx, rawNy);
  return nLen > EPSILON
    ? { inside: true, lum, nx: rawNx / nLen, ny: rawNy / nLen }
    : { inside: true, lum, nx: 0, ny: 1 };
}

/** 표면 밝기와 2D 법선 장을 따라 RK2 중점 적분으로 1·2·3단 교차 해칭 벡터 스트로크를 생성한다. */
export function generateNormalGuidedCrossHatching(options: CrossHatchOptions): ProceduralEffectVectorBatch {
  const startedAt = nowMs();
  const { grid } = options;
  const spacing = Math.max(2, options.seedSpacingPx ?? grid.cellSizePx);
  const stepLen = Math.max(1, options.stepLengthPx ?? grid.cellSizePx * 0.65);
  const stepsPerSide = Math.max(2, Math.floor(options.stepsPerSide ?? 4));
  const maxWidth = Math.max(0.4, options.maxStrokeWidthPx ?? 2.2);
  const t1 = clamp(options.primaryShadowThreshold ?? 0.65, 0.05, 0.98);
  const t2 = clamp(options.secondaryShadowThreshold ?? 0.38, 0.02, t1);
  const t3 = clamp(options.deepShadowThreshold ?? 0.18, 0.01, t2);
  const crossRad = (options.secondaryCrossAngleDeg ?? 52) * DEG_TO_RAD;

  const layerConfigs = [
    { threshold: t1, rotRad: 0 },
    { threshold: t2, rotRad: crossRad },
    { threshold: t3, rotRad: -crossRad },
  ] as const;

  const polylines: TaperedVectorPolyline[] = [];
  let totalVertices = 0;
  const maxX = grid.originX + grid.cols * grid.cellSizePx;
  const maxY = grid.originY + grid.rows * grid.cellSizePx;

  const tangentAt = (wx: number, wy: number, cosR: number, sinR: number): Point2D | null => {
    const s = sampleGridField(grid, wx, wy);
    if (!s.inside) return null;
    return { x: -s.ny * cosR - s.nx * sinR, y: -s.ny * sinR + s.nx * cosR };
  };

  for (let layerIdx = 0; layerIdx < layerConfigs.length; layerIdx += 1) {
    const cfg = layerConfigs[layerIdx]!;
    const cosR = Math.cos(cfg.rotRad);
    const sinR = Math.sin(cfg.rotRad);
    const offset = layerIdx * (spacing * 0.33);
    let strokeSerial = 0;

    for (let sy = grid.originY + spacing * 0.5 + offset; sy < maxY; sy += spacing) {
      for (let sx = grid.originX + spacing * 0.5 + offset; sx < maxX; sx += spacing) {
        const centerSample = sampleGridField(grid, sx, sy);
        if (!centerSample.inside || centerSample.lum >= cfg.threshold) continue;

        const traceHalf = (sign: 1 | -1): VectorStrokeSample[] => {
          const acc: VectorStrokeSample[] = [];
          let cx = sx;
          let cy = sy;
          for (let step = 1; step <= stepsPerSide; step += 1) {
            const k1 = tangentAt(cx, cy, cosR, sinR);
            if (k1 === null) break;
            const k2 = tangentAt(cx + sign * k1.x * stepLen * 0.5, cy + sign * k1.y * stepLen * 0.5, cosR, sinR);
            if (k2 === null) break;
            const nx = cx + sign * k2.x * stepLen;
            const ny = cy + sign * k2.y * stepLen;
            const ns = sampleGridField(grid, nx, ny);
            if (!ns.inside || ns.lum >= cfg.threshold + 0.06) break;
            const taper = 1 - (step / (stepsPerSide + 1)) * 0.78;
            const darkness = clamp((cfg.threshold - ns.lum) / Math.max(0.08, cfg.threshold), 0.15, 1);
            acc.push({ x: nx, y: ny, widthPx: Math.max(0.14, maxWidth * darkness * taper) });
            cx = nx; cy = ny;
          }
          return acc;
        };

        const centerDarkness = clamp((cfg.threshold - centerSample.lum) / Math.max(0.08, cfg.threshold), 0.2, 1);
        const merged = [
          ...traceHalf(-1).reverse(),
          { x: sx, y: sy, widthPx: Math.max(0.2, maxWidth * centerDarkness) },
          ...traceHalf(1),
        ];
        if (merged.length < 2) continue;
        polylines.push({ strokeId: `hatch-L${layerIdx}-${strokeSerial}`, layerIndex: layerIdx, points: merged });
        strokeSerial += 1;
        totalVertices += merged.length;
      }
    }
  }

  return {
    kind: "cross-hatching", polylines, totalVertexCount: totalVertices,
    elapsedMs: Math.max(0, nowMs() - startedAt), rasterBlurPx: 0,
  };
}

// ============================================================================
// 3. 다국어 대사 팽창 대응 이방성(Anisotropic) 말풍선 자동 맞춤 솔버
// ============================================================================

export type BalloonLocalizationLocale = "ko" | "en" | "es" | "de" | "fr" | "pt" | "ja" | "zh";
export type BalloonShapeKind = "ellipse" | "rounded-rect";

export const LOCALE_SCRIPT_EXPANSION_FROM_KO: Readonly<Record<BalloonLocalizationLocale, number>> = {
  ko: 1.0, ja: 1.08, zh: 0.92, en: 1.38, fr: 1.48, pt: 1.46, es: 1.52, de: 1.6,
};

export interface KeepOutBox {
  readonly id: string; readonly label: string; readonly rect: Rect2D; readonly marginPx?: number;
}

export interface SpeechBalloonGeometry {
  readonly balloonId: string; readonly shape: BalloonShapeKind;
  readonly centerX: number; readonly centerY: number;
  readonly rx: number; readonly ry: number;
  readonly cornerRadiusPx?: number; readonly tailTip?: Point2D;
}

export interface AnisotropicBalloonFitInput {
  readonly balloon: SpeechBalloonGeometry;
  readonly sourceLocale: BalloonLocalizationLocale; readonly targetLocale: BalloonLocalizationLocale;
  readonly sourceText: string; readonly translatedText?: string;
  readonly panelBounds: Rect2D; readonly keepOutBoxes: readonly KeepOutBox[];
  readonly baseFontSizePx?: number; readonly minFontScaleRatio?: number; readonly paddingRatio?: number;
}

export interface AnisotropicBalloonFitResult {
  readonly balloonId: string; readonly shape: BalloonShapeKind;
  readonly centerX: number; readonly centerY: number;
  readonly rx: number; readonly ry: number; readonly dx: number; readonly dy: number;
  readonly targetExpansionRatio: number; readonly achievedAreaRatio: number;
  readonly fontSizePx: number; readonly fontScaleApplied: number; readonly estimatedLineCount: number;
  readonly faceOverlapCount: number; readonly minKeepOutClearancePx: number;
  readonly fitsWithoutKeepOutCollision: boolean; readonly tailAnchorOnPerimeter: Point2D;
}

function estimateVisualUnits(text: string): number {
  let units = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x20) units += 0.35;
    else if ((code >= 0x1100 && code <= 0xd7af) || (code >= 0x3000 && code <= 0x9fff)) units += 1.0;
    else units += 0.58;
  }
  return Math.max(1, units);
}

function inscribedTextRect(
  shape: BalloonShapeKind, rx: number, ry: number, padRatio: number,
): { readonly width: number; readonly height: number } {
  const factor = shape === "ellipse" ? Math.SQRT1_2 * (1 - padRatio) : 1 - padRatio;
  return { width: Math.max(8, 2 * rx * factor), height: Math.max(8, 2 * ry * factor) };
}

function signedDistanceBalloonToAabb(
  shape: BalloonShapeKind, cx: number, cy: number, rx: number, ry: number,
  cornerRadiusPx: number, box: Rect2D, marginPx: number,
): number {
  const qx = clamp(cx, box.x - marginPx, box.x + box.width + marginPx);
  const qy = clamp(cy, box.y - marginPx, box.y + box.height + marginPx);
  const dx = Math.abs(qx - cx);
  const dy = Math.abs(qy - cy);

  if (shape === "ellipse") {
    if (dx <= EPSILON && dy <= EPSILON) return -Math.min(rx, ry);
    return (Math.hypot(dx / Math.max(EPSILON, rx), dy / Math.max(EPSILON, ry)) - 1) * Math.min(rx, ry);
  }

  const rCorner = clamp(cornerRadiusPx, 0, Math.min(rx, ry));
  const outsideDist = Math.hypot(Math.max(0, dx - (rx - rCorner)), Math.max(0, dy - (ry - rCorner))) - rCorner;
  const insideDist = Math.min(Math.max(dx - (rx - rCorner), dy - (ry - rCorner)), 0);
  return outsideDist + insideDist;
}

/** 다국어 번역 팽창 시 인물 얼굴 보호 박스를 침범하지 않도록 말풍선 반경과 중심 이동을 최적화한다. */
export function fitSpeechBalloonForLocaleExpansion(input: AnisotropicBalloonFitInput): AnisotropicBalloonFitResult {
  const { balloon, panelBounds } = input;
  const baseFontPx = Math.max(9, input.baseFontSizePx ?? 14);
  const minFontScale = clamp(input.minFontScaleRatio ?? 0.82, 0.6, 1);
  const padRatio = clamp(input.paddingRatio ?? 0.14, 0.04, 0.35);
  const cornerR = balloon.cornerRadiusPx ?? Math.min(balloon.rx, balloon.ry) * 0.28;

  const empiricalRatio =
    LOCALE_SCRIPT_EXPANSION_FROM_KO[input.targetLocale] /
    Math.max(0.5, LOCALE_SCRIPT_EXPANSION_FROM_KO[input.sourceLocale]);
  const measuredRatio =
    input.translatedText !== undefined && input.translatedText.trim().length > 0
      ? estimateVisualUnits(input.translatedText) / estimateVisualUnits(input.sourceText)
      : empiricalRatio;
  const targetExpansionRatio = clamp(Math.max(empiricalRatio, measuredRatio * 1.04), 0.85, 2.4);

  const baseInscribed = inscribedTextRect(balloon.shape, balloon.rx, balloon.ry, padRatio);
  const baseArea = baseInscribed.width * baseInscribed.height;
  const targetArea = baseArea * targetExpansionRatio;
  const baseAspect = balloon.rx / Math.max(EPSILON, balloon.ry);

  const checkCandidate = (
    cx: number, cy: number, rx: number, ry: number,
  ): { readonly valid: boolean; readonly overlapCount: number; readonly minClearance: number } => {
    const pMargin = 2;
    if (
      cx - rx < panelBounds.x + pMargin || cx + rx > panelBounds.x + panelBounds.width - pMargin ||
      cy - ry < panelBounds.y + pMargin || cy + ry > panelBounds.y + panelBounds.height - pMargin
    ) {
      return { valid: false, overlapCount: 1, minClearance: -10 };
    }
    let overlaps = 0;
    let minClear = Infinity;
    for (const ko of input.keepOutBoxes) {
      const dist = signedDistanceBalloonToAabb(balloon.shape, cx, cy, rx, ry, cornerR, ko.rect, ko.marginPx ?? 4);
      if (dist < minClear) minClear = dist;
      if (dist < 0) overlaps += 1;
    }
    if (!Number.isFinite(minClear)) minClear = Math.min(panelBounds.width, panelBounds.height);
    return { valid: overlaps === 0, overlapCount: overlaps, minClearance: minClear };
  };

  const maxShiftX = Math.min(panelBounds.width * 0.28, balloon.rx * 1.4);
  const maxShiftY = Math.min(panelBounds.height * 0.28, balloon.ry * 1.4);
  const shiftFracs = [0, -0.25, 0.25, -0.55, 0.55, -0.9, 0.9] as const;
  const anisoMultipliers = [1.0, 0.82, 1.22, 0.66, 1.48, 0.54, 1.78] as const;

  let bestCx = balloon.centerX;
  let bestCy = balloon.centerY;
  let bestRx = balloon.rx;
  let bestRy = balloon.ry;
  let bestClearance = checkCandidate(bestCx, bestCy, bestRx, bestRy).minClearance;
  let bestCost = Infinity;
  let foundValid = false;

  for (const fx of shiftFracs) {
    const cx = balloon.centerX + fx * maxShiftX;
    for (const fy of shiftFracs) {
      const cy = balloon.centerY + fy * maxShiftY;
      for (const aniso of anisoMultipliers) {
        const rootA = Math.sqrt(aniso);
        let lo = 0.85;
        let hi = Math.sqrt(targetExpansionRatio) * 1.03;
        let feasibleScale = 0;

        for (let iter = 0; iter < 12; iter += 1) {
          const mid = (lo + hi) * 0.5;
          if (checkCandidate(cx, cy, balloon.rx * mid * rootA, (balloon.ry * mid) / rootA).valid) {
            feasibleScale = mid; lo = mid;
          } else {
            hi = mid;
          }
        }
        if (feasibleScale <= 0) continue;

        const chosenScale = Math.min(feasibleScale, Math.sqrt(targetExpansionRatio));
        const candRx = balloon.rx * chosenScale * rootA;
        const candRy = (balloon.ry * chosenScale) / rootA;
        const verify = checkCandidate(cx, cy, candRx, candRy);
        if (!verify.valid) continue;

        const insc = inscribedTextRect(balloon.shape, candRx, candRy, padRatio);
        const shortfallRatio = Math.max(0, (targetArea - insc.width * insc.height) / Math.max(1, targetArea));
        const anisoPenalty = Math.pow(Math.log(candRx / Math.max(EPSILON, candRy) / baseAspect), 2);
        const shiftNorm =
          (Math.pow(cx - balloon.centerX, 2) + Math.pow(cy - balloon.centerY, 2)) /
          Math.max(1, balloon.rx * balloon.rx + balloon.ry * balloon.ry);

        const cost = shortfallRatio * 40 + anisoPenalty * 1.35 + shiftNorm * 0.9;
        if (cost < bestCost) {
          bestCost = cost; bestCx = cx; bestCy = cy; bestRx = candRx; bestRy = candRy;
          bestClearance = verify.minClearance; foundValid = true;
        }
      }
    }
  }

  const finalCheck = checkCandidate(bestCx, bestCy, bestRx, bestRy);
  const finalInscribed = inscribedTextRect(balloon.shape, bestRx, bestRy, padRatio);
  const achievedAreaRatio = (finalInscribed.width * finalInscribed.height) / Math.max(1, baseArea);
  const fontScaleApplied =
    achievedAreaRatio >= targetExpansionRatio
      ? 1
      : clamp(Math.sqrt(achievedAreaRatio / targetExpansionRatio), minFontScale, 1);
  const fontSizePx = Number((baseFontPx * fontScaleApplied).toFixed(2));
  const totalTextWidthPx = estimateVisualUnits(input.translatedText ?? input.sourceText) * fontSizePx * 0.95;
  const tailTarget = balloon.tailTip ?? { x: bestCx, y: bestCy + bestRy + 24 };
  const tAngle = Math.atan2(tailTarget.y - bestCy, tailTarget.x - bestCx);

  return {
    balloonId: balloon.balloonId, shape: balloon.shape, centerX: bestCx, centerY: bestCy,
    rx: bestRx, ry: bestRy, dx: bestCx - balloon.centerX, dy: bestCy - balloon.centerY,
    targetExpansionRatio, achievedAreaRatio, fontSizePx, fontScaleApplied,
    estimatedLineCount: Math.max(1, Math.ceil(totalTextWidthPx / finalInscribed.width)),
    faceOverlapCount: finalCheck.overlapCount,
    minKeepOutClearancePx: foundValid ? bestClearance : finalCheck.minClearance,
    fitsWithoutKeepOutCollision: finalCheck.valid,
    tailAnchorOnPerimeter: { x: bestCx + Math.cos(tAngle) * bestRx, y: bestCy + Math.sin(tAngle) * bestRy },
  };
}
