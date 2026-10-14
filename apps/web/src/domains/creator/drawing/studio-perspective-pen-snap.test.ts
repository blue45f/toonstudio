import { describe, expect, it } from "vitest";

import { createDefaultPerspectiveGuide } from "./studio-perspective-guide";
import {
  createPerspectivePenSnapSession,
  isPerspectivePenSnapActive,
  snapPerspectivePenPoint,
  snapStrokePointsToPerspectiveGuide,
  type PerspectivePenSnapConfig,
} from "./studio-perspective-pen-snap";

const CANVAS = { width: 320, height: 240 } as const;
const guide = createDefaultPerspectiveGuide("two-point", CANVAS);
const activeConfig: PerspectivePenSnapConfig = {
  enabled: true,
  guide,
};

describe("isPerspectivePenSnapActive / 세션 열기", () => {
  it("끄면 세션이 열리지 않는다 (기존 동작과 동일)", () => {
    expect(isPerspectivePenSnapActive(activeConfig)).toBe(true);
    expect(
      isPerspectivePenSnapActive({ ...activeConfig, enabled: false }),
    ).toBe(false);
    expect(
      isPerspectivePenSnapActive({ ...activeConfig, snapEnabled: false }),
    ).toBe(false);
    expect(isPerspectivePenSnapActive({ enabled: true, guide: null })).toBe(
      false,
    );
    expect(
      createPerspectivePenSnapSession(
        { ...activeConfig, enabled: false },
        { x: 10, y: 10 },
      ),
    ).toBeNull();
  });

  it("null 세션에 샘플을 넣으면 입력 그대로 돌아온다", () => {
    const result = snapPerspectivePenPoint(null, { x: 7, y: 9 });
    expect(result.point).toEqual({ x: 7, y: 9 });
    expect(result.snapped).toBe(false);
    expect(result.session).toBeNull();
  });
});

describe("snapPerspectivePenPoint", () => {
  it("최소 이동 전에는 확정하지 않고, 이동하면 가까운 소실점으로 확정한다", () => {
    const session = createPerspectivePenSnapSession(activeConfig, {
      x: 160,
      y: 60,
    });
    expect(session).not.toBeNull();
    const tiny = snapPerspectivePenPoint(session, { x: 161, y: 61 });
    expect(tiny.snapped).toBe(false);
    expect(tiny.session?.lockedVanishingPoint).toBeNull();

    // 오른쪽 아래 대각선 이동 → right VP(512,120) 방향이 더 가깝다
    const moved = snapPerspectivePenPoint(tiny.session, { x: 200, y: 90 });
    expect(moved.snapped).toBe(true);
    expect(moved.family).toBe("right");
    expect(moved.session?.lockedVanishingPoint).toEqual({ x: 512, y: 120 });
  });

  it("확정 후 샘플은 시작점–소실점 직선 위에 있다", () => {
    const session = createPerspectivePenSnapSession(activeConfig, {
      x: 160,
      y: 60,
    });
    const first = snapPerspectivePenPoint(session, { x: 200, y: 90 });
    const next = snapPerspectivePenPoint(first.session, { x: 260, y: 40 });
    expect(next.snapped).toBe(true);
    // 직선 (160,60)-(512,120) 위: 방향 벡터와 수직인 성분이 0이어야 한다
    const dx = 512 - 160;
    const dy = 120 - 60;
    const cross =
      (next.point.x - 160) * dy - (next.point.y - 60) * dx;
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it("반대 방향으로 그어도 같은 직선으로 확정한다(직선은 양방향)", () => {
    const onePoint = createDefaultPerspectiveGuide("one-point", CANVAS);
    const session = createPerspectivePenSnapSession(
      { enabled: true, guide: onePoint },
      { x: 60, y: 120 },
    );
    // 중앙 VP(160,120)의 반대 방향(왼쪽)으로 이동해도 수평 직선에 붙는다
    const result = snapPerspectivePenPoint(session, { x: 20, y: 132 });
    expect(result.snapped).toBe(true);
    expect(result.point.y).toBeCloseTo(120);
  });
});

describe("snapStrokePointsToPerspectiveGuide", () => {
  const stroke = [
    { x: 160, y: 60 },
    { x: 200, y: 90 },
    { x: 260, y: 40 },
    { x: 300, y: 130 },
  ];

  it("비활성이면 입력 배열을 동일 참조로 돌려준다", () => {
    const result = snapStrokePointsToPerspectiveGuide(stroke, {
      ...activeConfig,
      enabled: false,
    });
    expect(result).toBe(stroke);
  });

  it("활성이면 두 번째 점부터 가이드 직선 위로 스냅된다", () => {
    const result = snapStrokePointsToPerspectiveGuide(stroke, activeConfig);
    expect(result[0]).toEqual(stroke[0]);
    const dx = 512 - 160;
    const dy = 120 - 60;
    for (const point of result.slice(1)) {
      const cross = (point.x - 160) * dy - (point.y - 60) * dx;
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    }
  });

  it("빈 배열은 그대로 돌려준다", () => {
    const empty: Array<{ x: number; y: number }> = [];
    expect(snapStrokePointsToPerspectiveGuide(empty, activeConfig)).toBe(empty);
  });
});
