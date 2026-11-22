export interface StudioBrushPointerDispatchBoundary {
  readonly method: "init-capture-to-verified-window-bubble-v1";
  readonly installedBeforePageScripts: boolean;
  readonly complete: boolean;
  readonly pageEpoch: number;
  readonly endPageEpoch: number;
  readonly expectedPointerMoves: number;
  readonly starts: number;
  readonly ends: number;
  readonly moveStarts: number;
  readonly moveEnds: number;
  readonly downCount: number;
  readonly upCount: number;
  readonly pendingEvents: number;
  readonly lateWindowChanges: number;
  readonly errors: readonly string[];
}

export interface StudioBrushPointerDispatchSample {
  readonly sequence: number;
  readonly type: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
}

export interface StudioBrushPointerDispatchMeasurement {
  readonly boundary: StudioBrushPointerDispatchBoundary;
  readonly pointerAppendDurationsMs: readonly number[];
  readonly pointerUpMainThreadMs: number | null;
  readonly samples: readonly StudioBrushPointerDispatchSample[];
}

export interface StudioBrushPointerDispatchArm {
  readonly expectedPointerMoves: number;
  readonly stageSelector: string;
  readonly pointerType?: "mouse" | "pen" | "touch";
  readonly captureSamples?: boolean;
}

export interface StudioBrushPointerDispatchProbe {
  arm(options: StudioBrushPointerDispatchArm): void;
  finish(): StudioBrushPointerDispatchMeasurement;
  cancel(): void;
  dispose(): void;
}

export interface StudioBrushPointerDispatchWindow extends Window {
  __studioBrushPointerDispatch?: StudioBrushPointerDispatchProbe;
}

/** 이 함수는 직렬화된다. 타입을 제외한 외부 변수·import에 의존하지 않는다. */
function installStudioBrushPointerDispatchProbe(): void {
  if (window !== window.top) return;
  const host = window as StudioBrushPointerDispatchWindow;
  if (host.__studioBrushPointerDispatch) throw new Error("포인터 경계 계측 init이 중복되었습니다.");
  const installedBeforePageScripts = document.readyState === "loading";
  const epoch = performance.timeOrigin;
  const kinds = ["pointerdown", "pointermove", "pointerup", "pointercancel"];
  const prototype = EventTarget.prototype;
  const addDescriptor = Object.getOwnPropertyDescriptor(prototype, "addEventListener");
  const nativeAdd = prototype.addEventListener;
  const nativeRemove = prototype.removeEventListener;
  const initErrors: string[] = [];
  type Entry = { sequence: number; type: string; startedAt: number; ended: boolean };
  type Active = {
    options: StudioBrushPointerDispatchArm; stage: Element; url: string;
    events: WeakMap<Event, Entry>; samples: StudioBrushPointerDispatchSample[];
    durations: number[]; errors: string[]; starts: number; ends: number;
    moveStarts: number; moveEnds: number; downCount: number; upCount: number;
    pending: number; lastEnded: number; pointerId: number | null; lateWindowChanges: number;
    upDuration: number | null;
  };
  let active: Active | null = null;
  let disposed = false;
  const issue = (code: string): void => {
    const errors = active?.errors ?? initErrors;
    if (errors.length < 32 && !errors.includes(code)) errors.push(code);
  };
  const registrationChanged = (): void => {
    if (!active) return;
    active.lateWindowChanges += 1;
    issue("late-window-listener-change");
  };
  // options의 getter와 DOMString 변환은 원래 Web IDL에 한 번만 맡긴다.
  const auditedAdd: typeof nativeAdd = function (this: EventTarget, ...args) {
    // 원시 true는 getter 없이 capture 위상이 증명된다. 늦게 등록돼도 bubble 끝점보다 먼저 실행된다.
    // 객체 options는 다시 읽지 않으며, 증명하지 못한 capture/bubble 및 setter 변경은 계속 거절한다.
    if (active && this === window && args[2] !== true && (typeof args[0] !== "string" || kinds.includes(args[0]))) {
      registrationChanged();
    }
    return Reflect.apply(nativeAdd, this, args);
  };
  const findDescriptor = (key: string): { owner: object; descriptor: PropertyDescriptor } | null => {
    let owner: object | null = window;
    while (owner) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (descriptor) return { owner, descriptor };
      owner = Object.getPrototypeOf(owner) as object | null;
    }
    return null;
  };
  const setters: Array<{ key: string; owner: object; original: PropertyDescriptor;
    replacement: NonNullable<PropertyDescriptor["set"]> }> = [];
  const sameDescriptor = (current: PropertyDescriptor | undefined, expected: PropertyDescriptor): boolean => (
    current !== undefined && current.value === expected.value && current.get === expected.get
    && current.set === expected.set && current.writable === expected.writable
    && current.configurable === expected.configurable && current.enumerable === expected.enumerable
  );
  if (!addDescriptor?.configurable || typeof addDescriptor.value !== "function") {
    issue("add-event-listener-descriptor-unavailable");
  } else {
    Object.defineProperty(prototype, "addEventListener", { ...addDescriptor, value: auditedAdd });
  }
  for (const kind of kinds) {
    const key = `on${kind}`;
    const found = findDescriptor(key);
    if (!found?.descriptor.configurable || typeof found.descriptor.set !== "function") {
      issue(`${key}-descriptor-unavailable`);
      continue;
    }
    const nativeSet = found.descriptor.set;
    const original = found.descriptor;
    const replacement: NonNullable<PropertyDescriptor["set"]> = function (this: unknown, value: unknown) {
      if (this === window) registrationChanged();
      return Reflect.apply(nativeSet, this, [value]);
    };
    Object.defineProperty(found.owner, key, { ...original, set: replacement });
    setters.push({ key, owner: found.owner, original, replacement });
  }
  const checkIntegrity = (): void => {
    if (performance.timeOrigin !== epoch || active && location.href !== active.url) issue("document-changed");
    if (!addDescriptor || !sameDescriptor(Object.getOwnPropertyDescriptor(prototype, "addEventListener"),
      { ...addDescriptor, value: auditedAdd }) || window.addEventListener !== auditedAdd) issue("listener-audit-replaced");
    for (const { key, owner, replacement, original } of setters) {
      const current = findDescriptor(key);
      if (current?.owner !== owner || !sameDescriptor(current.descriptor,
        { ...original, set: replacement })) issue("pointer-setter-audit-replaced");
    }
  };
  const capture = (event: Event): void => {
    const state = active;
    if (!state) return;
    const startedAt = performance.now();
    const pointer = event as PointerEvent;
    if (!event.isTrusted) { issue("untrusted-event"); return; }
    if (event.type !== "pointerdown" && state.pointerId === null) return;
    if (event.type === "pointerdown") {
      if (!(event.target instanceof Node) || !state.stage.contains(event.target)) {
        issue("pointerdown-target-mismatch"); return;
      }
      state.downCount += 1;
      if (state.downCount !== 1) issue("duplicate-pointerdown");
      state.pointerId = pointer.pointerId;
    }
    if (!Number.isSafeInteger(pointer.pointerId) || pointer.pointerId !== state.pointerId
      || pointer.pointerType !== (state.options.pointerType ?? "mouse")) issue("pointer-identity-mismatch");
    if (state.events.has(event)) { issue("duplicate-event-start"); return; }
    if (state.pending !== 0) issue("previous-dispatch-incomplete");
    if (state.upCount !== 0) issue("event-after-pointerup");
    if (!Number.isFinite(startedAt)) issue("invalid-start-time");
    if (event.type === "pointercancel") issue("pointer-cancelled");
    if (event.type === "pointermove") state.moveStarts += 1;
    if (event.type === "pointerup") state.upCount += 1;
    state.starts += 1;
    state.pending += 1;
    if (state.starts > state.options.expectedPointerMoves + 2) issue("event-count-overflow");
    state.events.set(event, { sequence: state.starts, type: event.type, startedAt, ended: false });
  };
  const bubble = (event: Event): void => {
    const endedAt = performance.now();
    const state = active;
    if (!state) return;
    const entry = state.events.get(event);
    if (!entry) {
      if (event.type === "pointerdown" || state.pointerId !== null) issue("event-end-without-start");
      return;
    }
    if (entry.ended) { issue("duplicate-event-end"); return; }
    entry.ended = true;
    state.ends += 1;
    state.pending -= 1;
    if (entry.sequence !== state.lastEnded + 1) issue("event-end-order");
    state.lastEnded = entry.sequence;
    const durationMs = endedAt - entry.startedAt;
    if (!Number.isFinite(durationMs) || durationMs < 0) issue("invalid-dispatch-duration");
    if (event.type === "pointermove") { state.moveEnds += 1; state.durations.push(durationMs); }
    if (event.type === "pointerup") state.upDuration = durationMs;
    if (state.options.captureSamples && state.samples.length < state.options.expectedPointerMoves + 2) {
      state.samples.push({ sequence: entry.sequence, type: entry.type, startedAt: entry.startedAt, endedAt, durationMs });
    }
  };
  const removeEnds = (): void => {
    for (const kind of kinds) Reflect.apply(nativeRemove, window, [kind, bubble, false]);
  };
  const api: StudioBrushPointerDispatchProbe = {
    arm(options) {
      if (disposed || active) throw new Error("포인터 경계 계측 수명이 잘못되었습니다.");
      checkIntegrity();
      if (!installedBeforePageScripts) issue("init-after-page-scripts");
      if (initErrors.length) throw new Error(`포인터 경계 초기화 실패: ${initErrors.join(", ")}`);
      if (!Number.isSafeInteger(options.expectedPointerMoves) || options.expectedPointerMoves < 1
        || options.expectedPointerMoves > 100_000) throw new Error("포인터 경계 표본 수가 잘못되었습니다.");
      const stage = document.querySelector(options.stageSelector);
      if (!stage) throw new Error("포인터 경계의 입력 영역이 없습니다.");
      // 자신의 endpoint는 감사 wrapper를 통하지 않고 arm과 같은 동기 실행에서 설치한다.
      for (const kind of kinds) Reflect.apply(nativeAdd, window, [kind, bubble, { passive: true }]);
      active = { options: { ...options }, stage, url: location.href, events: new WeakMap(), samples: [],
        durations: [], errors: [], starts: 0, ends: 0, moveStarts: 0, moveEnds: 0, downCount: 0,
        upCount: 0, pending: 0, lastEnded: 0, pointerId: null, lateWindowChanges: 0, upDuration: null };
    },
    finish() {
      const state = active;
      if (!state) throw new Error("활성 포인터 경계 계측이 없습니다.");
      checkIntegrity();
      if (state.pending !== 0 || state.starts !== state.ends) issue("missing-event-end");
      if (state.downCount !== 1 || state.upCount !== 1) issue("stroke-boundary-count");
      if (state.moveStarts !== state.options.expectedPointerMoves || state.moveEnds !== state.moveStarts) issue("pointer-move-count");
      const boundary: StudioBrushPointerDispatchBoundary = {
        method: "init-capture-to-verified-window-bubble-v1", installedBeforePageScripts,
        complete: state.errors.length === 0, pageEpoch: epoch, endPageEpoch: performance.timeOrigin,
        expectedPointerMoves: state.options.expectedPointerMoves, starts: state.starts, ends: state.ends,
        moveStarts: state.moveStarts, moveEnds: state.moveEnds, downCount: state.downCount,
        upCount: state.upCount, pendingEvents: state.pending, lateWindowChanges: state.lateWindowChanges,
        errors: [...state.errors],
      };
      removeEnds(); active = null;
      return { boundary, pointerAppendDurationsMs: [...state.durations],
        pointerUpMainThreadMs: state.upDuration, samples: [...state.samples] };
    },
    cancel() { removeEnds(); active = null; },
    dispose() {
      api.cancel(); disposed = true;
      for (const kind of kinds) Reflect.apply(nativeRemove, window, [kind, capture, true]);
      if (addDescriptor && sameDescriptor(Object.getOwnPropertyDescriptor(prototype, "addEventListener"),
        { ...addDescriptor, value: auditedAdd })) {
        Object.defineProperty(prototype, "addEventListener", addDescriptor);
      }
      for (const { key, owner, original, replacement } of setters) {
        if (sameDescriptor(Object.getOwnPropertyDescriptor(owner, key), { ...original, set: replacement })) {
          Object.defineProperty(owner, key, original);
        }
      }
      if (host.__studioBrushPointerDispatch === api) delete host.__studioBrushPointerDispatch;
    },
  };
  for (const kind of kinds) Reflect.apply(nativeAdd, window, [kind, capture, { capture: true, passive: true }]);
  host.__studioBrushPointerDispatch = api;
}

/** 하나의 init에서 계측을 먼저 설치하고 기존 지연 검사 storage 준비를 이어간다. */
export function studioBrushPointerDispatchInitSource(seed?: {
  readonly autosavePrefix: string; readonly mobileHintKey: string; readonly quickstartKey: string;
}): string {
  return `(() => { const __name = (value) => value; (${installStudioBrushPointerDispatchProbe.toString()})();
    const seed = ${JSON.stringify(seed ?? null)};
    if (seed) { try {
      localStorage.setItem(seed.quickstartKey, "1"); localStorage.setItem(seed.mobileHintKey, "1");
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index); if (key?.startsWith(seed.autosavePrefix)) localStorage.removeItem(key);
      }
    } catch { /* 기존 storage 실패는 실제 화면·픽셀 검사에서 판정한다. */ } }
  })();`;
}

/** 이전 보고서나 불완전한 경계 영수증을 빠른 표본으로 취급하지 않는다. */
export function isStudioBrushPointerDispatchBoundaryValid(
  boundary: StudioBrushPointerDispatchBoundary | null | undefined,
  expectedPointerMoves: number,
  observedPointerMoves: number,
): boolean {
  return boundary?.method === "init-capture-to-verified-window-bubble-v1"
    && boundary.installedBeforePageScripts === true && boundary.complete === true
    && Number.isFinite(boundary.pageEpoch) && boundary.pageEpoch === boundary.endPageEpoch
    && Number.isSafeInteger(expectedPointerMoves) && expectedPointerMoves > 0
    && boundary.expectedPointerMoves === expectedPointerMoves && observedPointerMoves === expectedPointerMoves
    && boundary.starts === expectedPointerMoves + 2 && boundary.ends === boundary.starts
    && boundary.moveStarts === expectedPointerMoves && boundary.moveEnds === expectedPointerMoves
    && boundary.downCount === 1 && boundary.upCount === 1 && boundary.pendingEvents === 0
    && boundary.lateWindowChanges === 0 && Array.isArray(boundary.errors) && boundary.errors.length === 0;
}
