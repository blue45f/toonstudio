// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { DEFAULT_INPUT_CONFIG, InputPipeline } from "../engine/input/input-pipeline";
import { applyStrokeStream } from "../engine/input/stages/chain";
import { createCornerGateStage } from "../engine/input/stages/corner-gate";
import { createLazyBrushStageFromPct } from "../engine/input/stages/lazy-brush";
import { createPenSpringStageFromPct } from "../engine/input/stages/pen-spring";

import { attachPointerCapture, splitPredicted } from "./pointer-capture";
import {
  createInstrumentedPointerSurface,
  MAX_HEAP_DELTA_BYTES,
  MAX_REPLAY_SEEDS,
  MAX_WALL_MS,
  runSeededPointerReplay,
  validateCanonicalSampleStream,
} from "./pointer-replay-harness";
import { createSpeedPressureSimulator } from "./pressure-sim";

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

  it(`시드 1..${MAX_REPLAY_SEEDS} 유계 리플레이 스위트: 수명주기·predicted 격리·리스너/캡처 정리·파이프라인 연동을 검증한다`, () => {
    const startWallMs = performance.now();
    const startHeapBytes = typeof process !== "undefined" && typeof process.memoryUsage === "function" ? process.memoryUsage().heapUsed : 0;

    const pipeline = new InputPipeline(DEFAULT_INPUT_CONFIG);
    const speedSim = createSpeedPressureSimulator();
    const lazyGate = createCornerGateStage(createLazyBrushStageFromPct(60));
    const penGate = createCornerGateStage(createPenSpringStageFromPct(60));

    let totalStrokes = 0;

    for (let seed = 1; seed <= MAX_REPLAY_SEEDS; seed += 1) {
      const closeOpen = seed % 2 === 0;
      const result = runSeededPointerReplay(seed, {
        maxEvents: 48,
        closeOpenStrokeBeforeDetach: closeOpen,
      });

      expect(result.validation.valid, `seed=${seed} violations: ${result.validation.violations.join("; ")}`).toBe(true);
      expect(result.validation.predictedInCanonicalCount, `seed=${seed}`).toBe(0);
      if (closeOpen) {
        expect(result.validation.downCount, `seed=${seed}`).toBe(result.validation.upCount);
      } else {
        expect(result.validation.downCount - result.validation.upCount).toBeGreaterThanOrEqual(0);
        expect(result.validation.downCount - result.validation.upCount).toBeLessThanOrEqual(1);
      }
      expect(result.activeElementListenersAfterDetach, `seed=${seed} el listeners`).toBe(0);
      expect(result.activeWindowListenersAfterDetach, `seed=${seed} win listeners`).toBe(0);
      expect(result.activeCapturedPointersAfterDetach, `seed=${seed} captures`).toBe(0);
      expect(result.postDetachSampleCount, `seed=${seed} post-detach samples`).toBe(0);
      expect(result.touchActionRestored, `seed=${seed} touchAction`).toBe(true);

      // 각 완결된 획을 SpeedPressureSimulator + 단계 + InputPipeline에 통과시켜 유한성·단조성 확인
      for (const stroke of result.validation.strokes) {
        const lastSample = stroke[stroke.length - 1];
        if (!lastSample || lastSample.phase !== "up") {
          // 열린 채 detach된 획은 cancel(reset) 후 다음 획에 누수가 없는지 확인
          speedSim.apply(stroke);
          speedSim.reset();
          lazyGate.apply(stroke);
          lazyGate.reset();
          penGate.apply(stroke);
          penGate.reset();
          pipeline.push(stroke);
          pipeline.reset();
          continue;
        }
        totalStrokes += 1;
        const pressured = speedSim.apply(stroke);
        const stagedLazy = applyStrokeStream(lazyGate, pressured);
        const stagedPen = applyStrokeStream(penGate, pressured);
        const modeled = [...pipeline.push(stagedLazy).committed, ...pipeline.finish()];

        for (const seq of [pressured, stagedLazy, stagedPen, modeled]) {
          for (let i = 0; i < seq.length; i += 1) {
            const s = seq[i];
            expect(Number.isFinite(s?.x), `seed=${seed}`).toBe(true);
            expect(Number.isFinite(s?.y), `seed=${seed}`).toBe(true);
            expect(Number.isFinite(s?.tMs), `seed=${seed}`).toBe(true);
            expect(Number.isFinite(s?.pressure), `seed=${seed}`).toBe(true);
          }
        }
        for (let i = 1; i < modeled.length; i += 1) {
          expect(modeled[i]?.tMs, `seed=${seed} modeled monotonic`).toBeGreaterThanOrEqual(modeled[i - 1]?.tMs ?? 0);
        }
      }
    }

    const elapsedWallMs = performance.now() - startWallMs;
    const endHeapBytes = typeof process !== "undefined" && typeof process.memoryUsage === "function" ? process.memoryUsage().heapUsed : 0;
    const heapDeltaBytes = Math.max(0, endHeapBytes - startHeapBytes);

    expect(totalStrokes).toBeGreaterThan(30);
    expect(elapsedWallMs).toBeLessThan(MAX_WALL_MS);
    expect(heapDeltaBytes).toBeLessThan(MAX_HEAP_DELTA_BYTES);
  });
});


