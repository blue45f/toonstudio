/**
 * Wave 36: 무전문용어 인체공학 멀티터치·스타일러스 제스처 코드 인식기 및 8분할 원형 빠른 도구 메뉴.
 *
 * - 펜 입력 중이거나 펜을 뗀 직후(`stylusActiveWithinMs`)에 들어온 손바닥·손가락 터치를 차단해
 *   작화 도중 의도치 않은 실행 취소나 화면 튐을 막는다.
 * - 두 손가락 가볍게 탭(`실행 취소`), 세 손가락 가볍게 탭(`다시 실행`), 두 손가락 이동·확대·회전을 구분한다.
 * - 최소 `44px` 중심 데드존과 각도·반경 히스테리시스를 갖춘 8방향 원형 플릭 메뉴를 계산하며,
 *   `prefersReducedMotion` 환경에서는 탄성·이동 애니메이션을 즉시 끈 전환 힌트를 함께 반환한다.
 */

/** 터치·펜 조작 시 손떨림 오작동을 막기 위한 원형 메뉴 최소 데드존 반지름(`44px`). */
export const MIN_RADIAL_DEADZONE_RADIUS_PX = 44 as const;
/** 빠른 도구 원형 메뉴 기본 분할 수(`8방향`, 섹터당 `45°`). */
export const RADIAL_PIE_SECTOR_COUNT = 8 as const;
/** 스타일러스 활동 이후 손바닥 터치를 잠그는 기본 보호 시간(`180ms`). */
export const DEFAULT_STYLUS_LOCK_WINDOW_MS = 180 as const;
/** 멀티터치 탭으로 인정하는 최대 접촉 지속 시간(`260ms`). */
export const DEFAULT_TAP_MAX_DURATION_MS = 260 as const;
/** 멀티터치 탭으로 인정하는 손가락별 최대 이동 허용 거리(`14px`). */
export const DEFAULT_TAP_MAX_MOVEMENT_PX = 14 as const;
/** 넓은 면적 접촉을 손바닥 거치로 판별하는 기본 반지름 임계값(`24px`). */
export const DEFAULT_PALM_CONTACT_RADIUS_PX = 24 as const;
/** 섹터 경계(`±22.5°`) 근처 미세 떨림을 잡아주는 기본 각도 히스테리시스 여유(`8°`). */
export const DEFAULT_ANGULAR_HYSTERESIS_DEG = 8 as const;
/** 데드존 경계 진입 후 미세 후퇴 시 선택 해제를 늦추는 기본 반경 히스테리시스(`6px`). */
export const DEFAULT_RADIAL_HYSTERESIS_PX = 6 as const;

export type RadialSectorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type GesturePointerType = "pen" | "touch" | "mouse";

export type StudioGestureChordKind =
  | "two-finger-tap-undo"
  | "three-finger-tap-redo"
  | "two-finger-pinch-rotate-pan"
  | "palm-rejected-stylus-lock"
  | "radial-pie-flick"
  | "stylus-stroke"
  | "idle";

export interface RadialPieSectorItem {
  readonly sectorIndex: RadialSectorIndex;
  readonly actionId: string;
  readonly labelKo: string;
  /** 화면 좌표계(`+X` 오른쪽 `0°`, `+Y` 아래쪽 `90°`) 기준 섹터 중심 각도(`0..315`). */
  readonly centerAngleDeg: number;
}

export interface MotionSafeTransitionHint {
  readonly durationMs: number;
  readonly cssTransitionProperty:
    | "none"
    | "background-color, border-color, color, transform";
  readonly easing: "none" | "cubic-bezier(0.2, 0, 0, 1)";
  readonly activeScaleFactor: number;
  readonly animateTransform: boolean;
}

export interface RadialPieQueryInput {
  readonly dxPx: number;
  readonly dyPx: number;
  readonly previousSector?: RadialSectorIndex | null;
  readonly deadzoneRadiusPx?: number;
  readonly angularHysteresisDeg?: number;
  readonly radialHysteresisPx?: number;
  readonly prefersReducedMotion?: boolean;
  readonly sectors?: readonly RadialPieSectorItem[];
}

export interface RadialPieResolution {
  readonly inDeadzone: boolean;
  readonly distancePx: number;
  readonly effectiveDeadzoneRadiusPx: number;
  readonly angleDeg: number;
  readonly sectorIndex: RadialSectorIndex | null;
  readonly sector: RadialPieSectorItem | null;
  readonly hysteresisRetained: boolean;
  readonly transitionHint: MotionSafeTransitionHint;
}

export interface GesturePointerContact {
  readonly pointerId: number;
  readonly pointerType: GesturePointerType;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly startTimeMs: number;
  readonly currentTimeMs: number;
  readonly isReleased: boolean;
  readonly pressure?: number;
  readonly contactRadiusPx?: number;
}

export interface PinchRotatePanTransform {
  readonly panDeltaX: number;
  readonly panDeltaY: number;
  readonly zoomScale: number;
  readonly rotationDeltaRad: number;
  readonly rotationDeltaDeg: number;
  readonly pivotX: number;
  readonly pivotY: number;
}

export interface StudioGestureChordInput {
  readonly contacts: readonly GesturePointerContact[];
  readonly nowMs: number;
  readonly lastStylusActiveTimestampMs?: number | null;
  readonly stylusActiveWithinMs?: number;
  readonly prefersReducedMotion?: boolean;
  readonly radialMenuTriggerActive?: boolean;
  readonly previousRadialSector?: RadialSectorIndex | null;
  readonly deadzoneRadiusPx?: number;
  readonly maxTapDurationMs?: number;
  readonly maxTapMovementPx?: number;
  readonly palmContactRadiusThresholdPx?: number;
}

export interface StudioGestureChordResult {
  readonly kind: StudioGestureChordKind;
  readonly labelKo: string;
  readonly palmRejected: boolean;
  readonly rejectedPointerIds: readonly number[];
  readonly activeStylusPointerId: number | null;
  readonly pinchRotatePan: PinchRotatePanTransform | null;
  readonly radialMenu: RadialPieResolution | null;
  readonly transitionHint: MotionSafeTransitionHint;
}

/** 전문 용어를 배제한 직관적 한글 라벨 기반 8방향 기본 도구 배치. */
export const DEFAULT_RADIAL_PIE_SECTORS: readonly RadialPieSectorItem[] =
  Object.freeze([
    { sectorIndex: 0, actionId: "pen-brush", labelKo: "펜 브러시", centerAngleDeg: 0 },
    { sectorIndex: 1, actionId: "eraser", labelKo: "지우개", centerAngleDeg: 45 },
    { sectorIndex: 2, actionId: "bucket-fill", labelKo: "색 채우기", centerAngleDeg: 90 },
    { sectorIndex: 3, actionId: "eyedropper", labelKo: "색상 추출", centerAngleDeg: 135 },
    { sectorIndex: 4, actionId: "undo", labelKo: "실행 취소", centerAngleDeg: 180 },
    { sectorIndex: 5, actionId: "lasso-select", labelKo: "올가미 선택", centerAngleDeg: 225 },
    { sectorIndex: 6, actionId: "fit-canvas", labelKo: "화면 맞춤", centerAngleDeg: 270 },
    { sectorIndex: 7, actionId: "flip-horizontal", labelKo: "좌우 반전 보기", centerAngleDeg: 315 },
  ]);

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle360(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped === 0 ? 0 : wrapped;
}

function shortestAngularDistanceDeg(aDeg: number, bDeg: number): number {
  const diff = Math.abs(normalizeAngle360(aDeg) - normalizeAngle360(bDeg));
  return diff > 180 ? 360 - diff : diff;
}

function normalizeSignedRadians(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  let wrapped = (rad + Math.PI) % (2 * Math.PI);
  if (wrapped < 0) wrapped += 2 * Math.PI;
  return wrapped - Math.PI;
}

function toRadialSectorIndex(rawIndex: number): RadialSectorIndex {
  return (((Math.round(rawIndex) % 8) + 8) % 8) as RadialSectorIndex;
}

/** `prefersReducedMotion` 여부에 맞춘 UI 전환 힌트를 생성한다. */
export function buildMotionSafeTransitionHint(
  prefersReducedMotion = false,
): MotionSafeTransitionHint {
  if (prefersReducedMotion) {
    return {
      durationMs: 0,
      cssTransitionProperty: "none",
      easing: "none",
      activeScaleFactor: 1,
      animateTransform: false,
    };
  }
  return {
    durationMs: 150,
    cssTransitionProperty: "background-color, border-color, color, transform",
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    activeScaleFactor: 0.98,
    animateTransform: true,
  };
}

/**
 * 중심 변위(`dxPx`, `dyPx`)로부터 `>= 44px` 데드존과 반경·각도 히스테리시스를 적용해
 * 8분할 원형 도구 메뉴의 활성 섹터를 판정한다.
 */
export function resolveRadialPieSector(
  input: RadialPieQueryInput,
): RadialPieResolution {
  const dx = Number.isFinite(input.dxPx) ? input.dxPx : 0;
  const dy = Number.isFinite(input.dyPx) ? input.dyPx : 0;
  const distancePx = Math.hypot(dx, dy);

  const requestedDeadzone = input.deadzoneRadiusPx ?? MIN_RADIAL_DEADZONE_RADIUS_PX;
  const effectiveDeadzoneRadiusPx = Math.max(
    MIN_RADIAL_DEADZONE_RADIUS_PX,
    Number.isFinite(requestedDeadzone) ? requestedDeadzone : MIN_RADIAL_DEADZONE_RADIUS_PX,
  );
  const angularHysteresisDeg = clampRange(
    input.angularHysteresisDeg ?? DEFAULT_ANGULAR_HYSTERESIS_DEG,
    0,
    18,
  );
  const radialHysteresisPx = clampRange(
    input.radialHysteresisPx ?? DEFAULT_RADIAL_HYSTERESIS_PX,
    0,
    Math.min(16, effectiveDeadzoneRadiusPx * 0.35),
  );
  const transitionHint = buildMotionSafeTransitionHint(input.prefersReducedMotion ?? false);
  const sectors =
    input.sectors && input.sectors.length === RADIAL_PIE_SECTOR_COUNT
      ? input.sectors
      : DEFAULT_RADIAL_PIE_SECTORS;

  const angleDeg =
    distancePx > 1e-6 ? normalizeAngle360((Math.atan2(dy, dx) * 180) / Math.PI) : 0;
  const prev = input.previousSector ?? null;
  const radialCancelThresholdPx =
    prev === null
      ? effectiveDeadzoneRadiusPx
      : Math.max(0, effectiveDeadzoneRadiusPx - radialHysteresisPx);

  if (distancePx < radialCancelThresholdPx) {
    return {
      inDeadzone: true,
      distancePx,
      effectiveDeadzoneRadiusPx,
      angleDeg,
      sectorIndex: null,
      sector: null,
      hysteresisRetained: false,
      transitionHint,
    };
  }

  const nominalSector = toRadialSectorIndex(Math.floor((angleDeg + 22.5) / 45));
  let resolvedSectorIndex: RadialSectorIndex = nominalSector;
  let hysteresisRetained = distancePx < effectiveDeadzoneRadiusPx && prev !== null;

  if (prev !== null && prev !== nominalSector) {
    const distFromPrevCenter = shortestAngularDistanceDeg(angleDeg, prev * 45);
    if (distFromPrevCenter <= 22.5 + angularHysteresisDeg) {
      resolvedSectorIndex = prev;
      hysteresisRetained = true;
    }
  }

  const sector =
    sectors.find((item) => item.sectorIndex === resolvedSectorIndex) ??
    DEFAULT_RADIAL_PIE_SECTORS[resolvedSectorIndex] ??
    null;

  return {
    inDeadzone: false,
    distancePx,
    effectiveDeadzoneRadiusPx,
    angleDeg,
    sectorIndex: resolvedSectorIndex,
    sector,
    hysteresisRetained,
    transitionHint,
  };
}

function isCleanMultiTouchTap(
  touchContacts: readonly GesturePointerContact[],
  maxTapDurationMs: number,
  maxTapMovementPx: number,
): boolean {
  if (touchContacts.length === 0) return false;
  let earliestStart = Number.POSITIVE_INFINITY;
  let latestStart = Number.NEGATIVE_INFINITY;

  for (const contact of touchContacts) {
    if (!contact.isReleased) return false;
    const duration = contact.currentTimeMs - contact.startTimeMs;
    if (duration < 0 || duration > maxTapDurationMs) return false;
    const travel = Math.hypot(contact.currentX - contact.startX, contact.currentY - contact.startY);
    if (travel > maxTapMovementPx) return false;
    if (contact.startTimeMs < earliestStart) earliestStart = contact.startTimeMs;
    if (contact.startTimeMs > latestStart) latestStart = contact.startTimeMs;
  }

  return latestStart - earliestStart <= maxTapDurationMs;
}

function computeTwoFingerTransform(
  first: GesturePointerContact,
  second: GesturePointerContact,
): PinchRotatePanTransform | null {
  const startPivotX = (first.startX + second.startX) * 0.5;
  const startPivotY = (first.startY + second.startY) * 0.5;
  const pivotX = (first.currentX + second.currentX) * 0.5;
  const pivotY = (first.currentY + second.currentY) * 0.5;

  const panDeltaX = pivotX - startPivotX;
  const panDeltaY = pivotY - startPivotY;
  const startDx = second.startX - first.startX;
  const startDy = second.startY - first.startY;
  const curDx = second.currentX - first.currentX;
  const curDy = second.currentY - first.currentY;

  const startSpan = Math.hypot(startDx, startDy);
  const currentSpan = Math.hypot(curDx, curDy);
  if (startSpan < 1e-3 || currentSpan < 1e-3) return null;

  const zoomScale = clampRange(currentSpan / startSpan, 0.1, 10);
  const rotationDeltaRad = normalizeSignedRadians(
    Math.atan2(curDy, curDx) - Math.atan2(startDy, startDx),
  );
  const rotationDeltaDeg = (rotationDeltaRad * 180) / Math.PI;

  if (
    Math.hypot(panDeltaX, panDeltaY) < 2 &&
    Math.abs(currentSpan - startSpan) < 2 &&
    Math.abs(rotationDeltaDeg) < 1.5
  ) {
    return null;
  }

  return {
    panDeltaX,
    panDeltaY,
    zoomScale,
    rotationDeltaRad,
    rotationDeltaDeg,
    pivotX,
    pivotY,
  };
}

function makeChordResult(
  kind: StudioGestureChordKind,
  labelKo: string,
  transitionHint: MotionSafeTransitionHint,
  extras: Partial<Omit<StudioGestureChordResult, "kind" | "labelKo" | "transitionHint">> = {},
): StudioGestureChordResult {
  return {
    kind,
    labelKo,
    palmRejected: extras.palmRejected ?? false,
    rejectedPointerIds: extras.rejectedPointerIds ?? [],
    activeStylusPointerId: extras.activeStylusPointerId ?? null,
    pinchRotatePan: extras.pinchRotatePan ?? null,
    radialMenu: extras.radialMenu ?? null,
    transitionHint,
  };
}

/**
 * 멀티터치·스타일러스 입력 프레임으로부터 손바닥 오터치 잠금, 2손가락 실행 취소,
 * 3손가락 다시 실행, 2손가락 이동·확대·회전, 8방향 원형 도구 플릭을 판별한다.
 */
export function recognizeStudioGestureChord(
  input: StudioGestureChordInput,
): StudioGestureChordResult {
  const transitionHint = buildMotionSafeTransitionHint(input.prefersReducedMotion ?? false);
  const stylusWindowMs = Math.max(0, input.stylusActiveWithinMs ?? DEFAULT_STYLUS_LOCK_WINDOW_MS);
  const maxTapDurationMs = clampRange(input.maxTapDurationMs ?? DEFAULT_TAP_MAX_DURATION_MS, 40, 600);
  const maxTapMovementPx = clampRange(input.maxTapMovementPx ?? DEFAULT_TAP_MAX_MOVEMENT_PX, 2, 40);
  const palmRadiusThresholdPx = clampRange(
    input.palmContactRadiusThresholdPx ?? DEFAULT_PALM_CONTACT_RADIUS_PX,
    12,
    80,
  );

  const activePen = input.contacts.find((c) => c.pointerType === "pen") ?? null;
  const recentStylusGuardActive =
    activePen !== null ||
    (input.lastStylusActiveTimestampMs !== undefined &&
      input.lastStylusActiveTimestampMs !== null &&
      input.nowMs - input.lastStylusActiveTimestampMs >= 0 &&
      input.nowMs - input.lastStylusActiveTimestampMs <= stylusWindowMs);

  const rejectedPointerIds: number[] = [];
  const validTouchContacts: GesturePointerContact[] = [];

  for (const contact of input.contacts) {
    if (contact.pointerType !== "touch") continue;
    if (recentStylusGuardActive || (contact.contactRadiusPx ?? 0) >= palmRadiusThresholdPx) {
      rejectedPointerIds.push(contact.pointerId);
    } else {
      validTouchContacts.push(contact);
    }
  }
  const palmRejected = rejectedPointerIds.length > 0;

  if (input.radialMenuTriggerActive) {
    const driver =
      activePen ??
      validTouchContacts[0] ??
      input.contacts.find((c) => c.pointerType === "mouse") ??
      null;
    if (driver !== null) {
      const radialMenu = resolveRadialPieSector({
        dxPx: driver.currentX - driver.startX,
        dyPx: driver.currentY - driver.startY,
        previousSector: input.previousRadialSector ?? null,
        deadzoneRadiusPx: input.deadzoneRadiusPx,
        prefersReducedMotion: input.prefersReducedMotion,
      });
      return makeChordResult(
        "radial-pie-flick",
        radialMenu.sector?.labelKo ?? "빠른 도구 원형 메뉴",
        transitionHint,
        {
          palmRejected,
          rejectedPointerIds,
          activeStylusPointerId: activePen?.pointerId ?? null,
          radialMenu,
        },
      );
    }
  }

  if (palmRejected) {
    return makeChordResult("palm-rejected-stylus-lock", "펜 작업 중 손바닥 터치 차단", transitionHint, {
      palmRejected: true,
      rejectedPointerIds,
      activeStylusPointerId: activePen?.pointerId ?? null,
    });
  }

  if (activePen !== null) {
    return makeChordResult("stylus-stroke", "펜 그리기", transitionHint, {
      activeStylusPointerId: activePen.pointerId,
    });
  }

  if (validTouchContacts.length === 2 && isCleanMultiTouchTap(validTouchContacts, maxTapDurationMs, maxTapMovementPx)) {
    return makeChordResult("two-finger-tap-undo", "실행 취소", transitionHint);
  }

  if (validTouchContacts.length === 3 && isCleanMultiTouchTap(validTouchContacts, maxTapDurationMs, maxTapMovementPx)) {
    return makeChordResult("three-finger-tap-redo", "다시 실행", transitionHint);
  }

  if (validTouchContacts.length === 2) {
    const first = validTouchContacts[0];
    const second = validTouchContacts[1];
    if (first !== undefined && second !== undefined) {
      const pinchRotatePan = computeTwoFingerTransform(first, second);
      if (pinchRotatePan !== null) {
        return makeChordResult("two-finger-pinch-rotate-pan", "화면 이동·확대·회전", transitionHint, {
          pinchRotatePan,
        });
      }
    }
  }

  return makeChordResult("idle", "대기", transitionHint);
}
