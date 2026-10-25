/**
 * studio-interaction-sfx.ts — 클릭·드로잉·드래그 인터랙션 효과음 매핑 (순수 모듈, fetch 없음).
 *
 * 전역 UI 효과음 엔진(packages/core/src/fx/audio.ts의 playSfx + SfxName 10종)과
 * 스팅어 프리셋(domains/creator/studio-motion-fx.ts)은 이미 있다. 이 모듈은
 * 새 엔진을 만들지 않고, 캔버스·호스트 호출 지점에서 쓸 이벤트→기존 효과음
 * 매핑과 스로틀 정책만 담당한다. 실제 재생은 호출부가 playSfx로 수행한다.
 * 일반 DOM 클릭은 useClickSfx 전역 위임이 맡으므로, 이 매퍼는 캔버스·호스트
 * 전용 이벤트에만 쓰고 중복 재생을 피한다. 스트로크 이동 중에는 소리를
 * 내지 않는다(소음 방지). reduced-motion이면 전부 무음이다.
 */

export type StudioInteractionSfxEvent =
  | "click"
  | "tool-select"
  | "stroke-start"
  | "stroke-end"
  | "drag-start"
  | "drop"
  | "drop-invalid";

export type StudioInteractionSfxName =
  | "tick"
  | "pop"
  | "success"
  | "error"
  | "sparkle"
  | "woosh"
  | "open"
  | "close"
  | "tab"
  | "heart";

export type StudioInteractionSfxCategory = "click" | "draw" | "drag";

export interface StudioInteractionSfxSettings {
  readonly sfxEnabled: boolean;
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  readonly click: boolean;
  readonly draw: boolean;
  readonly drag: boolean;
}

const EVENT_TO_SFX: Readonly<Record<StudioInteractionSfxEvent, StudioInteractionSfxName>> =
  Object.freeze({
    click: "tick",
    "tool-select": "tab",
    "stroke-start": "tick",
    "stroke-end": "pop",
    "drag-start": "woosh",
    drop: "pop",
    "drop-invalid": "error",
  });

const EVENT_TO_CATEGORY: Readonly<Record<StudioInteractionSfxEvent, StudioInteractionSfxCategory>> =
  Object.freeze({
    click: "click",
    "tool-select": "click",
    "stroke-start": "draw",
    "stroke-end": "draw",
    "drag-start": "drag",
    drop: "drag",
    "drop-invalid": "drag",
  });

/** 이벤트별 최소 간격(ms). click 30ms는 useClickSfx와 동일하다. */
const EVENT_THROTTLE_MS: Readonly<Record<StudioInteractionSfxEvent, number>> =
  Object.freeze({
    click: 30,
    "tool-select": 80,
    "stroke-start": 150,
    "stroke-end": 150,
    "drag-start": 150,
    drop: 120,
    "drop-invalid": 120,
  });

/** 이벤트에 대한 효과음을 결정한다. 재생하면 안 되는 조건이면 null이다. */
export function resolveInteractionSfx(
  event: StudioInteractionSfxEvent,
  settings: StudioInteractionSfxSettings,
): StudioInteractionSfxName | null {
  if (!settings.sfxEnabled || settings.muted || settings.reducedMotion) return null;
  const category = EVENT_TO_CATEGORY[event];
  if (category === "click" && !settings.click) return null;
  if (category === "draw" && !settings.draw) return null;
  if (category === "drag" && !settings.drag) return null;
  return EVENT_TO_SFX[event];
}

/** 마지막 재생 시각 기준으로 지금 재생해도 되는지 판단한다. */
export function shouldPlayInteractionSfx(
  event: StudioInteractionSfxEvent,
  lastPlayedAtMs: number | null,
  nowMs: number,
): boolean {
  if (lastPlayedAtMs === null) return true;
  if (!Number.isFinite(nowMs) || !Number.isFinite(lastPlayedAtMs)) return false;
  return nowMs - lastPlayedAtMs >= EVENT_THROTTLE_MS[event];
}
