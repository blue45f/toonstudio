// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { attachPointerCapture, splitPredicted } from "./pointer-capture";

import type { RawSample } from "../engine/core/types";

interface SyntheticInit extends PointerEventInit {
  timeStamp?: number;
  coalesced?: PointerEvent[];
  predicted?: PointerEvent[];
}

/** jsdom PointerEvent에 coalesced/predicted·timeStamp를 모의로 붙인다. */
function pointerEvent(type: string, init: SyntheticInit = {}): PointerEvent {
  const { timeStamp, coalesced, predicted, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.5,
    ...rest,
  });
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
});
