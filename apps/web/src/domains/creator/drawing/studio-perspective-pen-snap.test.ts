import { describe, expect, it } from "vitest";

import {
  createDefaultPerspectiveGuide,
  warpPerspectivePointForFisheye,
} from "./studio-perspective-guide";
import {
  createPerspectivePenSnapSession,
  isPerspectivePenSnapActive,
  snapPerspectivePenPoint,
  snapStrokePointsToPerspectiveGuide,
  unwarpPerspectivePointFromFisheye,
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
    const result = snapPerspectivePenPoint(session, { x: 20, y: 132 });
    expect(result.snapped).toBe(true);
    expect(result.point.y).toBeCloseTo(120);
  });

  it("allowHorizonSnap=true이면 지평선 평행 가로 이동 시 horizon 패밀리에 스냅한다", () => {
    const onePoint = createDefaultPerspectiveGuide("one-point", CANVAS); // 중앙 VP (160, 120)
    // 시작점 (160, 40)에서 수평 오른쪽(200, 41)으로 이동하면 중앙 VP 방향(수직)보다 수평 지평선이 가깝다
    const session = createPerspectivePenSnapSession(
      { enabled: true, guide: onePoint, allowHorizonSnap: true },
      { x: 160, y: 40 },
    );
    const snapped = snapPerspectivePenPoint(session, { x: 200, y: 42 });
    expect(snapped.snapped).toBe(true);
    expect(snapped.family).toBe("horizon");
    expect(snapped.point.y).toBeCloseTo(40, 3);
  });

  it("maxSnapAngleDeg 범위를 벗어난 자유 각도 드로잉은 freehandPassthrough로 통과시킨다", () => {
    const onePoint = createDefaultPerspectiveGuide("one-point", CANVAS); // 중앙 VP (160, 120)
    // 시작점 (160, 40) → VP 광선은 수직(90도). 수평(0도)으로 그으면 90도 차이 > maxSnapAngleDeg(20도)
    const session = createPerspectivePenSnapSession(
      { enabled: true, guide: onePoint, maxSnapAngleDeg: 20 },
      { x: 160, y: 40 },
    );
    const first = snapPerspectivePenPoint(session, { x: 200, y: 40 });
    expect(first.snapped).toBe(false);
    expect(first.session?.freehandPassthrough).toBe(true);
    expect(first.point).toEqual({ x: 200, y: 40 });

    // 이후 샘플도 계속 스냅 없이 원본 좌표를 유지한다
    const second = snapPerspectivePenPoint(first.session, { x: 230, y: 65 });
    expect(second.snapped).toBe(false);
    expect(second.point).toEqual({ x: 230, y: 65 });
  });

  it("5점 어안(fisheyeStrength > 0) 설정 시 역왜곡-투영-재왜곡으로 곡선 궤적에 스냅한다", () => {
    const strength = 0.6;
    const rawPt = { x: 250, y: 50 };
    const warped = warpPerspectivePointForFisheye(rawPt, CANVAS, strength);
    const unwarped = unwarpPerspectivePointFromFisheye(warped, CANVAS, strength);
    expect(unwarped.x).toBeCloseTo(rawPt.x, 3);
    expect(unwarped.y).toBeCloseTo(rawPt.y, 3);

    const session = createPerspectivePenSnapSession(
      {
        enabled: true,
        guide,
        fisheyeStrength: strength,
        canvas: CANVAS,
      },
      { x: 160, y: 40 },
    );
    const res = snapPerspectivePenPoint(session, { x: 220, y: 65 });
    expect(res.snapped).toBe(true);
    expect(Number.isFinite(res.point.x)).toBe(true);
    expect(Number.isFinite(res.point.y)).toBe(true);
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
