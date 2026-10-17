import { describe, expect, it } from "vitest";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { studioFaceModelingExtent } from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  checkStudioFaceModelingDistance,
  formatStudioFaceModelingDistance,
  niceStudioFaceModelingStep,
  parseStudioFaceDrawCoordinate,
  parseStudioFaceModelingDistance,
  snapStudioFaceDrawPoint,
  stepStudioFaceModelingDistance,
  studioFaceDrawClientToPoint,
  studioFaceDrawGridStep,
  studioFaceDrawViewBox,
  studioFaceModelingHandleFraction,
  studioFaceModelingHandleValue,
  studioFaceModelingPreviewCost,
  studioFaceModelingRangeView,
  studioFaceModelingStepSize,
  type StudioFaceModelingDistanceTool,
} from "./studio-hybrid-dcc-face-modeling-session";
import {
  previewStudioHybridDccFaceModeling,
  studioHybridDccFaceModelingRange,
  type StudioFaceModelingRequest,
} from "./studio-hybrid-dcc-face-modeling-workspace";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
} from "./studio-hybrid-dcc-workspace";

describe("면 모델링 화면 규칙: 눈금과 거리 입력", () => {
  it("눈금은 1-2-5 열로 맞추고 도구 해상도(0.1 mm) 아래로는 내려가지 않는다", () => {
    expect(niceStudioFaceModelingStep(0.0173)).toBe(0.02);
    expect(niceStudioFaceModelingStep(0.0894)).toBe(0.1);
    expect(niceStudioFaceModelingStep(0.004)).toBe(0.005);
    expect(niceStudioFaceModelingStep(0.00001)).toBe(1e-4);
    expect(niceStudioFaceModelingStep(0)).toBe(1e-4);
    expect(niceStudioFaceModelingStep(Number.NaN)).toBe(1e-4);
    expect(studioFaceModelingStepSize(1.73)).toBe(0.02);
    expect(studioFaceModelingStepSize(0.05)).toBe(0.0005);
  });

  it("거리 문자열은 단위·사칙연산을 읽고 각도·잘못된 식은 거부한다", () => {
    const value = (text: string) => parseStudioFaceModelingDistance(text);
    expect(value("")).toEqual({ kind: "empty" });
    expect(value("   ")).toEqual({ kind: "empty" });
    expect(value("0.25")).toEqual({ kind: "value", value: 0.25 });
    expect(value("25cm")).toEqual({ kind: "value", value: 0.25 });
    expect(value("250mm")).toEqual({ kind: "value", value: 0.25 });
    expect(value("1m+25cm")).toEqual({ kind: "value", value: 1.25 });
    expect(value("-5cm")).toEqual({ kind: "value", value: -0.05 });
    expect(value("abc")).toEqual({ kind: "invalid" });
    expect(value("45deg")).toEqual({ kind: "invalid" });
    expect(value("1/0")).toEqual({ kind: "invalid" });
    expect(value("1e99")).toEqual({ kind: "invalid" });
    expect(parseStudioFaceDrawCoordinate("-25cm")).toBe(-0.25);
    expect(parseStudioFaceDrawCoordinate("x")).toBeNull();
  });

  it("표시 문자열은 소수 넷째 자리까지, 불필요한 0과 -0은 없앤다", () => {
    expect(formatStudioFaceModelingDistance(0.25)).toBe("0.25");
    expect(formatStudioFaceModelingDistance(-0.25)).toBe("-0.25");
    expect(formatStudioFaceModelingDistance(2)).toBe("2");
    expect(formatStudioFaceModelingDistance(1000)).toBe("1000");
    expect(formatStudioFaceModelingDistance(-0.00001)).toBe("0");
    expect(formatStudioFaceModelingDistance(0)).toBe("0");
    expect(formatStudioFaceModelingDistance(0.30000000000000004)).toBe("0.3");
  });
});

describe("면 모델링 화면 규칙: 허용 구간과 부호 검증", () => {
  it("허용 구간은 0에서 멀어지지 않는 쪽으로 해상도에 맞춰 끝값이 항상 유효하다", () => {
    const view = studioFaceModelingRangeView({ minDistance: -0.40009, maxDistance: 1.23456789 }, 1);
    expect(view.allowed).toEqual({ min: -0.4, max: 1.2345 });
    expect(view.handle).toEqual({ min: -0.4, max: 1.2345 });
    const zero = studioFaceModelingRangeView({ minDistance: 0, maxDistance: 0.3 }, 1);
    expect(Object.is(zero.allowed.min, 0)).toBe(true);
    expect(Object.is(zero.handle.min, 0)).toBe(true);
  });

  it("핸들 구간은 허용 구간을 모델 크기의 2배 안으로 줄인다(입력 구간은 그대로)", () => {
    const view = studioFaceModelingRangeView({ minDistance: -50, maxDistance: 1000 }, 0.1);
    expect(view.allowed).toEqual({ min: -50, max: 1000 });
    expect(view.handle).toEqual({ min: -0.2, max: 0.2 });
  });

  it("밀기/당기기만 음수를 받고 안쪽 테두리·오프셋은 0보다 큰 값만 받는다", () => {
    const allowed = { min: -0.4, max: 1.2 };
    expect(checkStudioFaceModelingDistance("push-pull", -0.3, allowed)).toEqual({ ok: true, distance: -0.3 });
    expect(checkStudioFaceModelingDistance("push-pull", 0.3, allowed)).toEqual({ ok: true, distance: 0.3 });
    for (const tool of ["inset", "offset"] as const satisfies readonly StudioFaceModelingDistanceTool[]) {
      expect(checkStudioFaceModelingDistance(tool, -0.1, { min: 0, max: 0.4 })).toEqual({
        ok: false,
        reason: "negative-not-allowed",
      });
      expect(checkStudioFaceModelingDistance(tool, 0.1, { min: 0, max: 0.4 })).toEqual({ ok: true, distance: 0.1 });
    }
  });

  it("0·범위 초과·너무 깊은 당기기·움직일 여유 없음을 구분해 한계값과 함께 알린다", () => {
    const allowed = { min: -0.4, max: 1.2 };
    expect(checkStudioFaceModelingDistance("push-pull", 0, allowed)).toEqual({ ok: false, reason: "zero" });
    expect(checkStudioFaceModelingDistance("push-pull", 0.00004, allowed)).toEqual({ ok: false, reason: "zero" });
    expect(checkStudioFaceModelingDistance("push-pull", 1.3, allowed)).toEqual({
      ok: false,
      reason: "above-max",
      limit: 1.2,
    });
    expect(checkStudioFaceModelingDistance("push-pull", -0.5, allowed)).toEqual({
      ok: false,
      reason: "below-min",
      limit: 0.4,
    });
    expect(checkStudioFaceModelingDistance("push-pull", 0.1, { min: -0.4, max: 0 })).toEqual({
      ok: false,
      reason: "no-room",
      side: "push",
    });
    expect(checkStudioFaceModelingDistance("push-pull", -0.1, { min: 0, max: 1 })).toEqual({
      ok: false,
      reason: "no-room",
      side: "pull",
    });
  });

  it("끝값은 부동소수점 여유 안에서 받는다", () => {
    const allowed = { min: -0.4, max: 1.2 };
    expect(checkStudioFaceModelingDistance("push-pull", 1.2 + 1e-6, allowed).ok).toBe(true);
    expect(checkStudioFaceModelingDistance("push-pull", -0.4 - 1e-6, allowed).ok).toBe(true);
    expect(checkStudioFaceModelingDistance("push-pull", 1.2 + 1e-3, allowed).ok).toBe(false);
  });
});

describe("면 모델링 화면 규칙: 키보드 단계와 핸들 좌표", () => {
  const bounds = { min: -0.4, max: 1.2 };

  it("한 단계는 기본·Shift(1/10)·PageUp/PageDown(10배)이고 부동소수점 찌꺼기가 없다", () => {
    expect(stepStudioFaceModelingDistance(null, 1, "normal", 0.02, bounds)).toBe(0.02);
    expect(stepStudioFaceModelingDistance(null, -1, "normal", 0.02, bounds)).toBe(-0.02);
    expect(stepStudioFaceModelingDistance(0.1, 1, "fine", 0.02, bounds)).toBe(0.102);
    expect(stepStudioFaceModelingDistance(0.1, 1, "coarse", 0.02, bounds)).toBe(0.3);
    expect(stepStudioFaceModelingDistance(0.1, 1, "normal", 0.1, bounds)).toBe(0.2);
    expect(stepStudioFaceModelingDistance(0.2, 1, "normal", 0.1, bounds)).toBe(0.3);
  });

  it("결과는 항상 구간 안이고 끝에서는 더 나가지 않는다", () => {
    expect(stepStudioFaceModelingDistance(1.19, 1, "coarse", 0.02, bounds)).toBe(1.2);
    expect(stepStudioFaceModelingDistance(1.2, 1, "normal", 0.02, bounds)).toBe(1.2);
    expect(stepStudioFaceModelingDistance(-0.39, -1, "coarse", 0.02, bounds)).toBe(-0.4);
    expect(stepStudioFaceModelingDistance(0, -1, "normal", 0.02, { min: 0, max: 0.4 })).toBe(0);
  });

  it("해상도보다 작은 눈금은 해상도로 올려 쓴다", () => {
    expect(stepStudioFaceModelingDistance(0, 1, "fine", 0.0005, bounds)).toBe(0.0001);
  });

  it("핸들 위치와 거리는 서로 오가며 양 끝은 정확히 구간의 끝값이다", () => {
    expect(studioFaceModelingHandleFraction(-0.4, bounds)).toBe(0);
    expect(studioFaceModelingHandleFraction(1.2, bounds)).toBe(1);
    expect(studioFaceModelingHandleFraction(0, bounds)).toBeCloseTo(0.25, 12);
    expect(studioFaceModelingHandleFraction(null, bounds)).toBeCloseTo(0.25, 12);
    expect(studioFaceModelingHandleFraction(9, bounds)).toBe(1);
    expect(studioFaceModelingHandleFraction(5, { min: 1, max: 1 })).toBe(0);
    expect(studioFaceModelingHandleValue(0, bounds)).toBe(-0.4);
    expect(studioFaceModelingHandleValue(1, bounds)).toBe(1.2);
    expect(studioFaceModelingHandleValue(-3, bounds)).toBe(-0.4);
    expect(studioFaceModelingHandleValue(7, bounds)).toBe(1.2);
    expect(studioFaceModelingHandleValue(Number.NaN, bounds)).toBe(-0.4);
    for (const fraction of [0.1, 0.25, 0.5, 0.77, 0.999]) {
      const value = studioFaceModelingHandleValue(fraction, bounds);
      expect(value).toBeGreaterThanOrEqual(bounds.min);
      expect(value).toBeLessThanOrEqual(bounds.max);
      // 눈금(span/200 → 0.01)에 붙어 소수 둘째 자리 이하의 값이 된다.
      expect(Math.abs(value - Number(value.toFixed(2)))).toBeLessThan(1e-9);
      expect(studioFaceModelingHandleFraction(value, bounds)).toBeCloseTo(fraction, 2);
    }
  });

  it("핸들 위치가 단조 증가해 끌수록 거리가 줄어드는 일이 없다", () => {
    let previous = Number.NEGATIVE_INFINITY;
    for (let step = 0; step <= 400; step += 1) {
      const value = studioFaceModelingHandleValue(step / 400, bounds);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("면 모델링 화면 규칙: 허용 구간의 끝값을 커널이 실제로 받아 준다", () => {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("session-range"), "cube");
  const extent = studioFaceModelingExtent(workspace.session.state.geometry.records.cube!.mesh);
  const source = workspaceComponentSelectionSource(workspace)!;
  const selection = (() => {
    const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
      mode: "face",
      operation: "replace",
      ids: [3],
      activeId: 3,
      source,
    });
    if (!result.ok) throw new Error("selection");
    return result.value;
  })();

  it.each([
    ["push-pull", "inward"],
    ["inset", "inward"],
    ["offset", "inward"],
  ] as const)("%s(%s): 입력 구간과 핸들 구간의 양 끝이 모두 미리보기에 성공한다", (tool, direction) => {
    const range = studioHybridDccFaceModelingRange(workspace, selection, tool, direction);
    if (!range.ok) throw new Error(range.detail);
    const view = studioFaceModelingRangeView(range.value, extent);
    const ends = [view.allowed.max, view.handle.max, view.allowed.min, view.handle.min]
      .filter((value) => Math.abs(value) >= 1e-4);
    expect(ends.length).toBeGreaterThan(1);
    for (const distance of ends) {
      const request: StudioFaceModelingRequest = tool === "offset"
        ? { tool, distance, direction }
        : { tool, distance };
      const preview = previewStudioHybridDccFaceModeling(workspace, selection, request);
      expect(preview.ok, `${tool} ${distance}`).toBe(true);
    }
  });

  it("허용 구간을 한 걸음이라도 넘으면 커널이 거부해 화면 검증과 같은 결론이다", () => {
    const range = studioHybridDccFaceModelingRange(workspace, selection, "inset", "inward");
    if (!range.ok) throw new Error(range.detail);
    const view = studioFaceModelingRangeView(range.value, extent);
    const over = view.allowed.max + 0.05;
    expect(checkStudioFaceModelingDistance("inset", over, view.allowed).ok).toBe(false);
    expect(previewStudioHybridDccFaceModeling(workspace, selection, { tool: "inset", distance: over }).ok).toBe(false);
  });
});

describe("면 모델링 화면 규칙: 그리기 패드 좌표", () => {
  const outline = [[-0.5, -0.25], [0.5, -0.25], [0.5, 0.25], [-0.5, 0.25]] as const;

  it("뷰박스는 윤곽을 모두 담고 세로 v의 부호를 뒤집는다", () => {
    const box = studioFaceDrawViewBox(outline);
    expect(box.width).toBeCloseTo(1.2, 9);
    expect(box.height).toBeCloseTo(0.7, 9);
    expect(box.x).toBeCloseTo(-0.6, 9);
    expect(box.y).toBeCloseTo(-0.35, 9);
    expect(studioFaceDrawViewBox([])).toEqual({ x: -1, y: -1, width: 2, height: 2 });
  });

  it("화면 좌표는 위쪽이 +v인 면 좌표로 바뀌고 여백(가운데 맞춤)을 정확히 반영한다", () => {
    const box = studioFaceDrawViewBox(outline);
    // 뷰박스 비율과 같은 사각형: 중심은 면 중심(0, 0)이다.
    const exact = { left: 10, top: 20, width: 600, height: 350 };
    const center = studioFaceDrawClientToPoint(box, exact, 310, 195)!;
    expect(center[0]).toBeCloseTo(0, 9);
    expect(center[1]).toBeCloseTo(0, 9);
    const upperRight = studioFaceDrawClientToPoint(box, exact, 10 + 600 * (1.1 / 1.2), 20 + 350 * (0.1 / 0.7))!;
    expect(upperRight[0]).toBeCloseTo(0.5, 9);
    expect(upperRight[1]).toBeCloseTo(0.25, 9);
    // 가로로 넓은 상자: 좌우에 남는 여백 때문에 같은 점이 옆으로 밀려 있어야 한다.
    const wide = { left: 0, top: 0, width: 1200, height: 350 };
    const wideCenter = studioFaceDrawClientToPoint(box, wide, 600, 175)!;
    expect(wideCenter[0]).toBeCloseTo(0, 9);
    expect(wideCenter[1]).toBeCloseTo(0, 9);
  });

  it("크기가 0인 상자나 잘못된 뷰박스는 점을 만들지 않는다", () => {
    const box = studioFaceDrawViewBox(outline);
    expect(studioFaceDrawClientToPoint(box, { left: 0, top: 0, width: 0, height: 10 }, 1, 1)).toBeNull();
    expect(studioFaceDrawClientToPoint({ x: 0, y: 0, width: 0, height: 1 }, { left: 0, top: 0, width: 10, height: 10 }, 1, 1)).toBeNull();
  });

  it("격자는 면 짧은 쪽의 약 1/12 눈금이고 점은 격자에 붙으며 -0이 없다", () => {
    expect(studioFaceDrawGridStep(outline)).toBe(0.05);
    expect(studioFaceDrawGridStep([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])).toBe(0.1);
    expect(snapStudioFaceDrawPoint([0.137, -0.2149], 0.05)).toEqual([0.15, -0.2]);
    const snapped = snapStudioFaceDrawPoint([-0.001, 0.0004], 0.05);
    expect(Object.is(snapped[0], 0)).toBe(true);
    expect(Object.is(snapped[1], 0)).toBe(true);
    expect(snapStudioFaceDrawPoint([0.137, 0.2], 0)).toEqual([0.137, 0.2]);
  });
});

describe("면 모델링 미리보기 비용", () => {
  it("메시 면 수에 선택 면 수의 3배를 더한다", () => {
    expect(studioFaceModelingPreviewCost(1000, 0)).toBe(1000);
    expect(studioFaceModelingPreviewCost(1000, 100)).toBe(1300);
    expect(studioFaceModelingPreviewCost(0, 0)).toBe(0);
  });
});
