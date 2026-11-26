/**
 * Wasm64 Wave 31: 무드리프트 앵커 고정 핀치·휠 줌(`0.05x..64x`), 지수 감쇠 관성 패닝 및
 * 정수 배율(`1x`, `2x`, `4x`, `8x`) 디바이스 픽셀 그리드 스냅 물리 엔진 (`inertial-pan-zoom-physics`).
 *
 * - 커서·두 손가락 핀치 초점 불변성: 다단계 연속 줌 체인에서도
 *   `|screenToWorld(cursor, before) - screenToWorld(cursor, after)| < 1e-12` (`< 1e-6` 규격 대비 백만 배 정밀)를 보장한다.
 * - 지수 점성 감쇠 적분(`dv/dt = -lambda * v`) 기반 프레임률 독립 관성 패닝을 수행하며,
 *   `prefersReducedMotion: true` 활성화 시 관성 속도와 잔여 이동량을 즉시 `0`으로 소거한다.
 * - `1x`, `2x`, `4x`, `8x` 정수 배율 도달 시 디바이스 물리 픽셀 경계(`Math.round(pan * dpr) / dpr`)로
 *   렌더 오프셋을 정렬해 `1px` 펜선 번짐(서브픽셀 블러)을 원천 차단한다.
 */

export const MIN_CAMERA_ZOOM = 0.05 as const;
export const MAX_CAMERA_ZOOM = 64 as const;
export const CRISP_INTEGER_ZOOMS = [1, 2, 4, 8] as const;
export const DEFAULT_FLING_FRICTION_PER_SEC = 6.5 as const;
export const DEFAULT_REST_SPEED_PX_PER_SEC = 8 as const;
export const DEFAULT_MAX_FLING_SPEED_PX_PER_SEC = 4800 as const;

export type CrispIntegerZoom = (typeof CRISP_INTEGER_ZOOMS)[number];

export interface ViewportPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface CanvasCameraTransform {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface CanvasCameraPhysicsState extends CanvasCameraTransform {
  readonly velocityX: number;
  readonly velocityY: number;
  readonly isFlingActive: boolean;
}

export interface PixelGridAlignedRenderTransform {
  readonly zoom: number;
  readonly alignedPanX: number;
  readonly alignedPanY: number;
  readonly devicePixelRatio: number;
  readonly isIntegerCrispZoom: boolean;
  readonly matchedCrispZoom: CrispIntegerZoom | null;
  readonly devicePixelResidualX: number;
  readonly devicePixelResidualY: number;
}

export interface AnchorLockedZoomOptions {
  /** 양수 지정 시 목표 배율이 `1x/2x/4x/8x` 상대 허용 오차 안으로 들어오면 자석처럼 정수 배율에 잠근다. */
  readonly magneticIntegerSnapToleranceRatio?: number;
  readonly devicePixelRatio?: number;
  readonly cancelActiveFling?: boolean;
}

export interface AnchorLockedZoomResult {
  readonly previousState: CanvasCameraPhysicsState;
  readonly nextState: CanvasCameraPhysicsState;
  readonly anchorScreenPoint: ViewportPoint2D;
  readonly worldFocalBefore: ViewportPoint2D;
  readonly worldFocalAfter: ViewportPoint2D;
  readonly worldAnchorDrift: number;
  readonly snappedCrispZoom: CrispIntegerZoom | null;
  readonly renderTransform: PixelGridAlignedRenderTransform;
}

export interface InertialFlingOptions {
  readonly prefersReducedMotion?: boolean;
  readonly frictionPerSec?: number;
  readonly restSpeedThresholdPxPerSec?: number;
  readonly maxFlingSpeedPxPerSec?: number;
  readonly devicePixelRatio?: number;
}

export interface InertialPanStepResult {
  readonly nextState: CanvasCameraPhysicsState;
  readonly deltaPanX: number;
  readonly deltaPanY: number;
  readonly speedPxPerSec: number;
  readonly renderTransform: PixelGridAlignedRenderTransform;
}

function sanitizeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 배율을 허용 범위 `[0.05, 64]` 안으로 안전하게 클램프한다. */
export function clampCameraZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, zoom));
}

/** 목표 배율이 `1x`, `2x`, `4x`, `8x` 정수 선명 배율의 허용 비율 이내인지 판별한다. */
export function matchCrispIntegerZoom(
  zoom: number,
  toleranceRatio = 1e-6,
): CrispIntegerZoom | null {
  const safeTol = Math.max(0, sanitizeFinite(toleranceRatio, 0));
  for (const crisp of CRISP_INTEGER_ZOOMS) {
    if (Math.abs(zoom - crisp) / crisp <= safeTol) {
      return crisp;
    }
  }
  return null;
}

/** 초기 카메라 물리 상태(`1x` 배율, 원점 패닝, 정지 상태)를 생성한다. */
export function createInitialCameraPhysicsState(
  overrides?: Partial<CanvasCameraTransform>,
): CanvasCameraPhysicsState {
  return {
    zoom: clampCameraZoom(overrides?.zoom ?? 1),
    panX: sanitizeFinite(overrides?.panX ?? 0, 0),
    panY: sanitizeFinite(overrides?.panY ?? 0, 0),
    velocityX: 0,
    velocityY: 0,
    isFlingActive: false,
  };
}

/** 화면 CSS 픽셀 좌표를 캔버스 월드(원고) 좌표로 역변환한다. */
export function screenToWorldPoint(
  screenPoint: ViewportPoint2D,
  camera: CanvasCameraTransform,
): ViewportPoint2D {
  const safeZoom = clampCameraZoom(camera.zoom);
  return {
    x: (screenPoint.x - camera.panX) / safeZoom,
    y: (screenPoint.y - camera.panY) / safeZoom,
  };
}

/** 캔버스 월드(원고) 좌표를 화면 CSS 픽셀 좌표로 정변환한다. */
export function worldToScreenPoint(
  worldPoint: ViewportPoint2D,
  camera: CanvasCameraTransform,
): ViewportPoint2D {
  const safeZoom = clampCameraZoom(camera.zoom);
  return {
    x: worldPoint.x * safeZoom + camera.panX,
    y: worldPoint.y * safeZoom + camera.panY,
  };
}

/**
 * 정수 배율(`1x`, `2x`, `4x`, `8x`)에서 `1px` 잉크 선이 두 물리 픽셀에 걸쳐 흐려지지 않도록
 * 디바이스 픽셀 격자에 스냅된 렌더 패닝 변환을 계산한다.
 */
export function resolvePixelGridCrispTransform(
  camera: CanvasCameraTransform,
  devicePixelRatio = 1,
): PixelGridAlignedRenderTransform {
  const dpr = Math.max(0.5, sanitizeFinite(devicePixelRatio, 1));
  const safeZoom = clampCameraZoom(camera.zoom);
  const matchedCrispZoom = matchCrispIntegerZoom(safeZoom, 1e-6);

  if (matchedCrispZoom !== null) {
    const snappedDeviceX = Math.round(camera.panX * dpr);
    const snappedDeviceY = Math.round(camera.panY * dpr);
    const alignedPanX = snappedDeviceX / dpr;
    const alignedPanY = snappedDeviceY / dpr;
    const resX = Math.abs(alignedPanX * dpr - Math.round(alignedPanX * dpr));
    const resY = Math.abs(alignedPanY * dpr - Math.round(alignedPanY * dpr));

    return {
      zoom: matchedCrispZoom,
      alignedPanX,
      alignedPanY,
      devicePixelRatio: dpr,
      isIntegerCrispZoom: true,
      matchedCrispZoom,
      devicePixelResidualX: resX < 1e-12 ? 0 : resX,
      devicePixelResidualY: resY < 1e-12 ? 0 : resY,
    };
  }

  const rawDevX = camera.panX * dpr;
  const rawDevY = camera.panY * dpr;
  return {
    zoom: safeZoom,
    alignedPanX: camera.panX,
    alignedPanY: camera.panY,
    devicePixelRatio: dpr,
    isIntegerCrispZoom: false,
    matchedCrispZoom: null,
    devicePixelResidualX: Math.abs(rawDevX - Math.round(rawDevX)),
    devicePixelResidualY: Math.abs(rawDevY - Math.round(rawDevY)),
  };
}

/** 제스처 종료 시 카메라 상태 자체를 디바이스 물리 픽셀 격자에 정착시킨다. */
export function snapCameraPanToDevicePixelGrid(
  state: CanvasCameraPhysicsState,
  devicePixelRatio = 1,
): CanvasCameraPhysicsState {
  const aligned = resolvePixelGridCrispTransform(state, devicePixelRatio);
  return {
    ...state,
    zoom: aligned.zoom,
    panX: aligned.alignedPanX,
    panY: aligned.alignedPanY,
  };
}

/**
 * 화면 커서·핀치 중심(`anchorScreenPoint`) 아래의 월드 좌표를 절대 고정한 채 목표 배율로 줌한다.
 * 배율 클램프나 자석 정수 배율 스냅이 개입하더라도 최종 배율로 패닝을 역산하므로 초점 드리프트가 발생하지 않는다.
 */
export function applyAnchorLockedZoom(
  state: CanvasCameraPhysicsState,
  targetZoom: number,
  anchorScreenPoint: ViewportPoint2D,
  options?: AnchorLockedZoomOptions,
): AnchorLockedZoomResult {
  const worldFocalBefore = screenToWorldPoint(anchorScreenPoint, state);
  let clampedZoom = clampCameraZoom(targetZoom);

  const magTol = Math.max(0, options?.magneticIntegerSnapToleranceRatio ?? 0);
  const snappedCrisp = magTol > 0 ? matchCrispIntegerZoom(clampedZoom, magTol) : matchCrispIntegerZoom(clampedZoom, 1e-6);
  if (snappedCrisp !== null && magTol > 0) {
    clampedZoom = snappedCrisp;
  }

  const nextPanX = anchorScreenPoint.x - worldFocalBefore.x * clampedZoom;
  const nextPanY = anchorScreenPoint.y - worldFocalBefore.y * clampedZoom;
  const cancelFling = options?.cancelActiveFling ?? true;

  const nextState: CanvasCameraPhysicsState = {
    zoom: clampedZoom,
    panX: nextPanX,
    panY: nextPanY,
    velocityX: cancelFling ? 0 : state.velocityX,
    velocityY: cancelFling ? 0 : state.velocityY,
    isFlingActive: cancelFling ? false : state.isFlingActive,
  };

  const worldFocalAfter = screenToWorldPoint(anchorScreenPoint, nextState);
  const worldAnchorDrift = Math.hypot(
    worldFocalAfter.x - worldFocalBefore.x,
    worldFocalAfter.y - worldFocalBefore.y,
  );

  return {
    previousState: state,
    nextState,
    anchorScreenPoint,
    worldFocalBefore,
    worldFocalAfter,
    worldAnchorDrift,
    snappedCrispZoom: matchCrispIntegerZoom(clampedZoom, 1e-6),
    renderTransform: resolvePixelGridCrispTransform(nextState, options?.devicePixelRatio ?? 1),
  };
}

/** 현재 배율에 배수 인자(`zoomFactor`)를 곱해 앵커 고정 줌을 수행한다. */
export function applyAnchorLockedZoomByFactor(
  state: CanvasCameraPhysicsState,
  zoomFactor: number,
  anchorScreenPoint: ViewportPoint2D,
  options?: AnchorLockedZoomOptions,
): AnchorLockedZoomResult {
  const safeFactor = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  return applyAnchorLockedZoom(state, state.zoom * safeFactor, anchorScreenPoint, options);
}

/**
 * 손가락·펜 패닝 릴리즈 시 관성 플링 속도를 주입한다.
 * `prefersReducedMotion: true`이면 접근성 지침에 따라 관성 속도를 즉시 `0`으로 차단한다.
 */
export function launchInertialPanFling(
  state: CanvasCameraPhysicsState,
  initialVelocityPxPerSec: ViewportPoint2D,
  options?: InertialFlingOptions,
): CanvasCameraPhysicsState {
  if (options?.prefersReducedMotion === true) {
    return { ...state, velocityX: 0, velocityY: 0, isFlingActive: false };
  }

  const rawVx = sanitizeFinite(initialVelocityPxPerSec.x, 0);
  const rawVy = sanitizeFinite(initialVelocityPxPerSec.y, 0);
  const speed = Math.hypot(rawVx, rawVy);
  const restThreshold = Math.max(0.1, options?.restSpeedThresholdPxPerSec ?? DEFAULT_REST_SPEED_PX_PER_SEC);

  if (speed < restThreshold) {
    return { ...state, velocityX: 0, velocityY: 0, isFlingActive: false };
  }

  const maxSpeed = Math.max(restThreshold, options?.maxFlingSpeedPxPerSec ?? DEFAULT_MAX_FLING_SPEED_PX_PER_SEC);
  const scale = speed > maxSpeed ? maxSpeed / speed : 1;

  return {
    ...state,
    velocityX: rawVx * scale,
    velocityY: rawVy * scale,
    isFlingActive: true,
  };
}

/**
 * 지수 감쇠 미분방정식의 닫힌 해(`(1 - exp(-lambda * dt)) / lambda`)로 `dtSec` 구간 관성 패닝을 적분한다.
 * `prefersReducedMotion: true`가 전달되면 잔여 이동 없이 즉시 정지한다.
 */
export function stepInertialPanPhysics(
  state: CanvasCameraPhysicsState,
  dtSec: number,
  options?: InertialFlingOptions,
): InertialPanStepResult {
  const dpr = options?.devicePixelRatio ?? 1;

  if (options?.prefersReducedMotion === true) {
    const halted: CanvasCameraPhysicsState = {
      ...state,
      velocityX: 0,
      velocityY: 0,
      isFlingActive: false,
    };
    return {
      nextState: halted,
      deltaPanX: 0,
      deltaPanY: 0,
      speedPxPerSec: 0,
      renderTransform: resolvePixelGridCrispTransform(halted, dpr),
    };
  }

  const safeDt = Math.max(0, sanitizeFinite(dtSec, 0));
  if (!state.isFlingActive || safeDt === 0) {
    const curSpeed = state.isFlingActive ? Math.hypot(state.velocityX, state.velocityY) : 0;
    return {
      nextState: state,
      deltaPanX: 0,
      deltaPanY: 0,
      speedPxPerSec: curSpeed,
      renderTransform: resolvePixelGridCrispTransform(state, dpr),
    };
  }

  const friction = Math.max(1e-3, options?.frictionPerSec ?? DEFAULT_FLING_FRICTION_PER_SEC);
  const restThreshold = Math.max(0.1, options?.restSpeedThresholdPxPerSec ?? DEFAULT_REST_SPEED_PX_PER_SEC);

  const decay = Math.exp(-friction * safeDt);
  const integralFactor = (1 - decay) / friction;
  const deltaPanX = state.velocityX * integralFactor;
  const deltaPanY = state.velocityY * integralFactor;

  const nextVx = state.velocityX * decay;
  const nextVy = state.velocityY * decay;
  const nextSpeed = Math.hypot(nextVx, nextVy);
  const stillMoving = nextSpeed >= restThreshold;

  const nextState: CanvasCameraPhysicsState = {
    zoom: state.zoom,
    panX: state.panX + deltaPanX,
    panY: state.panY + deltaPanY,
    velocityX: stillMoving ? nextVx : 0,
    velocityY: stillMoving ? nextVy : 0,
    isFlingActive: stillMoving,
  };

  return {
    nextState,
    deltaPanX,
    deltaPanY,
    speedPxPerSec: stillMoving ? nextSpeed : 0,
    renderTransform: resolvePixelGridCrispTransform(nextState, dpr),
  };
}
