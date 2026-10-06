/**
 * 스프라이트 표시 스무딩 (표정·동작 부드럽게)
 *
 * 논리 위치·충돌·보간은 기존 모듈이 담당하고, 이 모듈은 **표시 전용** 변환만 제공한다.
 *
 * - 표시 위치 지수 감쇠: 물리 스텝(60Hz)·디렉터 보간이 렌더 프레임과 어긋날 때 생기는
 *   계단 이동과 정지·회전 끝의 "툭" 끊김을 둥글게 한다. 논리 좌표는 건드리지 않는다.
 * - 호흡 위상: NPC·피어가 각자 다른 위상으로 숨쉬도록 id 해시 기반 시드를 쓴다.
 * - 텍스처 크로스페이드 상태 머신: idle↔walk↔액션·표정 교체 시 150ms 알파 블렌드.
 *   Phaser 애니메이션 연속 재생처럼 "연속 운동"인 교체는 페이드하지 않는다
 *   (페이드하면 오히려 다리가 겹쳐 보인다). 단, 수동 게이트 걷기의 프레임 진행은
 *   직전 프레임 체류가 충분히 길 때만 짧은 근사 페이드를 건다 — 진짜 인비트위닝이
 *   아니라 직전 프레임을 잠깐 겹쳐 프레임 전환의 팝을 누그러뜨리는 절차 근사다.
 *
 * 전부 순수 함수이고 프레임당 할당은 호출자 캐시 재사용으로 피한다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 표시 전용 좌표. 논리 좌표와 같은 단위지만 충돌·판정에는 쓰지 않는다. */
export type StudioDisplayPoint = StudioVirtualSpacePoint;

/** 표시 위치 감쇠 시간상수(초). 50ms면 걷기 160px/s에서 약 8px, NPC 90px/s에서 약 4.5px 뒤처진다. */
export const STUDIO_DISPLAY_DAMP_TAU_SECONDS = 0.05;

/** 이 거리(px)보다 멀면 텔레포트·포털·좌석 강제 이동으로 보고 즉시 스냅한다. */
export const STUDIO_DISPLAY_SNAP_DISTANCE_PX = 96;

/**
 * 상태 전환 크로스페이드 시간(ms).
 * 걷기 한 프레임 체류(약 169ms @160px/s·보폭 108px)보다 살짝 짧게 잡아, 상태가
 * 바뀐 뒤에도 이전 그림이 다음 걸음까지 겹쳐 남지 않게 한다.
 */
export const STUDIO_SPRITE_CROSSFADE_MS = 150;

/**
 * 걷기 프레임 근사 페이드를 거는 최소 직전 프레임 체류(ms).
 * 이보다 빠르게 프레임이 도는 걷기(달리기 등)에서는 겹침이 상시화되므로 걸지 않는다.
 */
export const STUDIO_SPRITE_WALK_FRAME_FADE_MIN_DWELL_MS = 120;

/** 걷기 프레임 근사 페이드 상한(ms). 실제 길이는 직전 체류의 40%를 넘지 않는다. */
export const STUDIO_SPRITE_WALK_FRAME_FADE_MAX_MS = 56;

/** 호흡 주기(ms). 로컬 호흡(초당 0.25바퀴)과 같은 리듬이다. */
export const STUDIO_SMOOTHING_BREATH_PERIOD_MS = 4_000;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 지수 감쇠 표시 위치. `alpha = 1 - exp(-dt/τ)`라 프레임레이트와 무관하게 수렴한다.
 * - current가 없으면(첫 표시) 목표를 그대로 반환한다.
 * - enabled=false(모션 감소 등)면 항상 스냅한다.
 * - 목표와의 거리가 스냅 임계보다 크면 텔레포트로 보고 스냅한다.
 */
export function dampStudioDisplayPoint(
  current: StudioVirtualSpacePoint | null,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  options: {
    readonly tauSeconds?: number;
    readonly snapDistancePx?: number;
    readonly enabled?: boolean;
  } = {},
): StudioVirtualSpacePoint {
  if (!current || options.enabled === false) return { x: target.x, y: target.y };
  const tau = finiteOr(options.tauSeconds ?? STUDIO_DISPLAY_DAMP_TAU_SECONDS, STUDIO_DISPLAY_DAMP_TAU_SECONDS);
  const snap = finiteOr(options.snapDistancePx ?? STUDIO_DISPLAY_SNAP_DISTANCE_PX, STUDIO_DISPLAY_SNAP_DISTANCE_PX);
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.hypot(dx, dy) > snap) return { x: target.x, y: target.y };
  const dt = Math.max(0, finiteOr(deltaSeconds, 0));
  if (dt <= 0 || tau <= 0) return { x: current.x, y: current.y };
  const alpha = 1 - Math.exp(-dt / tau);
  return { x: current.x + dx * alpha, y: current.y + dy * alpha };
}

/** 식별자 해시 → 0~1 위상 시드. 같은 캐릭터는 항상 같은 위상을 유지한다. */
export function studioSmoothingPhaseSeed(identity: string): number {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = (hash * 31 + identity.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

/** 절대 시각 + 시드 → 호흡 위상(0~1). 캐릭터마다 시작점이 달라 군집이 한 몸처럼 움직이지 않는다. */
export function studioBreathPhaseAt(timeMs: number, seed: number): number {
  const period = STUDIO_SMOOTHING_BREATH_PERIOD_MS;
  const phase = ((finiteOr(timeMs, 0) % period) + period) % period / period;
  const shifted = phase + finiteOr(seed, 0);
  return shifted - Math.floor(shifted);
}

/** 스프라이트 표시 정체성: 어떤 그림이 어떤 방식으로 표시 중인지. */
export interface StudioSpriteVisualIdentity {
  /** 동일성 비교용 키. 애니메이션 재생 중에는 프레임 이름 대신 애니메이션 키를 쓴다. */
  readonly key: string;
  readonly textureKey: string;
  readonly frame: string;
  /** Phaser 애니메이션으로 재생 중인지 (프레임 진행이 연속 운동인지). */
  readonly animated: boolean;
  /** 모션 상태 (idle/walk/talk 등). 같은 텍스처 안에서의 상태 교체 판정에 쓴다. */
  readonly state: string;
  /**
   * 수동 프레임 걷기의 방향 클립 식별자 (예: 걷기 애니메이션 키).
   * 네 방향이 한 텍스처를 공유하는 아틀라스 스킨은 텍스처 키만으로 방향 전환을
   * 구분할 수 없어서, 방향이 바뀌었는지를 이 값으로 판정한다.
   */
  readonly clipKey?: string;
}

export interface StudioSpriteFade {
  readonly textureKey: string;
  readonly frame: string;
  readonly startedAt: number;
  /** 이 페이드의 길이(ms). 상태 전이는 기본값, 걷기 프레임 근사 페이드는 짧게 잡는다. */
  readonly durationMs: number;
}

export interface StudioSpriteCrossfadeState {
  readonly identity: StudioSpriteVisualIdentity | null;
  readonly fade: StudioSpriteFade | null;
  /** 현재 정체성이 채택된 시각(ms). 걷기 프레임 체류 — 근사 페이드의 캡 계산에만 쓴다. */
  readonly lastChangeAtMs: number | null;
}

export function createStudioSpriteCrossfadeState(): StudioSpriteCrossfadeState {
  return { identity: null, fade: null, lastChangeAtMs: null };
}

/**
 * 연속 운동인지 판정: 페이드하면 안 되는 교체.
 * - 같은 텍스처에서 애니메이션이 계속 재생 중 (걷기 클립 프레임 진행)
 * - 같은 텍스처·같은 상태·같은 방향 클립의 정적 프레임 진행 (거리 기반 게이트 걷기).
 *   방향 클립이 바뀌면 공유 아틀라스에서도 방향 전환으로 보고 페이드한다.
 */
function isContinuousSpriteMotion(previous: StudioSpriteVisualIdentity, next: StudioSpriteVisualIdentity): boolean {
  if (previous.textureKey !== next.textureKey) return false;
  if (next.animated) return true;
  // 공유 아틀라스 스킨은 방향이 바뀌어도 텍스처가 같다. 방향 클립이 다르면
  // 프레임 진행이 아니라 방향 전환이므로 연속 운동으로 보지 않는다 —
  // 방향별 시트 스킨과 동일하게 크로스페이드 대상이 된다.
  if (previous.clipKey && next.clipKey && previous.clipKey !== next.clipKey) return false;
  return !previous.animated && previous.state === next.state && next.state === "walk";
}

/**
 * 수동 게이트 걷기의 프레임 진행인지 판정: 같은 텍스처·같은 방향 클립에서
 * 프레임만 바뀌는 교체. Phaser 애니메이션 재생(연속 운동)과 달리 프레임 사이가
 * 통째로 비어 있어, 체류가 길 때 짧은 근사 페이드를 걸 여지가 있는 유일한 구간이다.
 */
function isWalkFrameProgression(previous: StudioSpriteVisualIdentity, next: StudioSpriteVisualIdentity): boolean {
  if (previous.animated || next.animated) return false;
  if (previous.textureKey !== next.textureKey) return false;
  if (previous.state !== "walk" || next.state !== "walk") return false;
  if ((previous.clipKey ?? "") !== (next.clipKey ?? "")) return false;
  return previous.frame !== next.frame;
}

/**
 * 새 정체성을 받아 상태 전이를 계산한다. 페이드가 시작되면 `started`에 이전 그림이 담긴다.
 * 페이드 도중 다시 교체되면 방금까지의 본 그림을 새 페이드 원본으로 삼아 끊기지 않게 한다.
 * 걷기 프레임 진행은 직전 프레임 체류가 최소값 이상일 때만, 체류의 40%·상한 캡으로
 * 짧은 근사 페이드를 건다 (빠른 걷기에서는 겹침이 상시화되므로 걸지 않는다).
 */
export function transitionStudioSpriteCrossfade(
  state: StudioSpriteCrossfadeState,
  next: StudioSpriteVisualIdentity,
  timeMs: number,
  options: { readonly fadeMs?: number; readonly enabled?: boolean } = {},
): { readonly state: StudioSpriteCrossfadeState; readonly started: StudioSpriteFade | null } {
  const fadeMs = finiteOr(options.fadeMs ?? STUDIO_SPRITE_CROSSFADE_MS, STUDIO_SPRITE_CROSSFADE_MS);
  const now = finiteOr(timeMs, 0);
  if (options.enabled === false || fadeMs <= 0) {
    return { state: { identity: next, fade: null, lastChangeAtMs: now }, started: null };
  }
  const previous = state.identity;
  if (!previous) return { state: { identity: next, fade: null, lastChangeAtMs: now }, started: null };
  if (previous.key === next.key) return { state, started: null };
  if (isWalkFrameProgression(previous, next)) {
    const dwellMs = state.lastChangeAtMs === null ? 0 : Math.max(0, now - state.lastChangeAtMs);
    if (dwellMs >= STUDIO_SPRITE_WALK_FRAME_FADE_MIN_DWELL_MS) {
      const started: StudioSpriteFade = {
        textureKey: previous.textureKey,
        frame: previous.frame,
        startedAt: now,
        durationMs: Math.min(STUDIO_SPRITE_WALK_FRAME_FADE_MAX_MS, dwellMs * 0.4),
      };
      return { state: { identity: next, fade: started, lastChangeAtMs: now }, started };
    }
    return { state: { identity: next, fade: state.fade, lastChangeAtMs: now }, started: null };
  }
  if (isContinuousSpriteMotion(previous, next)) {
    return { state: { identity: next, fade: state.fade, lastChangeAtMs: now }, started: null };
  }
  const started: StudioSpriteFade = {
    textureKey: previous.textureKey,
    frame: previous.frame,
    startedAt: now,
    durationMs: fadeMs,
  };
  return { state: { identity: next, fade: started, lastChangeAtMs: now }, started };
}

/** 페이드 스프라이트 알파: 1에서 시작해 완만하게 0으로. 페이드가 없으면 0. */
export function studioSpriteCrossfadeAlpha(
  state: StudioSpriteCrossfadeState,
  timeMs: number,
  fadeMs: number = STUDIO_SPRITE_CROSSFADE_MS,
): number {
  const fade = state.fade;
  if (!fade) return 0;
  // 페이드마다 길이가 다를 수 있어(상태 전이 vs 걷기 프레임 근사) 기록된 길이가 우선이다.
  const durationMs = finiteOr(fade.durationMs, finiteOr(fadeMs, STUDIO_SPRITE_CROSSFADE_MS));
  if (durationMs <= 0) return 0;
  const progress = Math.min(1, Math.max(0, (finiteOr(timeMs, 0) - fade.startedAt) / durationMs));
  return Math.pow(1 - progress, 1.6);
}

/** 시간이 지나 끝난 페이드를 정리한다. 진행 중이면 상태를 그대로 돌려준다. */
export function finishStudioSpriteCrossfade(
  state: StudioSpriteCrossfadeState,
  timeMs: number,
  fadeMs: number = STUDIO_SPRITE_CROSSFADE_MS,
): StudioSpriteCrossfadeState {
  if (!state.fade) return state;
  return studioSpriteCrossfadeAlpha(state, timeMs, fadeMs) <= 0
    ? { identity: state.identity, fade: null, lastChangeAtMs: state.lastChangeAtMs }
    : state;
}

/** 동료 입장 페이드인 시간(ms). 공간에 사람이 "툭" 나타나지 않게 한다. */
export const STUDIO_PEER_ENTER_FADE_MS = 260;
/** 동료 퇴장 페이드아웃 시간(ms). 이 시간이 지나면 호출 측이 스프라이트를 파괴한다. */
export const STUDIO_PEER_EXIT_FADE_MS = 200;

function smoothstepUnit(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/**
 * 동료 프레즌스 페이드 배율(0~1). 표시 전용 — 논리 존재·충돌과 무관하다.
 * - 입장: spawnedAt부터 ENTER 구간 동안 smoothstep으로 차오른다.
 * - 퇴장: leavingAt부터 EXIT 구간 동안 내려가고, 끝나면 0 (파괴 신호).
 * - 모션 줄이기·효과 억제에서는 페이드 없이 즉시 1/0으로 갈린다.
 */
export function studioPeerPresenceFade(input: {
  readonly spawnedAt: number;
  readonly leavingAt: number | null;
  readonly now: number;
  readonly reducedMotion: boolean;
  readonly effectsSuppressed: boolean;
}): number {
  const instant = input.reducedMotion || input.effectsSuppressed || !Number.isFinite(input.now);
  if (input.leavingAt !== null) {
    if (instant) return 0;
    const progress = (input.now - input.leavingAt) / STUDIO_PEER_EXIT_FADE_MS;
    return 1 - smoothstepUnit(progress);
  }
  if (instant) return 1;
  const progress = (input.now - finiteOr(input.spawnedAt, input.now)) / STUDIO_PEER_ENTER_FADE_MS;
  return smoothstepUnit(progress);
}

/** 표시 감쇠 시간상수의 하한(초). 달리기처럼 빠를 때 위치 뒤처짐을 줄이는 바닥이다. */
export const STUDIO_DISPLAY_DAMP_TAU_MIN_SECONDS = 0.03;
/** 표시 감쇠 시간상수의 기준 속도(px/s). 이 속도까지는 기본 τ를 유지한다. */
export const STUDIO_DISPLAY_DAMP_TAU_REFERENCE_SPEED = 160;

/**
 * 속도 적응형 표시 감쇠 시간상수(초).
 * 고정 τ=50ms는 달리기(약 277px/s)에서 표시 위치가 논리 위치보다 약 14px 뒤처져
 * 몸이 미끄러져 따라오는 느낌을 만든다. 기준 속도보다 빠르면 τ를 하한까지 줄여
 * 뒤처짐을 약 8px로 묶고, 느릴 때는 기본 τ로 정지 끝의 계단감을 둥글게 유지한다.
 */
export function studioDisplayDampTauSeconds(speed: number): number {
  const safeSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0;
  if (safeSpeed <= STUDIO_DISPLAY_DAMP_TAU_REFERENCE_SPEED) return STUDIO_DISPLAY_DAMP_TAU_SECONDS;
  const ratio = STUDIO_DISPLAY_DAMP_TAU_REFERENCE_SPEED / safeSpeed;
  return Math.max(STUDIO_DISPLAY_DAMP_TAU_MIN_SECONDS, STUDIO_DISPLAY_DAMP_TAU_SECONDS * ratio);
}
