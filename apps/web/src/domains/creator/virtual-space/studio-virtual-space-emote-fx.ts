/**
 * 이모트가 시작될 때 머리 위에 터뜨리는 시간차 파티클 계획(순수 데이터).
 *
 * - 말풍선 아이콘과 몸동작은 emote-runtime이 맡고, 이 모듈은 "언제·어디에·몇 개·무슨 색"만 정한다.
 * - 좌표는 말풍선이 놓인 머리 위 기준점에서의 오프셋(px, 위쪽이 음수, 오버레이 배율 1 기준)이다.
 * - 색은 CSS 토큰이 아니라 폭죽 파티클의 고정 팔레트다(테마가 바뀌어도 폭죽은 알록달록해야 한다).
 * - 모션 줄이기에서는 쓰지 않는다(호출 측이 계획을 비운다).
 */
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";

export interface StudioEmoteBurst {
  /** 이모트가 시작된 뒤 이 시간(ms)이 지나면 터진다. */
  readonly delayMs: number;
  readonly dx: number;
  readonly dy: number;
  readonly count: number;
  readonly color: number;
}

const FIREWORK_YELLOW = 0xffd166;
const FIREWORK_PINK = 0xff9fb8;
const FIREWORK_BLUE = 0x4cc3ff;
const FIREWORK_GREEN = 0x5ad18a;
const FIREWORK_VIOLET = 0xa78bfa;
const FIREWORK_RED = 0xef476f;

/** 폭죽: 높이와 좌우를 달리한 일곱 발이 0.25초 간격으로 차례로 터진다. */
const FIREWORKS: readonly StudioEmoteBurst[] = Object.freeze([
  Object.freeze({ delayMs: 0, dx: 0, dy: -64, count: 14, color: FIREWORK_YELLOW }),
  Object.freeze({ delayMs: 250, dx: -30, dy: -48, count: 12, color: FIREWORK_PINK }),
  Object.freeze({ delayMs: 500, dx: 30, dy: -52, count: 12, color: FIREWORK_BLUE }),
  Object.freeze({ delayMs: 750, dx: -12, dy: -78, count: 12, color: FIREWORK_GREEN }),
  Object.freeze({ delayMs: 1_000, dx: 18, dy: -70, count: 12, color: FIREWORK_VIOLET }),
  Object.freeze({ delayMs: 1_250, dx: -36, dy: -66, count: 10, color: FIREWORK_RED }),
  Object.freeze({ delayMs: 1_500, dx: 2, dy: -58, count: 16, color: FIREWORK_YELLOW }),
]);

const NO_BURSTS: readonly StudioEmoteBurst[] = Object.freeze([]);

const KPOP_AURA_BURSTS: readonly StudioEmoteBurst[] = Object.freeze([
  Object.freeze({ delayMs: 0, dx: -24, dy: -56, count: 10, color: FIREWORK_PINK }),
  Object.freeze({ delayMs: 320, dx: 24, dy: -62, count: 12, color: FIREWORK_VIOLET }),
  Object.freeze({ delayMs: 640, dx: 0, dy: -74, count: 14, color: FIREWORK_BLUE }),
  Object.freeze({ delayMs: 960, dx: -18, dy: -60, count: 10, color: FIREWORK_YELLOW }),
]);

const WELLNESS_AURA_BURSTS: readonly StudioEmoteBurst[] = Object.freeze([
  Object.freeze({ delayMs: 0, dx: 0, dy: -48, count: 8, color: FIREWORK_GREEN }),
  Object.freeze({ delayMs: 450, dx: -20, dy: -58, count: 8, color: FIREWORK_BLUE }),
  Object.freeze({ delayMs: 900, dx: 20, dy: -58, count: 8, color: FIREWORK_GREEN }),
]);

const CELEBRATION_AURA_BURSTS: readonly StudioEmoteBurst[] = Object.freeze([
  Object.freeze({ delayMs: 0, dx: -16, dy: -54, count: 10, color: FIREWORK_YELLOW }),
  Object.freeze({ delayMs: 300, dx: 16, dy: -60, count: 10, color: FIREWORK_RED }),
  Object.freeze({ delayMs: 600, dx: 0, dy: -68, count: 12, color: FIREWORK_PINK }),
]);

export const STUDIO_STAGE_AURA_EMOTE_IDS: readonly StudioSpaceEmoteId[] = Object.freeze([
  "fireworks",
  "kpop-dance",
  "shuffle",
  "moonwalk",
  "yoga",
  "tai-chi",
  "calisthenics",
  "cheers",
  "party",
]);

/** 이모트가 시작될 때 터뜨릴 파티클 계획. 연출이 없는 이모트는 빈 배열이다. 지연이 빠른 순서로 정렬돼 있다. */
export function studioEmoteBurstPlan(id: StudioSpaceEmoteId): readonly StudioEmoteBurst[] {
  return id === "fireworks" ? FIREWORKS : NO_BURSTS;
}

/**
 * 댄스·웰니스·축하 모션용 확장 스테이지 오라 파티클 플랜.
 * 기본 폭죽 연출(`studioEmoteBurstPlan`) 계약을 보존하면서, 스테이지·스포트라이트·오피스 이벤트 연출에서 사용한다.
 */
export function studioEmoteStageAuraPlan(id: StudioSpaceEmoteId): readonly StudioEmoteBurst[] {
  if (id === "fireworks") return FIREWORKS;
  if (id === "kpop-dance" || id === "shuffle" || id === "moonwalk") return KPOP_AURA_BURSTS;
  if (id === "yoga" || id === "tai-chi" || id === "calisthenics") return WELLNESS_AURA_BURSTS;
  if (id === "cheers" || id === "party") return CELEBRATION_AURA_BURSTS;
  return NO_BURSTS;
}

/**
 * 아직 터뜨리지 않은 항목 가운데 지금(시작 뒤 elapsedMs) 터질 때가 된 것의 개수.
 * next는 이미 처리한 개수이므로 plan.slice(next, next + 반환값)이 이번에 터질 항목이다.
 */
export function studioEmoteBurstsDue(plan: readonly StudioEmoteBurst[], next: number, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isInteger(next) || next < 0) return 0;
  let due = 0;
  while (next + due < plan.length && (plan[next + due]?.delayMs ?? Infinity) <= elapsedMs) due += 1;
  return due;
}
