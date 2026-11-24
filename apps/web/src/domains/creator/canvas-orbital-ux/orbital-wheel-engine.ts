/**
 * Wave 38B — 커서 오비탈 휠 · 태블릿 플로팅 듀얼 휠 · 컨텍스트 매직 바 ·
 * 모바일 엄지 호(Thumb-Arc) 도크 · 엣지 스크럽 · 2.5× 오프셋 정밀 루페 엔진.
 *
 * - 순수 결정론적 기하·상태 솔버(브라우저 스토리지 비의존 · 원시 색상 0건).
 */

import {
  DEFAULT_ORBITAL_WHEEL_CONFIG,
  MAGIC_BAR_BLUEPRINTS,
  MAGIC_BAR_TOOL_LABELS_KO,
  MOBILE_THUMB_ACTIONS,
  ORBITAL_SECTOR_COUNT,
  ORBITAL_SECTOR_SPAN_DEG,
  ORBITAL_WHEEL_SECTORS,
  type ContextMagicBarAction,
  type ContextMagicBarModel,
  type Handedness,
  type MagicBarActionId,
  type MagicBarToolContext,
  type MobileEdgeScrubInput,
  type MobileEdgeScrubResult,
  type MobileEdgeScrubTarget,
  type MobileThumbArcButton,
  type MobileThumbArcDockLayout,
  type OrbitalPointerResolution,
  type OrbitalWheelAnchorResult,
  type OrbitalWheelConfig,
  type Point2D,
  type PrecisionLoupeInput,
  type PrecisionLoupePlacement,
  type TabletDualWheelLayout,
  type TabletDualWheelState,
  type ViewportSize,
} from "./orbital-wheel-catalog";

export {
  DEFAULT_ORBITAL_WHEEL_CONFIG,
  MAGIC_BAR_TOOL_LABELS_KO,
  ORBITAL_SECTOR_COUNT,
  ORBITAL_SECTOR_SPAN_DEG,
  ORBITAL_WHEEL_SECTORS,
  type ContextMagicBarAction,
  type ContextMagicBarModel,
  type ErgonomicDeviceMode,
  type Handedness,
  type MagicBarActionId,
  type MagicBarToolContext,
  type MobileEdgeScrubInput,
  type MobileEdgeScrubResult,
  type MobileEdgeScrubTarget,
  type MobileEdgeSide,
  type MobileThumbActionId,
  type MobileThumbArcButton,
  type MobileThumbArcDockLayout,
  type OrbitalPointerResolution,
  type OrbitalSectorDefinition,
  type OrbitalSectorId,
  type OrbitalWheelAnchorResult,
  type OrbitalWheelConfig,
  type Point2D,
  type PrecisionLoupeInput,
  type PrecisionLoupePlacement,
  type TabletDualWheelLayout,
  type TabletDualWheelState,
  type TabletLeftDialMode,
  type TabletRightDialMode,
  type ViewportSize,
} from "./orbital-wheel-catalog";

const CARDINAL_ANGLES_DEG = [0, 90, 180, 270] as const;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 각도를 `[0, 360)` 범위로 정규화한다. */
export function normalizeBearingDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  const mod = angleDeg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** 두 각도의 최단 부호 있는 차이(`[-180, 180]`)를 계산한다. */
export function signedAngleDiffDeg(fromDeg: number, toDeg: number): number {
  const diff = normalizeBearingDeg(toDeg - fromDeg);
  return diff > 180 ? diff - 360 : diff;
}

/** 12시(0°) 시계 방향 기준 좌표 오프셋 `(dx, dy)`의 방위각을 반환한다. */
export function computeBearingFromDelta(dx: number, dy: number): number {
  const rad = Math.atan2(dx, -dy);
  return normalizeBearingDeg((rad * 180) / Math.PI);
}

/**
 * 8분할 커서 오비탈 휠 포인터 솔버.
 * - 중심 데드존 이내에서는 의도치 않은 도구 오선택을 차단한다.
 * - 섹터 경계에서는 히스테리시스로 떨림을 방지하고, 섹터 중심으로 각도 자석 스냅을 적용한다.
 */
export function resolveOrbitalWheelPointer(
  dx: number,
  dy: number,
  options?: {
    readonly config?: Partial<OrbitalWheelConfig>;
    readonly previousSectorIndex?: number | null;
  },
): OrbitalPointerResolution {
  const cfg: OrbitalWheelConfig = { ...DEFAULT_ORBITAL_WHEEL_CONFIG, ...options?.config };
  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;
  const distancePx = Math.hypot(safeDx, safeDy);
  const rawBearingDeg = distancePx === 0 ? 0 : computeBearingFromDelta(safeDx, safeDy);

  if (distancePx < cfg.deadzoneRadiusPx) {
    return {
      distancePx,
      rawBearingDeg,
      inDeadzone: true,
      snappedSectorIndex: null,
      snappedSector: null,
      angularDeltaFromCenterDeg: 0,
      magneticSnapAngleDeg: null,
      visualPointerAngleDeg: null,
      magneticPullStrength: 0,
      ringDepth: "deadzone",
      heldByHysteresis: false,
    };
  }

  const rawIndex =
    Math.floor(normalizeBearingDeg(rawBearingDeg + ORBITAL_SECTOR_SPAN_DEG / 2) / ORBITAL_SECTOR_SPAN_DEG) %
    ORBITAL_SECTOR_COUNT;

  let snappedIndex = rawIndex;
  let heldByHysteresis = false;
  const prevIdx = options?.previousSectorIndex;

  if (
    typeof prevIdx === "number" &&
    prevIdx >= 0 &&
    prevIdx < ORBITAL_SECTOR_COUNT &&
    prevIdx !== rawIndex
  ) {
    const prevSector = ORBITAL_WHEEL_SECTORS[prevIdx];
    const deltaFromPrevCenter = Math.abs(signedAngleDiffDeg(prevSector.centerAngleDeg, rawBearingDeg));
    if (deltaFromPrevCenter <= ORBITAL_SECTOR_SPAN_DEG / 2 + cfg.hysteresisDeg) {
      snappedIndex = prevIdx;
      heldByHysteresis = true;
    }
  }

  const sector = ORBITAL_WHEEL_SECTORS[snappedIndex];
  const angularDeltaFromCenterDeg = signedAngleDiffDeg(sector.centerAngleDeg, rawBearingDeg);
  const halfSpan = ORBITAL_SECTOR_SPAN_DEG / 2;
  const normalizedOffCenter = clampNumber(Math.abs(angularDeltaFromCenterDeg) / halfSpan, 0, 1);
  const magneticPullStrength = Number(
    (1 - Math.pow(normalizedOffCenter, 2.2) * (1 - cfg.magneticPullFactor)).toFixed(3),
  );
  const pulledOffset = angularDeltaFromCenterDeg * (1 - magneticPullStrength * 0.72);
  const visualPointerAngleDeg = normalizeBearingDeg(sector.centerAngleDeg + pulledOffset);

  const ringDepth: OrbitalPointerResolution["ringDepth"] =
    distancePx >= cfg.flickCommitRadiusPx
      ? "flick-commit"
      : distancePx >= cfg.innerRadiusPx
        ? "primary"
        : "inner";

  return {
    distancePx: Number(distancePx.toFixed(2)),
    rawBearingDeg: Number(rawBearingDeg.toFixed(2)),
    inDeadzone: false,
    snappedSectorIndex: snappedIndex,
    snappedSector: sector,
    angularDeltaFromCenterDeg: Number(angularDeltaFromCenterDeg.toFixed(2)),
    magneticSnapAngleDeg: sector.centerAngleDeg,
    visualPointerAngleDeg: Number(visualPointerAngleDeg.toFixed(2)),
    magneticPullStrength,
    ringDepth,
    heldByHysteresis,
  };
}

/** 12시(0°) 시계 방향 극좌표를 SVG 데카르트 좌표로 변환한다. */
export function polarBearingToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  bearingDeg: number,
): Point2D {
  const rad = ((bearingDeg - 90) * Math.PI) / 180;
  return {
    x: Number((centerX + Math.cos(rad) * radius).toFixed(2)),
    y: Number((centerY + Math.sin(rad) * radius).toFixed(2)),
  };
}

/** 8분할 SVG 오비탈 휠의 단일 환형 섹터 경로 문자열을 생성한다. */
export function buildOrbitalSectorSvgPath(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  sectorIndex: number,
  gapDeg = 2.6,
): string {
  const idx = ((sectorIndex % ORBITAL_SECTOR_COUNT) + ORBITAL_SECTOR_COUNT) % ORBITAL_SECTOR_COUNT;
  const centerDeg = idx * ORBITAL_SECTOR_SPAN_DEG;
  const startDeg = centerDeg - ORBITAL_SECTOR_SPAN_DEG / 2 + gapDeg / 2;
  const endDeg = centerDeg + ORBITAL_SECTOR_SPAN_DEG / 2 - gapDeg / 2;

  const outerStart = polarBearingToCartesian(centerX, centerY, outerRadius, startDeg);
  const outerEnd = polarBearingToCartesian(centerX, centerY, outerRadius, endDeg);
  const innerEnd = polarBearingToCartesian(centerX, centerY, innerRadius, endDeg);
  const innerStart = polarBearingToCartesian(centerX, centerY, innerRadius, startDeg);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

/** 각 섹터 라벨·버튼 배치를 위한 중심 좌표를 계산한다. */
export function getOrbitalSectorCentroid(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  sectorIndex: number,
): Point2D {
  const idx = ((sectorIndex % ORBITAL_SECTOR_COUNT) + ORBITAL_SECTOR_COUNT) % ORBITAL_SECTOR_COUNT;
  return polarBearingToCartesian(centerX, centerY, (innerRadius + outerRadius) / 2, idx * ORBITAL_SECTOR_SPAN_DEG);
}

/** 오비탈 휠이 캔버스 가장자리에서 잘리지 않도록 중심 좌표를 클램핑한다. */
export function clampOrbitalWheelOrigin(
  origin: Point2D,
  viewport: ViewportSize,
  wheelOuterRadiusPx = DEFAULT_ORBITAL_WHEEL_CONFIG.outerRadiusPx,
  safeMarginPx = 16,
): OrbitalWheelAnchorResult {
  const pad = wheelOuterRadiusPx + safeMarginPx;
  const minX = Math.min(pad, viewport.width / 2);
  const maxX = Math.max(viewport.width - pad, viewport.width / 2);
  const minY = Math.min(pad, viewport.height / 2);
  const maxY = Math.max(viewport.height - pad, viewport.height / 2);

  const x = clampNumber(origin.x, minX, maxX);
  const y = clampNumber(origin.y, minY, maxY);

  return {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
    clampedX: x !== origin.x,
    clampedY: y !== origin.y,
  };
}

/** 태블릿 플로팅 듀얼 휠의 초기 상태를 생성한다. */
export function createInitialTabletDualWheelState(handedness: Handedness = "right"): TabletDualWheelState {
  return {
    handedness,
    leftMode: "brush-size",
    rightMode: "rotation",
    brushSizePx: 14,
    opacityPct: 90,
    layerNames: ["말풍선·식자", "하이라이트", "인물 선화", "인물 밑색", "배경 러프"],
    activeLayerIndex: 2,
    canvasRotationDeg: 0,
    rotationSnappedCardinalDeg: 0,
    zoomPct: 100,
    undoCursor: 6,
    undoMax: 8,
    lastFeedbackKo: "왼손 휠로 굵기·불투명도·레이어를, 오른손 휠로 회전·줌·되돌리기를 바로 조절해요.",
  };
}

/** 태블릿 왼손 플로팅 휠(굵기 · 불투명도 · 레이어 빠른 전환)을 회전 단계만큼 갱신한다. */
export function adjustTabletLeftWheel(state: TabletDualWheelState, deltaSteps: number): TabletDualWheelState {
  if (!Number.isFinite(deltaSteps) || deltaSteps === 0) return state;

  if (state.leftMode === "brush-size") {
    const stepSize = state.brushSizePx < 24 ? 2 : 6;
    const nextSize = Math.round(clampNumber(state.brushSizePx + deltaSteps * stepSize, 1, 240));
    return { ...state, brushSizePx: nextSize, lastFeedbackKo: `브러시 굵기 ${nextSize}px` };
  }

  if (state.leftMode === "opacity") {
    const nextOpacity = Math.round(clampNumber(state.opacityPct + deltaSteps * 5, 5, 100));
    return { ...state, opacityPct: nextOpacity, lastFeedbackKo: `브러시 불투명도 ${nextOpacity}%` };
  }

  const count = Math.max(1, state.layerNames.length);
  const nextIndex = Math.round(clampNumber(state.activeLayerIndex + deltaSteps, 0, count - 1));
  const layerLabel = state.layerNames[nextIndex] ?? `레이어 ${nextIndex + 1}`;
  return { ...state, activeLayerIndex: nextIndex, lastFeedbackKo: `레이어 전환: ${layerLabel}` };
}

/** 태블릿 오른손 플로팅 휠(360° 회전 · 줌 · 실행취소 스크럽)을 회전 단계만큼 갱신한다. */
export function adjustTabletRightWheel(state: TabletDualWheelState, deltaSteps: number): TabletDualWheelState {
  if (!Number.isFinite(deltaSteps) || deltaSteps === 0) return state;

  if (state.rightMode === "rotation") {
    const rawRotation = normalizeBearingDeg(state.canvasRotationDeg + deltaSteps * 15);
    let snappedAngle = rawRotation;
    let snappedCardinal: number | null = null;
    for (const cardinal of CARDINAL_ANGLES_DEG) {
      if (Math.abs(signedAngleDiffDeg(cardinal, rawRotation)) <= 4) {
        snappedAngle = cardinal;
        snappedCardinal = cardinal;
        break;
      }
    }
    return {
      ...state,
      canvasRotationDeg: Math.round(snappedAngle),
      rotationSnappedCardinalDeg: snappedCardinal,
      lastFeedbackKo:
        snappedCardinal !== null
          ? `캔버스 회전 ${Math.round(snappedAngle)}° (기준각 스냅)`
          : `캔버스 회전 ${Math.round(snappedAngle)}°`,
    };
  }

  if (state.rightMode === "zoom") {
    const nextZoom = Math.round(clampNumber(state.zoomPct * Math.pow(1.15, deltaSteps), 25, 800));
    return { ...state, zoomPct: nextZoom, lastFeedbackKo: `캔버스 배율 ${nextZoom}%` };
  }

  const nextCursor = Math.round(clampNumber(state.undoCursor + deltaSteps, 0, state.undoMax));
  return { ...state, undoCursor: nextCursor, lastFeedbackKo: `작업 기록 ${nextCursor}/${state.undoMax}단계로 이동` };
}

/** 태블릿 양손 플로팅 듀얼 휠의 인체공학적 화면 좌표를 계산한다. */
export function computeTabletDualWheelLayout(viewport: ViewportSize, wheelRadiusPx = 68): TabletDualWheelLayout {
  const safeW = Math.max(480, viewport.width);
  const safeH = Math.max(360, viewport.height);
  const orientation: TabletDualWheelLayout["orientation"] = safeW >= safeH ? "landscape" : "portrait";
  const edgeOffset = wheelRadiusPx + 22;
  const y = clampNumber(
    Math.round(safeH * (orientation === "landscape" ? 0.62 : 0.72)),
    wheelRadiusPx + 20,
    safeH - wheelRadiusPx - 20,
  );

  return {
    leftWheelCenter: { x: edgeOffset, y },
    rightWheelCenter: { x: safeW - edgeOffset, y },
    wheelRadiusPx,
    orientation,
  };
}

/** 선택 도구(`brush|lasso|3d-model|speech-balloon`)에 맞춰 컨텍스트 매직 바 4개 액션을 동적 생성한다. */
export function resolveContextMagicBar(
  toolContext: MagicBarToolContext,
  activeActionIds: ReadonlySet<MagicBarActionId> = new Set<MagicBarActionId>(),
): ContextMagicBarModel {
  const blueprint = MAGIC_BAR_BLUEPRINTS[toolContext];
  const actions: [
    ContextMagicBarAction,
    ContextMagicBarAction,
    ContextMagicBarAction,
    ContextMagicBarAction,
  ] = [
    { ...blueprint[0], active: activeActionIds.has(blueprint[0].id) },
    { ...blueprint[1], active: activeActionIds.has(blueprint[1].id) },
    { ...blueprint[2], active: activeActionIds.has(blueprint[2].id) },
    { ...blueprint[3], active: activeActionIds.has(blueprint[3].id) },
  ];

  return { toolContext, toolLabelKo: MAGIC_BAR_TOOL_LABELS_KO[toolContext], actions };
}

/** 모바일 한손 사용 방향을 1탭으로 반전한다. */
export function toggleMobileHandedness(current: Handedness): Handedness {
  return current === "right" ? "left" : "right";
}

/** 모바일 전용 엄지 호(Thumb-Arc) 도크 배치를 계산한다. */
export function computeMobileThumbArcDock(
  viewport: ViewportSize,
  handedness: Handedness,
  options?: {
    readonly arcRadiusPx?: number;
    readonly hitTargetSizePx?: number;
    readonly safeBottomPx?: number;
    readonly safeSidePx?: number;
  },
): MobileThumbArcDockLayout {
  const safeW = Math.max(320, viewport.width);
  const safeH = Math.max(480, viewport.height);
  const hitTargetSizePx = Math.max(44, options?.hitTargetSizePx ?? 48);
  const safeBottomPx = options?.safeBottomPx ?? 22;
  const safeSidePx = options?.safeSidePx ?? 22;
  const maxAllowedRadius = Math.min(safeW - safeSidePx * 2 - hitTargetSizePx, 210);
  const minNonOverlapRadius = Math.ceil(((hitTargetSizePx + 6) * 5) / (Math.PI / 2));
  const arcRadiusPx = clampNumber(
    options?.arcRadiusPx ?? Math.max(176, minNonOverlapRadius),
    Math.min(130, maxAllowedRadius),
    Math.max(130, maxAllowedRadius),
  );

  const isRight = handedness === "right";
  const pivot: Point2D = { x: isRight ? safeW - safeSidePx : safeSidePx, y: safeH - safeBottomPx };
  const startDeg = isRight ? 186 : 354;
  const endDeg = isRight ? 266 : 274;
  const count = MOBILE_THUMB_ACTIONS.length;

  const buttons: MobileThumbArcButton[] = MOBILE_THUMB_ACTIONS.map((item, idx) => {
    const t = count <= 1 ? 0 : idx / (count - 1);
    const angleDeg = startDeg + (endDeg - startDeg) * t;
    const rad = (angleDeg * Math.PI) / 180;
    const halfBtn = hitTargetSizePx / 2;
    return {
      index: idx,
      id: item.id,
      labelKo: item.labelKo,
      x: Number(clampNumber(pivot.x + Math.cos(rad) * arcRadiusPx, halfBtn + 6, safeW - halfBtn - 6).toFixed(1)),
      y: Number(clampNumber(pivot.y + Math.sin(rad) * arcRadiusPx, halfBtn + 6, safeH - halfBtn - 6).toFixed(1)),
      angleDeg: Number(angleDeg.toFixed(1)),
      hitTargetSizePx,
    };
  });

  let minChordSpacingPx = Number.POSITIVE_INFINITY;
  for (let i = 1; i < buttons.length; i += 1) {
    const dist = Math.hypot(buttons[i].x - buttons[i - 1].x, buttons[i].y - buttons[i - 1].y);
    if (dist < minChordSpacingPx) minChordSpacingPx = dist;
  }

  return {
    handedness,
    anchorCorner: isRight ? "bottom-right" : "bottom-left",
    pivot,
    arcRadiusPx: Number(arcRadiusPx.toFixed(1)),
    minHitTargetPx: hitTargetSizePx,
    minChordSpacingPx: Number.isFinite(minChordSpacingPx) ? Number(minChordSpacingPx.toFixed(1)) : 0,
    buttons,
  };
}

/** 모바일 화면 가장자리 엣지 스크럽 및 햅틱 진동 패턴 솔버. */
export function solveMobileEdgeScrub(input: MobileEdgeScrubInput): MobileEdgeScrubResult {
  const edgeZoneWidth = input.edgeZoneWidthPx ?? 32;
  const handedness = input.handedness ?? "right";
  const engaged =
    (input.edge === "left" && input.startX <= edgeZoneWidth) ||
    (input.edge === "right" && input.startX >= input.viewport.width - edgeZoneWidth);

  const target: MobileEdgeScrubTarget =
    handedness === "right"
      ? input.edge === "left"
        ? "brush-size"
        : "opacity"
      : input.edge === "right"
        ? "brush-size"
        : "opacity";

  const isBrush = target === "brush-size";
  const minVal = isBrush ? 1 : 5;
  const maxVal = isBrush ? 120 : 100;
  const labelKo = isBrush ? "브러시 굵기" : "불투명도";
  const unitSuffix: "px" | "%" = isBrush ? "px" : "%";

  if (!engaged) {
    const clampedStart = Math.round(clampNumber(input.startValue, minVal, maxVal));
    const norm = (clampedStart - minVal) / (maxVal - minVal);
    return {
      engaged: false,
      target,
      labelKo,
      value: clampedStart,
      normalized: Number(norm.toFixed(3)),
      detentIndex: Math.round(norm * 20),
      crossedDetent: false,
      hitBoundary: false,
      hapticKind: "none",
      hapticPatternMs: [],
      unitSuffix,
    };
  }

  const scrubSpanPx = Math.max(180, input.viewport.height * 0.45);
  const startNorm = clampNumber((input.startValue - minVal) / (maxVal - minVal), 0, 1);
  const nextNorm = clampNumber(startNorm + (input.startY - input.currentY) / scrubSpanPx, 0, 1);
  const value = Math.round(minVal + nextNorm * (maxVal - minVal));
  const detentIndex = Math.round(nextNorm * 20);
  const crossedDetent = detentIndex !== (input.previousDetentIndex ?? Math.round(startNorm * 20));
  const hitBoundary = (nextNorm === 0 || nextNorm === 1) && crossedDetent;

  let hapticKind: MobileEdgeScrubResult["hapticKind"] = "none";
  let hapticPatternMs: readonly number[] = [];

  if (hitBoundary) {
    hapticKind = "boundary";
    hapticPatternMs = [14, 24, 18];
  } else if (detentIndex === 10 && crossedDetent) {
    hapticKind = "snap-midpoint";
    hapticPatternMs = [10, 16, 10];
  } else if (crossedDetent) {
    hapticKind = "tick";
    hapticPatternMs = [6];
  }

  return {
    engaged: true,
    target,
    labelKo,
    value,
    normalized: Number(nextNorm.toFixed(3)),
    detentIndex,
    crossedDetent,
    hitBoundary,
    hapticKind,
    hapticPatternMs,
    unitSuffix,
  };
}

/** 모바일 2.5× 오프셋 정밀 루페 좌표 솔버(손가락 가림 제로 · 화면 경계 클램핑). */
export function solvePrecisionLoupePlacement(input: PrecisionLoupeInput): PrecisionLoupePlacement {
  const magnification = clampNumber(input.magnification ?? 2.5, 1.5, 5);
  const loupeRadiusPx = clampNumber(input.loupeRadiusPx ?? 56, 36, 92);
  const fingerOcclusionRadiusPx = clampNumber(input.fingerOcclusionRadiusPx ?? 30, 16, 48);
  const safeMarginPx = Math.max(8, input.safeMarginPx ?? 12);
  const vw = Math.max(loupeRadiusPx * 2 + safeMarginPx * 2, input.viewport.width);
  const vh = Math.max(loupeRadiusPx * 2 + safeMarginPx * 2, input.viewport.height);

  const tx = clampNumber(input.touchPoint.x, 0, vw);
  const ty = clampNumber(input.touchPoint.y, 0, vh);
  const minCenterX = safeMarginPx + loupeRadiusPx;
  const maxCenterX = vw - safeMarginPx - loupeRadiusPx;
  const minCenterY = safeMarginPx + loupeRadiusPx;
  const maxCenterY = vh - safeMarginPx - loupeRadiusPx;

  const requiredDist = loupeRadiusPx + fingerOcclusionRadiusPx;
  const offsetX = Math.ceil(requiredDist * 0.88);
  const offsetY = Math.ceil(requiredDist * 1.15);
  const preferredSignX = input.handedness === "right" ? -1 : 1;

  const candidateOffsets: readonly {
    readonly dx: number;
    readonly dy: number;
    readonly quadrant: PrecisionLoupePlacement["quadrant"];
  }[] = [
    { dx: preferredSignX * offsetX, dy: -offsetY, quadrant: preferredSignX < 0 ? "top-left" : "top-right" },
    { dx: -preferredSignX * offsetX, dy: -offsetY, quadrant: preferredSignX < 0 ? "top-right" : "top-left" },
    { dx: preferredSignX * offsetX, dy: offsetY, quadrant: preferredSignX < 0 ? "bottom-left" : "bottom-right" },
    { dx: -preferredSignX * offsetX, dy: offsetY, quadrant: preferredSignX < 0 ? "bottom-right" : "bottom-left" },
  ];

  let best = {
    x: clampNumber(tx + candidateOffsets[0].dx, minCenterX, maxCenterX),
    y: clampNumber(ty + candidateOffsets[0].dy, minCenterY, maxCenterY),
    quadrant: candidateOffsets[0].quadrant,
    clearance: -Number.POSITIVE_INFINITY,
    clamped: false,
  };

  for (const candidate of candidateOffsets) {
    const rawX = tx + candidate.dx;
    const rawY = ty + candidate.dy;
    const cx = clampNumber(rawX, minCenterX, maxCenterX);
    const cy = clampNumber(rawY, minCenterY, maxCenterY);
    const clearance = Math.hypot(cx - tx, cy - ty) - requiredDist;
    const clamped = cx !== rawX || cy !== rawY;

    if (clearance >= 0) {
      best = { x: cx, y: cy, quadrant: candidate.quadrant, clearance, clamped };
      break;
    }
    if (clearance > best.clearance) {
      best = { x: cx, y: cy, quadrant: candidate.quadrant, clearance, clamped };
    }
  }

  const sampleSize = Number(((loupeRadiusPx * 2) / magnification).toFixed(2));
  return {
    magnification,
    loupeRadiusPx,
    loupeCenter: { x: Number(best.x.toFixed(1)), y: Number(best.y.toFixed(1)) },
    touchPoint: { x: Number(tx.toFixed(1)), y: Number(ty.toFixed(1)) },
    quadrant: best.quadrant,
    clampedToViewport: best.clamped,
    fingerClearancePx: Number(best.clearance.toFixed(1)),
    zeroFingerOcclusion: best.clearance >= 0,
    sourceSampleRect: {
      x: Number(clampNumber(tx - sampleSize / 2, 0, Math.max(0, vw - sampleSize)).toFixed(2)),
      y: Number(clampNumber(ty - sampleSize / 2, 0, Math.max(0, vh - sampleSize)).toFixed(2)),
      width: sampleSize,
      height: sampleSize,
    },
  };
}
