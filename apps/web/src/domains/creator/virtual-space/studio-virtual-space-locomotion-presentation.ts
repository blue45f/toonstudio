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

const GAIT_BODY_LIFT = 3.5;
const GAIT_BODY_SWAY = 2.4;

/**
 * 그림자와 같은 이동 거리·같은 위상을 쓴다. 접지 순간 그림자가 가장 작아지므로 몸도 가장 낮아져야
 * 하므로 `(cos - 1)`을 쓴다. 정지·벽·모션 감소에서는 0이다.
 */
export function studioGaitBodyOffset(distance: number, stride: number, moving: boolean, reducedMotion: boolean): {
  readonly offsetX: number;
  readonly offsetY: number;
} {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) {
    return { offsetX: 0, offsetY: 0 };
  }
  const phase = distance / stride * Math.PI * 4;
  return { offsetX: Math.sin(phase) * GAIT_BODY_SWAY, offsetY: (Math.cos(phase) - 1) * GAIT_BODY_LIFT };
}

/**
 * 유효 보폭 단일화: 프레임 선택·몸 bob·기울기·스쿼시가 전부 같은 보폭을 써야
 * 발 접지와 몸 움직임의 위상이 어긋나지 않는다. 장소 프로필의 강제 보폭(스프라이트
 * 데이터)이 있으면 그것이, 없으면 클립 고유 보폭이, 둘 다 없으면 표준 보폭이 이긴다.
 */
export function studioEffectiveGaitStride(override: number | undefined, clipStride: number | undefined): number {
  if (Number.isFinite(override) && (override as number) > 0) return override as number;
  if (Number.isFinite(clipStride) && (clipStride as number) > 0) return clipStride as number;
  return STUDIO_GAIT_DISTANCE_PER_CYCLE;
}

const GAIT_ROCK_DEGREES = 1.1;

/**
 * 걸음 위상에 동기된 몸 흔들림(도). 좌우 스웨이(offsetX)와 같은 위상이라 몸이
 * 걸음마다 한 몸으로 흔들린다. 4프레임 걷기 사이클의 딱딱한 프레임 전환 사이에
 * 연속적인 2차 모션을 넣어 끊김을 누그러뜨리는 절차적 인비트위닝이다.
 * 정지·벽·모션 감소에서는 0이다.
 */
export function studioGaitRockAngle(distance: number, stride: number, moving: boolean, reducedMotion: boolean): number {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) return 0;
  return Math.sin(distance / stride * Math.PI * 4) * GAIT_ROCK_DEGREES;
}

const GAIT_SQUASH_DEPTH = 0.012;

/**
 * 걸음 위상에 동기된 세로 스쿼시 배율. 발이 땅에 닿는 순간(bob이 가장 낮은 위상,
 * cos=1) 몸이 살짝 눌리고, 떠오를 때 원복한다. 진폭 1.2%로 과하지 않게 둔다.
 * 정지·벽·모션 감소에서는 1이다.
 */
export function studioGaitSquashScaleY(distance: number, stride: number, moving: boolean, reducedMotion: boolean): number {
  if (!moving || reducedMotion || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(stride) || stride <= 0) return 1;
  const contact = (Math.cos(distance / stride * Math.PI * 4) + 1) / 2;
  return 1 - GAIT_SQUASH_DEPTH * contact;
}

/** 접지 스쿼시의 가로 반동 비율. 세로로 눌린 만큼의 60%를 가로로 돌려 부피가 보존되는 느낌을 준다. */
const GAIT_SQUASH_LATERAL_REBOUND = 0.6;

/**
 * 접지 스쿼시 배율 쌍. 세로는 기존 곡선 그대로, 가로에는 부피 보존 반동을 더해
 * 발이 닿는 순간 몸이 아래로만 꺼지지 않고 살짝 퍼지며 "착지"로 읽히게 한다.
 * 정지·벽·모션 감소에서는 두 축 모두 1이다.
 */
export function studioGaitSquashScale(
  distance: number,
  stride: number,
  moving: boolean,
  reducedMotion: boolean,
): { readonly scaleX: number; readonly scaleY: number } {
  const scaleY = studioGaitSquashScaleY(distance, stride, moving, reducedMotion);
  return { scaleX: 1 + (1 - scaleY) * GAIT_SQUASH_LATERAL_REBOUND, scaleY };
}

const IDLE_SWAY_AMPLITUDE_PX = 1.2;
const IDLE_SWAY_PERIOD_MS = 5_900;

/**
 * 대기 중 무게중심 이동(px): 좌우로 아주 느리게 흔들려 정지 포즈가 석상처럼
 * 굳지 않게 한다. 위상은 배우별 시드로 어긋나 군집이 한 몸처럼 움직이지 않는다.
 * 모션 감소에서는 0이다.
 */
export function studioIdleSwayOffsetX(timeMs: number, seed: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(timeMs)) return 0;
  const safeSeed = Number.isFinite(seed) ? seed : 0;
  return Math.sin((timeMs / IDLE_SWAY_PERIOD_MS + safeSeed) * Math.PI * 2) * IDLE_SWAY_AMPLITUDE_PX;
}

const DOZE_CYCLE_MS = 6_400;
const DOZE_DIP_MS = 1_700;
const DOZE_DIP_DEPTH_PX = 2.4;
const DOZE_TILT_DEGREES = 1.8;

/**
 * 자리 비움(away) 졸기 오프셋. 자리 비움은 지금까지 이름표·투명도뿐이라 몸은
 * available 대기 자세와 똑같이 서 있어 상태가 몸짓으로 읽히지 않았다.
 * 긴 주기(6.4초)마다 한 번씩 고개가 아래로 살짝 떨어졌다 돌아오는 꾸벅임을
 * 기존 idle 생명감(호흡·sway·깜빡임)과 같은 절차 모션 어휘로 얹는다.
 * 전용 아트가 아니라 몸 전체의 미세 변위이며, 진폭을 작게 잡는 이유도 그 전제다.
 * 배우별 시드로 위상을 어긋나게 하고, 모션 감소에서는 중립값을 돌려준다.
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

const BLINK_MIN_INTERVAL_MS = 3_400;
const BLINK_INTERVAL_SPREAD_MS = 3_400;
const BLINK_DURATION_MS = 110;
const BLINK_DEPTH = 0.014;

function smoothstep01(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 절차적 눈 깜빡임의 세로 배율. 표정 아트(깜빡임 프레임)가 있는 스타일은 그쪽이
 * 우선이며, 이 값은 깜빡임 작화가 없는 스킨에서 몸 전체가 110ms 동안 1.4% 눌리는
 * 미세한 생동감으로 대신한다 — 진짜 눈동자 움직임이 아님을 전제로 진폭을 작게 둔다.
 * 간격은 배우별 시드로 3.4~6.8초 사이에서 어긋난다. 모션 감소에서는 항상 1이다.
 */
export function studioBlinkScaleY(timeMs: number, seed: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(timeMs) || timeMs < 0) return 1;
  const safeSeed = Number.isFinite(seed) ? Math.max(0, Math.min(1, seed)) : 0;
  const interval = BLINK_MIN_INTERVAL_MS + safeSeed * BLINK_INTERVAL_SPREAD_MS;
  const phase = (timeMs + safeSeed * interval * 7) % interval;
  if (phase >= BLINK_DURATION_MS) return 1;
  const edge = Math.min(phase, BLINK_DURATION_MS - phase) / (BLINK_DURATION_MS / 2);
  return 1 - BLINK_DEPTH * smoothstep01(edge);
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
 * 대기(idle) 및 착석(sit) 상태에서 이미지 스프라이트가 석상처럼 멈춰 보이지 않도록
 * 부피 보존 호흡 배율(들숨 시 세로 확장·가로 미세 수축)을 계산한다.
 * 보행 중이거나 모션 감소일 때는 `{ scaleX: 1, scaleY: 1 }`을 반환한다.
 */
export function studioIdleUpperBodyBreathScale(
  timeMs: number,
  seed: number,
  moving: boolean,
  seated: boolean,
  reducedMotion: boolean,
): { readonly scaleX: number; readonly scaleY: number } {
  if (moving || reducedMotion || !Number.isFinite(timeMs) || timeMs < 0) {
    return { scaleX: 1, scaleY: 1 };
  }
  const safeSeed = Number.isFinite(seed) ? Math.max(0, Math.min(1, seed)) : 0;
  const periodMs = seated ? 4_600 : 3_800;
  const depthY = seated ? 0.0065 : 0.0095;
  const wave = Math.sin(((timeMs / periodMs) + safeSeed) * Math.PI * 2);
  return {
    scaleX: Number((1 - wave * depthY * 0.42).toFixed(5)),
    scaleY: Number((1 + wave * depthY).toFixed(5)),
  };
}

export interface StudioImageSpriteSubframeMotion {
  /** 프레임 내부 위상 (0~1). 프레임 전환 경계에서는 0 또는 1에 수렴. */
  readonly subframePhase: number;
  /** 프레임과 프레임 사이의 불연속 포즈 점프를 메우는 미세 수직 아크(px, 경계에서 0). */
  readonly liftPx: number;
  /** 좌우 발 교차에 맞춘 미세 상체 회전 인비트위닝(도, 경계에서 0). */
  readonly tiltDeg: number;
  /** 프레임 내부 탄성 부피 보존 가로 배율. */
  readonly scaleX: number;
  /** 프레임 내부 탄성 부피 보존 세로 배율. */
  readonly scaleY: number;
}

/**
 * 4프레임(또는 N프레임) PNG 이미지 스프라이트 전용 서브프레임(Sub-frame) 절차적 인비트위닝.
 *
 * 이미지 스프라이트는 프레임 수가 4장 내외로 적어 60~120Hz 화면에서 프레임이 바뀔 때
 * 자세가 계단식으로 끊겨 보일 수 있다. 각 프레임의 고유 `originX/originY` 정합은 그대로 보존하면서,
 * 프레임 내부 진행도 `u ∈ [0, 1)` 구간에서 경계값(`u=0, 1`)이 정확히 0인 사인 엔벨로프(`sin(πu)`)로
 * 미세 리프트·상체 스윙·탄성 스케일을 보간해 60fps 이상의 부드러운 연속 동작감을 만든다.
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
  // 프레임 교체 경계(u = 0, u = 1)에서 0이 되는 매끄러운 반파 엔벨로프
  const envelope = Math.sin(u * Math.PI);
  // 짝수/홀수 프레임(왼발/오른발 교차)에 따라 상체 미세 스윙 부호를 교번
  const paritySign = frameIndex % 2 === 0 ? 1 : -1;
  const liftPx = Number((-envelope * 0.95).toFixed(4));
  const tiltDeg = Number((envelope * paritySign * 0.42).toFixed(4));
  const scaleY = Number((1 + envelope * 0.0055).toFixed(5));
  const scaleX = Number((1 - envelope * 0.0032).toFixed(5));
  return {
    subframePhase: Number(u.toFixed(4)),
    liftPx,
    tiltDeg,
    scaleX,
    scaleY,
  };
}

