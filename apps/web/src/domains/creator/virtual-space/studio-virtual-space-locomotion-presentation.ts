import type { StudioVirtualCameraMode } from "./studio-virtual-space-experience-preference";
import { STUDIO_VIRTUAL_SPACE_WALK_SPEED } from "./studio-virtual-space-navigation";
import { STUDIO_GAIT_DISTANCE_PER_CYCLE } from "./studio-virtual-space-presentation";

const ILLUSTRATED_PLAYER = Object.freeze({ walkSpeed: 160, sprintMultiplier: 1.3, gaitDistancePerCycle: 108 });
const LEGACY_PLAYER = Object.freeze({ walkSpeed: STUDIO_VIRTUAL_SPACE_WALK_SPEED, sprintMultiplier: 1.35,
  gaitDistancePerCycle: undefined });

/** 약 85px인 내장 장소의 몸 크기에 맞춘다. 기존 사용자 월드와 NPC의 원본 보폭은 유지한다. */
export function studioPlayerLocomotionProfile(illustratedPlace: boolean) {
  return illustratedPlace ? ILLUSTRATED_PLAYER : LEGACY_PLAYER;
}

/** 한 보행 주기의 두 접지에 그림자를 맞춘다. 벽·정지·모션 감소에서는 맥동하지 않는다. */
export function studioGaitShadowScale(distance: number, stride: number, moving: boolean, reducedMotion: boolean): number {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) return 1;
  return .96 + Math.cos(distance / stride * Math.PI * 4) * .04;
}

const GAIT_BODY_LIFT = 1.0;

/**
 * 그림자와 같은 이동 거리·같은 위상을 쓴다. 접지 순간 그림자가 가장 작아지므로 몸도 가장 낮아져야
 * 하므로 `(cos - 1)`을 쓴다. 좌우 흔들림(sway)을 제거해 보행 중 캐릭터가 흔들리지 않고
 * 정갈한 미세 상하 리듬만 유지한다. 정지·벽·모션 감소에서는 0이다.
 */
export function studioGaitBodyOffset(distance: number, stride: number, moving: boolean, reducedMotion: boolean): {
  readonly offsetX: number;
  readonly offsetY: number;
} {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) {
    return { offsetX: 0, offsetY: 0 };
  }
  const phase = distance / stride * Math.PI * 4;
  return { offsetX: 0, offsetY: (Math.cos(phase) - 1) * GAIT_BODY_LIFT };
}

/**
 * 유효 보폭 단일화: 프레임 선택·몸 bob·그림자가 전부 같은 보폭을 써야
 * 발 접지와 몸 움직임의 위상이 어긋나지 않는다. 장소 프로필의 강제 보폭(스프라이트
 * 데이터)이 있으면 그것이, 없으면 클립 고유 보폭이, 둘 다 없으면 표준 보폭이 이긴다.
 */
export function studioEffectiveGaitStride(override: number | undefined, clipStride: number | undefined): number {
  if (Number.isFinite(override) && (override as number) > 0) return override as number;
  if (Number.isFinite(clipStride) && (clipStride as number) > 0) return clipStride as number;
  return STUDIO_GAIT_DISTANCE_PER_CYCLE;
}

/**
 * 걸음 위상에 동기된 몸 흔들림(도).
 * 등신 비율과 직립 자세 안정을 위해 보행 중 과도한 좌우 회전 흔들림을 제거하고 0도를 유지한다.
 */
export function studioGaitRockAngle(_distance: number, _stride: number, _moving: boolean, _reducedMotion: boolean): number {
  return 0;
}

/**
 * 걸음 위상 세로 배율.
 * 대기·걷기·뛰기 전 구간에서 캐릭터 등신 비율과 키를 1.0으로 고정(proportional height lock)해
 * 프레임마다 사이즈가 출렁이는 현상을 원천 차단한다.
 */
export function studioGaitSquashScaleY(_distance: number, _stride: number, _moving: boolean, _reducedMotion: boolean): number {
  return 1;
}

/**
 * 접지 배율 쌍. 보행 중 캐릭터 가로·세로 크기를 1.0으로 고정한다.
 */
export function studioGaitSquashScale(
  _distance: number,
  _stride: number,
  _moving: boolean,
  _reducedMotion: boolean,
): { readonly scaleX: number; readonly scaleY: number } {
  return { scaleX: 1, scaleY: 1 };
}

/**
 * 대기 중 무게중심 이동(px).
 * 정지 상태에서 좌우로 흔들리는 현상을 제거해 발바닥 접지를 완전히 고정한다.
 */
export function studioIdleSwayOffsetX(_timeMs: number, _seed: number, _reducedMotion: boolean): number {
  return 0;
}

const DOZE_CYCLE_MS = 6_400;
const DOZE_DIP_MS = 1_700;
const DOZE_DIP_DEPTH_PX = 0.8;
const DOZE_TILT_DEGREES = 0.6;

/**
 * 자리 비움(away) 졸기 오프셋.
 * 긴 주기(6.4초)마다 한 번씩 고개가 아주 미세하게 내려갔다 돌아오며, 과도한 흔들림 없이
 * 자리 비움 상태만 정갈하게 전달한다. 모션 감소에서는 중립값을 돌려준다.
 */
export function studioAwayDozeMotion(
  timeMs: number,
  seed: number,
  reducedMotion: boolean,
): { readonly offsetY: number; readonly angleDegrees: number } {
  if (reducedMotion || !Number.isFinite(timeMs) || timeMs < 0) return { offsetY: 0, angleDegrees: 0 };
  const safeSeed = Number.isFinite(seed) ? Math.max(0, Math.min(1, seed)) : 0;
  const phaseMs = (timeMs + safeSeed * DOZE_CYCLE_MS) % DOZE_CYCLE_MS;
  if (phaseMs >= DOZE_DIP_MS) return { offsetY: 0, angleDegrees: 0 };
  const depth = Math.sin((phaseMs / DOZE_DIP_MS) * Math.PI);
  const tiltSign = safeSeed >= 0.5 ? 1 : -1;
  // depth 0에서 기울기 부호를 곱하면 -0이 되어 중립값과 달라지므로 0은 그대로 둔다.
  const angleDegrees = depth === 0 ? 0 : depth * DOZE_TILT_DEGREES * tiltSign;
  return { offsetY: depth * DOZE_DIP_DEPTH_PX, angleDegrees };
}

/**
 * 절차적 눈 깜빡임의 세로 배율.
 * 몸 전체를 찌그러뜨리는 가짜 눈 깜빡임(body squash)을 제거해 키 요동 없이 항상 1을 유지한다.
 */
export function studioBlinkScaleY(_timeMs: number, _seed: number, _reducedMotion: boolean): number {
  return 1;
}

/**
 * Phaser setDeadzone은 추적 위치도 재설정하므로 모드나 데드존 배율이 바뀔 때만 호출한다.
 * 배율 0.2(즉응형)는 카메라가 거의 바로 따라붙게 하고, 1은 기존 데드존 그대로다.
 */
export class StudioCameraFollowModeController {
  private mode: StudioVirtualCameraMode | null = null;
  private scale = Number.NaN;

  constructor(private readonly camera: { setDeadzone(width: number, height: number): unknown }) {}

  update(mode: StudioVirtualCameraMode, deadzoneScale = 1): void {
    const scale = Number.isFinite(deadzoneScale) ? Math.max(0, Math.min(1, deadzoneScale)) : 1;
    if (this.mode === mode && this.scale === scale) return;
    this.camera.setDeadzone(
      Math.round((mode === "steady" ? 200 : mode === "cinematic" ? 110 : 150) * scale),
      Math.round((mode === "steady" ? 135 : mode === "cinematic" ? 78 : 100) * scale),
    );
    this.mode = mode;
    this.scale = scale;
  }
}

/**
 * 보행 위상에 맞춘 접지 그림자 알파.
 * 발이 땅을 딛는 순간(cos = -1) 그림자 농도가 깊어지고, 발이 떠오르는 순간(cos = 1) 옅어진다.
 * 정지·벽·모션 감소에서는 기본 알파(`baseAlpha`)를 그대로 돌려준다.
 */
export function studioGaitShadowAlpha(
  distance: number,
  stride: number,
  moving: boolean,
  reducedMotion: boolean,
  baseAlpha = 0.28,
): number {
  const safeBase = Number.isFinite(baseAlpha) ? Math.max(0, Math.min(1, baseAlpha)) : 0.28;
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) {
    return safeBase;
  }
  const phase = (distance / stride) * Math.PI * 4;
  // cos(phase) === -1 일 때 두 발 접지(가장 짙음), +1 일 때 최고점(가장 옅음)
  const modulation = -Math.cos(phase) * 0.045;
  return Math.max(0.05, Math.min(0.95, Number((safeBase + modulation).toFixed(4))));
}

/**
 * 대기(idle) 및 착석(sit) 상태 호흡 배율.
 * 캐릭터 전체를 세로·가로로 늘였다 줄이는 사이즈 요동을 차단하고 항상 1.0 비율을 고정한다.
 */
export function studioIdleUpperBodyBreathScale(
  _timeMs: number,
  _seed: number,
  _moving: boolean,
  _seated: boolean,
  _reducedMotion: boolean,
): { readonly scaleX: number; readonly scaleY: number } {
  return { scaleX: 1, scaleY: 1 };
}

export interface StudioImageSpriteSubframeMotion {
  /** 프레임 내부 위상 (0~1). 프레임 전환 경계에서는 0 또는 1에 수렴. */
  readonly subframePhase: number;
  /** 프레임 경계 보조 수직 오프셋(px). 중첩 바운스 방지를 위해 0으로 고정. */
  readonly liftPx: number;
  /** 프레임 경계 보조 기울기(도). 흔들림 방지를 위해 0으로 고정. */
  readonly tiltDeg: number;
  /** 등신 비율 고정 가로 배율(항상 1). */
  readonly scaleX: number;
  /** 등신 비율 고정 세로 배율(항상 1). */
  readonly scaleY: number;
}

/**
 * 이미지 스프라이트 서브프레임 위상 계산.
 * 프레임 내부 진행도 `subframePhase ∈ [0, 1)`만 유지하고, 중첩 크기 펌핑·흔들림(scale/tilt/lift)은
 * 0과 1.0으로 잠가 프레임 전환 시 캐릭터 크기가 출렁이지 않게 한다.
 */
export function studioImageSpriteSubframeMotion(
  distance: number,
  stride: number,
  frameCount = 4,
  moving = true,
  reducedMotion = false,
): StudioImageSpriteSubframeMotion {
  if (
    !moving ||
    reducedMotion ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(stride) ||
    stride <= 0 ||
    !Number.isFinite(frameCount) ||
    frameCount < 2
  ) {
    return { subframePhase: 0, liftPx: 0, tiltDeg: 0, scaleX: 1, scaleY: 1 };
  }
  const cycleProgress = ((distance % stride) + stride) % stride / stride;
  const scaled = cycleProgress * frameCount;
  const frameIndex = Math.floor(scaled);
  const u = scaled - frameIndex;
  return {
    subframePhase: Number(u.toFixed(4)),
    liftPx: 0,
    tiltDeg: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

