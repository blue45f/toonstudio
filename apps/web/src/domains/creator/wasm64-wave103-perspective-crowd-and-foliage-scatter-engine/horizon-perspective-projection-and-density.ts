/**
 * Wave 103 — 원근 지평선 잠금 투영 및 대기 깊이 스타일링 모듈.
 *
 * - 수평 핀홀 카메라 지면 투영 모델(`PerspectiveGroundStage`)
 * - 지면 Y ↔ 월드 깊이 Z 정·역투영 및 눈높이 지평선 일치 법칙(Horizon Eye-Level Law) 보장
 * - 로그 깊이 기반 대기 원근감(3단계 디테일 티어·안개 혼색·선 굵기·채도 감쇠) 계산
 * - 원근 지면 그리드 및 화면 경계 상자(AABB) 교차 판정 유틸리티
 */

export interface ScreenPoint2D {
  readonly xPx: number;
  readonly yPx: number;
}

export interface WorldGroundPoint2D {
  readonly xMeters: number;
  readonly zMeters: number;
}

export interface ScreenBoundingBox {
  readonly minXPx: number;
  readonly minYPx: number;
  readonly maxXPx: number;
  readonly maxYPx: number;
}

export type DetailTier =
  | "detailed-foreground"
  | "midground-contour"
  | "soft-background-wash";

export interface PerspectiveGroundStage {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly horizonYPx: number;
  readonly cameraEyeHeightMeters: number;
  readonly focalLengthPx: number;
  readonly nearGroundYPx: number;
  readonly farGroundYPx: number;
  readonly principalXPx?: number;
}

export interface StageValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export interface ResolvedStageDepthRange {
  readonly principalXPx: number;
  readonly nearDepthMeters: number;
  readonly farDepthMeters: number;
  readonly horizonCompressionFactor: number;
}

export interface ProjectedStandingFigure {
  readonly worldXMeters: number;
  readonly depthMeters: number;
  readonly physicalHeightMeters: number;
  readonly physicalWidthMeters: number;
  readonly eyeHeightMeters: number;
  readonly footScreenX: number;
  readonly footScreenY: number;
  readonly headScreenY: number;
  readonly eyeScreenY: number;
  readonly canonicalEyeScreenY: number;
  readonly screenHeightPx: number;
  readonly screenWidthPx: number;
  readonly horizonEyeErrorPx: number;
  readonly canonicalHorizonEyeErrorPx: number;
  readonly bbox: ScreenBoundingBox;
}

export interface AtmosphericDepthStyle {
  readonly detailTier: DetailTier;
  readonly normalizedDepth01: number;
  readonly hazeBlend: number;
  readonly strokeWidthPx: number;
  readonly chromaScale: number;
  readonly silhouetteOpacity: number;
  readonly lightnessLift: number;
}

export interface GroundSpanMetrics {
  readonly depthMeters: number;
  readonly footYPx: number;
  readonly pixelsPerMeter: number;
  readonly worldMinXMeters: number;
  readonly worldMaxXMeters: number;
  readonly visibleWorldWidthMeters: number;
  readonly screenCompressionScale: number;
}

export interface PerspectiveGridLine {
  readonly kind: "depth-horizontal" | "converging-radial";
  readonly start: ScreenPoint2D;
  readonly end: ScreenPoint2D;
  readonly depthMeters?: number;
  readonly worldXMeters?: number;
}

export interface PerspectiveGroundGrid {
  readonly horizonLine: { readonly start: ScreenPoint2D; readonly end: ScreenPoint2D };
  readonly depthLines: readonly PerspectiveGridLine[];
  readonly radialLines: readonly PerspectiveGridLine[];
}

export const DEFAULT_PERSPECTIVE_STAGE: PerspectiveGroundStage = {
  viewportWidthPx: 1200,
  viewportHeightPx: 800,
  horizonYPx: 280,
  cameraEyeHeightMeters: 1.62,
  focalLengthPx: 920,
  nearGroundYPx: 760,
  farGroundYPx: 312,
  principalXPx: 600,
};

const EPSILON = 1e-9;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 스테이지 파라미터의 기하학적 유효성을 검사한다.
 */
export function validatePerspectiveGroundStage(
  stage: PerspectiveGroundStage,
): StageValidationResult {
  const issues: string[] = [];

  if (!Number.isFinite(stage.viewportWidthPx) || stage.viewportWidthPx <= 0) {
    issues.push("viewportWidthPx는 0보다 큰 유한수여야 합니다.");
  }
  if (!Number.isFinite(stage.viewportHeightPx) || stage.viewportHeightPx <= 0) {
    issues.push("viewportHeightPx는 0보다 큰 유한수여야 합니다.");
  }
  if (!Number.isFinite(stage.cameraEyeHeightMeters) || stage.cameraEyeHeightMeters <= 0) {
    issues.push("cameraEyeHeightMeters는 0보다 큰 유한수여야 합니다.");
  }
  if (!Number.isFinite(stage.focalLengthPx) || stage.focalLengthPx <= 0) {
    issues.push("focalLengthPx는 0보다 큰 유한수여야 합니다.");
  }
  if (!Number.isFinite(stage.horizonYPx)) {
    issues.push("horizonYPx는 유한수여야 합니다.");
  } else if (stage.horizonYPx < 0 || stage.horizonYPx >= stage.viewportHeightPx) {
    issues.push("horizonYPx는 뷰포트 세로 범위 [0, viewportHeightPx) 안에 있어야 합니다.");
  }
  if (!Number.isFinite(stage.farGroundYPx)) {
    issues.push("farGroundYPx는 유한수여야 합니다.");
  }
  if (!Number.isFinite(stage.nearGroundYPx)) {
    issues.push("nearGroundYPx는 유한수여야 합니다.");
  }
  if (
    Number.isFinite(stage.horizonYPx) &&
    Number.isFinite(stage.farGroundYPx) &&
    stage.farGroundYPx <= stage.horizonYPx
  ) {
    issues.push("farGroundYPx는 horizonYPx보다 커야 합니다(지평선 아래 지면).");
  }
  if (
    Number.isFinite(stage.farGroundYPx) &&
    Number.isFinite(stage.nearGroundYPx) &&
    stage.nearGroundYPx <= stage.farGroundYPx
  ) {
    issues.push("nearGroundYPx는 farGroundYPx보다 커야 합니다.");
  }
  if (
    Number.isFinite(stage.nearGroundYPx) &&
    Number.isFinite(stage.viewportHeightPx) &&
    stage.nearGroundYPx > stage.viewportHeightPx
  ) {
    issues.push("nearGroundYPx는 viewportHeightPx 이하이어야 합니다.");
  }
  if (stage.principalXPx !== undefined) {
    if (!Number.isFinite(stage.principalXPx)) {
      issues.push("principalXPx는 유한수여야 합니다.");
    } else if (
      Number.isFinite(stage.viewportWidthPx) &&
      (stage.principalXPx < -stage.viewportWidthPx ||
        stage.principalXPx > stage.viewportWidthPx * 2)
    ) {
      issues.push("principalXPx가 허용된 수평 투영 범위를 벗어났습니다.");
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertValidPerspectiveGroundStage(stage: PerspectiveGroundStage): void {
  const result = validatePerspectiveGroundStage(stage);
  if (!result.valid) {
    throw new RangeError(`유효하지 않은 PerspectiveGroundStage: ${result.issues.join(" ")}`);
  }
}

export function resolvePrincipalXPx(stage: PerspectiveGroundStage): number {
  return stage.principalXPx ?? stage.viewportWidthPx * 0.5;
}

/**
 * 지면 발 위치의 화면 Y 좌표(`footYPx`)를 카메라 전방 월드 깊이(m)로 정확 변환한다.
 * 공식: Z = (cameraEyeHeightMeters * focalLengthPx) / (footYPx - horizonYPx)
 */
export function groundYToWorldDepthMeters(
  footYPx: number,
  stage: PerspectiveGroundStage,
): number {
  assertValidPerspectiveGroundStage(stage);
  if (!Number.isFinite(footYPx)) {
    throw new RangeError("footYPx는 유한수여야 합니다.");
  }
  const deltaY = footYPx - stage.horizonYPx;
  if (deltaY <= EPSILON) {
    throw new RangeError(
      `footYPx(${footYPx})는 horizonYPx(${stage.horizonYPx})보다 커야 지면 깊이를 계산할 수 있습니다.`,
    );
  }
  return (stage.cameraEyeHeightMeters * stage.focalLengthPx) / deltaY;
}

/**
 * 카메라 전방 월드 깊이(m)를 지면 발 위치 화면 Y 좌표(`footYPx`)로 변환한다.
 */
export function worldDepthToGroundYPx(
  depthMeters: number,
  stage: PerspectiveGroundStage,
): number {
  assertValidPerspectiveGroundStage(stage);
  if (!Number.isFinite(depthMeters) || depthMeters <= EPSILON) {
    throw new RangeError("depthMeters는 0보다 큰 유한수여야 합니다.");
  }
  return stage.horizonYPx + (stage.cameraEyeHeightMeters * stage.focalLengthPx) / depthMeters;
}

/**
 * 깊이 `depthMeters`에 서 있는 물리 높이 `physicalHeightMeters`의 화면 픽셀 높이를 계산한다.
 * 공식: H_px = (physicalHeightMeters * focalLengthPx) / depthMeters
 * 눈높이가 `cameraEyeHeightMeters`와 같은 직립 인물은 깊이와 무관하게 눈 Y가 `horizonYPx`에 정확히 정렬된다.
 */
export function worldDepthToScreenHeightPx(
  physicalHeightMeters: number,
  depthMeters: number,
  stage: PerspectiveGroundStage,
): number {
  assertValidPerspectiveGroundStage(stage);
  if (!Number.isFinite(physicalHeightMeters) || physicalHeightMeters < 0) {
    throw new RangeError("physicalHeightMeters는 0 이상의 유한수여야 합니다.");
  }
  if (!Number.isFinite(depthMeters) || depthMeters <= EPSILON) {
    throw new RangeError("depthMeters는 0보다 큰 유한수여야 합니다.");
  }
  return (physicalHeightMeters * stage.focalLengthPx) / depthMeters;
}

/**
 * 지면 발 위치 `footYPx`에 서 있는 눈높이 `eyeHeightMeters` 인물의 눈 화면 Y 좌표를 계산한다.
 */
export function computeStandingEyeScreenY(
  footYPx: number,
  eyeHeightMeters: number,
  stage: PerspectiveGroundStage,
): number {
  const depthMeters = groundYToWorldDepthMeters(footYPx, stage);
  const eyeOffsetPx = worldDepthToScreenHeightPx(eyeHeightMeters, depthMeters, stage);
  return footYPx - eyeOffsetPx;
}

/**
 * 3D 월드 좌표 `(xMeters, yMeters, zMeters)`를 2D 화면 좌표로 투영한다(지면 yMeters = 0).
 */
export function worldToScreenPoint(
  xMeters: number,
  yMeters: number,
  zMeters: number,
  stage: PerspectiveGroundStage,
): ScreenPoint2D {
  assertValidPerspectiveGroundStage(stage);
  if (!Number.isFinite(xMeters) || !Number.isFinite(yMeters) || !Number.isFinite(zMeters)) {
    throw new RangeError("월드 좌표는 모두 유한수여야 합니다.");
  }
  if (zMeters <= EPSILON) {
    throw new RangeError("zMeters는 0보다 커야 합니다.");
  }
  const principalX = resolvePrincipalXPx(stage);
  return {
    xPx: principalX + (xMeters * stage.focalLengthPx) / zMeters,
    yPx:
      stage.horizonYPx +
      ((stage.cameraEyeHeightMeters - yMeters) * stage.focalLengthPx) / zMeters,
  };
}

/**
 * 화면 지면 좌표 `(screenXPx, footYPx)`를 월드 지면 좌표 `(xMeters, zMeters)`로 역투영한다.
 */
export function screenGroundToWorldXZ(
  screenXPx: number,
  footYPx: number,
  stage: PerspectiveGroundStage,
): WorldGroundPoint2D {
  if (!Number.isFinite(screenXPx)) {
    throw new RangeError("screenXPx는 유한수여야 합니다.");
  }
  const zMeters = groundYToWorldDepthMeters(footYPx, stage);
  const principalX = resolvePrincipalXPx(stage);
  const xMeters = ((screenXPx - principalX) * zMeters) / stage.focalLengthPx;
  return { xMeters, zMeters };
}

/**
 * 스테이지의 근경·원경 깊이 범위와 소실점 압축 배율을 산출한다.
 */
export function resolveStageDepthRange(
  stage: PerspectiveGroundStage,
): ResolvedStageDepthRange {
  assertValidPerspectiveGroundStage(stage);
  const nearDepthMeters = groundYToWorldDepthMeters(stage.nearGroundYPx, stage);
  const farDepthMeters = groundYToWorldDepthMeters(stage.farGroundYPx, stage);
  return {
    principalXPx: resolvePrincipalXPx(stage),
    nearDepthMeters,
    farDepthMeters,
    horizonCompressionFactor: farDepthMeters / nearDepthMeters,
  };
}

/**
 * 특정 깊이 `depthMeters`에서 화면 가로 폭에 대응하는 월드 지면 폭과 픽셀 축척을 계산한다.
 */
export function computeGroundSpanAtDepth(
  depthMeters: number,
  stage: PerspectiveGroundStage,
  edgeMarginPx = 0,
): GroundSpanMetrics {
  assertValidPerspectiveGroundStage(stage);
  if (!Number.isFinite(depthMeters) || depthMeters <= EPSILON) {
    throw new RangeError("depthMeters는 0보다 큰 유한수여야 합니다.");
  }
  const safeMargin = clampNumber(edgeMarginPx, 0, stage.viewportWidthPx * 0.45);
  const principalX = resolvePrincipalXPx(stage);
  const footYPx = worldDepthToGroundYPx(depthMeters, stage);
  const pixelsPerMeter = stage.focalLengthPx / depthMeters;
  const worldMinXMeters = ((safeMargin - principalX) * depthMeters) / stage.focalLengthPx;
  const worldMaxXMeters =
    ((stage.viewportWidthPx - safeMargin - principalX) * depthMeters) / stage.focalLengthPx;
  const { nearDepthMeters } = resolveStageDepthRange(stage);

  return {
    depthMeters,
    footYPx,
    pixelsPerMeter,
    worldMinXMeters,
    worldMaxXMeters,
    visibleWorldWidthMeters: Math.max(0, worldMaxXMeters - worldMinXMeters),
    screenCompressionScale: depthMeters / nearDepthMeters,
  };
}

/**
 * 월드 지면 위치에 서 있는 개체(인물·식생·가로등)를 화면으로 정확 투영하고 눈높이 오차를 검증한다.
 */
export function projectStandingFigure(params: {
  readonly worldXMeters: number;
  readonly depthMeters: number;
  readonly physicalHeightMeters: number;
  readonly physicalWidthMeters: number;
  readonly stage: PerspectiveGroundStage;
  readonly eyeHeightMeters?: number;
}): ProjectedStandingFigure {
  const {
    worldXMeters,
    depthMeters,
    physicalHeightMeters,
    physicalWidthMeters,
    stage,
  } = params;

  assertValidPerspectiveGroundStage(stage);
  if (!Number.isFinite(worldXMeters)) {
    throw new RangeError("worldXMeters는 유한수여야 합니다.");
  }
  if (!Number.isFinite(physicalWidthMeters) || physicalWidthMeters < 0) {
    throw new RangeError("physicalWidthMeters는 0 이상의 유한수여야 합니다.");
  }

  const footScreenY = worldDepthToGroundYPx(depthMeters, stage);
  const principalX = resolvePrincipalXPx(stage);
  const footScreenX = principalX + (worldXMeters * stage.focalLengthPx) / depthMeters;
  const screenHeightPx = worldDepthToScreenHeightPx(physicalHeightMeters, depthMeters, stage);
  const screenWidthPx = worldDepthToScreenHeightPx(physicalWidthMeters, depthMeters, stage);
  const headScreenY = footScreenY - screenHeightPx;

  const eyeHeightMeters = params.eyeHeightMeters ?? stage.cameraEyeHeightMeters;
  const eyeScreenY =
    footScreenY - worldDepthToScreenHeightPx(eyeHeightMeters, depthMeters, stage);
  const canonicalEyeScreenY =
    footScreenY - worldDepthToScreenHeightPx(stage.cameraEyeHeightMeters, depthMeters, stage);

  const halfWidthPx = screenWidthPx * 0.5;
  const bbox: ScreenBoundingBox = {
    minXPx: footScreenX - halfWidthPx,
    minYPx: headScreenY,
    maxXPx: footScreenX + halfWidthPx,
    maxYPx: footScreenY,
  };

  return {
    worldXMeters,
    depthMeters,
    physicalHeightMeters,
    physicalWidthMeters,
    eyeHeightMeters,
    footScreenX,
    footScreenY,
    headScreenY,
    eyeScreenY,
    canonicalEyeScreenY,
    screenHeightPx,
    screenWidthPx,
    horizonEyeErrorPx: Math.abs(eyeScreenY - stage.horizonYPx),
    canonicalHorizonEyeErrorPx: Math.abs(canonicalEyeScreenY - stage.horizonYPx),
    bbox,
  };
}

/**
 * 깊이에 따른 웹툰 대기 원근감 스타일을 계산한다.
 * - 근경(< 0.34): `detailed-foreground` (진한 잉크선·선명한 채도·낮은 안개)
 * - 중경(< 0.70): `midground-contour` (중간 윤곽선·중간 채도)
 * - 원경(>= 0.70): `soft-background-wash` (가느다란 헤어라인·최대 0.75 대기 안개 혼색)
 */
export function computeAtmosphericDepthStyling(
  depthMeters: number,
  nearDepthMeters: number,
  farDepthMeters: number,
): AtmosphericDepthStyle {
  if (
    !Number.isFinite(depthMeters) ||
    !Number.isFinite(nearDepthMeters) ||
    !Number.isFinite(farDepthMeters)
  ) {
    throw new RangeError("대기 깊이 계산 인자는 모두 유한수여야 합니다.");
  }
  if (depthMeters <= EPSILON || nearDepthMeters <= EPSILON || farDepthMeters <= nearDepthMeters) {
    throw new RangeError("nearDepthMeters > 0 이며 farDepthMeters > nearDepthMeters여야 합니다.");
  }

  const clampedDepth = clampNumber(depthMeters, nearDepthMeters, farDepthMeters);
  const logSpan = Math.log(farDepthMeters / nearDepthMeters);
  const normalizedDepth01 =
    logSpan <= EPSILON ? 0 : clamp01(Math.log(clampedDepth / nearDepthMeters) / logSpan);

  let detailTier: DetailTier;
  if (normalizedDepth01 < 0.34) {
    detailTier = "detailed-foreground";
  } else if (normalizedDepth01 < 0.7) {
    detailTier = "midground-contour";
  } else {
    detailTier = "soft-background-wash";
  }

  const hazeBlend = clampNumber(0.75 * Math.pow(normalizedDepth01, 1.15), 0, 0.75);
  const strokeWidthPx = 2.4 - 1.75 * normalizedDepth01;
  const chromaScale = 1.0 - 0.78 * normalizedDepth01;
  const silhouetteOpacity = 0.96 - 0.5 * normalizedDepth01;
  const lightnessLift = 0.26 * Math.pow(normalizedDepth01, 1.1);

  return {
    detailTier,
    normalizedDepth01,
    hazeBlend,
    strokeWidthPx,
    chromaScale,
    silhouetteOpacity,
    lightnessLift,
  };
}

/**
 * 스테이지용 원근 지면 그리드(수평 깊이선 + 소실점 수렴 방사선)를 생성한다.
 */
export function generatePerspectiveGroundGrid(
  stage: PerspectiveGroundStage,
  options?: {
    readonly depthLineCount?: number;
    readonly radialHalfCount?: number;
    readonly radialSpacingMeters?: number;
  },
): PerspectiveGroundGrid {
  const { nearDepthMeters, farDepthMeters } = resolveStageDepthRange(stage);
  const depthLineCount = Math.max(2, Math.floor(options?.depthLineCount ?? 7));
  const radialHalfCount = Math.max(1, Math.floor(options?.radialHalfCount ?? 6));
  const radialSpacingMeters = Math.max(0.5, options?.radialSpacingMeters ?? 2.5);

  const depthLines: PerspectiveGridLine[] = [];
  for (let i = 0; i < depthLineCount; i += 1) {
    const t = depthLineCount === 1 ? 0 : i / (depthLineCount - 1);
    const depthMeters = nearDepthMeters * Math.pow(farDepthMeters / nearDepthMeters, t);
    const yPx = worldDepthToGroundYPx(depthMeters, stage);
    depthLines.push({
      kind: "depth-horizontal",
      start: { xPx: 0, yPx },
      end: { xPx: stage.viewportWidthPx, yPx },
      depthMeters,
    });
  }

  const radialLines: PerspectiveGridLine[] = [];
  for (let k = -radialHalfCount; k <= radialHalfCount; k += 1) {
    const worldXMeters = k * radialSpacingMeters;
    const nearPt = worldToScreenPoint(worldXMeters, 0, nearDepthMeters, stage);
    const farPt = worldToScreenPoint(worldXMeters, 0, farDepthMeters, stage);
    radialLines.push({
      kind: "converging-radial",
      start: nearPt,
      end: farPt,
      worldXMeters,
    });
  }

  return {
    horizonLine: {
      start: { xPx: 0, yPx: stage.horizonYPx },
      end: { xPx: stage.viewportWidthPx, yPx: stage.horizonYPx },
    },
    depthLines,
    radialLines,
  };
}

/**
 * 경계 상자를 사방으로 `paddingPx`만큼 확장한다.
 */
export function expandBoundingBox(
  bbox: ScreenBoundingBox,
  paddingPx: number,
): ScreenBoundingBox {
  const safePad = Number.isFinite(paddingPx) ? Math.max(0, paddingPx) : 0;
  return {
    minXPx: bbox.minXPx - safePad,
    minYPx: bbox.minYPx - safePad,
    maxXPx: bbox.maxXPx + safePad,
    maxYPx: bbox.maxYPx + safePad,
  };
}

/**
 * 두 화면 경계 상자(AABB)가 겹치는지 판정한다(경계 접촉은 엄격 분리 허용).
 */
export function boxesIntersect(a: ScreenBoundingBox, b: ScreenBoundingBox): boolean {
  return (
    a.minXPx < b.maxXPx &&
    a.maxXPx > b.minXPx &&
    a.minYPx < b.maxYPx &&
    a.maxYPx > b.minYPx
  );
}

/**
 * 두 화면 경계 상자의 교차 면적(px^2)을 반환한다.
 */
export function computeBoxIntersectionArea(a: ScreenBoundingBox, b: ScreenBoundingBox): number {
  const overlapW = Math.min(a.maxXPx, b.maxXPx) - Math.max(a.minXPx, b.minXPx);
  const overlapH = Math.min(a.maxYPx, b.maxYPx) - Math.max(a.minYPx, b.minYPx);
  if (overlapW <= 0 || overlapH <= 0) return 0;
  return overlapW * overlapH;
}
