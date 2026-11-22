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

import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 표시 전용 좌표. 논리 좌표와 같은 단위지만 충돌·판정에는 쓰지 않는다. */
export type StudioDisplayPoint = StudioVirtualSpacePoint;

/** 표시 위치 감쇠 시간상수(초). 50ms면 걷기 160px/s에서 약 8px, NPC 90px/s에서 약 4.5px 뒤처진다. */
export const STUDIO_DISPLAY_DAMP_TAU_SECONDS = 0.05;

/** 이 거리(px)보다 멀면 텔레포트·포털·좌석 강제 이동으로 보고 즉시 스냅한다. */
export const STUDIO_DISPLAY_SNAP_DISTANCE_PX = 96;

/** 프레임 스파이크(백그라운드 탭·GC 지연 등)에서 감쇠가 한 번에 튀지 않도록 막는 최대 델타 시간(초). */
export const STUDIO_DISPLAY_MAX_DELTA_SECONDS = 0.1;

/** 정지 직전 미세 진동(0.1px 이하 서브픽셀 떨림)을 0%로 차단하는 스냅 데드존(px). */
export const STUDIO_DISPLAY_STOP_EPSILON_PX = 0.08;

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
 * - dt 스파이크(> 100ms)를 클램프하고, 정지 직전 스냅 데드존(dist <= epsilon)으로 미세 떨림을 차단한다.
 */
export function dampStudioDisplayPoint(
  current: StudioVirtualSpacePoint | null,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  options: {
    readonly tauSeconds?: number;
    readonly snapDistancePx?: number;
    readonly stopEpsilonPx?: number;
    readonly maxDeltaSeconds?: number;
    readonly enabled?: boolean;
  } = {},
): StudioVirtualSpacePoint {
  if (!current || options.enabled === false) return { x: target.x, y: target.y };
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return { x: current.x, y: current.y };
  const tau = finiteOr(options.tauSeconds ?? STUDIO_DISPLAY_DAMP_TAU_SECONDS, STUDIO_DISPLAY_DAMP_TAU_SECONDS);
  const snap = finiteOr(options.snapDistancePx ?? STUDIO_DISPLAY_SNAP_DISTANCE_PX, STUDIO_DISPLAY_SNAP_DISTANCE_PX);
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.hypot(dx, dy);
  if (dist > snap) return { x: target.x, y: target.y };
  const rawDt = Math.max(0, finiteOr(deltaSeconds, 0));
  if (rawDt <= 0 || tau <= 0) return { x: current.x, y: current.y };
  const stopEpsilon = Math.max(0, finiteOr(options.stopEpsilonPx ?? STUDIO_DISPLAY_STOP_EPSILON_PX, STUDIO_DISPLAY_STOP_EPSILON_PX));
  if (dist <= stopEpsilon) return { x: target.x, y: target.y };
  const maxDt = Math.max(0.016, finiteOr(options.maxDeltaSeconds ?? STUDIO_DISPLAY_MAX_DELTA_SECONDS, STUDIO_DISPLAY_MAX_DELTA_SECONDS));
  const dt = Math.min(maxDt, rawDt);
  const alpha = 1 - Math.exp(-dt / tau);
  const nextX = current.x + dx * alpha;
  const nextY = current.y + dy * alpha;
  if (Math.hypot(target.x - nextX, target.y - nextY) <= stopEpsilon) {
    return { x: target.x, y: target.y };
  }
  return { x: nextX, y: nextY };
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

/** 자세 전이 세틀 시간(ms). 자세 상태 머신의 전이 시간(380ms)과 맞춘다. */
export const STUDIO_POSE_SETTLE_MS = 380;
/** 일어서기 세틀 시간(ms). 앉기보다 짧고 가볍게 눌렸다 돌아온다. */
export const STUDIO_POSE_STAND_SETTLE_MS = 300;

/**
 * 자세 전이 세틀 세로 배율.
 * 앉기·눕기·기립 전환 시 몸 전체를 찌그러뜨리지 않고 등신 비율(1.0)을 안정적으로 유지한다.
 */
export function studioPoseSettleScaleY(_input: {
  readonly state: string;
  readonly previousState: string | null;
  readonly elapsedMs: number;
  readonly reducedMotion: boolean;
}): number {
  return 1;
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

/** NPC 등장 페이드인 시간(ms). 동료 입장(260ms)보다 살짝 짧게 잡아 관심 경계를 자주 넘나드는 NPC가 무겁게 느껴지지 않게 한다. */
export const STUDIO_ACTOR_VISIBILITY_FADE_IN_MS = 240;
/** NPC 퇴장 페이드아웃 시간(ms). 이 구간 동안은 계속 그리되 관심 상한 카운트에서는 이미 빠져 있다. */
export const STUDIO_ACTOR_VISIBILITY_FADE_OUT_MS = 180;
/**
 * 동시에 페이드아웃을 허용하는 배우 수 상한.
 * 카메라 점프·월드 경계 이동처럼 한꺼번에 많은 NPC가 관심에서 벗어날 때 초과분은
 * 즉시 숨겨, 그리기 상한(래칫)을 페이드가 무너뜨리지 않게 한다.
 */
export const STUDIO_ACTOR_VISIBILITY_MAX_FADE_OUTS = 8;

/**
 * 배우 가시성 페이드 상태. 관심 판정(보일 자격)이 켜지고 꺼질 때 스프라이트가
 * 툭 나타나고 사라지던 NPC 팝을 알파 전이로 바꾸는 표시 전용 상태 머신이다.
 * 논리 존재·이동·충돌과 무관하며, `fromAlpha`에서 목표(보임 1·숨김 0)로
 * smoothstep 전이한다. 전이 도중 판정이 뒤집히면 그 순간의 알파에서 이어 시작한다.
 */
export interface StudioActorVisibilityFadeState {
  /** 전이가 시작된 순간의 알파(0~1). */
  readonly fromAlpha: number;
  /** 현재 목표: true면 등장 중/표시, false면 퇴장 중/숨김. */
  readonly targetVisible: boolean;
  /** 전이 시작 시각(ms, 씬 시간). */
  readonly startedAt: number;
}

export function createStudioActorVisibilityFadeState(visible = true): StudioActorVisibilityFadeState {
  return { fromAlpha: visible ? 1 : 0, targetVisible: visible, startedAt: 0 };
}

function visibilityFadeDurationMs(state: StudioActorVisibilityFadeState): number {
  const fullMs = state.targetVisible ? STUDIO_ACTOR_VISIBILITY_FADE_IN_MS : STUDIO_ACTOR_VISIBILITY_FADE_OUT_MS;
  const distance = Math.abs((state.targetVisible ? 1 : 0) - finiteOr(state.fromAlpha, state.targetVisible ? 1 : 0));
  return fullMs * distance;
}

/** 현재 시각의 가시성 알파(0~1). 전이 길이는 남은 거리에 비례해 도중 반전이 짧게 끝난다. */
export function studioActorVisibilityFadeAlpha(state: StudioActorVisibilityFadeState, timeMs: number): number {
  const target = state.targetVisible ? 1 : 0;
  const from = Math.min(1, Math.max(0, finiteOr(state.fromAlpha, target)));
  if (from === target) return target;
  const durationMs = visibilityFadeDurationMs(state);
  if (!(durationMs > 0)) return target;
  const progress = Math.min(1, Math.max(0, (finiteOr(timeMs, state.startedAt) - state.startedAt) / durationMs));
  return from + (target - from) * smoothstepUnit(progress);
}

/**
 * 이 배우를 이번 프레임에 그려야 하는지.
 * 페이드인 첫 프레임은 알파가 아직 0이라, 목표가 보임이면 알파와 무관하게 그리기 시작한다.
 */
export function studioActorVisibilityFadeRendering(state: StudioActorVisibilityFadeState, timeMs: number): boolean {
  return state.targetVisible || studioActorVisibilityFadeAlpha(state, timeMs) > 0;
}

/**
 * 관심 판정을 상태에 반영한다.
 * - 상태가 없으면(첫 관측) 판정을 즉시 채택한다 — 씬이 열릴 때부터 페이드가 걸리지 않게.
 * - 목표가 같으면 상태를 그대로 돌려준다(매 프레임 호출해도 전이가 재시작되지 않는다).
 * - 모션 줄이기·효과 억제·즉시 처분(instant)이면 페이드 없이 갈린다(동료 프레즌스와 같은 게이트).
 */
export function transitionStudioActorVisibilityFade(
  state: StudioActorVisibilityFadeState | null,
  wantedVisible: boolean,
  timeMs: number,
  options: {
    readonly reducedMotion?: boolean;
    readonly effectsSuppressed?: boolean;
    readonly instant?: boolean;
  } = {},
): StudioActorVisibilityFadeState {
  const now = finiteOr(timeMs, 0);
  if (!state) return { fromAlpha: wantedVisible ? 1 : 0, targetVisible: wantedVisible, startedAt: now };
  if (state.targetVisible === wantedVisible) return state;
  if (options.instant || options.reducedMotion || options.effectsSuppressed) {
    return { fromAlpha: wantedVisible ? 1 : 0, targetVisible: wantedVisible, startedAt: now };
  }
  return { fromAlpha: studioActorVisibilityFadeAlpha(state, now), targetVisible: wantedVisible, startedAt: now };
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

/* ---------------------------------------------------------------------------------------------- */
/* 임계감쇠(Critically Damped) 스무딩 & 방향 뒤집힘(Flip) 히스테리시스                                 */
/* ---------------------------------------------------------------------------------------------- */

/** 임계감쇠 스칼라 상태(위치 + 속도). 오버슈트와 발산 없이 프레임 독립적으로 수렴한다. */
export interface StudioCriticallyDampedScalarState {
  readonly value: number;
  readonly velocity: number;
}

/** 임계감쇠 2D 좌표 상태. */
export interface StudioCriticallyDampedPointState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/**
 * 닫힌해(Closed-form) 임계감쇠 스칼라 스무딩.
 * Padé 근사 대신 정확한 `exp(-ω·dt)`를 사용해 8ms~120ms 가변 프레임에서도
 * 발산·진동·오버슈트가 원천 발생하지 않으며, 정지 직전 데드존으로 미세 떨림을 차단한다.
 */
export function stepCriticallyDampedScalar(
  state: StudioCriticallyDampedScalarState,
  target: number,
  deltaSeconds: number,
  options: {
    readonly smoothTimeSeconds?: number;
    readonly maxSpeed?: number;
    readonly stopEpsilon?: number;
    readonly maxDeltaSeconds?: number;
    readonly enabled?: boolean;
  } = {},
): StudioCriticallyDampedScalarState {
  const safeTarget = finiteOr(target, state.value);
  const currentValue = finiteOr(state.value, safeTarget);
  const currentVelocity = finiteOr(state.velocity, 0);
  if (options.enabled === false) return { value: safeTarget, velocity: 0 };
  const smoothTime = finiteOr(options.smoothTimeSeconds ?? STUDIO_DISPLAY_DAMP_TAU_SECONDS, STUDIO_DISPLAY_DAMP_TAU_SECONDS);
  if (smoothTime <= 0) return { value: safeTarget, velocity: 0 };
  const rawDt = Math.max(0, finiteOr(deltaSeconds, 0));
  if (rawDt <= 0) return { value: currentValue, velocity: currentVelocity };

  const stopEpsilon = Math.max(0, finiteOr(options.stopEpsilon ?? STUDIO_DISPLAY_STOP_EPSILON_PX, STUDIO_DISPLAY_STOP_EPSILON_PX));
  const initialDiff = currentValue - safeTarget;
  const omega = 2 / smoothTime;
  if (Math.abs(initialDiff) <= stopEpsilon && Math.abs(currentVelocity) <= stopEpsilon * omega * 2) {
    return { value: safeTarget, velocity: 0 };
  }

  const maxDt = Math.max(0.016, finiteOr(options.maxDeltaSeconds ?? STUDIO_DISPLAY_MAX_DELTA_SECONDS, STUDIO_DISPLAY_MAX_DELTA_SECONDS));
  const dt = Math.min(maxDt, rawDt);
  const maxSpeed = options.maxSpeed !== undefined && Number.isFinite(options.maxSpeed) && options.maxSpeed > 0
    ? options.maxSpeed
    : Number.POSITIVE_INFINITY;

  const clampedDiff = Number.isFinite(maxSpeed)
    ? Math.max(-maxSpeed * smoothTime, Math.min(maxSpeed * smoothTime, initialDiff))
    : initialDiff;
  const effectiveTarget = currentValue - clampedDiff;
  const exp = Math.exp(-omega * dt);
  const temp = (currentVelocity + omega * clampedDiff) * dt;
  let nextVelocity = (currentVelocity - omega * temp) * exp;
  let nextValue = effectiveTarget + (clampedDiff + temp) * exp;

  // 단일 스텝 변위가 속도 상한을 넘지 않도록 제한
  if (Number.isFinite(maxSpeed)) {
    const stepDelta = nextValue - currentValue;
    const maxStep = maxSpeed * dt;
    if (Math.abs(stepDelta) > maxStep) {
      const sign = Math.sign(stepDelta);
      nextValue = currentValue + sign * maxStep;
      nextVelocity = sign * maxSpeed;
    }
  }

  // 목표점을 지나치는 오버슈트 차단
  if ((safeTarget - currentValue) * (nextValue - safeTarget) > 0) {
    return { value: safeTarget, velocity: 0 };
  }
  if (Math.abs(safeTarget - nextValue) <= stopEpsilon && Math.abs(nextVelocity) <= stopEpsilon * omega * 2) {
    return { value: safeTarget, velocity: 0 };
  }
  return { value: nextValue, velocity: nextVelocity };
}

/**
 * 2D 임계감쇠 좌표 스무딩.
 * 대각선 이동 시에도 방사형 속도 상한이 등방적으로 적용되며, 텔레포트 거리 초과 시 즉시 스냅한다.
 */
export function stepCriticallyDampedPoint(
  state: StudioCriticallyDampedPointState | null,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  options: {
    readonly smoothTimeSeconds?: number;
    readonly maxSpeed?: number;
    readonly snapDistancePx?: number;
    readonly stopEpsilonPx?: number;
    readonly maxDeltaSeconds?: number;
    readonly enabled?: boolean;
  } = {},
): StudioCriticallyDampedPointState {
  const safeTargetX = finiteOr(target.x, state?.x ?? 0);
  const safeTargetY = finiteOr(target.y, state?.y ?? 0);
  if (!state || options.enabled === false) {
    return { x: safeTargetX, y: safeTargetY, vx: 0, vy: 0 };
  }
  const snap = finiteOr(options.snapDistancePx ?? STUDIO_DISPLAY_SNAP_DISTANCE_PX, STUDIO_DISPLAY_SNAP_DISTANCE_PX);
  const dx = safeTargetX - state.x;
  const dy = safeTargetY - state.y;
  const dist = Math.hypot(dx, dy);
  if (dist > snap) {
    return { x: safeTargetX, y: safeTargetY, vx: 0, vy: 0 };
  }
  const rawDt = Math.max(0, finiteOr(deltaSeconds, 0));
  if (rawDt <= 0) {
    return { x: state.x, y: state.y, vx: finiteOr(state.vx, 0), vy: finiteOr(state.vy, 0) };
  }

  const maxDt = Math.max(0.016, finiteOr(options.maxDeltaSeconds ?? STUDIO_DISPLAY_MAX_DELTA_SECONDS, STUDIO_DISPLAY_MAX_DELTA_SECONDS));
  const dt = Math.min(maxDt, rawDt);
  const stopEpsilon = Math.max(0, finiteOr(options.stopEpsilonPx ?? STUDIO_DISPLAY_STOP_EPSILON_PX, STUDIO_DISPLAY_STOP_EPSILON_PX));
  const smoothTime = finiteOr(options.smoothTimeSeconds ?? STUDIO_DISPLAY_DAMP_TAU_SECONDS, STUDIO_DISPLAY_DAMP_TAU_SECONDS);
  const omega = smoothTime > 0 ? 2 / smoothTime : 0;
  if (dist <= stopEpsilon && Math.hypot(state.vx, state.vy) <= stopEpsilon * omega * 2) {
    return { x: safeTargetX, y: safeTargetY, vx: 0, vy: 0 };
  }

  const nextX = stepCriticallyDampedScalar({ value: state.x, velocity: state.vx }, safeTargetX, dt, {
    smoothTimeSeconds: smoothTime,
    stopEpsilon: 0,
    maxDeltaSeconds: maxDt,
    enabled: options.enabled,
  });
  const nextY = stepCriticallyDampedScalar({ value: state.y, velocity: state.vy }, safeTargetY, dt, {
    smoothTimeSeconds: smoothTime,
    stopEpsilon: 0,
    maxDeltaSeconds: maxDt,
    enabled: options.enabled,
  });

  let outX = nextX.value;
  let outY = nextY.value;
  let outVx = nextX.velocity;
  let outVy = nextY.velocity;

  // 대각선 속도 초과를 막는 등방 방사형 속도 상한
  const maxSpeed = options.maxSpeed !== undefined && Number.isFinite(options.maxSpeed) && options.maxSpeed > 0
    ? options.maxSpeed
    : Number.POSITIVE_INFINITY;
  if (Number.isFinite(maxSpeed)) {
    const stepX = outX - state.x;
    const stepY = outY - state.y;
    const stepDist = Math.hypot(stepX, stepY);
    const maxStep = maxSpeed * dt;
    if (stepDist > maxStep && stepDist > 1e-9) {
      const ratio = maxStep / stepDist;
      outX = state.x + stepX * ratio;
      outY = state.y + stepY * ratio;
      outVx = (stepX * ratio) / dt;
      outVy = (stepY * ratio) / dt;
    }
  }

  if (Math.hypot(safeTargetX - outX, safeTargetY - outY) <= stopEpsilon
    && Math.hypot(outVx, outVy) <= Math.max(2, stopEpsilon * omega * 2)) {
    return { x: safeTargetX, y: safeTargetY, vx: 0, vy: 0 };
  }
  return { x: outX, y: outY, vx: outVx, vy: outVy };
}

/** 방향 전환 미세 속도 데드존(px/s). 이 속도 미만에서는 절대 facing을 뒤집지 않는다. */
export const STUDIO_FACING_DEADZONE_SPEED = 10;
/** 대각선 축 전환 히스테리시스 배수. ±15% 속도 노이즈에서도 대각선 채터링을 막도록 1.42배 우세 시 전환한다. */
export const STUDIO_FACING_AXIS_HYSTERESIS = 1.42;
/** 방향 전환 최소 유지 시간(ms). 짧은 노이즈로 인한 좌↔우 채터링을 차단한다. */
export const STUDIO_FACING_MIN_HOLD_MS = 85;
/** 의도적인 180도 급반전을 허용하는 최소 속도(px/s). */
export const STUDIO_FACING_REVERSAL_SPEED = 75;

export interface StudioFacingHysteresisState {
  readonly facing: StudioVirtualSpaceFacing;
  readonly lastChangedAtMs: number;
}

export function createStudioFacingHysteresis(
  initial: StudioVirtualSpaceFacing = "down",
  nowMs = 0,
): StudioFacingHysteresisState {
  return { facing: initial, lastChangedAtMs: finiteOr(nowMs, 0) };
}

function isOppositeFacing(a: StudioVirtualSpaceFacing, b: StudioVirtualSpaceFacing): boolean {
  return (a === "left" && b === "right")
    || (a === "right" && b === "left")
    || (a === "up" && b === "down")
    || (a === "down" && b === "up");
}

/**
 * 방향 뒤집힘(Flip) 채터링 차단 필터.
 * - 속도 데드존(`|v| < deadzoneSpeed`)에서 방향을 고정한다.
 * - 대각선 구간에서는 현재 축 성분이 1.28배 이상 밀리지 않으면 기존 방향을 유지한다.
 * - 최소 유지 시간(`minHoldMs`) 동안 미세 요동으로 인한 깜빡임을 막고, 고속 180도 급반전만 빠르게 반응한다.
 */
export function stepStudioFacingHysteresis(
  state: StudioFacingHysteresisState,
  vx: number,
  vy: number,
  nowMs: number,
  options: {
    readonly deadzoneSpeed?: number;
    readonly axisFlipThreshold?: number;
    readonly axisHysteresis?: number;
    readonly minHoldMs?: number;
    readonly reversalSpeed?: number;
    readonly reversalMinHoldMs?: number;
  } = {},
): StudioFacingHysteresisState {
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(nowMs)) return state;
  const deadzone = Math.max(0, finiteOr(options.deadzoneSpeed ?? STUDIO_FACING_DEADZONE_SPEED, STUDIO_FACING_DEADZONE_SPEED));
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const speed = Math.hypot(ax, ay);
  if (speed < deadzone) return state;

  const axisFlip = Math.max(deadzone * 0.5, finiteOr(options.axisFlipThreshold ?? deadzone * 1.15, deadzone * 1.15));
  const hysteresis = Math.max(1, finiteOr(options.axisHysteresis ?? STUDIO_FACING_AXIS_HYSTERESIS, STUDIO_FACING_AXIS_HYSTERESIS));
  const wasHorizontal = state.facing === "left" || state.facing === "right";

  let candidate: StudioVirtualSpaceFacing = state.facing;
  if (wasHorizontal) {
    if (ay > ax * hysteresis && ay >= axisFlip) {
      candidate = vy < 0 ? "up" : "down";
    } else if (ax >= axisFlip) {
      candidate = vx < 0 ? "left" : "right";
    }
  } else if (ax > ay * hysteresis && ax >= axisFlip) {
    candidate = vx < 0 ? "left" : "right";
  } else if (ay >= axisFlip) {
    candidate = vy < 0 ? "up" : "down";
  }

  if (candidate === state.facing) return state;

  const elapsedMs = Math.max(0, nowMs - state.lastChangedAtMs);
  const minHoldMs = Math.max(0, finiteOr(options.minHoldMs ?? STUDIO_FACING_MIN_HOLD_MS, STUDIO_FACING_MIN_HOLD_MS));
  const reversalSpeed = Math.max(deadzone, finiteOr(options.reversalSpeed ?? STUDIO_FACING_REVERSAL_SPEED, STUDIO_FACING_REVERSAL_SPEED));
  const reversalMinHoldMs = Math.max(0, finiteOr(options.reversalMinHoldMs ?? 24, 24));
  const opposingComponent = candidate === "left" || candidate === "right" ? ax : ay;
  const deliberateReversal = isOppositeFacing(state.facing, candidate)
    && speed >= reversalSpeed
    && opposingComponent >= reversalSpeed * 0.65;
  const requiredHoldMs = deliberateReversal ? reversalMinHoldMs : minHoldMs;
  if (elapsedMs < requiredHoldMs) return state;

  return { facing: candidate, lastChangedAtMs: nowMs };
}
