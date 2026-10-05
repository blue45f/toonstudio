import {
  STUDIO_COFFEE_BREW_MS,
  type StudioInteractableRuntime,
  type StudioInteractableStateKey,
} from "./studio-virtual-space-interactable-objects";

/**
 * 오브젝트 상태 반응 (VS 120 웨이브 2 · 단위 2)
 *
 * 상태 가구(의자·문·게시판·조명·커피 머신·미디어 보드)가 상태가 바뀐 뒤
 * "어떻게 보여야 하는가"를 데이터 주도 표로 정의하는 순수 모듈.
 * 웨이브 1까지는 반응이 interaction-fx 안에 종류별로 손으로 박혀 있었고(커피 김·고리),
 * 나머지 상태 가구(문·조명·게시판)는 아무 시각 반응이 없었다.
 *
 * - 입력은 상태 머신 런타임(kind·stateKey·stateChangedAt)과 현재 시각뿐이다.
 *   모든 값은 결정적 함수이며 타이머·난수·렌더러 의존이 없다.
 * - 채널: indicator(상태 배지 종류·문구), progress(진행 0~1), pulse(주목 맥동 0~1),
 *   swing(열림 정도 0~1), glow(조명 세기 0~1), settle(앉기 안착 배율), sweep(읽음 반사 위치).
 * - `reducedMotion`이면 전이 애니메이션은 최종값으로 즉시 수렴하고 맥동·반사는 멈춘다.
 * - 전면 오버레이·틴트는 만들지 않는다. 오브젝트 국소 표시 전용이다.
 */

/** 상태 배지 종류. none이면 배지를 그리지 않는다. */
export type StudioObjectReactionIndicator = "none" | "in-use" | "ready" | "open" | "on" | "read" | "attention";

export const STUDIO_OBJECT_REACTION_INDICATORS: readonly StudioObjectReactionIndicator[] = Object.freeze([
  "none", "in-use", "ready", "open", "on", "read", "attention",
]);

export interface StudioObjectReactionFrame {
  readonly indicator: StudioObjectReactionIndicator;
  /** 배지 문구. indicator가 none이면 null. */
  readonly label: { readonly ko: string; readonly en: string } | null;
  /** 상태 진행 0~1 — 커피 추출 등. */
  readonly progress: number;
  /** 주목 맥동 0~1 — 준비 완료·새 공지 등. */
  readonly pulse: number;
  /** 열림 정도 0(닫힘)~1(열림) — 문 회전·미디어 펼침. */
  readonly swing: number;
  /** 조명 세기 0~1 — 켜질 때 차오르고 꺼질 때 잦아든다. */
  readonly glow: number;
  /** 앉기 안착 배율 (1이 원본, 앉는 순간 0.95까지 눌렸다 돌아온다). */
  readonly settle: number;
  /** 읽음 확인 반사 위치 0~1, 반사가 없으면 -1. */
  readonly sweep: number;
}

interface StudioObjectReactionSpec {
  readonly indicator: StudioObjectReactionIndicator;
  readonly label: { readonly ko: string; readonly en: string } | null;
  /** 전이 애니메이션 길이(ms). 0이면 즉시 최종값. */
  readonly transitionMs: number;
}

const LABEL_IN_USE = Object.freeze({ ko: "● 사용 중", en: "● In use" });
const LABEL_BREWING = Object.freeze({ ko: "● 추출 중", en: "● Brewing" });
const LABEL_READY = Object.freeze({ ko: "● 준비 완료", en: "● Ready" });
const LABEL_OPEN = Object.freeze({ ko: "● 열림", en: "● Open" });
const LABEL_ON = Object.freeze({ ko: "● 켜짐", en: "● On" });
const LABEL_READ = Object.freeze({ ko: "● 읽음", en: "● Read" });
const LABEL_NEW = Object.freeze({ ko: "● 새 공지", en: "● New" });

/** 상태 키별 반응 사양 표 — 반응을 바꾸려면 이 표만 고친다. */
export const STUDIO_OBJECT_REACTION_SPECS: Readonly<Record<StudioInteractableStateKey, StudioObjectReactionSpec>> = Object.freeze({
  "chair:empty": Object.freeze({ indicator: "none", label: null, transitionMs: 200 }),
  "chair:occupied": Object.freeze({ indicator: "in-use", label: LABEL_IN_USE, transitionMs: 320 }),
  "door:closed": Object.freeze({ indicator: "none", label: null, transitionMs: 380 }),
  "door:open": Object.freeze({ indicator: "open", label: LABEL_OPEN, transitionMs: 380 }),
  "bulletin:unread": Object.freeze({ indicator: "attention", label: LABEL_NEW, transitionMs: 0 }),
  "bulletin:read": Object.freeze({ indicator: "read", label: LABEL_READ, transitionMs: 900 }),
  "light:off": Object.freeze({ indicator: "none", label: null, transitionMs: 240 }),
  "light:on": Object.freeze({ indicator: "on", label: LABEL_ON, transitionMs: 240 }),
  "coffee:idle": Object.freeze({ indicator: "none", label: null, transitionMs: 0 }),
  "coffee:brewing": Object.freeze({ indicator: "in-use", label: LABEL_BREWING, transitionMs: STUDIO_COFFEE_BREW_MS }),
  "coffee:ready": Object.freeze({ indicator: "ready", label: LABEL_READY, transitionMs: 0 }),
  "media:closed": Object.freeze({ indicator: "none", label: null, transitionMs: 300 }),
  "media:open": Object.freeze({ indicator: "open", label: LABEL_OPEN, transitionMs: 300 }),
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

const NEUTRAL: Omit<StudioObjectReactionFrame, "indicator" | "label"> = Object.freeze({
  progress: 0, pulse: 0, swing: 0, glow: 0, settle: 1, sweep: -1,
});

/**
 * 상태 런타임의 현재 반응 프레임을 계산한다.
 * 전이 채널은 stateChangedAt부터의 경과로 정해지며, 상태가 오래 유지되면 최종값에 머문다.
 */
export function objectReactionFrame(
  runtime: Pick<StudioInteractableRuntime, "kind" | "stateKey" | "stateChangedAt">,
  nowMs: number,
  reducedMotion: boolean,
): StudioObjectReactionFrame {
  const spec = STUDIO_OBJECT_REACTION_SPECS[runtime.stateKey];
  const now = Number.isFinite(nowMs) ? nowMs : runtime.stateChangedAt;
  const elapsed = Math.max(0, now - runtime.stateChangedAt);
  // 모션 줄이기에서는 전이가 끝난 상태로 본다.
  const transition = reducedMotion || spec.transitionMs <= 0 ? 1 : clamp01(elapsed / spec.transitionMs);
  const base = { indicator: spec.indicator, label: spec.label };
  switch (runtime.stateKey) {
    case "chair:occupied": {
      // 앉는 순간 살짝 눌렸다(0.95) 제자리로 돌아오는 안착 곡선.
      const settle = reducedMotion ? 1 : 1 - 0.05 * Math.sin(Math.PI * transition);
      return Object.freeze({ ...base, ...NEUTRAL, settle });
    }
    case "chair:empty":
      return Object.freeze({ ...base, ...NEUTRAL });
    case "door:open":
      return Object.freeze({ ...base, ...NEUTRAL, swing: easeOutCubic(transition) });
    case "door:closed":
      return Object.freeze({ ...base, ...NEUTRAL, swing: 1 - easeOutCubic(transition) });
    case "bulletin:unread": {
      // 새 공지 주목 맥동 — 오브젝트 위 작은 점 하나 분량이다.
      const pulse = reducedMotion ? 0.5 : 0.4 + 0.2 * Math.sin(now / 420);
      return Object.freeze({ ...base, ...NEUTRAL, pulse });
    }
    case "bulletin:read": {
      // 읽은 직후 한 번만 반사가 지나가고, 지나가면 사라진다.
      const sweep = !reducedMotion && transition < 1 ? transition : -1;
      return Object.freeze({ ...base, ...NEUTRAL, sweep });
    }
    case "light:on":
      return Object.freeze({ ...base, ...NEUTRAL, glow: easeOutCubic(transition) });
    case "light:off":
      return Object.freeze({ ...base, ...NEUTRAL, glow: 1 - easeOutCubic(transition) });
    case "coffee:brewing":
      return Object.freeze({ ...base, ...NEUTRAL, progress: clamp01(elapsed / STUDIO_COFFEE_BREW_MS) });
    case "coffee:ready": {
      // interaction-fx가 손으로 쓰던 준비 완료 맥동 곡선과 같은 값이다(배선 교체로도 무변화).
      const pulse = reducedMotion ? 0.6 : 0.45 + Math.sin(now / 260) * 0.25;
      return Object.freeze({ ...base, ...NEUTRAL, progress: 1, pulse });
    }
    case "media:open":
      return Object.freeze({ ...base, ...NEUTRAL, swing: easeOutCubic(transition) });
    case "media:closed":
      return Object.freeze({ ...base, ...NEUTRAL, swing: 1 - easeOutCubic(transition) });
    case "coffee:idle":
      return Object.freeze({ ...base, ...NEUTRAL });
  }
}
