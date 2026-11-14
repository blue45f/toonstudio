// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adjustDrawStrokeWidth,
  clearVectorStrokeWidthBaselinesForTest,
  hasVectorStrokeWidthBaseline,
  restoreVectorStrokeWidthBaseline,
} from "./studio-line-width-adjust";
import { StudioLineWidthAdjustmentPanel } from "./StudioLineWidthAdjustmentPanel";
import type { DrawEl } from "../studio-element-model";
import { planStudioVectorEraseToIntersectionApply } from "../studio-vector-erase-to-intersection-apply";

describe("P1-11 벡터 잉크 편집 (교차점 지우기 · 선 굵기 비파괴 수정 · 원본 복원)", () => {
  beforeEach(() => {
    clearVectorStrokeWidthBaselinesForTest();
  });

  afterEach(() => {
    cleanup();
  });

  it("교점까지 지우기가 교차선 너머 삐침 구간만 절단하고 벡터 정점·필압·기울기를 유지한다", () => {
    const horizontal: DrawEl = {
      id: "vec-h",
      type: "draw",
      kind: "freehand",
      points: [0, 50, 50, 50, 100, 50],
      pressures: [0.4, 0.8, 0.6],
      tiltXs: [12, 16, 20],
      stroke: "#111111",
      strokeWidth: 4,
    };
    const verticalCutter: DrawEl = {
      id: "vec-v",
      type: "draw",
      kind: "freehand",
      points: [60, 0, 60, 100],
      stroke: "#111111",
      strokeWidth: 4,
    };

    // Click on the right overhang (x=88, y=50) beyond the x=60 intersection
    const result = planStudioVectorEraseToIntersectionApply({
      elements: [horizontal, verticalCutter],
      point: { x: 88, y: 50 },
      allocateId: () => "vec-h-piece-2",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieceCount).toBe(1);
    const trimmed = result.nextElements.find((el) => el.id === "vec-h") as DrawEl;
    expect(trimmed.type).toBe("draw");
    // Trimmed at x=60, preserving start x=0..60 and interpolated attributes
    expect(trimmed.points[0]).toBe(0);
    expect(trimmed.points[trimmed.points.length - 2]).toBeCloseTo(60, 3);
    expect(trimmed.pressures?.length).toBe(trimmed.points.length / 2);
    expect(trimmed.tiltXs?.length).toBe(trimmed.points.length / 2);
  });

  it("앞·중간·끝 구간별 비파괴 선폭 변조와 다단계 편집 후 원본 굵기 복원이 정확히 동작한다", () => {
    const baseStroke: DrawEl = {
      id: "vec-taper-1",
      type: "draw",
      kind: "freehand",
      points: [0, 0, 25, 0, 50, 0, 75, 0, 100, 0],
      pressures: [0.6, 0.7, 0.8, 0.7, 0.6],
      tiltXs: [5, 6, 7, 6, 5],
      stroke: "#222222",
      strokeWidth: 5,
    };

    // 1. Start-segment non-destructive thickening (+5px -> 2.0x at t=0, untouched at t=1)
    const startPatch = adjustDrawStrokeWidth(baseStroke, {
      action: "thicken",
      value: 5,
      segment: "start",
    });
    expect(startPatch.strokeWidth).toBe(5);
    expect(startPatch.pressures?.[0]).toBeCloseTo(1.2, 2);
    expect(startPatch.pressures?.[4]).toBeCloseTo(0.6, 3);
    expect(hasVectorStrokeWidthBaseline("vec-taper-1")).toBe(true);

    // 2. Subsequent whole-line narrowing on the already-edited stroke
    const editedOnce: DrawEl = { ...baseStroke, ...startPatch };
    const secondPatch = adjustDrawStrokeWidth(editedOnce, {
      action: "narrow",
      value: 2,
      scalePressures: true,
    });
    expect(secondPatch.strokeWidth).toBe(3);

    // 3. 1-click non-destructive original baseline restore recovers initial width=5 & pressures
    const restored = restoreVectorStrokeWidthBaseline("vec-taper-1");
    expect(restored).toEqual({
      strokeWidth: 5,
      pressures: [0.6, 0.7, 0.8, 0.7, 0.6],
    });
    expect(hasVectorStrokeWidthBaseline("vec-taper-1")).toBe(false);
  });

  it("패널에서 교점까지 지우기 빠른 토글·구간 부분 변조·벡터 원본 굵기 복원 UI를 노출한다", () => {
    const onApply = vi.fn();
    const onToggleErase = vi.fn();
    const onRestore = vi.fn();

    render(
      <StudioLineWidthAdjustmentPanel
        currentWidth={3}
        selectedVectorStrokeWidth={6}
        hasSelectedVectorStroke
        canRestoreOriginalWidth
        onRestoreOriginalWidth={onRestore}
        eraseToIntersectionActive={false}
        onToggleEraseToIntersection={onToggleErase}
        onApply={onApply}
      />,
    );

    expect(screen.getByText("벡터 비파괴")).toBeTruthy();
    expect(screen.getByText("6px → 8px")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "켜기" }));
    expect(onToggleErase).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "끝부분" }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 선에 적용" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "thicken",
        value: 2,
        segment: "end",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "선택한 벡터 선 원본 굵기 복원" }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});
