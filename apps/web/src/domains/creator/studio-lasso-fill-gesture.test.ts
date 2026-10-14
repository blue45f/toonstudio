import { describe, expect, it } from "vitest";

import {
  beginStudioLassoFillDrag,
  endStudioLassoFillDrag,
  isStudioLassoFillPathEnclosing,
  moveStudioLassoFillDrag,
  STUDIO_LASSO_FILL_MIN_POINT_DISTANCE_PX,
} from "./studio-lasso-fill-gesture";

describe("studio-lasso-fill-gesture", () => {
  it("기본 포인터로 시작하면 첫 점이 기록되고 차단되지 않는다", () => {
    const gesture = beginStudioLassoFillDrag(null, {
      pointerId: 1,
      point: { x: 10, y: 10 },
      button: 0,
      isPrimary: true,
    });
    expect(gesture.blocked).toBe(false);
    expect(gesture.points).toEqual([{ x: 10, y: 10 }]);
  });

  it("오른쪽 버튼이나 비기본 포인터로 시작하면 차단된다", () => {
    const byButton = beginStudioLassoFillDrag(null, {
      pointerId: 1,
      point: { x: 0, y: 0 },
      button: 2,
    });
    expect(byButton.blocked).toBe(true);
    const bySecondary = beginStudioLassoFillDrag(null, {
      pointerId: 2,
      point: { x: 0, y: 0 },
      isPrimary: false,
    });
    expect(bySecondary.blocked).toBe(true);
  });

  it("최소 거리보다 짧은 움직임은 점을 추가하지 않고 같은 객체를 돌려준다", () => {
    const gesture = beginStudioLassoFillDrag(null, { pointerId: 1, point: { x: 0, y: 0 } });
    const moved = moveStudioLassoFillDrag(gesture, 1, {
      x: STUDIO_LASSO_FILL_MIN_POINT_DISTANCE_PX - 1,
      y: 0,
    });
    expect(moved).toBe(gesture);
    const far = moveStudioLassoFillDrag(gesture, 1, { x: 10, y: 0 });
    expect(far.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("다른 포인터의 움직임은 무시한다", () => {
    const gesture = beginStudioLassoFillDrag(null, { pointerId: 1, point: { x: 0, y: 0 } });
    expect(moveStudioLassoFillDrag(gesture, 99, { x: 50, y: 50 })).toBe(gesture);
  });

  it("두 번째 포인터가 닿으면 제스처가 차단되고 경로는 무효가 된다", () => {
    let gesture = beginStudioLassoFillDrag(null, { pointerId: 1, point: { x: 0, y: 0 } });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 20, y: 0 });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 20, y: 20 });
    gesture = beginStudioLassoFillDrag(gesture, { pointerId: 2, point: { x: 5, y: 5 } });
    expect(gesture.blocked).toBe(true);
    const ended = endStudioLassoFillDrag(gesture, 1, { x: 0, y: 20 });
    expect(ended.path).toBeNull();
  });

  it("정상 종료하면 종료점까지 포함한 경로를 돌려준다", () => {
    let gesture = beginStudioLassoFillDrag(null, { pointerId: 1, point: { x: 0, y: 0 } });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 20, y: 0 });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 20, y: 20 });
    const ended = endStudioLassoFillDrag(gesture, 1, { x: 0, y: 20 });
    expect(ended.gesture).toBeNull();
    expect(ended.path).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]);
  });

  it("취소된 드래그는 경로를 돌려주지 않는다", () => {
    let gesture = beginStudioLassoFillDrag(null, { pointerId: 1, point: { x: 0, y: 0 } });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 20, y: 0 });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 20, y: 20 });
    const ended = endStudioLassoFillDrag(gesture, 1, { x: 0, y: 20 }, true);
    expect(ended.path).toBeNull();
    expect(ended.gesture).toBeNull();
  });

  it("직선 드래그는 면적이 없어 둘러싸기로 성립하지 않는다", () => {
    let gesture = beginStudioLassoFillDrag(null, { pointerId: 1, point: { x: 0, y: 5 } });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 10, y: 5 });
    gesture = moveStudioLassoFillDrag(gesture, 1, { x: 20, y: 5 });
    const ended = endStudioLassoFillDrag(gesture, 1);
    expect(ended.path).toBeNull();
    expect(
      isStudioLassoFillPathEnclosing([
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        { x: 20, y: 5 },
      ]),
    ).toBe(false);
    expect(
      isStudioLassoFillPathEnclosing([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe(false);
  });
});
