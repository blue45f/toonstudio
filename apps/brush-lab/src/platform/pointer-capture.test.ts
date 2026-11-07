// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { displayScale, fitDocumentSize } from "./canvas-present";
import {
  attachPointerCapture,
  MAX_SAFE_DOCUMENT_COORD_PX,
  MIN_VALID_RECT_SIDE_PX,
  resolveSurfaceMapping,
  splitPredicted,
} from "./pointer-capture";
import {
  createInstrumentedPointerSurface,
  validateCanonicalSampleStream,
} from "./pointer-replay-harness";

import type { RawSample } from "../engine/core/types";

interface SyntheticInit extends PointerEventInit {
  timeStamp?: number;
  coalesced?: PointerEvent[];
  predicted?: PointerEvent[];
}

/** jsdom PointerEvent에 coalesced/predicted·timeStamp·비정수/비유한 좌표를 모의로 붙인다. */
function pointerEvent(type: string, init: SyntheticInit = {}): PointerEvent {
  const { timeStamp, coalesced, predicted, clientX, clientY, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.5,
    clientX: typeof clientX === "number" && Number.isFinite(clientX) ? clientX : 0,
    clientY: typeof clientY === "number" && Number.isFinite(clientY) ? clientY : 0,
    ...rest,
  });
  if (typeof clientX === "number") {
    Object.defineProperty(ev, "clientX", { value: clientX });
  }
  if (typeof clientY === "number") {
    Object.defineProperty(ev, "clientY", { value: clientY });
  }
  if (typeof timeStamp === "number") {
    Object.defineProperty(ev, "timeStamp", { value: timeStamp });
  }
  if (coalesced) {
    Object.defineProperty(ev, "getCoalescedEvents", { value: () => coalesced });
  }
  if (predicted) {
    Object.defineProperty(ev, "getPredictedEvents", { value: () => predicted });
  }
  return ev;
}

function setup(opts?: Parameters<typeof attachPointerCapture>[2]) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const batches: RawSample[][] = [];
  const detach = attachPointerCapture(el, (raw) => batches.push(raw), opts);
  return { el, batches, detach };
}

describe("attachPointerCapture", () => {
  it("pointerdown은 down 표본 1개, coalesced는 마지막만 raw, predicted는 predicted로 태깅한다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 20, timeStamp: 100 }));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      expect.objectContaining({ x: 10, y: 20, tMs: 100, phase: "down", source: "raw", pointerType: "pen" }),
    ]);

    const c1 = pointerEvent("pointermove", { clientX: 11, clientY: 21, timeStamp: 104, pressure: 0.6 });
    const c2 = pointerEvent("pointermove", { clientX: 12, clientY: 22, timeStamp: 108, pressure: 0.7 });
    const p1 = pointerEvent("pointermove", { clientX: 13, clientY: 23, timeStamp: 116, pressure: 0.7 });
    el.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 12,
        clientY: 22,
        timeStamp: 108,
        pressure: 0.7,
        coalesced: [c1, c2],
        predicted: [p1],
      }),
    );
    expect(batches).toHaveLength(2);
    const move = batches[1] ?? [];
    expect(move.map((s) => [s.source, s.phase, s.x])).toEqual([
      ["coalesced", "move", 11],
      ["raw", "move", 12],
      ["predicted", "move", 13],
    ]);
    const split = splitPredicted(move);
    expect(split.canonical).toHaveLength(2);
    expect(split.predicted).toHaveLength(1);
    detach();
  });

  it("pointerup은 phase up 표본 1개이며 마지막 접촉 압력을 쓴다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0, pressure: 0.4 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5, pressure: 0.8 }));
    el.dispatchEvent(pointerEvent("pointerup", { clientX: 6, clientY: 6, pressure: 0 }));
    const last = batches[batches.length - 1] ?? [];
    expect(last).toHaveLength(1);
    expect(last[0]).toEqual(expect.objectContaining({ phase: "up", source: "raw", x: 6, tiltXDeg: 0 }));
    // jsdom은 pressure를 float32로 저장하므로 근사 비교한다.
    expect(last[0]?.pressure).toBeCloseTo(0.8, 5);
    detach();
  });

  it("getCoalescedEvents가 없으면 pointermove 1개를 raw 표본 1개로 넘긴다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 3, clientY: 4 }));
    expect(batches[1]).toEqual([expect.objectContaining({ x: 3, y: 4, source: "raw", phase: "move" })]);
    detach();
  });

  it("다른 포인터와 pen 직후 touch(팜)는 무시하고 primary 포인터 하나만 획을 소유한다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, timeStamp: 1000 }));
    // 다른 pointerId의 move는 무시
    el.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 99, clientY: 99, timeStamp: 1001 }));
    expect(batches).toHaveLength(1);
    el.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, timeStamp: 1002 }));
    expect(batches).toHaveLength(2);
    // pen 이후 500 ms 이내 touch down은 손바닥으로 보고 무시
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 3, pointerType: "touch", timeStamp: 1200 }));
    expect(batches).toHaveLength(2);
    // 접촉폭 20 px 이상 touch도 무시
    el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 4, pointerType: "touch", width: 24, timeStamp: 3000 }),
    );
    expect(batches).toHaveLength(2);
    // 충분히 지난 뒤의 작은 touch는 허용
    el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 5, pointerType: "touch", width: 4, timeStamp: 3001 }),
    );
    expect(batches).toHaveLength(3);
    expect(batches[2]?.[0]?.pointerType).toBe("touch");
    detach();
  });

  it("호버는 onHover로만 전달되고 표본을 만들지 않으며 detach 후에는 아무 콜백도 없다", () => {
    const hovers: [number, number][] = [];
    const { el, batches, detach } = setup({ onHover: (x, y) => hovers.push([x, y]) });
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 7, clientY: 8, buttons: 0 }));
    expect(hovers).toEqual([[7, 8]]);
    expect(batches).toHaveLength(0);
    expect(el.style.touchAction).toBe("none");
    detach();
    expect(el.style.touchAction).toBe("");
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    expect(batches).toHaveLength(0);
  });

  it("logicalSize가 주어지면 요소 좌표를 논리 캔버스 좌표로 변환한다", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(el, (raw) => batches.push(raw), { logicalSize: { width: 400, height: 200 } });
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 150, clientY: 100 }));
    expect(batches[0]?.[0]).toEqual(expect.objectContaining({ x: 100, y: 100 }));
    detach();
  });
});

describe("attachPointerCapture: 캡처 상실·컨텍스트 메뉴", () => {
  it("lostpointercapture 단독은 표본을 만들지 않고 소유자를 유지해 획이 이어진다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, pressure: 0.4 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5, pressure: 0.7 }));
    el.dispatchEvent(pointerEvent("lostpointercapture", { clientX: 5, clientY: 5, pressure: 0 }));
    expect(batches).toHaveLength(2);
    // 소유자가 유지되므로 이후 move/up이 정상 경로로 이어진다.
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 9, clientY: 9, pressure: 0.8 }));
    expect(batches).toHaveLength(3);
    el.dispatchEvent(pointerEvent("pointerup", { clientX: 9, clientY: 9 }));
    const last = batches[batches.length - 1] ?? [];
    expect(last).toHaveLength(1);
    expect(last[0]).toEqual(expect.objectContaining({ phase: "up", source: "raw" }));
    detach();
  });

  it("조용히 끝난 획 뒤 한참 뒤의 down은 예전 획을 합성 종료하고 새로 시작한다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, pressure: 0.4, timeStamp: 1000 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5, pressure: 0.7, timeStamp: 1100 }));
    expect(batches).toHaveLength(2);
    // 2초 넘게 조용하다가 새 down: 합성 up 1개 + 새 down 1개.
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 9, clientY: 9, pressure: 0.5, timeStamp: 5000 }));
    expect(batches).toHaveLength(4);
    expect(batches[2]).toHaveLength(1);
    expect(batches[2]?.[0]).toEqual(expect.objectContaining({ phase: "up" }));
    expect(batches[2]?.[0]?.pressure).toBeCloseTo(0.7, 5);
    expect(batches[3]).toEqual([expect.objectContaining({ phase: "down" })]);
    detach();
  });

  it("조용한 지 2초 안의 down은 멀티터치로 보고 무시한다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, pressure: 0.4, timeStamp: 1000 }));
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 9, clientY: 9, pressure: 0.5, timeStamp: 1500 }));
    expect(batches).toHaveLength(1);
    detach();
  });

  it("정상 pointerup 뒤의 lostpointercapture와 소유하지 않은 포인터의 lostpointercapture는 표본을 만들지 않는다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    el.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 9 }));
    expect(batches).toHaveLength(1);
    el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2 }));
    expect(batches).toHaveLength(2);
    el.dispatchEvent(pointerEvent("lostpointercapture", { clientX: 2, clientY: 2 }));
    expect(batches).toHaveLength(2);
    detach();
    // detach 뒤에는 어떤 이벤트도 표본이 되지 않는다.
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    el.dispatchEvent(pointerEvent("lostpointercapture"));
    expect(batches).toHaveLength(2);
  });

  it("blockContextMenu를 켜면 contextmenu를 막고 해제하면 풀리며 기본값은 막지 않는다", () => {
    const blocked = setup({ blockContextMenu: true });
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    blocked.el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    blocked.detach();
    const after = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    blocked.el.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);

    const open = setup();
    const ev2 = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    open.el.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    open.detach();
  });

  it("primaryButtonOnly는 마우스 보조 버튼 획을 막고 주 버튼·펜은 그대로 받는다(기본은 모두 받는다)", () => {    const strict = setup({ primaryButtonOnly: true });
    strict.el.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse", button: 2, buttons: 2, clientX: 1, clientY: 1 }));
    expect(strict.batches).toHaveLength(0);
    strict.el.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse", button: 0, buttons: 1, clientX: 1, clientY: 1 }));
    expect(strict.batches).toHaveLength(1);
    strict.el.dispatchEvent(pointerEvent("pointerup", { pointerType: "mouse", button: 0, clientX: 1, clientY: 1 }));
    strict.el.dispatchEvent(pointerEvent("pointerdown", { pointerType: "pen", button: 0, buttons: 1, clientX: 2, clientY: 2 }));
    expect(strict.batches).toHaveLength(3);
    strict.detach();

    const open = setup();
    open.el.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse", button: 2, buttons: 2, clientX: 1, clientY: 1 }));
    expect(open.batches).toHaveLength(1);
    open.detach();
  });

    it("setPointerCapture가 던지면 획을 시작하지 않고 onCaptureFailure로 사유를 알린다", () => {    const failures: { pointerId: number; reason: string }[] = [];
    const { el, batches, detach } = setup({ onCaptureFailure: (info) => failures.push(info) });
    Object.defineProperty(el, "setPointerCapture", {
      value: () => {
        throw new Error("NotFoundError");
      },
    });
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    expect(batches).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.pointerId).toBe(1);
    expect(failures[0]?.reason).toContain("NotFoundError");
    // 소유자가 없으므로 이후 move도 무시된다(유령 획 없음).
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5 }));
    expect(batches).toHaveLength(0);
    detach();
  });

  it("캡처 호출은 성공해도 확보되지 않으면 획을 시작하지 않는다", () => {
    const failures: { pointerId: number; reason: string }[] = [];
    const { el, batches, detach } = setup({ onCaptureFailure: (info) => failures.push(info) });
    Object.defineProperty(el, "setPointerCapture", { value: () => undefined });
    Object.defineProperty(el, "hasPointerCapture", { value: () => false });
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    expect(batches).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toContain("not acquired");
    detach();
  });

  it("요소가 놓친 up은 window 그물망이 받아 획을 끝낸다(유령 소유자 방지)", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, pressure: 0.4 }));
    expect(batches).toHaveLength(1);
    // 요소 리스너를 거치지 않고 window에만 pointerup이 온 경우(리마운트 등).
    window.dispatchEvent(pointerEvent("pointerup", { clientX: 9, clientY: 9 }));
    const last = batches[batches.length - 1] ?? [];
    expect(last).toHaveLength(1);
    expect(last[0]).toEqual(expect.objectContaining({ phase: "up" }));
    detach();
  });

  it("획 도중 마우스 보조 버튼은 기본 동작을 막고(자동스크롤 방지) 표본을 만들지 않는다", () => {
    const { el, batches, detach } = setup({ primaryButtonOnly: true });
    el.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse", button: 0, buttons: 1, clientX: 1, clientY: 1 }));
    expect(batches).toHaveLength(1);
    const wheel = pointerEvent("pointerdown", { pointerType: "mouse", button: 1, buttons: 5, clientX: 2, clientY: 2 });
    el.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(batches).toHaveLength(1);
    const right = pointerEvent("pointerdown", { pointerType: "mouse", button: 2, buttons: 3, clientX: 3, clientY: 3 });
    el.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    expect(batches).toHaveLength(1);
    detach();
  });

  it("useRawUpdate 활성 시 pointerrawupdate가 마지막 위치·시각을 갱신해 stale takeover 합성 up에 반영한다", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "onpointerrawupdate", { value: null, configurable: true });
    document.body.appendChild(el);
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(el, (raw) => batches.push(raw), { useRawUpdate: true });

    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 20, pressure: 0.3, timeStamp: 1000 }));
    el.dispatchEvent(pointerEvent("pointerrawupdate", { clientX: 45, clientY: 65, pressure: 0.8, timeStamp: 2500 }));
    expect(batches).toHaveLength(2);

    // pointerrawupdate 시각(2500ms)으로부터 1500ms 뒤(4000ms)의 다른 포인터 down은 아직 2초 미만이므로 무시되어야 한다.
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 90, clientY: 90, pressure: 0.5, timeStamp: 4000 }));
    expect(batches).toHaveLength(2);

    // 2500ms로부터 2초가 넘은 5000ms 시점의 새 down은 마지막 pointerrawupdate 위치(45, 65)로 합성 up을 내야 한다.
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 90, clientY: 90, pressure: 0.5, timeStamp: 5000 }));
    expect(batches).toHaveLength(4);
    expect(batches[2]?.[0]).toEqual(
      expect.objectContaining({
        phase: "up",
        x: 45,
        y: 65,
        tMs: 5000,
      }),
    );
    expect(batches[2]?.[0]?.pressure).toBeCloseTo(0.8, 5);
    expect(batches[3]?.[0]).toEqual(expect.objectContaining({ phase: "down", x: 90, y: 90, tMs: 5000 }));
    detach();
  });
});

describe("attachPointerCapture: 경합 조건 회귀 및 결정적 재현(합성 포인터 이벤트 스트림 리플레이 — 실기기 펜 하드웨어 검증 아님)", () => {
  it("2초(STALE_TAKEOVER_MS) 뒤라도 거부되거나 캡처에 실패한 pointerdown은 진행 중인 획을 합성 up으로 죽이지 않는다", () => {
    const surface = createInstrumentedPointerSurface();
    const batches: RawSample[][] = [];
    const failures: { pointerId: number; reason: string }[] = [];
    const detach = attachPointerCapture(surface.el, (raw) => batches.push(raw), {
      primaryButtonOnly: true,
      onCaptureFailure: (info) => failures.push(info),
    });

    // 1. ownerId=1 획 시작 및 이동
    surface.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, pressure: 0.4, timeStamp: 1000 }));
    surface.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 20, clientY: 20, pressure: 0.6, timeStamp: 1100 }));
    expect(batches).toHaveLength(2);
    expect(surface.activeCapturedPointers().has(1)).toBe(true);

    // 2. 2초 넘은 시점(t=4000)의 비주포인터(!isPrimary) down -> 거부되어야 하고 기존 획 유지
    surface.el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 2, isPrimary: false, clientX: 50, clientY: 50, timeStamp: 4000 }),
    );
    expect(batches).toHaveLength(2);

    // 3. 2초 넘은 시점(t=4100)의 마우스 우클릭(primaryButtonOnly: true) down -> 거부 + preventDefault + 기존 획 유지
    const rightClick = pointerEvent("pointerdown", {
      pointerId: 3,
      pointerType: "mouse",
      button: 2,
      buttons: 2,
      clientX: 60,
      clientY: 60,
      timeStamp: 4100,
    });
    surface.el.dispatchEvent(rightClick);
    expect(rightClick.defaultPrevented).toBe(true);
    expect(batches).toHaveLength(2);

    // 4. 2초 넘은 시점(t=4200)의 팜(접촉폭 >= 20px) touch down -> 거부 + 기존 획 유지
    surface.el.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 4,
        pointerType: "touch",
        width: 28,
        clientX: 70,
        clientY: 70,
        timeStamp: 4200,
      }),
    );
    expect(batches).toHaveLength(2);

    // 5. 2초 넘은 시점(t=4300)의 setPointerCapture 예외 발생 down -> 거부 + onCaptureFailure + 기존 획 유지
    surface.setNextCaptureFailure("throw");
    surface.el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 5, clientX: 80, clientY: 80, timeStamp: 4300 }),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.pointerId).toBe(5);
    expect(batches).toHaveLength(2);

    // 6. 2초 넘은 시점(t=4400)의 hasPointerCapture 미확보 down -> 거부 + onCaptureFailure + 기존 획 유지
    surface.setNextCaptureFailure("not-acquired");
    surface.el.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 6, clientX: 85, clientY: 85, timeStamp: 4400 }),
    );
    expect(failures).toHaveLength(2);
    expect(failures[1]?.pointerId).toBe(6);
    expect(batches).toHaveLength(2);

    // 7. 원래 소유자(pointerId=1)가 여전히 살아 있어 이후 move와 pointerup이 정상 처리된다.
    surface.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 30, clientY: 30, pressure: 0.75, timeStamp: 4500 }));
    surface.el.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 35, clientY: 35, pressure: 0, timeStamp: 4520 }));
    expect(batches).toHaveLength(4);
    expect(batches[2]?.[0]).toEqual(expect.objectContaining({ phase: "move", x: 30, y: 30, tMs: 4500 }));
    expect(batches[3]?.[0]).toEqual(expect.objectContaining({ phase: "up", x: 35, y: 35, tMs: 4520 }));
    expect(batches[3]?.[0]?.pressure).toBeCloseTo(0.75, 5);

    detach();
    surface.dispose();
  });

  it("유효한 stale takeover(> 2000ms)는 이전 소유자의 포인터 캡처를 해제하고 정확히 1개의 합성 up 뒤 새 획을 시작한다", () => {
    const surface = createInstrumentedPointerSurface();
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(surface.el, (raw) => batches.push(raw));

    surface.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 10, clientX: 12, clientY: 14, pressure: 0.5, timeStamp: 1000 }));
    surface.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 10, clientX: 22, clientY: 24, pressure: 0.8, timeStamp: 1200 }));
    expect(surface.activeCapturedPointers()).toEqual(new Set([10]));

    surface.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 11, clientX: 50, clientY: 60, pressure: 0.4, timeStamp: 3500 }));
    // 이전 포인터(10) 캡처 해제 + 새 포인터(11) 캡처 보유
    expect(surface.activeCapturedPointers()).toEqual(new Set([11]));
    expect(batches).toHaveLength(4);
    expect(batches[2]?.[0]).toEqual(expect.objectContaining({ phase: "up", x: 22, y: 24, tMs: 3500 }));
    expect(batches[3]?.[0]).toEqual(expect.objectContaining({ phase: "down", x: 50, y: 60, tMs: 3500 }));

    detach();
    expect(surface.activeCapturedPointers().size).toBe(0);
    surface.dispose();
  });

  it("역행하는 pointermove/pointerrawupdate 타임스탬프가 lastTMs를 되감아 가짜 stale takeover를 유발하지 않는다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 1000 }));
    el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 20, clientY: 20, timeStamp: 3000 }));
    // 역행 시각(t=900) move가 들어와도 lastTMs는 3000으로 유지되어야 한다.
    el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 25, clientY: 25, timeStamp: 900 }));
    expect(batches).toHaveLength(3);

    // t=2950에 다른 포인터(pointerId=2) down이 오면 3000 기준으로는 역행/동시 입력이므로 stale takeover가 발동하면 안 된다.
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 99, clientY: 99, timeStamp: 2950 }));
    expect(batches).toHaveLength(3);

    // 원래 소유자(pointerId=1)로 정상 종료
    el.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 30, clientY: 30, timeStamp: 3100 }));
    expect(batches).toHaveLength(4);
    expect(batches[3]?.[0]?.phase).toBe("up");
    detach();
  });

  it("역행하는 pen 타임스탬프가 lastPenTMs를 되감아 직후 팜 터치를 통과시키지 않는다", () => {
    const { el, batches, detach } = setup();
    // t=1000에 pen 호버 이동
    el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, pointerType: "pen", buttons: 0, timeStamp: 1000 }));
    // t=200(역행)에 pen 호버 이동이 와도 lastPenTMs는 1000으로 유지되어야 한다.
    el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, pointerType: "pen", buttons: 0, timeStamp: 200 }));
    // t=1100(1000으로부터 100ms < 500ms)의 좁은 touch down은 팜 리젝션으로 무시되어야 한다.
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, pointerType: "touch", width: 4, timeStamp: 1100 }));
    expect(batches).toHaveLength(0);
    detach();
  });

  it("useRawUpdate 활성 시 pointermove(예측 전용)가 pointerrawupdate의 위치·압력·시각 추적을 덮어쓰지 않는다", () => {
    const surface = createInstrumentedPointerSurface({ enableRawUpdate: true });
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(surface.el, (raw) => batches.push(raw), { useRawUpdate: true });

    surface.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, pressure: 0.3, timeStamp: 1000 }));
    surface.el.dispatchEvent(pointerEvent("pointerrawupdate", { pointerId: 1, clientX: 40, clientY: 50, pressure: 0.85, timeStamp: 2500 }));
    // 이어서 도착한 pointermove가 다른 좌표·압력·과거 시각을 가져도 정본 추적 상태를 덮어쓰면 안 된다.
    const pred = pointerEvent("pointermove", { pointerId: 1, clientX: 44, clientY: 54, pressure: 0.85, timeStamp: 2508 });
    surface.el.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 1,
        clientX: 99,
        clientY: 99,
        pressure: 0.1,
        timeStamp: 1200,
        predicted: [pred],
      }),
    );

    // t=5000 stale takeover 발생 시 합성 up은 pointerrawupdate의 (40, 50)과 압력 0.85를 유지해야 한다.
    surface.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 70, clientY: 80, pressure: 0.5, timeStamp: 5000 }));
    expect(batches[3]?.[0]).toEqual(expect.objectContaining({ phase: "up", x: 40, y: 50, tMs: 5000 }));
    expect(batches[3]?.[0]?.pressure).toBeCloseTo(0.85, 5);

    detach();
    surface.dispose();
  });

  it("중복·지연 pointerup/pointercancel(요소 및 window)과 lostpointercapture 조합에서도 획당 종료(up)는 정확히 1번만 방출된다", () => {
    const { el, batches, detach } = setup();

    // 시나리오 A: lostpointercapture -> pointercancel(el) -> pointerup(el) -> pointerup(window) -> lostpointercapture
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 100 }));
    el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 20, clientY: 20, timeStamp: 110 }));
    el.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 1, clientX: 20, clientY: 20, timeStamp: 112 }));
    el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 1, clientX: 20, clientY: 20, timeStamp: 115 }));
    el.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 20, clientY: 20, timeStamp: 116 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 20, clientY: 20, timeStamp: 117 }));
    el.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 1, clientX: 20, clientY: 20, timeStamp: 118 }));

    // 시나리오 B: pointerup(window) -> pointercancel(el) -> pointerup(el)
    el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 30, clientY: 30, timeStamp: 200 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 2, clientX: 35, clientY: 35, timeStamp: 210 }));
    el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 2, clientX: 35, clientY: 35, timeStamp: 211 }));
    el.dispatchEvent(pointerEvent("pointerup", { pointerId: 2, clientX: 35, clientY: 35, timeStamp: 212 }));

    const canonical = splitPredicted(batches.flat()).canonical;
    const validation = validateCanonicalSampleStream(canonical, { requireAllClosed: true });
    expect(validation.valid).toBe(true);
    expect(validation.downCount).toBe(2);
    expect(validation.upCount).toBe(2);
    detach();
  });

  it("획 도중 detach() 호출 시 포인터 캡처 해제·리스너 누수 0·touchAction 복원·잔여 표본 0을 보장한다", () => {
    const surface = createInstrumentedPointerSurface({ enableRawUpdate: true, initialTouchAction: "manipulation" });
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(surface.el, (raw) => batches.push(raw), {
      useRawUpdate: true,
      blockContextMenu: true,
    });

    expect(surface.activeElementListenerCount()).toBeGreaterThan(0);
    expect(surface.activeWindowListenerCount()).toBe(1);
    expect(surface.el.style.touchAction).toBe("none");

    surface.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7, clientX: 15, clientY: 25, timeStamp: 500 }));
    expect(surface.activeCapturedPointers()).toEqual(new Set([7]));
    expect(batches).toHaveLength(1);

    // 획 진행 도중 detach()
    detach();
    detach(); // 멱등 호출

    expect(surface.activeCapturedPointers().size).toBe(0);
    expect(surface.activeElementListenerCount()).toBe(0);
    expect(surface.activeWindowListenerCount()).toBe(0);
    expect(surface.el.style.touchAction).toBe("manipulation");

    // detach 이후 이벤트는 표본을 절대 방출하지 않는다.
    surface.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, clientX: 30, clientY: 40, timeStamp: 510 }));
    surface.el.dispatchEvent(pointerEvent("pointerrawupdate", { pointerId: 7, clientX: 35, clientY: 45, timeStamp: 512 }));
    surface.el.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, clientX: 40, clientY: 50, timeStamp: 520 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, clientX: 40, clientY: 50, timeStamp: 521 }));
    expect(batches).toHaveLength(1);

    surface.dispose();
  });

  it("정본 정상 입력 보존: 표준 down -> coalesced/predicted move -> up 출력이 비트 단위로 동일하게 유지된다", () => {
    const { el, batches, detach } = setup();
    el.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 1,
        pointerType: "pen",
        clientX: 10,
        clientY: 20,
        pressure: 0.4,
        tiltX: 5,
        tiltY: -3,
        twist: 12,
        timeStamp: 100,
      }),
    );
    const c1 = pointerEvent("pointermove", {
      pointerId: 1,
      pointerType: "pen",
      clientX: 14,
      clientY: 24,
      pressure: 0.55,
      tiltX: 6,
      tiltY: -2,
      twist: 12,
      timeStamp: 104,
    });
    const c2 = pointerEvent("pointermove", {
      pointerId: 1,
      pointerType: "pen",
      clientX: 18,
      clientY: 28,
      pressure: 0.7,
      tiltX: 7,
      tiltY: -1,
      twist: 12,
      timeStamp: 108,
    });
    const p1 = pointerEvent("pointermove", {
      pointerId: 1,
      pointerType: "pen",
      clientX: 22,
      clientY: 32,
      pressure: 0.7,
      tiltX: 7,
      tiltY: -1,
      twist: 12,
      timeStamp: 112,
    });
    el.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 1,
        pointerType: "pen",
        clientX: 18,
        clientY: 28,
        pressure: 0.7,
        tiltX: 7,
        tiltY: -1,
        twist: 12,
        timeStamp: 108,
        coalesced: [c1, c2],
        predicted: [p1],
      }),
    );
    el.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 1,
        pointerType: "pen",
        clientX: 20,
        clientY: 30,
        pressure: 0,
        tiltX: 7,
        tiltY: -1,
        twist: 12,
        timeStamp: 116,
      }),
    );

    const flat = batches.flat();
    expect(flat).toHaveLength(5);
    expect(flat.map((s) => ({ x: s.x, y: s.y, tMs: s.tMs, phase: s.phase, source: s.source, tiltXDeg: s.tiltXDeg, tiltYDeg: s.tiltYDeg, twistDeg: s.twistDeg }))).toEqual([
      { x: 10, y: 20, tMs: 100, phase: "down", source: "raw", tiltXDeg: 5, tiltYDeg: -3, twistDeg: 12 },
      { x: 14, y: 24, tMs: 104, phase: "move", source: "coalesced", tiltXDeg: 6, tiltYDeg: -2, twistDeg: 12 },
      { x: 18, y: 28, tMs: 108, phase: "move", source: "raw", tiltXDeg: 7, tiltYDeg: -1, twistDeg: 12 },
      { x: 22, y: 32, tMs: 112, phase: "move", source: "predicted", tiltXDeg: 7, tiltYDeg: -1, twistDeg: 12 },
      { x: 20, y: 30, tMs: 116, phase: "up", source: "raw", tiltXDeg: 7, tiltYDeg: -1, twistDeg: 12 },
    ]);
    expect(flat[4]?.pressure).toBeCloseTo(0.7, 5);
    detach();
  });
});

function setRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("좌표 공간 계약: DPR·크기 변경·배율·0 크기·숨김·비유한·과대 값", () => {
  it("DPR 1 / 2 / 3과 고정·화면맞춤 문서에서 이중 DPR 곱셈 없이 정규화 위치 (0,0)·(0.5,0.5)·(1,1)이 정확한 문서 좌표에 매핑된다", () => {
    const fixedDoc = { width: 1024, height: 640 };
    for (const dpr of [1, 2, 3]) {
      // 고정 문서: 컨테이너 폭 768px에 맞춘 CSS 크기
      const scale = displayScale(fixedDoc, 768);
      const cssW = Math.round(fixedDoc.width * scale);
      const cssH = Math.round(fixedDoc.height * scale);
      const el = document.createElement("div");
      setRect(el, { left: 40, top: 80, width: cssW, height: cssH });

      const mapping = resolveSurfaceMapping(el, fixedDoc);
      expect(mapping.valid).toBe(true);
      expect(mapping.toLocal(40, 80)).toEqual({ x: 0, y: 0 });
      expect(mapping.toLocal(40 + cssW * 0.5, 80 + cssH * 0.5)).toEqual({
        x: fixedDoc.width * 0.5,
        y: fixedDoc.height * 0.5,
      });
      expect(mapping.toLocal(40 + cssW, 80 + cssH)).toEqual({
        x: fixedDoc.width,
        y: fixedDoc.height,
      });

      // 화면 맞춤 문서: fitDocumentSize(600, 400, dpr)
      const fit = fitDocumentSize(600, 400, dpr);
      const fitEl = document.createElement("div");
      setRect(fitEl, { left: 24, top: 36, width: fit.css.width, height: fit.css.height });
      const fitMapping = resolveSurfaceMapping(fitEl, fit.document);
      expect(fitMapping.valid).toBe(true);
      expect(fitMapping.toLocal(24, 36)).toEqual({ x: 0, y: 0 });
      expect(fitMapping.toLocal(24 + fit.css.width * 0.5, 36 + fit.css.height * 0.5)).toEqual({
        x: fit.document.width * 0.5,
        y: fit.document.height * 0.5,
      });
      expect(fitMapping.toLocal(24 + fit.css.width, 36 + fit.css.height)).toEqual({
        x: fit.document.width,
        y: fit.document.height,
      });
    }
  });

  it("뷰포트 크기 변경(1440 -> 768 -> 390 -> 320), 스크롤/오프셋 이동, CSS 배율(0.5x·0.75x·1.25x)에서도 기준점·중앙 교차선·외곽 획 오차가 0이다", () => {
    const doc = { width: 1024, height: 640 };
    const el = document.createElement("div");
    document.body.appendChild(el);
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(el, (raw) => batches.push(raw), { logicalSize: doc });

    const layouts = [
      { viewportW: 1440, left: 260, top: 96, cssScale: 1.0 },
      { viewportW: 768, left: 24, top: 140, cssScale: 0.75 },
      { viewportW: 390, left: 12, top: 220, cssScale: 0.5 },
      { viewportW: 320, left: 8, top: 48, cssScale: 1.25 },
    ];

    const normalizedTargets: [number, number][] = [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [0.25, 0.75],
      [0.75, 0.25],
    ];

    let t = 100;
    for (const layout of layouts) {
      const baseScale = displayScale(doc, layout.viewportW - 32);
      const rectW = doc.width * baseScale * layout.cssScale;
      const rectH = doc.height * baseScale * layout.cssScale;
      setRect(el, { left: layout.left, top: layout.top, width: rectW, height: rectH });

      batches.length = 0;
      const first = normalizedTargets[0]!;
      el.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: layout.left + first[0] * rectW,
          clientY: layout.top + first[1] * rectH,
          timeStamp: (t += 10),
        }),
      );
      for (let i = 1; i < normalizedTargets.length - 1; i += 1) {
        const u = normalizedTargets[i]!;
        el.dispatchEvent(
          pointerEvent("pointermove", {
            clientX: layout.left + u[0] * rectW,
            clientY: layout.top + u[1] * rectH,
            timeStamp: (t += 10),
          }),
        );
      }
      const last = normalizedTargets[normalizedTargets.length - 1]!;
      el.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: layout.left + last[0] * rectW,
          clientY: layout.top + last[1] * rectH,
          timeStamp: (t += 10),
        }),
      );

      const samples = batches.flat();
      expect(samples).toHaveLength(normalizedTargets.length);
      for (let i = 0; i < normalizedTargets.length; i += 1) {
        const expectedX = normalizedTargets[i]![0] * doc.width;
        const expectedY = normalizedTargets[i]![1] * doc.height;
        const err = Math.hypot((samples[i]?.x ?? 0) - expectedX, (samples[i]?.y ?? 0) - expectedY);
        expect(err).toBeLessThan(1e-9);
      }
    }
    detach();
  });

  it("0×0 사각형·숨김(display:none / visibility:hidden / hidden)·비유한 사각형에서는 획을 시작하지 않고, 복구 후 정상 동작한다", () => {
    const doc = { width: 640, height: 400 };
    const el = document.createElement("div");
    document.body.appendChild(el);
    const batches: RawSample[][] = [];
    const hovers: [number, number][] = [];
    const detach = attachPointerCapture(el, (raw) => batches.push(raw), {
      logicalSize: doc,
      onHover: (x, y) => hovers.push([x, y]),
    });

    // 1. 0×0 사각형에서 pointerdown + hover -> 무시
    setRect(el, { left: 10, top: 10, width: 0, height: 0 });
    expect(resolveSurfaceMapping(el, doc).reason).toBe("zero-rect");
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 20, clientY: 20, buttons: 0, timeStamp: 10 }));
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 20, timeStamp: 20 }));
    expect(hovers).toHaveLength(0);
    expect(batches).toHaveLength(0);

    // 2. 미소 사각형(1e-300 < MIN_VALID_RECT_SIDE_PX)에서 pointerdown -> 배율 폭주 없이 zero-rect로 거부
    setRect(el, { left: 10, top: 10, width: 1e-300, height: 1e-300 });
    expect(resolveSurfaceMapping(el, doc).reason).toBe("zero-rect");
    expect(MIN_VALID_RECT_SIDE_PX).toBe(1e-3);
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 20, timeStamp: 30 }));
    expect(batches).toHaveLength(0);

    // 3. 음수 사각형 및 비유한(NaN / Infinity) 사각형 -> 거부
    setRect(el, { left: 0, top: 0, width: -100, height: 200 });
    expect(resolveSurfaceMapping(el, doc).reason).toBe("negative-rect");
    setRect(el, { left: Number.NaN, top: 0, width: 320, height: 200 });
    expect(resolveSurfaceMapping(el, doc).reason).toBe("non-finite-rect");
    setRect(el, { left: 0, top: 0, width: Number.POSITIVE_INFINITY, height: 200 });
    expect(resolveSurfaceMapping(el, doc).reason).toBe("non-finite-rect");
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 20, timeStamp: 40 }));
    expect(batches).toHaveLength(0);

    // 4. 숨김(display: none / visibility: hidden / hidden = true) -> 거부
    setRect(el, { left: 10, top: 20, width: 320, height: 200 });
    el.style.display = "none";
    expect(resolveSurfaceMapping(el, doc).reason).toBe("surface-hidden");
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 50, clientY: 60, timeStamp: 50 }));
    expect(batches).toHaveLength(0);

    el.style.display = "block";
    el.style.visibility = "hidden";
    expect(resolveSurfaceMapping(el, doc).reason).toBe("surface-hidden");
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 50, clientY: 60, timeStamp: 60 }));
    expect(batches).toHaveLength(0);

    el.style.visibility = "visible";
    el.hidden = true;
    expect(resolveSurfaceMapping(el, doc).reason).toBe("surface-hidden");
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 50, clientY: 60, timeStamp: 70 }));
    expect(batches).toHaveLength(0);

    // 5. 재표시(hidden = false, 320×200) 후 정상 획 시작·종료
    el.hidden = false;
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 170, clientY: 120, timeStamp: 80 }));
    el.dispatchEvent(pointerEvent("pointerup", { clientX: 330, clientY: 220, timeStamp: 90 }));
    expect(batches).toHaveLength(2);
    expect(batches[0]?.[0]).toEqual(expect.objectContaining({ phase: "down", x: 320, y: 200 }));
    expect(batches[1]?.[0]).toEqual(expect.objectContaining({ phase: "up", x: 640, y: 400 }));
    detach();
  });

  it("획 도중 요소가 0×0 또는 display:none으로 무너지면 중간 move를 무시하고 pointerup은 마지막 유효 좌표에서 깔끔히 닫힌다", () => {
    const doc = { width: 400, height: 200 };
    const el = document.createElement("div");
    document.body.appendChild(el);
    setRect(el, { left: 0, top: 0, width: 200, height: 100 });
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(el, (raw) => batches.push(raw), { logicalSize: doc });

    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 50, clientY: 25, timeStamp: 100 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 100, clientY: 50, timeStamp: 110 }));
    expect(batches).toHaveLength(2);

    // 획 도중 0×0 붕괴 -> move는 무시되고 pointerup은 마지막 유효 문서 좌표(200, 100)로 종료
    setRect(el, { left: 0, top: 0, width: 0, height: 0 });
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 180, clientY: 90, timeStamp: 120 }));
    expect(batches).toHaveLength(2);
    el.dispatchEvent(pointerEvent("pointerup", { clientX: 190, clientY: 95, timeStamp: 130 }));
    expect(batches).toHaveLength(3);
    expect(batches[2]?.[0]).toEqual(expect.objectContaining({ phase: "up", x: 200, y: 100 }));

    // 크기 복구 후 다음 획이 정상 시작된다(유령 획 없음).
    setRect(el, { left: 0, top: 0, width: 200, height: 100 });
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 25, clientY: 10, timeStamp: 140 }));
    expect(batches).toHaveLength(4);
    expect(batches[3]?.[0]).toEqual(expect.objectContaining({ phase: "down", x: 50, y: 20 }));
    detach();
  });

  it("극단 유한 좌표(±1e308)는 ±MAX_SAFE_DOCUMENT_COORD_PX(±16384)로 클램프되고 비유한 clientX/clientY(NaN·Infinity)는 폐기된다", () => {
    const doc = { width: 1024, height: 640 };
    const el = document.createElement("div");
    document.body.appendChild(el);
    setRect(el, { left: 10, top: 20, width: 512, height: 320 });
    const batches: RawSample[][] = [];
    const detach = attachPointerCapture(el, (raw) => batches.push(raw), { logicalSize: doc });

    // NaN pointerdown은 시작하지 않는다.
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: Number.NaN, clientY: 50, timeStamp: 10 }));
    expect(batches).toHaveLength(0);

    // 정상 시작 후 극단 유한값(1e308, -1e308) 및 비유한 move
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 20, timeStamp: 20 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: 1e308, clientY: -1e308, timeStamp: 30 }));
    el.dispatchEvent(pointerEvent("pointermove", { clientX: Number.POSITIVE_INFINITY, clientY: 40, timeStamp: 40 }));
    el.dispatchEvent(pointerEvent("pointerup", { clientX: 266, clientY: 180, timeStamp: 50 }));

    expect(batches).toHaveLength(3);
    expect(batches[1]?.[0]).toEqual(
      expect.objectContaining({
        phase: "move",
        x: MAX_SAFE_DOCUMENT_COORD_PX,
        y: -MAX_SAFE_DOCUMENT_COORD_PX,
      }),
    );
    expect(batches[2]?.[0]).toEqual(expect.objectContaining({ phase: "up", x: 512, y: 320 }));
    detach();
  });

  it("음성 대조군(Negative Control): 이중 DPR 곱셈 또는 오프셋 미보정 매퍼는 50px 이상의 좌표 오차를 발생시켜 계약을 위반한다", () => {
    const doc = { width: 1024, height: 640 };
    const rect = { left: 120, top: 80, width: 512, height: 320 };
    const dpr = 2;
    const el = document.createElement("div");
    setRect(el, rect);

    const correct = resolveSurfaceMapping(el, doc);
    const clientX = rect.left + rect.width * 0.5;
    const clientY = rect.top + rect.height * 0.5;
    const goodPt = correct.toLocal(clientX, clientY)!;
    expect(goodPt).toEqual({ x: 512, y: 320 });

    // 의도적 결함 1: 이중 DPR 곱셈
    const buggyDoubleDprPt = {
      x: (clientX - rect.left) * (doc.width / rect.width) * dpr,
      y: (clientY - rect.top) * (doc.height / rect.height) * dpr,
    };
    const doubleDprErrorPx = Math.hypot(buggyDoubleDprPt.x - goodPt.x, buggyDoubleDprPt.y - goodPt.y);
    expect(doubleDprErrorPx).toBeGreaterThan(50);

    // 의도적 결함 2: 스크롤/바운딩 오프셋(rect.left, rect.top) 미차감
    const buggyOffsetPt = {
      x: clientX * (doc.width / rect.width),
      y: clientY * (doc.height / rect.height),
    };
    const offsetErrorPx = Math.hypot(buggyOffsetPt.x - goodPt.x, buggyOffsetPt.y - goodPt.y);
    expect(offsetErrorPx).toBeGreaterThan(50);
  });
});



