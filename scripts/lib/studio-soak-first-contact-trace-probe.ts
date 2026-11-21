export interface StudioFirstContactTraceIdentity {
  readonly sessionId: string;
  readonly frameId: string;
}
export type StudioFirstContactTracePhase = "session-start" | "pointerdown" | "first-move" | "first-raf" | "pointerup" | "session-end";
export interface StudioFirstContactTraceMarker extends StudioFirstContactTraceIdentity {
  readonly name: string;
  readonly cycle: number;
  readonly phase: StudioFirstContactTracePhase;
  readonly pageEpoch: number;
  readonly startTime: number;
  readonly pointerType: string | null;
  readonly eventType: string | null;
}
export interface StudioFirstContactTraceSnapshot extends StudioFirstContactTraceIdentity {
  readonly pageEpoch: number;
  readonly mainFrame: boolean;
  readonly markers: readonly StudioFirstContactTraceMarker[];
  readonly cycles: readonly { cycle: number; inputMode: string }[];
  readonly errors: readonly string[];
}
export interface StudioFirstContactTracePage {
  evaluate(source: string): Promise<unknown>;
}

/** 기존 입력을 passive capture로 관측한다. 진단 실행에만 첫 접촉 뒤 RAF 관측 하나를 추가한다. */
export function studioFirstContactTraceProbeSource(identity: StudioFirstContactTraceIdentity): string {
  return `(() => {
    const identity = ${JSON.stringify(identity)};
    if (window.__studioFirstContactTrace) throw new Error("첫 접촉 trace 관측기가 중첩되었습니다.");
    if (window !== window.top) throw new Error("첫 접촉 trace는 같은 최상위 페이지에서만 수집합니다.");
    const pageEpoch = performance.timeOrigin, documentUrl = location.href;
    const markers = [], cycles = [], errors = [];
    let active = null, raf = null, serial = 0;
    const error = (code) => { if (errors.length < 32 && !errors.includes(code)) errors.push(code); };
    const mark = (phase, cycle, event = null) => {
      if (performance.timeOrigin !== pageEpoch || location.href !== documentUrl) error("page-changed");
      if (markers.length >= 258) { error("marker-overflow"); return; }
      const name = "toonstudio:soak-first-contact:" + identity.sessionId + ":" + (++serial) + ":" + cycle + ":" + phase;
      const detail = { ...identity, phase, cycle, pageEpoch };
      const entry = performance.mark(name, { detail });
      markers.push({ ...detail, name, startTime: entry.startTime,
        pointerType: event ? event.pointerType : null, eventType: event ? event.type : null });
      performance.clearMarks(name);
    };
    const matches = (event) => {
      if (!active || !active.stage.contains(event.target)) return false;
      if (event.isTrusted !== true) error("untrusted-event");
      if (event.pointerType !== active.inputMode) error("pointer-type");
      return true;
    };
    const down = (event) => {
      if (!matches(event)) return;
      if (active.down) { error("duplicate-pointerdown"); return; }
      active.down = true; active.pointerId = event.pointerId;
      mark("pointerdown", active.cycle, event);
      const cycle = active.cycle;
      raf = requestAnimationFrame(() => { raf = null; mark("first-raf", cycle); });
    };
    const move = (event) => {
      if (!active || !active.down || active.up) return;
      if (event.pointerId !== active.pointerId) { error("pointer-id"); return; }
      if (event.isTrusted !== true || event.pointerType !== active.inputMode) error("pointer-move-identity");
      if (!active.move) { active.move = true; mark("first-move", active.cycle, event); }
    };
    const up = (event) => {
      if (!active || !active.down || active.up) return;
      if (event.pointerId !== active.pointerId) { error("pointer-id"); return; }
      if (event.isTrusted !== true || event.pointerType !== active.inputMode) error("pointer-up-identity");
      active.up = true;
      if (event.type === "pointercancel") error("pointer-cancelled");
      else mark("pointerup", active.cycle, event);
    };
    const bindings = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]];
    for (const [name, listener] of bindings) window.addEventListener(name, listener, { capture: true, passive: true });
    window.__studioFirstContactTrace = {
      sessionId: identity.sessionId, frameId: identity.frameId,
      arm(cycle, inputMode) {
        if (!Number.isSafeInteger(cycle) || cycle < 1 || !["mouse", "pen", "touch"].includes(inputMode)
          || cycles.length >= 64 || cycles.some((row) => row.cycle >= cycle)) throw new Error("첫 접촉 trace 획 식별자가 잘못되었습니다.");
        if (active && (!active.up || !active.move || raf !== null)) { error("previous-stroke-incomplete"); throw new Error("앞선 trace 획이 완료되지 않았습니다."); }
        const stage = document.querySelector(".konvajs-content");
        if (!stage) throw new Error("첫 접촉 trace의 캔버스가 없습니다.");
        active = { cycle, inputMode, stage, down: false, move: false, up: false, pointerId: null };
        cycles.push({ cycle, inputMode });
      },
      finish() {
        try {
          if (raf !== null) error("first-raf-pending");
          mark("session-end", 0);
          return { ...identity, pageEpoch, mainFrame: window === window.top, markers, cycles, errors };
        } finally {
          if (raf !== null) cancelAnimationFrame(raf);
          for (const [name, listener] of bindings) window.removeEventListener(name, listener, true);
          for (const marker of markers) performance.clearMarks(marker.name);
          delete window.__studioFirstContactTrace;
        }
      }
    };
    mark("session-start", 0);
  })()`;
}

export async function armStudioFirstContactTrace(page: StudioFirstContactTracePage, identity: StudioFirstContactTraceIdentity, cycle: number, inputMode: string): Promise<void> {
  if (!Number.isSafeInteger(cycle) || cycle < 1 || !["mouse", "pen", "touch"].includes(inputMode)) {
    throw new Error("첫 접촉 trace 획과 입력 종류를 확인해 주세요.");
  }
  await page.evaluate(`(() => {
    const probe = window.__studioFirstContactTrace, identity = ${JSON.stringify(identity)};
    if (!probe || probe.sessionId !== identity.sessionId || probe.frameId !== identity.frameId) throw new Error("같은 세션의 첫 접촉 trace 관측기가 없습니다.");
    window.__studioFirstContactTrace.arm(${cycle}, ${JSON.stringify(inputMode)});
  })()`);
}

export async function finishStudioFirstContactTraceProbe(page: StudioFirstContactTracePage, identity: StudioFirstContactTraceIdentity): Promise<unknown> {
  return page.evaluate(`(() => {
    const probe = window.__studioFirstContactTrace, identity = ${JSON.stringify(identity)};
    if (!probe || probe.sessionId !== identity.sessionId || probe.frameId !== identity.frameId) throw new Error("같은 세션의 첫 접촉 trace 관측기가 없습니다.");
    return probe.finish();
  })()`);
}
