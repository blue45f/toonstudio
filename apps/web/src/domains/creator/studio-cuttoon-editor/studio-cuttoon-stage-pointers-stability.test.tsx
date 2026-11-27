// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DrawEl } from "../studio-element-model";
import { resetStudioRejectedStrokeRecovery } from "../studio-rejected-stroke-recovery";
import { resetStudioReliabilityStatus } from "../studio-reliability-status-store";
import { disposeStudioSafeModeRuntime } from "../studio-safe-mode-runtime";
import { resetStudioStrokeFocusActivityForTests } from "../studio-stroke-focus-activity";
import { StudioReliabilityStatusRail } from "../StudioReliabilityStatusRail";
import { resetStudioDrawingStabilityTelemetryForTests } from "./studio-cuttoon-drawing-stability-telemetry";
import {
  createLiveStageStabilityHarness,
  createTestStagePointerEvent,
} from "./studio-cuttoon-stage-pointers-stability-fixture";

afterEach(() => {
  cleanup();
  disposeStudioSafeModeRuntime();
  resetStudioReliabilityStatus();
  resetStudioRejectedStrokeRecovery();
  resetStudioStrokeFocusActivityForTests();
  resetStudioDrawingStabilityTelemetryForTests();
  vi.restoreAllMocks();
});

describe("실제 /studio 스테이지 포인터 파이프라인 드로잉 안정성 직결 통합 검증", () => {
  it("라이브 스테이지에서 신발끈 점프와 0.02->0.95->0 압력 스파이크는 제거하고 정상 빠른 해칭은 그대로 커밋한다", () => {
    const h = createLiveStageStabilityHarness();
    try {
      const down = createTestStagePointerEvent("pointerdown", {
        pointerId: 5,
        pointerType: "pen",
        clientX: 20,
        clientY: 40,
        pressure: 0.5,
        timeStamp: 100,
      });
      h.stage.setPointersPositions(down);
      h.pointers.onStageDown(h.stageEvent(down));

      const coalescedMoves = [
        createTestStagePointerEvent("pointermove", {
          pointerId: 5, pointerType: "pen", clientX: 30, clientY: 40, pressure: 0.54, timeStamp: 108,
        }),
        createTestStagePointerEvent("pointermove", {
          pointerId: 5, pointerType: "pen", clientX: 40, clientY: 40, pressure: 0.52, timeStamp: 116,
        }),
        createTestStagePointerEvent("pointermove", {
          pointerId: 5, pointerType: "pen", clientX: 50, clientY: 40, pressure: 0.02, timeStamp: 124,
        }),
        createTestStagePointerEvent("pointermove", {
          pointerId: 5, pointerType: "pen", clientX: 58, clientY: 40, pressure: 0.95, timeStamp: 132,
        }),
      ];
      const moveParent = createTestStagePointerEvent("pointermove", {
        pointerId: 5,
        pointerType: "pen",
        clientX: 58,
        clientY: 40,
        pressure: 0.95,
        timeStamp: 132,
        coalesced: coalescedMoves,
      });
      h.windowTarget.dispatchEvent(moveParent);

      // 펜을 떼는 순간 8ms 만에 (58,40) -> (58, 175)로 튀는 신발끈 스파이크
      const up = createTestStagePointerEvent("pointerup", {
        pointerId: 5,
        pointerType: "pen",
        clientX: 58,
        clientY: 175,
        pressure: 0,
        timeStamp: 140,
      });
      h.windowTarget.dispatchEvent(up);

      expect(h.committedBatches).toHaveLength(1);
      const committed = h.committedBatches[0]?.[0] as DrawEl;
      expect(committed.type).toBe("draw");
      for (let i = 1; i < committed.points.length; i += 2) {
        expect(committed.points[i]).toBe(40);
      }
      expect(committed.pressures?.at(-1)).toBeLessThan(0.25);

      // 이어서 정상적인 빠른 해칭 직선을 그으면 끝점까지 온전히 보존된다.
      const hatchDown = createTestStagePointerEvent("pointerdown", {
        pointerId: 6, pointerType: "pen", clientX: 100, clientY: 100, pressure: 0.4, timeStamp: 200,
      });
      h.stage.setPointersPositions(hatchDown);
      h.pointers.onStageDown(h.stageEvent(hatchDown));

      const hatchMoves = [1, 2, 3, 4].map((step) =>
        createTestStagePointerEvent("pointermove", {
          pointerId: 6,
          pointerType: "pen",
          clientX: 100 + step * 40,
          clientY: 100 + step * 10,
          pressure: 0.55 - step * 0.08,
          timeStamp: 200 + step * 8,
        }),
      );
      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointermove", {
          pointerId: 6,
          pointerType: "pen",
          clientX: 260,
          clientY: 140,
          pressure: 0.23,
          timeStamp: 232,
          coalesced: hatchMoves,
        }),
      );
      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointerup", {
          pointerId: 6,
          pointerType: "pen",
          clientX: 300,
          clientY: 150,
          pressure: 0,
          timeStamp: 240,
        }),
      );

      const hatchCommitted = h.committedBatches.at(-1)?.at(-1) as DrawEl;
      expect(hatchCommitted.points.slice(-2)).toEqual([300, 150]);
    } finally {
      h.transport.dispose();
    }
  });

  it("펜 드로잉 중 보조 손바닥 터치(down/move/cancel/up)가 끼어들어도 커서와 획이 오염되지 않는다", () => {
    const h = createLiveStageStabilityHarness({ palmRejectionSetting: false });
    try {
      const penDown = createTestStagePointerEvent("pointerdown", {
        pointerId: 10, pointerType: "pen", clientX: 50, clientY: 60, pressure: 0.6, timeStamp: 10,
      });
      h.stage.setPointersPositions(penDown);
      h.pointers.onStageDown(h.stageEvent(penDown));

      const cursorCallsAfterPenDown = h.cursorPosition.mock.calls.length;

      const palmDown = createTestStagePointerEvent("pointerdown", {
        pointerId: 77, pointerType: "touch", clientX: 500, clientY: 600, pressure: 0.8, timeStamp: 14, isPrimary: false,
      });
      const palmMove = createTestStagePointerEvent("pointermove", {
        pointerId: 77, pointerType: "touch", clientX: 520, clientY: 610, pressure: 0.8, timeStamp: 18, isPrimary: false,
      });
      const palmCancel = createTestStagePointerEvent("pointercancel", {
        pointerId: 77, pointerType: "touch", clientX: 520, clientY: 610, pressure: 0, timeStamp: 22, isPrimary: false,
      });
      const palmUp = createTestStagePointerEvent("pointerup", {
        pointerId: 77, pointerType: "touch", clientX: 520, clientY: 610, pressure: 0, timeStamp: 24, isPrimary: false,
      });

      h.pointers.onStageDown(h.stageEvent(palmDown));
      h.pointers.onStageMove(h.stageEvent(palmMove));
      h.pointers.onStagePointerCancel(h.stageEvent(palmCancel));
      h.pointers.onStageUp(h.stageEvent(palmUp));

      expect(h.hideCursorSpy).not.toHaveBeenCalled();
      expect(h.cursorPosition).toHaveBeenCalledTimes(cursorCallsAfterPenDown);
      expect(h.drawingRef.current).not.toBeNull();

      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointermove", {
          pointerId: 10, pointerType: "pen", clientX: 90, clientY: 80, pressure: 0.5, timeStamp: 30,
        }),
      );
      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointerup", {
          pointerId: 10, pointerType: "pen", clientX: 120, clientY: 95, pressure: 0, timeStamp: 38,
        }),
      );

      expect(h.committedBatches).toHaveLength(1);
      const finished = h.committedBatches[0]?.[0] as DrawEl;
      expect(finished.points).toEqual([50, 60, 90, 80, 120, 95]);
    } finally {
      h.transport.dispose();
    }
  });

  it("창 포커스 이탈(visibilitychange) 및 캡처 유실 고착 시 그리던 선을 무손실 확정하고 새 선도 즉시 시작한다", () => {
    render(<StudioReliabilityStatusRail />);
    const h = createLiveStageStabilityHarness();
    try {
      const penDown = createTestStagePointerEvent("pointerdown", {
        pointerId: 31, pointerType: "pen", clientX: 30, clientY: 30, pressure: 0.5, timeStamp: 100,
      });
      h.stage.setPointersPositions(penDown);
      h.pointers.onStageDown(h.stageEvent(penDown));

      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointermove", {
          pointerId: 31, pointerType: "pen", clientX: 80, clientY: 60, pressure: 0.65, timeStamp: 112,
        }),
      );
      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointermove", {
          pointerId: 31, pointerType: "pen", clientX: 140, clientY: 90, pressure: 0.6, timeStamp: 124,
        }),
      );

      act(() => {
        h.setVisibilityState("hidden");
        h.documentTarget.dispatchEvent(new Event("visibilitychange"));
      });

      expect(h.drawingRef.current).toBeNull();
      expect(h.committedBatches).toHaveLength(1);
      const salvaged = h.committedBatches[0]?.[0] as DrawEl;
      expect(salvaged.points).toEqual([30, 30, 80, 60, 140, 90]);

      // 이어서 캡처 유실로 pointerup 없이 멈춘 두 번째 획 직후(200ms 뒤) 새 펜 접촉 시 즉시 구제 + 새 획 진입
      h.setVisibilityState("visible");
      const stuckDown = createTestStagePointerEvent("pointerdown", {
        pointerId: 32, pointerType: "pen", clientX: 10, clientY: 200, pressure: 0.5, timeStamp: 300,
      });
      h.stage.setPointersPositions(stuckDown);
      h.pointers.onStageDown(h.stageEvent(stuckDown));
      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointermove", {
          pointerId: 32, pointerType: "pen", clientX: 60, clientY: 220, pressure: 0.55, timeStamp: 316,
        }),
      );

      // pointerup 없이 200ms 뒤 새 pointerId 33 진입 -> 2초 대기 없이 직전 획 구제 확정 후 새 획 즉시 시작!
      const nextPenDown = createTestStagePointerEvent("pointerdown", {
        pointerId: 33, pointerType: "pen", clientX: 150, clientY: 250, pressure: 0.6, timeStamp: 520,
      });
      h.stage.setPointersPositions(nextPenDown);
      h.pointers.onStageDown(h.stageEvent(nextPenDown));

      expect(h.committedBatches).toHaveLength(2);
      expect(h.drawingRef.current?.points).toEqual([150, 250]);

      const chip = screen.getByRole("button", { name: /저장·GPU·저장소 상태/ });
      act(() => {
        fireEvent.click(chip);
      });
      const stabilityCell = document.querySelector(
        '[data-studio-reliability-detail-channel="drawing-stability"]',
      );
      expect(stabilityCell?.textContent).toContain("단절 복구 2건");
    } finally {
      h.transport.dispose();
    }
  });

  it("실제 배치 경로에서 240Hz 과밀 직선 포인트는 병합하고 >= 18° 코너 포인트는 100% 보존한다", () => {
    const h = createLiveStageStabilityHarness();
    try {
      const penDown = createTestStagePointerEvent("pointerdown", {
        pointerId: 41, pointerType: "pen", clientX: 0, clientY: 0, pressure: 0.5, timeStamp: 10,
      });
      h.stage.setPointersPositions(penDown);
      h.pointers.onStageDown(h.stageEvent(penDown));

      const denseSamples: PointerEvent[] = [];
      for (let i = 1; i <= 6; i += 1) {
        denseSamples.push(
          createTestStagePointerEvent("pointermove", {
            pointerId: 41,
            pointerType: "pen",
            clientX: i * 2,
            clientY: 0,
            pressure: 0.5,
            timeStamp: 10 + i * 4,
          }),
        );
      }
      for (let j = 1; j <= 4; j += 1) {
        denseSamples.push(
          createTestStagePointerEvent("pointermove", {
            pointerId: 41,
            pointerType: "pen",
            clientX: 12 + j * 2,
            clientY: j * 2,
            pressure: 0.5,
            timeStamp: 34 + j * 4,
          }),
        );
      }

      h.windowTarget.dispatchEvent(
        createTestStagePointerEvent("pointermove", {
          pointerId: 41,
          pointerType: "pen",
          clientX: 20,
          clientY: 8,
          pressure: 0.5,
          timeStamp: 50,
          coalesced: denseSamples,
        }),
      );

      const live = h.drawingRef.current;
      if (!live) throw new Error("라이브 자유선 초안이 생성되지 않았습니다.");
      const recordedCount = Math.floor(live.points.length / 2);
      expect(recordedCount).toBeLessThan(11);
      const pairs: Array<[number, number]> = [];
      for (let k = 0; k + 1 < live.points.length; k += 2) {
        pairs.push([live.points[k] ?? 0, live.points[k + 1] ?? 0]);
      }
      expect(pairs).toContainEqual([12, 0]);
      expect(pairs.at(-1)).toEqual([20, 8]);
    } finally {
      h.transport.dispose();
    }
  });
});
