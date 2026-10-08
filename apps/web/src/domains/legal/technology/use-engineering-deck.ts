import { useCallback, useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  clampDeckIndex,
  engineeringDeckHash,
  engineeringDeckSearch,
  isDeckTrack,
  parseEngineeringDeckState,
  resolveDeckSlideIndex,
  type DeckTrack,
  type DeckView,
  type EngineeringDeckState,
} from "./engineering-deck-state";

/**
 * 발표 모드의 외부 시스템 동기화(URL·키보드·전체 화면·다른 창·세션 저장소)를 한곳에서 관리한다.
 * 슬라이드 모델과 화면 배치는 호출하는 페이지가 소유한다.
 */

const SYNC_CHANNEL = "toonstudio-engineering-deck";
const TIMER_STORAGE_KEY = "toonstudio-engineering-deck-timer";
const POSITION_STORAGE_KEY = "toonstudio-engineering-deck-position";
const JUMP_BUFFER_TIMEOUT_MS = 1600;
const SWIPE_MIN_DISTANCE_PX = 60;

function readDeckLocation(): EngineeringDeckState {
  if (typeof window === "undefined") return parseEngineeringDeckState("", "");
  return parseEngineeringDeckState(window.location.search, window.location.hash);
}

function readSession<T>(key: string, parse: (value: unknown) => T | null): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? null : parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없어도 발표 조작은 계속된다.
  }
}

/* ── URL과 슬라이드 위치 ─────────────────────────────────── */

/** 트랙별 슬라이드 수와 id 순서. 번역 없이 계산되는 값이라 주소를 위치로 바꾸는 데 쓴다. */
export interface DeckPositionSource {
  readonly count: (track: DeckTrack) => number;
  readonly ids: (track: DeckTrack) => readonly string[];
}

export interface DeckPosition {
  readonly track: DeckTrack;
  readonly index: number;
  readonly view: DeckView;
  /** 이 탭에서 같은 트랙을 보던 마지막 위치. URL에 위치가 없을 때만 이어보기를 제안한다. */
  readonly resumeIndex: number | null;
  readonly goTo: (index: number) => void;
  readonly setTrack: (track: DeckTrack) => void;
  /** 트랙과 위치를 한 번에 바꾼다(예: 발표 슬라이드에서 도감 부록의 카드로). */
  readonly openSlide: (track: DeckTrack, index: number) => void;
  /** 다른 창에서 받은 위치를 적용한다(다시 방송하지 않음). */
  readonly applyRemote: (track: DeckTrack, index: number) => void;
  readonly dismissResume: () => void;
}

interface StoredPosition {
  readonly track: DeckTrack;
  readonly index: number;
}

function parseStoredPosition(value: unknown): StoredPosition | null {
  if (!value || typeof value !== "object" || !("track" in value) || !("index" in value)) return null;
  const { track, index } = value;
  return isDeckTrack(track) && typeof index === "number" && Number.isSafeInteger(index) ? { track, index } : null;
}

/** 주소의 `#slide-<id>` 는 트랙의 슬라이드 id 순서로 위치를 푼다(번호 해시는 그대로 번호). */
function readResolvedLocation(source: DeckPositionSource): EngineeringDeckState {
  const location = readDeckLocation();
  return location.slideId ? { ...location, index: resolveDeckSlideIndex(location, source.ids(location.track)) } : location;
}

/** 부록 트랙은 카드가 계속 늘어 번호가 흔들리므로 주소창에도 슬라이드 id 를 쓴다. 나머지는 기존 번호 형식이다. */
function urlSlideId(track: DeckTrack, index: number, source: DeckPositionSource): string | undefined {
  return track === "atlas" ? source.ids(track)[index] : undefined;
}

export function useDeckPosition(source: DeckPositionSource): DeckPosition {
  const [state, setState] = useState(() => {
    const location = readResolvedLocation(source);
    const stored = typeof window === "undefined" ? null : readSession(POSITION_STORAGE_KEY, parseStoredPosition);
    const hasHashPosition = typeof window !== "undefined" && /^#(?:slide-|deck=)/u.test(window.location.hash);
    const resumeIndex = !hasHashPosition && stored && stored.track === location.track && stored.index > 0 ? stored.index : null;
    return { track: location.track, index: location.index, view: location.view, resumeIndex };
  });

  const safeIndex = clampDeckIndex(state.index, source.count(state.track));

  // URL은 외부 시스템이다. 라우터 이력을 늘리지 않도록 replaceState로만 맞춘다.
  useEffect(() => {
    const nextSearch = engineeringDeckSearch({ track: state.track, view: state.view });
    const nextHash = engineeringDeckHash(safeIndex, urlSlideId(state.track, safeIndex, source));
    if (window.location.search !== nextSearch || window.location.hash !== nextHash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch}${nextHash}`);
    }
    if (state.view === "audience") writeSession(POSITION_STORAGE_KEY, { track: state.track, index: safeIndex });
  }, [state.track, state.view, safeIndex, source]);

  useEffect(() => {
    const restore = (): void => {
      const location = readResolvedLocation(source);
      setState((current) => ({ ...current, track: location.track, index: location.index, view: location.view }));
    };
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
    };
  }, [source]);

  const goTo = useCallback((index: number) => {
    const next = clampDeckIndex(index, source.count(state.track));
    if (next === safeIndex) return;
    setState((current) => ({ ...current, index: next, resumeIndex: null }));
  }, [safeIndex, source, state.track]);

  const setTrack = useCallback((track: DeckTrack) => {
    if (track === state.track) return;
    setState((current) => ({ ...current, track, index: 0, resumeIndex: null }));
  }, [state.track]);

  const openSlide = useCallback((track: DeckTrack, index: number) => {
    const next = clampDeckIndex(index, source.count(track));
    setState((current) => (current.track === track && current.index === next
      ? current
      : { ...current, track, index: next, resumeIndex: null }));
  }, [source]);

  const applyRemote = useCallback((track: DeckTrack, index: number) => {
    setState((current) => (current.track === track && current.index === index
      ? current
      : { ...current, track, index, resumeIndex: null }));
  }, []);

  const dismissResume = useCallback(() => setState((current) => ({ ...current, resumeIndex: null })), []);

  return {
    track: state.track,
    index: safeIndex,
    view: state.view,
    resumeIndex: state.resumeIndex,
    goTo,
    setTrack,
    openSlide,
    applyRemote,
    dismissResume,
  };
}

/* ── 발표 타이머 ─────────────────────────────────────────── */

export interface DeckTimerState {
  /** 실행 중이면 시작 시각(ms), 멈춰 있으면 null. */
  readonly startedAt: number | null;
  /** 이전 실행 구간에서 누적된 초. */
  readonly accumulatedSeconds: number;
  /**
   * 마지막으로 바뀐 시각(ms). 청중 창과 발표자 창이 서로 다른 상태를 가졌을 때 더 최근 쪽을 고르는 기준이다.
   * 이 필드가 생기기 전에 저장된 값에는 없으므로 0으로 읽는다.
   */
  readonly updatedAt: number;
}

export interface DeckTimer extends DeckTimerState {
  /** 지금 타이머 상태 그 자체(창 사이 동기화에 넘기는 값). 바뀔 때만 새 객체가 된다. */
  readonly state: DeckTimerState;
  readonly running: boolean;
  readonly start: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly reset: () => void;
  /** 다른 창에서 받은 타이머 상태를 그대로 적용한다(다시 방송하지 않는다). */
  readonly apply: (state: DeckTimerState) => void;
}

const EMPTY_TIMER: DeckTimerState = { startedAt: null, accumulatedSeconds: 0, updatedAt: 0 };

export function parseTimer(value: unknown): DeckTimerState | null {
  if (!value || typeof value !== "object" || !("startedAt" in value) || !("accumulatedSeconds" in value)) return null;
  const { startedAt, accumulatedSeconds } = value;
  if (startedAt !== null && (typeof startedAt !== "number" || !Number.isFinite(startedAt))) return null;
  if (typeof accumulatedSeconds !== "number" || !Number.isFinite(accumulatedSeconds) || accumulatedSeconds < 0) return null;
  const updatedAt = "updatedAt" in value && typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) && value.updatedAt >= 0
    ? value.updatedAt
    : 0;
  return { startedAt, accumulatedSeconds, updatedAt };
}

export function elapsedDeckSeconds(timer: Pick<DeckTimerState, "startedAt" | "accumulatedSeconds">, now: number): number {
  const running = timer.startedAt === null ? 0 : Math.max(0, Math.floor((now - timer.startedAt) / 1000));
  return timer.accumulatedSeconds + running;
}

/** 두 상태가 같은지(창 사이 되돌림 방지용 키). */
export function deckTimerKey(timer: DeckTimerState): string {
  return `${timer.startedAt ?? "-"}:${timer.accumulatedSeconds}:${timer.updatedAt}`;
}

/**
 * 다른 창에서 받은 타이머 상태를 어떻게 다룰지 정한다.
 * `apply`: 받은 쪽이 더 최근이라 적용한다. `reply`: 받은 쪽이 더 오래돼 내 상태를 알려 상대를 맞춘다. `ignore`: 같다.
 */
export function reconcileDeckTimer(local: DeckTimerState, incoming: DeckTimerState): "apply" | "reply" | "ignore" {
  if (incoming.updatedAt > local.updatedAt) return "apply";
  if (incoming.updatedAt < local.updatedAt) return "reply";
  return "ignore";
}

/** 새로고침해도 같은 탭에서는 경과 시간을 이어간다(sessionStorage). 창 사이 동기화는 `useDeckSync`가 맡는다. */
export function useDeckTimer(): DeckTimer {
  const [timer, setTimer] = useState<DeckTimerState>(() => (
    typeof window === "undefined" ? null : readSession(TIMER_STORAGE_KEY, parseTimer)
  ) ?? EMPTY_TIMER);

  useEffect(() => {
    writeSession(TIMER_STORAGE_KEY, timer.startedAt === null && timer.accumulatedSeconds === 0 ? null : timer);
  }, [timer]);

  const start = useCallback(() => {
    const now = Date.now();
    setTimer((current) => (current.startedAt === null ? { ...current, startedAt: now, updatedAt: now } : current));
  }, []);
  const pause = useCallback(() => {
    const now = Date.now();
    setTimer((current) => (current.startedAt === null
      ? current
      : { startedAt: null, accumulatedSeconds: elapsedDeckSeconds(current, now), updatedAt: now }));
  }, []);
  const toggle = useCallback(() => {
    const now = Date.now();
    setTimer((current) => (current.startedAt === null
      ? { ...current, startedAt: now, updatedAt: now }
      : { startedAt: null, accumulatedSeconds: elapsedDeckSeconds(current, now), updatedAt: now }));
  }, []);
  const reset = useCallback(() => setTimer({ startedAt: null, accumulatedSeconds: 0, updatedAt: Date.now() }), []);
  const apply = useCallback((state: DeckTimerState) => setTimer(state), []);

  return { ...timer, state: timer, running: timer.startedAt !== null, start, pause, toggle, reset, apply };
}

/* ── 다른 창(발표자 창) 동기화 ─────────────────────────────── */

type DeckSyncMessage =
  | {
    readonly v: 1;
    readonly kind: "state";
    readonly track: DeckTrack;
    readonly index: number;
    readonly from: string;
    readonly timer?: DeckTimerState;
  }
  | { readonly v: 1; readonly kind: "timer"; readonly timer: DeckTimerState; readonly from: string }
  | { readonly v: 1; readonly kind: "sync-request"; readonly from: string };

export function parseSyncMessage(value: unknown): DeckSyncMessage | null {
  if (!value || typeof value !== "object" || !("v" in value) || !("from" in value) || !("kind" in value)) return null;
  const { v, from, kind } = value;
  if (v !== 1 || typeof from !== "string") return null;
  if (kind === "sync-request") return { v: 1, kind: "sync-request", from };
  if (kind === "timer") {
    const timer = "timer" in value ? parseTimer(value.timer) : null;
    return timer ? { v: 1, kind: "timer", timer, from } : null;
  }
  if (kind !== "state" || !("track" in value) || !("index" in value)) return null;
  const { track, index } = value;
  if (!(isDeckTrack(track) && typeof index === "number" && Number.isSafeInteger(index) && index >= 0)) return null;
  const timer = "timer" in value ? parseTimer(value.timer) : null;
  return { v: 1, kind: "state", track, index, from, ...(timer ? { timer } : {}) };
}

export interface DeckSync {
  readonly available: boolean;
}

/** 청중 창과 발표자 창이 같은 타이머를 쓰도록 `useDeckSync`에 넘기는 연결. */
export interface DeckTimerBridge {
  readonly state: DeckTimerState;
  readonly apply: (state: DeckTimerState) => void;
}

/**
 * BroadcastChannel로 같은 브라우저의 청중 화면과 발표자 창을 같은 슬라이드·같은 타이머로 맞춘다.
 * 새로 열린 창은 위치를 방송하지 않고 먼저 현재 상태를 요청한다(이미 발표 중인 창이 기준).
 * 타이머는 시작 시각·누적 초·바뀐 시각을 실어 보내므로 어느 창에서 시작·일시정지·초기화해도 같은 값을 본다.
 * 두 창의 상태가 다르면 `updatedAt`이 더 최근인 쪽이 이긴다.
 */
export function useDeckSync(
  current: { readonly track: DeckTrack; readonly index: number },
  apply: (track: DeckTrack, index: number) => void,
  timerBridge?: DeckTimerBridge,
): DeckSync {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const syncedKeyRef = useRef<string | null>(null);
  const syncedTimerKeyRef = useRef<string | null>(null);
  const [senderId] = useState(() => `deck-${Math.random().toString(36).slice(2, 10)}`);
  const [available] = useState(() => typeof window !== "undefined" && typeof window.BroadcastChannel === "function");
  const timerState = timerBridge?.state;

  const post = useEffectEvent((message: DeckSyncMessage) => {
    channelRef.current?.postMessage(message);
  });

  /** 받은 타이머가 더 최근이면 적용하고, 더 오래됐으면 내 상태를 알려 상대를 맞춘다. */
  const reconcileTimer = useEffectEvent((incoming: DeckTimerState | undefined) => {
    if (!incoming || !timerBridge) return;
    const decision = reconcileDeckTimer(timerBridge.state, incoming);
    if (decision === "apply") {
      syncedTimerKeyRef.current = deckTimerKey(incoming);
      timerBridge.apply(incoming);
    } else if (decision === "reply") {
      post({ v: 1, kind: "timer", timer: timerBridge.state, from: senderId });
    }
  });

  const onMessage = useEffectEvent((data: unknown) => {
    const message = parseSyncMessage(data);
    if (!message || message.from === senderId) return;
    if (message.kind === "sync-request") {
      post({ v: 1, kind: "state", track: current.track, index: current.index, from: senderId, ...(timerBridge ? { timer: timerBridge.state } : {}) });
      return;
    }
    if (message.kind === "timer") {
      reconcileTimer(message.timer);
      return;
    }
    syncedKeyRef.current = `${message.track}:${message.index}`;
    apply(message.track, message.index);
    reconcileTimer(message.timer);
  });

  useEffect(() => {
    if (!available) return;
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => onMessage(event.data);
    channel.postMessage({ v: 1, kind: "sync-request", from: senderId } satisfies DeckSyncMessage);
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [available, senderId]);

  useEffect(() => {
    const key = `${current.track}:${current.index}`;
    if (syncedKeyRef.current === null || syncedKeyRef.current === key) {
      syncedKeyRef.current = key;
      return;
    }
    syncedKeyRef.current = key;
    post({ v: 1, kind: "state", track: current.track, index: current.index, from: senderId, ...(timerState ? { timer: timerState } : {}) });
  }, [current.track, current.index, senderId, timerState]);

  // 이 창에서 타이머를 바꾸면 다른 창에 알린다. 받은 값을 적용한 변화와 첫 렌더는 다시 보내지 않는다.
  useEffect(() => {
    if (!timerState) return;
    const key = deckTimerKey(timerState);
    if (syncedTimerKeyRef.current === null || syncedTimerKeyRef.current === key) {
      syncedTimerKeyRef.current = key;
      return;
    }
    syncedTimerKeyRef.current = key;
    post({ v: 1, kind: "timer", timer: timerState, from: senderId });
  }, [timerState, senderId]);

  return { available };
}

/** 초 단위로 다시 그려지는 현재 시각. 타이머 표시 컴포넌트 안에서만 사용해 페이지 전체 재렌더를 피한다. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

/* ── 전체 화면 ───────────────────────────────────────────── */

export function useFullscreenState(): boolean {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = (): void => setFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  return fullscreen;
}

export async function requestDocumentFullscreen(): Promise<boolean> {
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== "function") return false;
  try {
    await root.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitDocumentFullscreen(): Promise<void> {
  if (!document.fullscreenElement || typeof document.exitFullscreen !== "function") return;
  try {
    await document.exitFullscreen();
  } catch {
    // 브라우저가 거부하면 사용자가 Esc로 직접 종료할 수 있다.
  }
}

/* ── 키보드 ──────────────────────────────────────────────── */

export type DeckCommand =
  | "next"
  | "previous"
  /** 도감 부록 트랙에서 이전·다음 카드의 첫 슬라이드로 이동한다(`[` `]`). */
  | "previousCard"
  | "nextCard"
  | "first"
  | "last"
  | "present"
  | "notes"
  | "overview"
  | "blackout"
  | "timer"
  | "help"
  | "escape";

const FORM_FIELD_SELECTOR = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
const CONTROL_SELECTOR = `a, button, summary, [role="button"], [role="link"], ${FORM_FIELD_SELECTOR}`;

/**
 * 키 입력을 발표 명령으로 바꾼다.
 * - 입력 필드에서는 발표 단축키를 쓰지 않는다.
 * - 발표 중이 아니면 버튼·링크에 초점이 있을 때도 쓰지 않는다(기본 동작 유지).
 * - 발표 중에는 버튼에 초점이 있어도 화살표로 넘기되 Space/Enter는 버튼에 맡긴다.
 */
export function deckCommandForKey(event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "target">, presenting: boolean): DeckCommand | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (event.key === "Escape") return "escape";
  if (target?.closest(FORM_FIELD_SELECTOR)) return null;
  const onControl = Boolean(target?.closest(CONTROL_SELECTOR));
  if (onControl && (!presenting || event.key === " " || event.key === "Enter")) return null;

  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "previous";
    case " ":
      return event.shiftKey ? "previous" : "next";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "[":
      return "previousCard";
    case "]":
      return "nextCard";
    default:
      break;
  }
  switch (event.key.toLowerCase()) {
    case "f":
      return "present";
    case "n":
    case "s":
      return "notes";
    case "o":
      return "overview";
    case "b":
    case ".":
      return "blackout";
    case "t":
      return "timer";
    case "?":
      return "help";
    default:
      return null;
  }
}

/** 숫자를 누른 뒤 Enter로 해당 번호 슬라이드로 이동한다(Keynote·Reveal.js와 같은 방식). */
export function useSlideNumberJump(onJump: (position: number) => void): {
  readonly buffer: string;
  readonly handleKey: (event: KeyboardEvent) => boolean;
} {
  const [buffer, setBuffer] = useState("");
  const timeoutRef = useRef<number | null>(null);
  const bufferRef = useRef("");

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  const handleKey = useCallback((event: KeyboardEvent): boolean => {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(FORM_FIELD_SELECTOR)) return false;
    const update = (value: string): void => {
      bufferRef.current = value;
      setBuffer(value);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = value ? window.setTimeout(() => update(""), JUMP_BUFFER_TIMEOUT_MS) : null;
    };
    if (/^\d$/u.test(event.key) && bufferRef.current.length < 3) {
      update(bufferRef.current + event.key);
      return true;
    }
    if (event.key === "Enter" && bufferRef.current) {
      const position = Number(bufferRef.current);
      update("");
      if (position > 0) onJump(position);
      return true;
    }
    return false;
  }, [onJump]);

  return { buffer, handleKey };
}

/* ── 터치 스와이프 ───────────────────────────────────────── */

export function useSwipeNavigation(onNext: () => void, onPrevious: () => void) {
  const startRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") return;
    startRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  const onPointerUp = useCallback((event: ReactPointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onNext();
    else onPrevious();
  }, [onNext, onPrevious]);
  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);
  return { onPointerDown, onPointerUp, onPointerCancel };
}
