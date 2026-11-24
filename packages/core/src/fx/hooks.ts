/**
 * @toonstudio/core/fx/hooks — fx 엔진을 React에 잇는 얇은 훅 모음.
 *
 * audio/particles 본체는 프레임워크 비종속이고, 이 파일만 React 를 **peer** 로 씁니다.
 * - useClickSfx()    : document 에 위임 클릭 리스너 1개를 달아 요소 맥락별 아틀리에 SFX 재생.
 * - useAmbientBgm()  : 생성형 앰비언트 BGM opt-in 토글 + 무드 로테이션 제어 + 영속 상태 구독.
 * - useAudioState()  : 오디오 상태(mute/volume/opt-in/무드) 구독(useSyncExternalStore).
 * - useFx()          : playSfx / 파티클 버스트 / 상태를 한 번에 묶은 편의 훅.
 *
 * 모든 훅은 SSR-safe(서버 스냅샷 제공) 합니다.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  BGM_PRESETS,
  type AudioState,
  type BgmPreset,
  type SfxName,
  bgmNext,
  bgmSetMood,
  bgmToggle,
  getAudioState,
  isSfxName,
  onAudioStateChange,
  playSfx,
  resumeAudio,
  setBgmEnabled,
  setBgmVolume,
  setMasterVolume,
  setMuted,
  setSfxEnabled,
} from "./audio";
import {
  type ParticleBurstOptions,
  triggerParticleBurst,
  triggerParticleBurstAtElement,
} from "./particles";

/* ── 상태 구독(useSyncExternalStore) ──────────────────────────────────────── */

// 서버/초기 스냅샷 — onAudioStateChange 가 매번 새 객체를 주므로 안정 참조용 캐시는
// 엔진(getAudioState)에 위임한다. SSR 에서는 getServerSnapshot 으로 동일 스냅샷 사용.
const subscribe = (onStoreChange: () => void): (() => void) => onAudioStateChange(onStoreChange);

/** 오디오 상태(opt-in·mute·volume·현재 무드)를 구독한다. */
export function useAudioState(): AudioState {
  return useSyncExternalStore(subscribe, getAudioState, getAudioState);
}

/* ── useClickSfx — 전 페이지 상황맞춤 위임 클릭 SFX ────────────────────────── */

const SFX_SELECTOR = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  ".pressable",
  'input[type="submit"]',
  'input[type="button"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  "summary",
  "[data-sfx]",
].join(", ");

const DESTRUCTIVE_ACTION_RE =
  /(삭제|제거|비우기|초기화|탈퇴|폐기|지우기|\b(delete|remove|trash|purge|discard|revoke|erase|destroy)\b)/i;
const CLOSE_ACTION_RE =
  /(닫기|취소|접기|숨기기|나가기|\b(close|dismiss|cancel|collapse|hide)\b)/i;
const OPEN_ACTION_RE =
  /(열기|펼치기|확장|더보기|상세보기|메뉴|\b(open|expand|drawer|modal|popover|menu)\b)/i;
const CONFIRM_ACTION_RE =
  /(저장|완료|확인|제출|적용|등록|발행|내보내기|\b(save|submit|confirm|apply|done|complete|publish|export)\b)/i;
const HEART_ACTION_RE =
  /(좋아요|즐겨찾기|북마크|응원|하트|\b(like|heart|favorite|favourite|bookmark|cheer)\b)/i;

const isElementLike = (value: unknown): value is Element =>
  typeof (value as Element | null)?.matches === "function";

const readExplicitDataSfx = (element: Element): SfxName | null => {
  const direct = element.getAttribute("data-sfx")?.trim().toLowerCase();
  if (isSfxName(direct)) return direct;
  const inherited =
    typeof element.closest === "function"
      ? element.closest("[data-sfx]")?.getAttribute("data-sfx")?.trim().toLowerCase()
      : undefined;
  return isSfxName(inherited) ? inherited : null;
};

const collectSemanticText = (element: Element, tag: string): string => {
  const parts: string[] = [];
  const dataAction = element.getAttribute("data-action")?.trim();
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  const title = element.getAttribute("title")?.trim();
  if (dataAction) parts.push(dataAction);
  if (ariaLabel) parts.push(ariaLabel);
  if (title) parts.push(title);
  if (tag === "input") {
    const val = element.getAttribute("value")?.trim();
    if (val) parts.push(val);
  } else {
    // 긴 카드·링크 제목에 우연히 포함된 단어 오탐을 막기 위해 짧은 라벨 텍스트만 반영한다.
    const text = element.textContent?.replace(/\s+/g, " ").trim();
    if (text && text.length <= 36) parts.push(text);
  }
  return parts.join(" ");
};

/**
 * 클릭된 DOM 요소의 명시 속성(`[data-sfx]`)과 시맨틱 역할·맥락을 분석해
 * 가장 자연스러운 아틀리에 UI 효과음을 결정한다.
 *
 * 우선순위:
 * 1. `[data-sfx="<SfxName>"]` 명시 지정
 * 2. `role="tab"` / `radio` → `tab`
 * 3. `role="switch"` / `checkbox` / `<input type="checkbox">` → 상태별 `toggle-on` / `toggle-off`
 * 4. `<summary>` → 현재 열림 여부에 따라 `close` / `open`
 * 5. 삭제·제거(`soft-warn`) → 닫기·취소(`close`) → 열기·`aria-haspopup`(`open`) →
 *    저장·제출·완료(`confirm`) → 좋아요·북마크(`heart`) → `aria-pressed`(`toggle-on`/`toggle-off`)
 * 6. 기본 폴백(`fallback`, 기본 `"tick"`)
 */
export function resolveContextualClickSfx(
  element: Element | null | undefined,
  fallback: SfxName = "tick",
): SfxName {
  if (!element) return fallback;

  const explicit = readExplicitDataSfx(element);
  if (explicit) return explicit;

  const role = element.getAttribute("role")?.trim().toLowerCase() ?? "";
  const tag = element.tagName?.toLowerCase() ?? "";
  const typeAttr = element.getAttribute("type")?.trim().toLowerCase() ?? "";

  if (role === "tab" || role === "radio" || (tag === "input" && typeAttr === "radio")) {
    return "tab";
  }

  if (tag === "input" && typeAttr === "checkbox") {
    // 네이티브 checkbox는 click 이벤트 시점에 checked 값이 이미 반전되어 있다.
    return (element as HTMLInputElement).checked ? "toggle-on" : "toggle-off";
  }

  if (role === "switch" || role === "checkbox" || role === "menuitemcheckbox") {
    // 캡처 단계에서 React 상태 갱신 전 aria-checked를 읽으므로 false→켜짐, true→꺼짐으로 매핑한다.
    const ariaChecked = element.getAttribute("aria-checked")?.trim().toLowerCase();
    return ariaChecked === "true" ? "toggle-off" : "toggle-on";
  }

  if (tag === "summary") {
    return element.parentElement?.hasAttribute("open") ? "close" : "open";
  }

  const semanticText = collectSemanticText(element, tag);
  if (semanticText && DESTRUCTIVE_ACTION_RE.test(semanticText)) {
    return "soft-warn";
  }

  const ariaExpanded = element.getAttribute("aria-expanded")?.trim().toLowerCase();
  if ((semanticText && CLOSE_ACTION_RE.test(semanticText)) || ariaExpanded === "true") {
    return "close";
  }

  const ariaHasPopup = element.getAttribute("aria-haspopup")?.trim().toLowerCase();
  if (
    ariaExpanded === "false" ||
    (ariaHasPopup && ariaHasPopup !== "false") ||
    (semanticText && OPEN_ACTION_RE.test(semanticText))
  ) {
    return "open";
  }

  if (typeAttr === "submit" || (semanticText && CONFIRM_ACTION_RE.test(semanticText))) {
    return "confirm";
  }

  const ariaPressed = element.getAttribute("aria-pressed")?.trim().toLowerCase();
  if (semanticText && HEART_ACTION_RE.test(semanticText)) {
    return ariaPressed === "true" ? "toggle-off" : "heart";
  }

  if (ariaPressed === "false") return "toggle-on";
  if (ariaPressed === "true") return "toggle-off";

  return fallback;
}

/** 클릭 타겟(또는 조상)이 사운드 대상인지 + 비활성/제외 여부 판정. */
const findSfxTarget = (start: EventTarget | null): Element | null => {
  let node: Element | null = isElementLike(start) ? start : null;
  while (node) {
    if (typeof node.closest === "function" && node.closest("[data-no-sfx]")) return null;
    if (node.matches(SFX_SELECTOR)) {
      if (
        (node as HTMLButtonElement).disabled ||
        node.getAttribute("aria-disabled") === "true"
      ) {
        return null;
      }
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

/** 연타로 소리가 뭉치지 않게 하는 스로틀(ms). */
const CLICK_THROTTLE_MS = 30;

export interface UseClickSfxOptions {
  /** false 면 리스너를 달지 않음(런타임 토글용). 기본 true. */
  enabled?: boolean;
  /** 상황 매칭에 걸리지 않는 일반 요소의 기본 효과음(기본 'tick'). */
  sfx?: SfxName;
}

/**
 * document 에 캡처 단계 클릭 리스너 **1개**를 달아 인터랙티브 요소 맥락에 맞는 SFX를 재생한다.
 * `[data-sfx]`를 최우선 존중하고 `[data-no-sfx]`·disabled 요소는 제외, 30ms 스로틀.
 * 컴포넌트 트리 루트에서 1회만 호출하세요.
 */
export function useClickSfx(options: UseClickSfxOptions = {}): void {
  const { enabled = true, sfx = "tick" } = options;
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let lastPlayedAt = 0;
    const handler = (event: Event): void => {
      const target = findSfxTarget(event.target);
      if (!target) return;
      const nowMs = Date.now();
      if (nowMs - lastPlayedAt < CLICK_THROTTLE_MS) return;
      lastPlayedAt = nowMs;
      void resumeAudio(); // 첫 제스처 언락.
      playSfx(resolveContextualClickSfx(target, sfx));
    };
    document.addEventListener("click", handler, { capture: true, passive: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [enabled, sfx]);
}

/* ── useAmbientBgm — opt-in BGM 토글 + 로테이션 제어 ──────────────────────── */

export interface UseAmbientBgm {
  /** BGM opt-in 여부. */
  enabled: boolean;
  /** 현재(또는 다음 시작할) 무드명. */
  mood: string;
  /** 현재 무드 id. */
  moodId: string;
  /** 현재 트랙 아티스트(호스티드 플레이리스트에서만, 없으면 ""). */
  artist: string;
  /** 현재 트랙 크레딧/출처 링크(호스티드 플레이리스트에서만, 없으면 ""). */
  creditUrl: string;
  /** BGM 전용 볼륨(0~1). */
  volume: number;
  /** 사용 가능한 무드 프리셋(메타). */
  presets: readonly BgmPreset[];
  /** on↔off 토글(켜졌으면 true 반환). 제스처 핸들러에서 호출하세요. */
  toggle: () => boolean;
  /** 명시적으로 켜기/끄기. */
  setEnabled: (value: boolean) => void;
  /** 다음 무드로 전환. */
  next: () => void;
  /** 특정 무드 id 로 전환. */
  setMood: (moodId: string) => void;
  /** BGM 전용 볼륨 설정. */
  setVolume: (value: number) => void;
}

/**
 * 생성형 앰비언트 BGM 의 opt-in 토글·무드 로테이션·영속 상태를 React 로 노출한다.
 * 자동재생하지 않으며(autoplay 정책), toggle 은 사용자 제스처 안에서 호출되어야 한다.
 */
export function useAmbientBgm(): UseAmbientBgm {
  const audio = useAudioState();
  const toggle = useCallback(() => bgmToggle(), []);
  const setEnabled = useCallback((value: boolean) => setBgmEnabled(value), []);
  const next = useCallback(() => bgmNext(), []);
  const setMood = useCallback((moodId: string) => bgmSetMood(moodId), []);
  const setVolume = useCallback((value: number) => setBgmVolume(value), []);
  return {
    enabled: audio.bgmEnabled,
    mood: audio.currentMood,
    moodId: audio.currentMoodId,
    artist: audio.currentTrackArtist,
    creditUrl: audio.currentTrackCreditUrl,
    volume: audio.bgmVolume,
    presets: BGM_PRESETS,
    toggle,
    setEnabled,
    next,
    setMood,
    setVolume,
  };
}

/* ── useFx — 편의 묶음 훅 ─────────────────────────────────────────────────── */

export interface UseFx {
  /** 효과음 재생('tick'|'pop'|'success'|'error'). */
  sfx: (name: SfxName) => void;
  /** (x, y) 뷰포트 좌표에 파티클 버스트. */
  burst: (x: number, y: number, options?: ParticleBurstOptions) => void;
  /** 요소 중심에서 파티클 버스트. */
  burstAt: (el: Element | null | undefined, options?: ParticleBurstOptions) => void;
  /** 효과음 on/off(영속). */
  setSfxEnabled: (value: boolean) => void;
  /** 마스터 음소거 on/off(영속). */
  setMuted: (value: boolean) => void;
  /** 마스터 볼륨(0~1, 영속). */
  setVolume: (value: number) => void;
  /** 오디오 상태 스냅샷(구독). */
  audio: AudioState;
}

/**
 * 효과음·파티클·오디오 설정을 한 번에 묶은 편의 훅. 컴포넌트에서 `const fx = useFx()` 로 쓰세요.
 */
export function useFx(): UseFx {
  const audio = useAudioState();
  const sfx = useCallback((name: SfxName) => playSfx(name), []);
  const burst = useCallback(
    (x: number, y: number, options?: ParticleBurstOptions) => triggerParticleBurst(x, y, options),
    [],
  );
  const burstAt = useCallback(
    (el: Element | null | undefined, options?: ParticleBurstOptions) =>
      triggerParticleBurstAtElement(el, options),
    [],
  );
  return {
    sfx,
    burst,
    burstAt,
    setSfxEnabled,
    setMuted,
    setVolume: setMasterVolume,
    audio,
  };
}

/* ── useReveal — 스크롤-진입 모션(IntersectionObserver, once) ──────────────────── */

export interface UseRevealOptions {
  /** 진입 판정 임계(0~1). 기본 0.01(픽셀 한 줄만 보여도 발화 — 큰 섹션이 늦게 안 뜨도록). */
  threshold?: number;
  /** 루트 마진(IO rootMargin). 기본 "200px 0px 200px 0px"(뷰포트 200px 전부터 미리 발화 — 빠른 플링/앵커 점프에도 공백 방지). */
  rootMargin?: string;
  /** false 면 관찰하지 않고 즉시 보임 처리(런타임 토글용). 기본 true. */
  enabled?: boolean;
}

/**
 * 요소가 처음 뷰포트에 들어오면 한 번만 `revealed=true` 로 전환한다(IntersectionObserver, once).
 * 반환한 ref 를 대상에 달고, `revealed` 가 true 면 fx.css 의 `is-revealed` 클래스를 붙이세요:
 *   const { ref, revealed } = useReveal();
 *   <section ref={ref} className={`reveal ${revealed ? "is-revealed" : ""}`}>…
 *
 * SSR/IO 미지원/비브라우저면 즉시 revealed=true 로 폴백(콘텐츠가 항상 보임 — CLS 0).
 * fx.css 가 reduced-motion 에서 from-state 를 무효화하므로 모션만 빠지고 가시성은 유지됩니다.
 */
export function useReveal<T extends Element = HTMLElement>(
  options: UseRevealOptions = {},
): { ref: (node: T | null) => void; revealed: boolean } {
  const { threshold = 0.01, rootMargin = "200px 0px 200px 0px", enabled = true } = options;
  const [revealed, setRevealed] = useState(false);
  const nodeRef = useRef<T | null>(null);

  // 콜백 ref — 노드 부착 시점에 IO 를 건다(once). 부착 해제 시 정리.
  const ref = useCallback(
    (node: T | null) => {
      nodeRef.current = node;
      if (!node || !enabled) return;
      // IO 미지원·비브라우저면 즉시 보임 처리.
      if (typeof IntersectionObserver === "undefined") {
        setRevealed(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setRevealed(true);
            observer.disconnect(); // once
          }
        },
        { threshold, rootMargin },
      );
      observer.observe(node);
    },
    [enabled, threshold, rootMargin],
  );

  // enabled=false 면(또는 비활성→되면) 즉시 보임 처리.
  useEffect(() => {
    if (!enabled) setRevealed(true);
  }, [enabled]);

  return { ref, revealed };
}
