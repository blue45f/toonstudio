import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  type StudioVirtualSpacePoint,
} from "../studio-virtual-space-model";
import type { StudioOfficeZoneType } from "../studio-virtual-space-office-zones";
import {
  stepCriticallyDampedPoint,
  stepCriticallyDampedScalar,
} from "../studio-virtual-space-sprite-smoothing";

/**
 * 가상 스튜디오 미니맵 원클릭 점프 & 임계 감쇠(Critically Damped Spring) 카메라 추적기.
 *
 * - 작업실·회의실·외주 광장·휴게실 4대 거점 원클릭 이동을 임계 감쇠 스프링으로 오버슈트 없이 수렴시킨다.
 * - 달리기(sprint) 중에는 시야를 미세하게 넓혀(`zoom 1.0 → 0.94`) 주변 동료와 구역 배치를 파악하기 쉽게 한다.
 * - `prefers-reduced-motion` 환경에서는 스프링 보간과 줌 변동을 건너뛰고 즉시 목표 지점으로 이동한다.
 * - 순수 계산 모듈(₩0 로컬, 브라우저 스토리지 미사용).
 */

/** 미니맵 원클릭 거점 4종. */
export type StudioMinimapLandmarkId =
  | "workroom"
  | "meeting-room"
  | "outsourcing-plaza"
  | "lounge";

export const STUDIO_MINIMAP_LANDMARK_IDS: readonly StudioMinimapLandmarkId[] = Object.freeze([
  "workroom",
  "meeting-room",
  "outsourcing-plaza",
  "lounge",
]);

/** 기본 카메라 줌 배율. */
export const STUDIO_MINIMAP_CAMERA_BASE_ZOOM = 1.0;

/** 달리기 시 미세 시야 확장 줌 배율(1.0 → 0.94). */
export const STUDIO_MINIMAP_CAMERA_SPRINT_ZOOM = 0.94;

/** 미니맵 원클릭 점프 스프링 시정수(초). 약 0.7~1.0초 안에 오버슈트 없이 안착한다. */
export const STUDIO_MINIMAP_CAMERA_JUMP_SMOOTH_TIME_S = 0.24;

/** 아바타 추적 모드 스프링 시정수(초). */
export const STUDIO_MINIMAP_CAMERA_FOLLOW_SMOOTH_TIME_S = 0.14;

/** 달리기 줌 전환 스프링 시정수(초). */
export const STUDIO_MINIMAP_CAMERA_ZOOM_SMOOTH_TIME_S = 0.22;

/** 위치 안착 판정 허용 오차(px). */
export const STUDIO_MINIMAP_CAMERA_POSITION_EPSILON_PX = 0.25;

/** 줌 안착 판정 허용 오차. */
export const STUDIO_MINIMAP_CAMERA_ZOOM_EPSILON = 0.0005;

/** 카메라 추적 모드. */
export type StudioMinimapCameraMode = "follow" | "minimap-jump";

/** 미니맵 원클릭 이동 거점 정의. */
export interface StudioMinimapLandmark {
  readonly id: StudioMinimapLandmarkId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly target: StudioVirtualSpacePoint;
  readonly zoneType: StudioOfficeZoneType;
}

/** 1280×960 표준 가상 스튜디오 4대 거점 기본 좌표. */
export const STUDIO_MINIMAP_DEFAULT_LANDMARKS: readonly StudioMinimapLandmark[] = Object.freeze([
  Object.freeze({
    id: "workroom",
    labelKo: "작업실",
    labelEn: "Workroom",
    descriptionKo: "선화·채색 타블렛 데스크가 모인 메인 작업 구역",
    descriptionEn: "Main drawing desks for line art and coloring",
    target: Object.freeze({ x: 260, y: 260 }),
    zoneType: "studio",
  }),
  Object.freeze({
    id: "meeting-room",
    labelKo: "회의실",
    labelEn: "Meeting Room",
    descriptionKo: "3D 배경 구도와 마감 검수를 협의하는 회의 공간",
    descriptionEn: "Room for 3D background and deadline reviews",
    target: Object.freeze({ x: 980, y: 250 }),
    zoneType: "meeting-room",
  }),
  Object.freeze({
    id: "outsourcing-plaza",
    labelKo: "외주 광장",
    labelEn: "Outsourcing Plaza",
    descriptionKo: "협업 제안과 어시스턴트 합류가 열리는 중앙 광장",
    descriptionEn: "Central plaza for collaboration and outsourcing",
    target: Object.freeze({ x: 640, y: 540 }),
    zoneType: "event-hall",
  }),
  Object.freeze({
    id: "lounge",
    labelKo: "휴게실",
    labelEn: "Lounge",
    descriptionKo: "커피를 마시며 잠시 숨을 고르는 휴식 구역",
    descriptionEn: "Quiet lounge for coffee breaks",
    target: Object.freeze({ x: 980, y: 740 }),
    zoneType: "lounge",
  }),
]);

/** 카메라 경계 클램프 설정. */
export interface StudioMinimapCameraBounds {
  readonly worldWidth: number;
  readonly worldHeight: number;
  /** 화면이 비추는 월드 가로폭(지정 시 가장자리 빈 여백이 보이지 않게 클램프). */
  readonly viewportWidth?: number;
  /** 화면이 비추는 월드 세로폭. */
  readonly viewportHeight?: number;
  /** 월드 가장자리 최소 여유(px). viewportWidth/Height가 없을 때 사용. 기본 20. */
  readonly marginPx?: number;
}

/** 임계 감쇠 카메라 상태. */
export interface StudioMinimapCameraState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly zoom: number;
  readonly zoomVelocity: number;
  readonly targetZoom: number;
  readonly mode: StudioMinimapCameraMode;
  readonly activeLandmarkId: StudioMinimapLandmarkId | null;
  readonly settled: boolean;
}

/** 미니맵 점프 명령 옵션. */
export interface StudioMinimapJumpOptions {
  readonly reducedMotion?: boolean;
  readonly landmarks?: readonly StudioMinimapLandmark[];
  readonly bounds?: StudioMinimapCameraBounds;
}

/** 카메라 프레임 진행 입력. */
export interface StudioMinimapCameraStepInput {
  /** 프레임 델타(초). */
  readonly deltaSeconds: number;
  /** 추적 모드일 때 따라갈 아바타 좌표. */
  readonly followTarget?: StudioVirtualSpacePoint | null;
  /** 미니맵 점프 도중에도 아바타 추적으로 복귀할지 여부. */
  readonly resumeFollow?: boolean;
  /** 달리기 여부. true면 시야가 1.0 → 0.94로 미세 확장된다. */
  readonly sprinting?: boolean;
  /** 달리기 속도 비율(0~1). 생략 시 sprinting이 true면 1.0으로 취급. */
  readonly sprintSpeedRatio?: number;
  /** `prefers-reduced-motion` 여부. true면 즉시 이동·줌 1.0 고정. */
  readonly reducedMotion?: boolean;
  /** 위치 스프링 시정수 덮어쓰기(초). */
  readonly smoothTimeSeconds?: number;
  /** 줌 스프링 시정수 덮어쓰기(초). */
  readonly zoomSmoothTimeSeconds?: number;
  /** 최대 카메라 이동 속도 상한(px/s). */
  readonly maxSpeedPxPerSec?: number;
  /** 월드 경계 클램프. */
  readonly bounds?: StudioMinimapCameraBounds;
}

const LANDMARK_ID_SET: ReadonlySet<string> = new Set(STUDIO_MINIMAP_LANDMARK_IDS);

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** 유효한 미니맵 4대 거점 ID인지 판별한다. */
export function isStudioMinimapLandmarkId(value: unknown): value is StudioMinimapLandmarkId {
  return typeof value === "string" && LANDMARK_ID_SET.has(value);
}

/** 거점 ID로 랜드마크 메타·목표 좌표를 찾는다(커스텀 목록 우선, 없으면 기본값). */
export function studioMinimapLandmarkById(
  id: StudioMinimapLandmarkId,
  landmarks: readonly StudioMinimapLandmark[] = STUDIO_MINIMAP_DEFAULT_LANDMARKS,
): StudioMinimapLandmark {
  const custom = landmarks.find((item) => item.id === id);
  if (custom) return custom;
  const fallback = STUDIO_MINIMAP_DEFAULT_LANDMARKS.find((item) => item.id === id);
  return fallback ?? STUDIO_MINIMAP_DEFAULT_LANDMARKS[0];
}

/** 카메라 중심 좌표를 월드 경계 안으로 안전하게 제한한다. */
export function clampMinimapCameraPoint(
  point: StudioVirtualSpacePoint,
  bounds?: StudioMinimapCameraBounds,
): StudioVirtualSpacePoint {
  const rawX = finiteOr(point.x, STUDIO_VIRTUAL_SPACE_WIDTH / 2);
  const rawY = finiteOr(point.y, STUDIO_VIRTUAL_SPACE_HEIGHT / 2);
  if (!bounds) {
    return Object.freeze({ x: roundTo(rawX, 3), y: roundTo(rawY, 3) });
  }
  const worldWidth = Math.max(1, finiteOr(bounds.worldWidth, STUDIO_VIRTUAL_SPACE_WIDTH));
  const worldHeight = Math.max(1, finiteOr(bounds.worldHeight, STUDIO_VIRTUAL_SPACE_HEIGHT));
  const margin = Math.max(0, finiteOr(bounds.marginPx, 20));

  const halfViewX = bounds.viewportWidth !== undefined && Number.isFinite(bounds.viewportWidth) && bounds.viewportWidth > 0
    ? bounds.viewportWidth / 2
    : margin;
  const halfViewY = bounds.viewportHeight !== undefined && Number.isFinite(bounds.viewportHeight) && bounds.viewportHeight > 0
    ? bounds.viewportHeight / 2
    : margin;

  const x = halfViewX * 2 >= worldWidth
    ? worldWidth / 2
    : clamp(rawX, halfViewX, worldWidth - halfViewX);
  const y = halfViewY * 2 >= worldHeight
    ? worldHeight / 2
    : clamp(rawY, halfViewY, worldHeight - halfViewY);

  return Object.freeze({ x: roundTo(x, 3), y: roundTo(y, 3) });
}

/**
 * 달리기 상태에 따른 목표 카메라 줌 배율을 계산한다.
 * - 일반 이동·대기: `1.0`
 * - 달리기: `1.0 → 0.94` 미세 시야 확장
 * - `prefers-reduced-motion`: 항상 `1.0` 고정
 */
export function resolveStudioMinimapSprintZoom(options: {
  readonly sprinting: boolean;
  readonly sprintSpeedRatio?: number;
  readonly reducedMotion?: boolean;
  readonly baseZoom?: number;
  readonly sprintZoom?: number;
}): number {
  const baseZoom = clamp(finiteOr(options.baseZoom, STUDIO_MINIMAP_CAMERA_BASE_ZOOM), 0.5, 2.0);
  if (options.reducedMotion === true || !options.sprinting) {
    return roundTo(baseZoom, 4);
  }
  const sprintZoom = clamp(finiteOr(options.sprintZoom, STUDIO_MINIMAP_CAMERA_SPRINT_ZOOM), 0.5, baseZoom);
  const ratio = clamp(finiteOr(options.sprintSpeedRatio, 1), 0, 1);
  return roundTo(baseZoom - (baseZoom - sprintZoom) * ratio, 4);
}

/** 임계 감쇠 미니맵 카메라 초기 상태를 생성한다. */
export function createVirtualSpaceMinimapCameraState(initial: {
  readonly x?: number;
  readonly y?: number;
  readonly zoom?: number;
  readonly landmarkId?: StudioMinimapLandmarkId | null;
  readonly bounds?: StudioMinimapCameraBounds;
} = {}): StudioMinimapCameraState {
  const landmark = initial.landmarkId ? studioMinimapLandmarkById(initial.landmarkId) : null;
  const startPoint = clampMinimapCameraPoint(
    {
      x: finiteOr(initial.x, landmark?.target.x ?? STUDIO_VIRTUAL_SPACE_WIDTH / 2),
      y: finiteOr(initial.y, landmark?.target.y ?? STUDIO_VIRTUAL_SPACE_HEIGHT / 2),
    },
    initial.bounds,
  );
  const zoom = clamp(finiteOr(initial.zoom, STUDIO_MINIMAP_CAMERA_BASE_ZOOM), 0.5, 2.0);
  return Object.freeze({
    x: startPoint.x,
    y: startPoint.y,
    vx: 0,
    vy: 0,
    targetX: startPoint.x,
    targetY: startPoint.y,
    zoom,
    zoomVelocity: 0,
    targetZoom: zoom,
    mode: "follow",
    activeLandmarkId: initial.landmarkId ?? null,
    settled: true,
  });
}

/**
 * 미니맵 임의 좌표로 원클릭 카메라 이동을 시작한다.
 * `reducedMotion === true`면 스프링 보간 없이 즉시 목표 지점에 안착한다.
 */
export function jumpMinimapCameraToPoint(
  state: StudioMinimapCameraState,
  point: StudioVirtualSpacePoint,
  options: {
    readonly reducedMotion?: boolean;
    readonly landmarkId?: StudioMinimapLandmarkId | null;
    readonly bounds?: StudioMinimapCameraBounds;
  } = {},
): StudioMinimapCameraState {
  const target = clampMinimapCameraPoint(point, options.bounds);
  const landmarkId = options.landmarkId ?? null;

  if (options.reducedMotion === true) {
    return Object.freeze({
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      targetX: target.x,
      targetY: target.y,
      zoom: STUDIO_MINIMAP_CAMERA_BASE_ZOOM,
      zoomVelocity: 0,
      targetZoom: STUDIO_MINIMAP_CAMERA_BASE_ZOOM,
      mode: "minimap-jump",
      activeLandmarkId: landmarkId,
      settled: true,
    });
  }

  const alreadyAtTarget = Math.hypot(target.x - state.x, target.y - state.y) <= STUDIO_MINIMAP_CAMERA_POSITION_EPSILON_PX
    && Math.hypot(state.vx, state.vy) <= 1
    && Math.abs(state.zoom - STUDIO_MINIMAP_CAMERA_BASE_ZOOM) <= STUDIO_MINIMAP_CAMERA_ZOOM_EPSILON;

  return Object.freeze({
    ...state,
    targetX: target.x,
    targetY: target.y,
    targetZoom: STUDIO_MINIMAP_CAMERA_BASE_ZOOM,
    mode: "minimap-jump",
    activeLandmarkId: landmarkId,
    settled: alreadyAtTarget,
  });
}

/**
 * 작업실·회의실·외주 광장·휴게실 원클릭 이동을 트리거한다.
 * `prefers-reduced-motion` 시 즉시 이동한다.
 */
export function jumpMinimapCameraToLandmark(
  state: StudioMinimapCameraState,
  landmarkId: StudioMinimapLandmarkId,
  options: StudioMinimapJumpOptions = {},
): StudioMinimapCameraState {
  const landmark = studioMinimapLandmarkById(landmarkId, options.landmarks);
  return jumpMinimapCameraToPoint(state, landmark.target, {
    reducedMotion: options.reducedMotion,
    landmarkId: landmark.id,
    bounds: options.bounds,
  });
}

/**
 * 임계 감쇠 스프링으로 카메라 위치와 달리기 줌(`1.0 ↔ 0.94`)을 한 프레임 전진한다.
 * - `reducedMotion === true`면 즉시 목표 위치와 기본 줌(`1.0`)으로 스냅한다.
 * - 오버슈트 없이 부드럽게 수렴하며, 안착 임계 이내에서 속도를 0으로 깔끔하게 정리한다.
 */
export function stepVirtualSpaceMinimapCamera(
  state: StudioMinimapCameraState,
  input: StudioMinimapCameraStepInput,
): StudioMinimapCameraState {
  const reducedMotion = input.reducedMotion === true;
  const mode: StudioMinimapCameraMode = input.resumeFollow === true && input.followTarget
    ? "follow"
    : state.mode;

  const rawTarget: StudioVirtualSpacePoint = mode === "follow" && input.followTarget
    ? input.followTarget
    : { x: state.targetX, y: state.targetY };
  const clampedTarget = clampMinimapCameraPoint(rawTarget, input.bounds);

  const desiredZoom = resolveStudioMinimapSprintZoom({
    sprinting: input.sprinting === true,
    sprintSpeedRatio: input.sprintSpeedRatio,
    reducedMotion,
  });

  if (reducedMotion) {
    return Object.freeze({
      x: clampedTarget.x,
      y: clampedTarget.y,
      vx: 0,
      vy: 0,
      targetX: clampedTarget.x,
      targetY: clampedTarget.y,
      zoom: STUDIO_MINIMAP_CAMERA_BASE_ZOOM,
      zoomVelocity: 0,
      targetZoom: STUDIO_MINIMAP_CAMERA_BASE_ZOOM,
      mode,
      activeLandmarkId: mode === "follow" ? null : state.activeLandmarkId,
      settled: true,
    });
  }

  const dt = Math.max(0, finiteOr(input.deltaSeconds, 0));
  if (dt <= 0) {
    return state;
  }

  const defaultSmoothTime = mode === "minimap-jump"
    ? STUDIO_MINIMAP_CAMERA_JUMP_SMOOTH_TIME_S
    : STUDIO_MINIMAP_CAMERA_FOLLOW_SMOOTH_TIME_S;
  const smoothTimeSeconds = Math.max(0.02, finiteOr(input.smoothTimeSeconds, defaultSmoothTime));
  const zoomSmoothTimeSeconds = Math.max(
    0.02,
    finiteOr(input.zoomSmoothTimeSeconds, STUDIO_MINIMAP_CAMERA_ZOOM_SMOOTH_TIME_S),
  );

  // 긴 미니맵 원클릭 이동(1000px+)도 끊김 없이 미끄러지도록 snapDistancePx를 무한대로 열어둔다.
  const nextPos = stepCriticallyDampedPoint(
    { x: state.x, y: state.y, vx: state.vx, vy: state.vy },
    clampedTarget,
    dt,
    {
      smoothTimeSeconds,
      maxSpeed: input.maxSpeedPxPerSec,
      snapDistancePx: Number.POSITIVE_INFINITY,
      stopEpsilonPx: STUDIO_MINIMAP_CAMERA_POSITION_EPSILON_PX,
      maxDeltaSeconds: 0.1,
      enabled: true,
    },
  );

  const clampedPos = clampMinimapCameraPoint({ x: nextPos.x, y: nextPos.y }, input.bounds);
  const nextZoom = stepCriticallyDampedScalar(
    { value: state.zoom, velocity: state.zoomVelocity },
    desiredZoom,
    dt,
    {
      smoothTimeSeconds: zoomSmoothTimeSeconds,
      stopEpsilon: STUDIO_MINIMAP_CAMERA_ZOOM_EPSILON,
      maxDeltaSeconds: 0.1,
      enabled: true,
    },
  );

  const posDist = Math.hypot(clampedTarget.x - clampedPos.x, clampedTarget.y - clampedPos.y);
  const posSpeed = Math.hypot(nextPos.vx, nextPos.vy);
  const zoomDiff = Math.abs(desiredZoom - nextZoom.value);
  const posSettled = posDist <= STUDIO_MINIMAP_CAMERA_POSITION_EPSILON_PX && posSpeed <= 2;
  const zoomSettled = zoomDiff <= STUDIO_MINIMAP_CAMERA_ZOOM_EPSILON && Math.abs(nextZoom.velocity) <= 0.02;

  return Object.freeze({
    x: posSettled ? clampedTarget.x : roundTo(clampedPos.x, 3),
    y: posSettled ? clampedTarget.y : roundTo(clampedPos.y, 3),
    vx: posSettled ? 0 : roundTo(nextPos.vx, 3),
    vy: posSettled ? 0 : roundTo(nextPos.vy, 3),
    targetX: clampedTarget.x,
    targetY: clampedTarget.y,
    zoom: zoomSettled ? desiredZoom : roundTo(nextZoom.value, 5),
    zoomVelocity: zoomSettled ? 0 : roundTo(nextZoom.velocity, 5),
    targetZoom: desiredZoom,
    mode,
    activeLandmarkId: mode === "follow" ? null : state.activeLandmarkId,
    settled: posSettled && zoomSettled,
  });
}
