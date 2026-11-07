import {
  attachPointerCapture,
  DEFAULT_PALM_CONTACT_WIDTH_PX,
  DEFAULT_PALM_REJECT_MS,
  splitPredicted,
  STALE_TAKEOVER_MS,
} from "./pointer-capture";

import type { PointerCaptureOptions } from "./pointer-capture";
import type { PointerKind, RawSample } from "../engine/core/types";

/**
 * 결정적 시드 기반 포인터 이벤트 스트림 생성기 및 리플레이 하네스.
 *
 * 주의(용어 규약): 이 모듈은 브라우저 DOM 어댑터(`attachPointerCapture`)와 입력 단계의 상태 전이·수명주기를
 * 검증하기 위한 **합성 포인터 이벤트 스트림 리플레이 — 실기기 펜 하드웨어 검증 아님** 도구다.
 */

/** 시드 리플레이 스위트 상한(무한 soak 루프 방지). */
export const MAX_REPLAY_SEEDS = 64;
/** 시드당 최대 합성 이벤트 수 상한. */
export const MAX_EVENTS_PER_SEED = 96;
/** 시드 리플레이 전체 실행 벽시계 상한(ms). */
export const MAX_WALL_MS = 2000;
/** 시드 리플레이 힙 증가량 상한(바이트, 64 MB). */
export const MAX_HEAP_DELTA_BYTES = 64 * 1024 * 1024;

/** 결정적 32비트 PRNG (mulberry32). [0, 1) 부동소수점을 반환한다. */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 결정적 32비트 PRNG (xorshift32). [0, 1) 부동소수점을 반환한다. */
export function xorshift32(seed: number): () => number {
  let x = seed | 0;
  if (x === 0) x = 0x12345678;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** 시드 기반 난수 도우미. */
export class SeededPointerRng {
  private readonly next01: () => number;

  constructor(seed: number) {
    this.next01 = mulberry32(seed);
  }

  float(min = 0, max = 1): number {
    return min + (max - min) * this.next01();
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next01() * (maxInclusive - min + 1));
  }

  bool(probability = 0.5): boolean {
    return this.next01() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const idx = Math.floor(this.next01() * items.length);
    const chosen = items[idx] ?? items[0];
    if (chosen === undefined) throw new Error("empty items");
    return chosen;
  }
}

export type SyntheticCaptureFailureMode = "throw" | "not-acquired" | false;

export interface SyntheticPointerEventSpec {
  target: "el" | "window";
  type: "pointerdown" | "pointermove" | "pointerrawupdate" | "pointerup" | "pointercancel" | "lostpointercapture";
  pointerId: number;
  pointerType: PointerKind;
  isPrimary: boolean;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  width?: number;
  height?: number;
  timeStamp: number;
  coalesced?: Omit<SyntheticPointerEventSpec, "target" | "coalesced" | "predicted" | "captureFailure">[];
  predicted?: Omit<SyntheticPointerEventSpec, "target" | "coalesced" | "predicted" | "captureFailure">[];
  /** 이 이벤트에서 setPointerCapture 실패를 유도할지 여부. */
  captureFailure?: SyntheticCaptureFailureMode;
  /** 디버깅·재현 로그용 설명 태그. */
  tag?: string;
}

/** jsdom `PointerEvent`에 coalesced/predicted/timeStamp/width 등을 합성 부착한다. */
export function createSyntheticPointerEvent(
  spec: Omit<SyntheticPointerEventSpec, "target" | "captureFailure">,
): PointerEvent {
  const ev = new PointerEvent(spec.type, {
    bubbles: spec.type !== "lostpointercapture",
    cancelable: true,
    isPrimary: spec.isPrimary,
    pointerId: spec.pointerId,
    pointerType: spec.pointerType,
    button: spec.button,
    buttons: spec.buttons,
    clientX: spec.clientX,
    clientY: spec.clientY,
    pressure: spec.pressure,
    tiltX: spec.tiltX,
    tiltY: spec.tiltY,
    twist: spec.twist,
    width: spec.width ?? 1,
    height: spec.height ?? 1,
  });
  Object.defineProperty(ev, "timeStamp", { value: spec.timeStamp, configurable: true });
  if (typeof spec.width === "number") Object.defineProperty(ev, "width", { value: spec.width, configurable: true });
  if (typeof spec.height === "number") Object.defineProperty(ev, "height", { value: spec.height, configurable: true });
  if (spec.coalesced) {
    const coalescedEvents = spec.coalesced.map((c) => createSyntheticPointerEvent(c));
    Object.defineProperty(ev, "getCoalescedEvents", { value: () => coalescedEvents, configurable: true });
  }
  if (spec.predicted) {
    const predictedEvents = spec.predicted.map((p) => createSyntheticPointerEvent(p));
    Object.defineProperty(ev, "getPredictedEvents", { value: () => predictedEvents, configurable: true });
  }
  return ev;
}

export interface InstrumentedPointerSurface {
  readonly el: HTMLElement;
  /** 다음 setPointerCapture 호출에 적용할 실패 모드. */
  setNextCaptureFailure(mode: SyntheticCaptureFailureMode): void;
  /** 현재 요소에 등록된 활성 리스너 총수. */
  activeElementListenerCount(): number;
  /** 현재 window에 이 하네스 동안 등록된 활성 리스너 총수. */
  activeWindowListenerCount(): number;
  /** 현재 요소가 보유 중인 포인터 캡처 ID 집합. */
  activeCapturedPointers(): ReadonlySet<number>;
  /** window 계측 후크를 원상 복구하고 요소를 정리한다. */
  dispose(): void;
}

/**
 * 요소(`el`)와 `window`의 이벤트 리스너 등록/해제 및 포인터 캡처 상태를 계측하는 래퍼를 만든다.
 * `detach()` 이후 리스너 누수 0건·포인터 캡처 누수 0건을 단언하는 데 쓴다.
 */
export function createInstrumentedPointerSurface(opts: {
  enableRawUpdate?: boolean;
  initialTouchAction?: string;
} = {}): InstrumentedPointerSurface {
  const el = document.createElement("div");
  if (opts.initialTouchAction !== undefined) el.style.touchAction = opts.initialTouchAction;
  if (opts.enableRawUpdate) {
    Object.defineProperty(el, "onpointerrawupdate", { value: null, configurable: true, writable: true });
  }
  document.body.appendChild(el);

  const elListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const winListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const capturedIds = new Set<number>();
  let nextCaptureFailure: SyntheticCaptureFailureMode = false;

  const origElAdd = el.addEventListener.bind(el);
  const origElRemove = el.removeEventListener.bind(el);
  const origWinAdd = window.addEventListener.bind(window);
  const origWinRemove = window.removeEventListener.bind(window);

  const trackAdd = (map: Map<string, Set<EventListenerOrEventListenerObject>>, type: string, fn: EventListenerOrEventListenerObject): void => {
    let set = map.get(type);
    if (!set) {
      set = new Set();
      map.set(type, set);
    }
    set.add(fn);
  };
  const trackRemove = (map: Map<string, Set<EventListenerOrEventListenerObject>>, type: string, fn: EventListenerOrEventListenerObject): void => {
    const set = map.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) map.delete(type);
  };

  el.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    if (listener) {
      trackAdd(elListeners, type, listener);
      origElAdd(type, listener, options);
    }
  }) as typeof el.addEventListener;

  el.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
    if (listener) {
      trackRemove(elListeners, type, listener);
      origElRemove(type, listener, options);
    }
  }) as typeof el.removeEventListener;

  window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    if (listener) {
      trackAdd(winListeners, type, listener);
      origWinAdd(type, listener, options);
    }
  }) as typeof window.addEventListener;

  window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
    if (listener) {
      trackRemove(winListeners, type, listener);
      origWinRemove(type, listener, options);
    }
  }) as typeof window.removeEventListener;

  Object.defineProperty(el, "setPointerCapture", {
    configurable: true,
    value: (pointerId: number) => {
      const mode = nextCaptureFailure;
      nextCaptureFailure = false;
      if (mode === "throw") throw new Error(`Synthetic NotFoundError for pointerId=${pointerId}`);
      if (mode === "not-acquired") return;
      capturedIds.add(pointerId);
    },
  });
  Object.defineProperty(el, "hasPointerCapture", {
    configurable: true,
    value: (pointerId: number) => capturedIds.has(pointerId),
  });
  Object.defineProperty(el, "releasePointerCapture", {
    configurable: true,
    value: (pointerId: number) => {
      if (!capturedIds.has(pointerId)) throw new Error(`InvalidPointerId ${pointerId}`);
      capturedIds.delete(pointerId);
    },
  });

  const countListeners = (map: Map<string, Set<EventListenerOrEventListenerObject>>): number => {
    let total = 0;
    for (const set of map.values()) total += set.size;
    return total;
  };

  return {
    el,
    setNextCaptureFailure: (mode) => {
      nextCaptureFailure = mode;
    },
    activeElementListenerCount: () => countListeners(elListeners),
    activeWindowListenerCount: () => countListeners(winListeners),
    activeCapturedPointers: () => new Set(capturedIds),
    dispose: () => {
      window.addEventListener = origWinAdd;
      window.removeEventListener = origWinRemove;
      el.remove();
    },
  };
}

export interface SeededReplayOptions {
  /** 시드당 최대 이벤트 수(기본 48, 상한 `MAX_EVENTS_PER_SEED`). */
  maxEvents?: number;
  /** `useRawUpdate` 활성 여부(생략 시 시드에서 결정적으로 선택). */
  useRawUpdate?: boolean;
  /** `primaryButtonOnly` 활성 여부(생략 시 true). */
  primaryButtonOnly?: boolean;
  /** `blockContextMenu` 활성 여부(생략 시 시드에서 결정적으로 선택). */
  blockContextMenu?: boolean;
  /** detach 직전에 열린 획이 있으면 정상 pointerup으로 닫을지 여부(기본 false: 중도 detach도 시험). */
  closeOpenStrokeBeforeDetach?: boolean;
}

function makeSpec(
  partial: Partial<SyntheticPointerEventSpec> & Pick<SyntheticPointerEventSpec, "type" | "pointerId" | "clientX" | "clientY" | "timeStamp">,
): SyntheticPointerEventSpec {
  return {
    target: "el",
    pointerType: "pen",
    isPrimary: true,
    button: 0,
    buttons: 0,
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    ...partial,
  };
}

/**
 * 시드로부터 결정적인 합성 포인터 이벤트 스트림을 생성한다(합성 포인터 이벤트 스트림 리플레이 — 실기기 펜 하드웨어 검증 아님).
 */
export function generateSeededPointerStream(
  seed: number,
  opts: SeededReplayOptions = {},
): {
  events: SyntheticPointerEventSpec[];
  useRawUpdate: boolean;
  primaryButtonOnly: boolean;
  blockContextMenu: boolean;
} {
  const rng = new SeededPointerRng(seed);
  const limit = Math.min(Math.max(8, opts.maxEvents ?? 48), MAX_EVENTS_PER_SEED);
  const useRawUpdate = opts.useRawUpdate ?? rng.bool(0.35);
  const primaryButtonOnly = opts.primaryButtonOnly ?? true;
  const blockContextMenu = opts.blockContextMenu ?? rng.bool(0.5);

  const events: SyntheticPointerEventSpec[] = [];
  let tMs = 1000;
  let activePointerId: number | null = null;
  let activeKind: PointerKind = "pen";
  let nextPointerId = 1;
  let x = 30;
  let y = 40;

  const push = (spec: SyntheticPointerEventSpec): boolean => {
    if (events.length >= limit) return false;
    events.push(spec);
    return true;
  };

  while (events.length < limit) {
    if (activePointerId === null) {
      const roll = rng.float();
      if (roll < 0.12) {
        tMs += rng.int(1, 16);
        push(makeSpec({ type: "pointermove", pointerId: nextPointerId, button: -1, clientX: rng.int(10, 200), clientY: rng.int(10, 200), timeStamp: tMs, tag: "hover-move" }));
        continue;
      }
      if (roll < 0.24) {
        const orphanType = rng.pick(["pointerup", "pointercancel", "lostpointercapture"] as const);
        const target = orphanType === "pointerup" && rng.bool(0.4) ? "window" : "el";
        tMs += rng.int(0, 12);
        push(makeSpec({ target, type: orphanType, pointerId: rng.int(1, nextPointerId + 2), clientX: x, clientY: y, timeStamp: tMs, tag: "orphan-terminal" }));
        continue;
      }
      if (roll < 0.38) {
        tMs += rng.int(1, 20);
        const rejectKind = rng.pick(["non-primary", "palm-width", "secondary-button", "capture-throw", "capture-unacquired"] as const);
        const pid = nextPointerId++;
        push(makeSpec({
          type: "pointerdown", pointerId: pid,
          pointerType: rejectKind === "palm-width" ? "touch" : rejectKind === "secondary-button" ? "mouse" : "pen",
          isPrimary: rejectKind !== "non-primary",
          button: rejectKind === "secondary-button" ? 2 : 0, buttons: rejectKind === "secondary-button" ? 2 : 1,
          clientX: rng.int(10, 180), clientY: rng.int(10, 180), pressure: 0.5,
          width: rejectKind === "palm-width" ? DEFAULT_PALM_CONTACT_WIDTH_PX + 8 : 2, timeStamp: tMs,
          captureFailure: rejectKind === "capture-throw" ? "throw" : rejectKind === "capture-unacquired" ? "not-acquired" : false,
          tag: `rejected-down:${rejectKind}`,
        }));
        continue;
      }

      activeKind = rng.pick(["pen", "pen", "mouse"] as const);
      tMs += rng.int(4, 25);
      activePointerId = nextPointerId++;
      x = rng.int(20, 160);
      y = rng.int(20, 160);
      push(makeSpec({
        type: "pointerdown", pointerId: activePointerId, pointerType: activeKind, buttons: 1,
        clientX: x, clientY: y, pressure: rng.float(0.25, 0.85),
        tiltX: rng.int(-20, 20), tiltY: rng.int(-20, 20), timeStamp: tMs, tag: "valid-down",
      }));
      continue;
    }

    const action = rng.float();
    if (action < 0.42) {
      const timeMode = rng.float();
      let eventTMs: number;
      if (timeMode < 0.15) eventTMs = tMs;
      else if (timeMode < 0.28) eventTMs = Math.max(1, tMs - rng.int(5, 120));
      else {
        tMs += rng.int(4, 16);
        eventTMs = tMs;
      }
      x = Math.max(4, Math.min(240, x + rng.int(-15, 18)));
      y = Math.max(4, Math.min(240, y + rng.int(-15, 18)));
      const pressure = rng.float(0.2, 0.95);

      if (useRawUpdate && rng.bool(0.65)) {
        push(makeSpec({
          type: "pointerrawupdate", pointerId: activePointerId, pointerType: activeKind, button: -1, buttons: 1,
          clientX: x, clientY: y, pressure, tiltX: rng.int(-15, 15), tiltY: rng.int(-15, 15),
          timeStamp: eventTMs, tag: "rawupdate-move",
        }));
      } else {
        const coalescedCount = rng.int(1, 3);
        const coalesced: NonNullable<SyntheticPointerEventSpec["coalesced"]> = [];
        for (let c = 0; c < coalescedCount; c += 1) {
          const frac = (c + 1) / coalescedCount;
          const subT = c === coalescedCount - 1 ? eventTMs : Math.max(1, eventTMs - (coalescedCount - 1 - c) * 2);
          coalesced.push(makeSpec({
            type: "pointermove", pointerId: activePointerId, pointerType: activeKind, button: -1, buttons: 1,
            clientX: Math.round(x - (1 - frac) * 4), clientY: Math.round(y - (1 - frac) * 4),
            pressure, timeStamp: subT, tag: "coalesced-item",
          }));
        }
        const predictedCount = rng.int(0, 2);
        const predicted: NonNullable<SyntheticPointerEventSpec["predicted"]> = [];
        for (let p = 0; p < predictedCount; p += 1) {
          predicted.push(makeSpec({
            type: "pointermove", pointerId: activePointerId, pointerType: activeKind, button: -1, buttons: 1,
            clientX: x + (p + 1) * 3, clientY: y + (p + 1) * 3,
            pressure, timeStamp: eventTMs + (p + 1) * 4, tag: "predicted-item",
          }));
        }
        push(makeSpec({
          type: "pointermove", pointerId: activePointerId, pointerType: activeKind, button: -1, buttons: 1,
          clientX: x, clientY: y, pressure, timeStamp: eventTMs,
          coalesced, predicted, tag: "move-with-coalesced-predicted",
        }));
      }
      continue;
    }

    if (action < 0.56) {
      const intrudeId = nextPointerId + 50;
      const subRoll = rng.float();
      tMs += rng.int(0, 30);
      if (subRoll < 0.45) {
        push(makeSpec({
          type: "pointerdown", pointerId: intrudeId,
          pointerType: rng.pick(["touch", "mouse", "pen"] as const), isPrimary: rng.bool(0.5),
          button: rng.pick([0, 1, 2] as const), buttons: 1,
          clientX: x + 20, clientY: y + 20, pressure: 0.5, timeStamp: tMs, tag: "concurrent-down-within-stale-window",
        }));
      } else {
        const intrudeType = rng.pick(["pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const);
        push(makeSpec({
          target: intrudeType === "pointerup" && rng.bool(0.5) ? "window" : "el",
          type: intrudeType, pointerId: intrudeId, pointerType: "touch", isPrimary: false,
          clientX: x + 30, clientY: y + 30, pressure: 0.3, timeStamp: tMs, tag: "non-owner-interference",
        }));
      }
      continue;
    }

    if (action < 0.68) {
      tMs += rng.int(1, 10);
      push(makeSpec({
        type: "lostpointercapture", pointerId: activePointerId, pointerType: activeKind,
        button: -1, buttons: 1, clientX: x, clientY: y, timeStamp: tMs, tag: "owner-lostpointercapture-mid-stroke",
      }));
      continue;
    }

    if (action < 0.82) {
      const staleTMs = tMs + STALE_TAKEOVER_MS + rng.int(50, 600);
      const isRejectedTakeover = rng.bool(0.55);
      if (isRejectedTakeover) {
        const rejectReason = rng.pick([
          "non-primary", "secondary-mouse", "palm-width", "palm-after-pen", "capture-throw", "capture-unacquired",
        ] as const);
        if (rejectReason === "palm-after-pen") {
          push(makeSpec({
            type: "pointermove", pointerId: activePointerId + 99, isPrimary: false, button: -1,
            clientX: x, clientY: y, timeStamp: staleTMs - Math.floor(DEFAULT_PALM_REJECT_MS / 2),
            tag: "pen-note-before-stale-palm",
          }));
        }
        push(makeSpec({
          type: "pointerdown", pointerId: nextPointerId++,
          pointerType: rejectReason === "secondary-mouse" ? "mouse" : rejectReason === "palm-width" || rejectReason === "palm-after-pen" ? "touch" : "pen",
          isPrimary: rejectReason !== "non-primary",
          button: rejectReason === "secondary-mouse" ? 2 : 0, buttons: rejectReason === "secondary-mouse" ? 2 : 1,
          clientX: x + 15, clientY: y + 15, pressure: 0.6,
          width: rejectReason === "palm-width" ? DEFAULT_PALM_CONTACT_WIDTH_PX + 10 : 2, timeStamp: staleTMs,
          captureFailure: rejectReason === "capture-throw" ? "throw" : rejectReason === "capture-unacquired" ? "not-acquired" : false,
          tag: `stale-rejected:${rejectReason}`,
        }));
      } else {
        tMs = staleTMs;
        activePointerId = nextPointerId++;
        activeKind = rng.pick(["pen", "mouse"] as const);
        x = rng.int(25, 190);
        y = rng.int(25, 190);
        push(makeSpec({
          type: "pointerdown", pointerId: activePointerId, pointerType: activeKind, buttons: 1,
          clientX: x, clientY: y, pressure: rng.float(0.3, 0.8), timeStamp: tMs, tag: "stale-valid-takeover",
        }));
      }
      continue;
    }

    const endMode = rng.pick(["el-up", "window-up", "el-cancel"] as const);
    tMs += rng.int(2, 16);
    const closingId = activePointerId;
    const closingKind = activeKind;
    activePointerId = null;

    push(makeSpec({
      target: endMode === "window-up" ? "window" : "el",
      type: endMode === "el-cancel" ? "pointercancel" : "pointerup",
      pointerId: closingId, pointerType: closingKind, clientX: x, clientY: y, timeStamp: tMs, tag: `close:${endMode}`,
    }));

    if (rng.bool(0.65) && events.length < limit) {
      const dupKind = rng.pick(["dup-el-up", "dup-win-up", "dup-el-cancel", "post-lostcapture"] as const);
      push(makeSpec({
        target: dupKind === "dup-win-up" ? "window" : "el",
        type: dupKind === "dup-el-cancel" ? "pointercancel" : dupKind === "post-lostcapture" ? "lostpointercapture" : "pointerup",
        pointerId: closingId, pointerType: closingKind, clientX: x, clientY: y, timeStamp: tMs + rng.int(0, 4),
        tag: `post-close:${dupKind}`,
      }));
    }
  }

  if (opts.closeOpenStrokeBeforeDetach && activePointerId !== null) {
    tMs += 8;
    events.push(makeSpec({
      type: "pointerup", pointerId: activePointerId, pointerType: activeKind,
      clientX: x, clientY: y, timeStamp: tMs, tag: "final-close-up",
    }));
  }

  return { events, useRawUpdate, primaryButtonOnly, blockContextMenu };
}

export interface CanonicalStreamValidation {
  valid: boolean;
  violations: string[];
  downCount: number;
  moveCount: number;
  upCount: number;
  predictedInCanonicalCount: number;
  strokes: RawSample[][];
}

/**
 * 정본(`canonical`) 표본 스트림이 획 수명주기 불변식을 모두 만족하는지 검증한다:
 * - 정본 스트림 안에 `source === "predicted"` 표본이 0개여야 한다.
 * - 모든 획은 정확히 1개의 `phase: "down"`으로 시작하고 0개 이상의 `"move"`를 거쳐 최대 1개의 `"up"`으로 끝난다.
 * - 고아 `"move"`(열린 획 밖의 move)나 고아/중복 `"up"`이 없어야 한다.
 */
export function validateCanonicalSampleStream(
  canonicalSamples: readonly RawSample[],
  opts: { requireAllClosed?: boolean } = {},
): CanonicalStreamValidation {
  const violations: string[] = [];
  const strokes: RawSample[][] = [];
  let currentStroke: RawSample[] | null = null;
  let downCount = 0;
  let moveCount = 0;
  let upCount = 0;
  let predictedInCanonicalCount = 0;

  for (let i = 0; i < canonicalSamples.length; i += 1) {
    const s = canonicalSamples[i];
    if (!s) continue;
    if (s.source === "predicted") {
      predictedInCanonicalCount += 1;
      violations.push(`index ${i}: predicted sample found in canonical stream`);
    }
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.tMs) || !Number.isFinite(s.pressure)) {
      violations.push(`index ${i}: non-finite sample field`);
    }
    if (s.phase === "down") {
      downCount += 1;
      if (currentStroke !== null) violations.push(`index ${i}: "down" arrived while previous stroke was still open without "up"`);
      currentStroke = [s];
      strokes.push(currentStroke);
    } else if (s.phase === "move") {
      moveCount += 1;
      if (currentStroke === null) violations.push(`index ${i}: orphan "move" outside of active stroke`);
      else currentStroke.push(s);
    } else if (s.phase === "up") {
      upCount += 1;
      if (currentStroke === null) violations.push(`index ${i}: orphan or duplicate "up" outside of active stroke`);
      else {
        currentStroke.push(s);
        currentStroke = null;
      }
    }
  }

  if (opts.requireAllClosed && currentStroke !== null) {
    violations.push("stream ended with an unclosed stroke (downCount !== upCount)");
  }
  if (downCount - upCount > 1 || upCount > downCount) {
    violations.push(`mismatched downCount (${downCount}) and upCount (${upCount})`);
  }

  return { valid: violations.length === 0, violations, downCount, moveCount, upCount, predictedInCanonicalCount, strokes };
}

export interface SeededReplayResult {
  seed: number;
  events: SyntheticPointerEventSpec[];
  batches: RawSample[][];
  allSamples: RawSample[];
  canonicalSamples: RawSample[];
  predictedSamples: RawSample[];
  validation: CanonicalStreamValidation;
  captureFailures: { pointerId: number; reason: string }[];
  hovers: { x: number; y: number }[];
  activeElementListenersAfterDetach: number;
  activeWindowListenersAfterDetach: number;
  activeCapturedPointersAfterDetach: number;
  postDetachSampleCount: number;
  touchActionRestored: boolean;
}

/**
 * 주어진 시드로 합성 포인터 이벤트 스트림을 생성·재생하고 `detach()` 후 정리 불변식까지 확인한다.
 * (합성 포인터 이벤트 스트림 리플레이 — 실기기 펜 하드웨어 검증 아님)
 */
export function runSeededPointerReplay(
  seed: number,
  opts: SeededReplayOptions = {},
): SeededReplayResult {
  const generated = generateSeededPointerStream(seed, opts);
  const surface = createInstrumentedPointerSurface({
    enableRawUpdate: generated.useRawUpdate,
    initialTouchAction: "pan-y",
  });

  const batches: RawSample[][] = [];
  const captureFailures: { pointerId: number; reason: string }[] = [];
  const hovers: { x: number; y: number }[] = [];

  const captureOpts: PointerCaptureOptions = {
    useRawUpdate: generated.useRawUpdate,
    primaryButtonOnly: generated.primaryButtonOnly,
    blockContextMenu: generated.blockContextMenu,
    onHover: (hx, hy) => hovers.push({ x: hx, y: hy }),
    onCaptureFailure: (info) => captureFailures.push(info),
  };

  try {
    const detach = attachPointerCapture(surface.el, (raw) => batches.push(raw), captureOpts);

    for (const spec of generated.events) {
      if (spec.captureFailure) surface.setNextCaptureFailure(spec.captureFailure);
      const ev = createSyntheticPointerEvent(spec);
      if (spec.target === "window") window.dispatchEvent(ev);
      else surface.el.dispatchEvent(ev);
    }

    detach();
    detach();

    const activeElementListenersAfterDetach = surface.activeElementListenerCount();
    const activeWindowListenersAfterDetach = surface.activeWindowListenerCount();
    const activeCapturedPointersAfterDetach = surface.activeCapturedPointers().size;
    const touchActionRestored = surface.el.style.touchAction === "pan-y";

    const batchCountBeforePostDetach = batches.length;
    const hoverCountBeforePostDetach = hovers.length;
    surface.el.dispatchEvent(createSyntheticPointerEvent(makeSpec({ type: "pointerdown", pointerId: 999, buttons: 1, clientX: 50, clientY: 50, pressure: 0.5, timeStamp: 99999 })));
    surface.el.dispatchEvent(createSyntheticPointerEvent(makeSpec({ type: "pointermove", pointerId: 999, button: -1, clientX: 60, clientY: 60, timeStamp: 100000 })));
    window.dispatchEvent(createSyntheticPointerEvent(makeSpec({ type: "pointerup", pointerId: 999, clientX: 60, clientY: 60, timeStamp: 100001 })));
    const postDetachSampleCount = batches.length - batchCountBeforePostDetach + (hovers.length - hoverCountBeforePostDetach);

    const allSamples = batches.flat();
    const { canonical: canonicalSamples, predicted: predictedSamples } = splitPredicted(allSamples);
    const validation = validateCanonicalSampleStream(canonicalSamples, {
      requireAllClosed: opts.closeOpenStrokeBeforeDetach === true,
    });

    return {
      seed,
      events: generated.events,
      batches,
      allSamples,
      canonicalSamples,
      predictedSamples,
      validation,
      captureFailures,
      hovers,
      activeElementListenersAfterDetach,
      activeWindowListenersAfterDetach,
      activeCapturedPointersAfterDetach,
      postDetachSampleCount,
      touchActionRestored,
    };
  } finally {
    surface.dispose();
  }
}
