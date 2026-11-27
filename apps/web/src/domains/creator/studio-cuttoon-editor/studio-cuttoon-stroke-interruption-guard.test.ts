import { afterEach, describe, expect, it } from "vitest";

import { beginStudioStrokePointerSession } from "../canvas/studio-pointer-input";
import type { DrawEl } from "../studio-element-model";
import {
  getStudioDrawingStabilityTelemetrySnapshot,
  resetStudioDrawingStabilityTelemetryForTests,
} from "./studio-cuttoon-drawing-stability-telemetry";
import {
  isStudioPalmTouchDuringActivePenStroke,
  planStudioStageDownStrokeInterruption,
  planStudioStrokeCancelOrAbortRecovery,
  shouldSalvageStudioInterruptedStroke,
  synthesizeStudioAuthoritativeFallbackPointer,
} from "./studio-cuttoon-stroke-interruption-guard";

afterEach(() => {
  resetStudioDrawingStabilityTelemetryForTests();
});

function makePointer(input: {
  pointerId: number;
  pointerType: "pen" | "touch" | "mouse";
  clientX?: number;
  clientY?: number;
  pressure?: number;
  buttons?: number;
  timeStamp?: number;
  isPrimary?: boolean;
}): PointerEvent {
  return {
    pointerId: input.pointerId,
    pointerType: input.pointerType,
    isPrimary: input.isPrimary ?? true,
    button: 0,
    buttons: input.buttons ?? 1,
    clientX: input.clientX ?? 120,
    clientY: input.clientY ?? 180,
    pressure: input.pressure ?? 0.6,
    tangentialPressure: 0,
    tiltX: 12,
    tiltY: -8,
    altitudeAngle: 1.1,
    azimuthAngle: 0.5,
    twist: 20,
    width: 2,
    height: 2,
    timeStamp: input.timeStamp ?? 100,
    getCoalescedEvents: () => [],
    getPredictedEvents: () => [],
  } as unknown as PointerEvent;
}

const activeFreehandStroke: DrawEl = {
  id: "active-pen-stroke",
  type: "draw",
  kind: "freehand",
  mode: "pen",
  brush: "pen",
  points: [20, 30, 50, 45, 85, 60],
  pressures: [0.4, 0.6, 0.55],
  stroke: "#111827",
  strokeWidth: 4,
};

const singleDotNoiseStroke: DrawEl = {
  id: "tiny-dot",
  type: "draw",
  kind: "freehand",
  mode: "pen",
  brush: "pen",
  points: [20, 30],
  pressures: [0.3],
  stroke: "#111827",
  strokeWidth: 4,
};

describe("studio-cuttoon-stroke-interruption-guard", () => {
  it("활성 펜 드로잉 진행 중 끼어든 보조 손바닥 터치(touch)를 즉시 격리 무시한다", () => {
    const penDown = makePointer({ pointerId: 11, pointerType: "pen", timeStamp: 100 });
    const penSession = beginStudioStrokePointerSession(penDown);
    const palmTouch = makePointer({
      pointerId: 99,
      pointerType: "touch",
      clientX: 400,
      clientY: 520,
      isPrimary: false,
      timeStamp: 112,
    });

    expect(isStudioPalmTouchDuringActivePenStroke(penSession, activeFreehandStroke, palmTouch)).toBe(true);

    const downPlan = planStudioStageDownStrokeInterruption({
      activeSession: penSession,
      activeDrawing: activeFreehandStroke,
      incomingPointer: palmTouch,
      lastAuthoritativePointer: penDown,
    });
    expect(downPlan).toEqual({ action: "ignore-palm-touch" });

    const cancelPlan = planStudioStrokeCancelOrAbortRecovery({
      activeSession: penSession,
      activeDrawing: activeFreehandStroke,
      cancelPointer: palmTouch,
      lastAuthoritativePointer: penDown,
    });
    expect(cancelPlan).toEqual({ action: "ignore-palm-touch" });
    expect(getStudioDrawingStabilityTelemetrySnapshot().palmTouchesIsolated).toBe(2);
  });

  it("포인터 캡처 유실·알림 후 drawing 고착 상태에서 새 주 펜 접촉이 들어오면 이전 획을 무손실 구제 확정한다", () => {
    const oldPen = makePointer({
      pointerId: 11,
      pointerType: "pen",
      clientX: 85,
      clientY: 60,
      timeStamp: 140,
    });
    const stuckSession = beginStudioStrokePointerSession(oldPen);
    // 350ms 만에(기존 2000ms 타임아웃 훨씬 전) 새 펜 pointerId 12로 다음 획을 긋기 시작
    const nextPen = makePointer({
      pointerId: 12,
      pointerType: "pen",
      clientX: 200,
      clientY: 220,
      timeStamp: 490,
    });

    const plan = planStudioStageDownStrokeInterruption({
      activeSession: stuckSession,
      activeDrawing: activeFreehandStroke,
      incomingPointer: nextPen,
      lastAuthoritativePointer: null,
    });

    expect(plan.action).toBe("salvage-stuck-and-proceed");
    if (plan.action !== "salvage-stuck-and-proceed") {
      throw new Error("고착 스트로크 구제 계획이 생성되지 않았습니다.");
    }
    expect(plan.fallbackPointer.pointerId).toBe(11);
    expect(plan.fallbackPointer.clientX).toBe(85);
    expect(plan.fallbackPointer.clientY).toBe(60);
    expect(getStudioDrawingStabilityTelemetrySnapshot().interruptedStrokesSalvaged).toBe(1);
  });

  it("창 포커스 이탈·전송 중단 시 마지막 권위 샘플을 합성 복원하여 그리던 선을 무손실 보존한다", () => {
    const penDown = makePointer({
      pointerId: 21,
      pointerType: "pen",
      clientX: 164,
      clientY: 248,
      pressure: 0.72,
      timeStamp: 320,
    });
    const session = beginStudioStrokePointerSession(penDown);

    const recovery = planStudioStrokeCancelOrAbortRecovery({
      activeSession: session,
      activeDrawing: activeFreehandStroke,
      cancelPointer: null,
      lastAuthoritativePointer: null,
    });

    expect(recovery.action).toBe("salvage-commit");
    if (recovery.action !== "salvage-commit") {
      throw new Error("창 포커스 이탈 구제 계획이 생성되지 않았습니다.");
    }
    expect(recovery.fallbackPointer.pointerId).toBe(21);
    expect(recovery.fallbackPointer.pointerType).toBe("pen");
    expect(recovery.fallbackPointer.clientX).toBe(164);
    expect(recovery.fallbackPointer.clientY).toBe(248);
    expect(recovery.fallbackPointer.pressure).toBe(0.72);
    expect(recovery.fallbackPointer.tiltX).toBe(12);
    expect(recovery.fallbackPointer.tiltY).toBe(-8);
  });

  it("손가락 드로잉 중 두 번째 손가락 핀치 전환은 구제하지 않고 취소하며, 무의미한 미세 노이즈는 폐기한다", () => {
    const finger1 = makePointer({ pointerId: 1, pointerType: "touch", timeStamp: 50 });
    const fingerSession = beginStudioStrokePointerSession(finger1);
    const finger2 = makePointer({ pointerId: 2, pointerType: "touch", isPrimary: false, timeStamp: 70 });

    const multiTouchPlan = planStudioStageDownStrokeInterruption({
      activeSession: fingerSession,
      activeDrawing: activeFreehandStroke,
      incomingPointer: finger2,
      lastAuthoritativePointer: finger1,
    });
    expect(multiTouchPlan).toEqual({ action: "discard-finger-for-multitouch" });

    const touchCancel = planStudioStrokeCancelOrAbortRecovery({
      activeSession: fingerSession,
      activeDrawing: activeFreehandStroke,
      cancelPointer: finger1,
      lastAuthoritativePointer: finger1,
    });
    expect(touchCancel).toEqual({ action: "discard" });

    const subPixelJitter: DrawEl = {
      ...singleDotNoiseStroke,
      points: [20, 30, 20.1, 30.1],
      pressures: [0.1, 0.1],
    };
    // 점 1개 이하이거나 이동 거리가 극미세한 미완성 접촉은 구제 대상이 아니다.
    expect(shouldSalvageStudioInterruptedStroke(null)).toBe(false);
    expect(
      shouldSalvageStudioInterruptedStroke({
        ...subPixelJitter,
        kind: "rect",
        points: [20, 30, 20.2, 30.2],
      }),
    ).toBe(false);

    const synthesized = synthesizeStudioAuthoritativeFallbackPointer(sessionOrNull(), null, finger1);
    expect(synthesized.clientX).toBe(finger1.clientX);
  });
});

function sessionOrNull() {
  return null;
}
