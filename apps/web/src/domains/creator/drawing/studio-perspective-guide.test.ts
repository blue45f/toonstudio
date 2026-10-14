import { describe, expect, it } from "vitest";

import { createStudioPerspectiveRuler } from "./studio-rulers";
import {
  buildPerspectiveGridSegments,
  buildVanishingGuideLines,
  clipGuideLineToCanvas,
  createDefaultPerspectiveGuide,
  normalizePerspectiveGuide,
  perspectiveGuideFromPerspectiveRuler,
  perspectiveKindForPointCount,
  perspectiveVanishingPoints,
  projectPointToLine,
  snapPointToGuides,
  vanishingPointsFromPerspectiveGuide,
} from "./studio-perspective-guide";

const CANVAS = { width: 320, height: 240 } as const;

describe("createDefaultPerspectiveGuide", () => {
  it("1점 투시는 중앙 소실점 하나만 만든다", () => {
    const guide = createDefaultPerspectiveGuide("one-point", CANVAS);
    expect(guide.left).toEqual({ x: 160, y: 120 });
    expect(guide.right).toBeUndefined();
    expect(guide.vertical).toBeUndefined();
  });

  it("2점 투시는 지평선 위 좌·우 소실점을 캔버스 밖에 만든다", () => {
    const guide = createDefaultPerspectiveGuide("two-point", CANVAS);
    expect(guide.left).toEqual({ x: -192, y: 120 });
    expect(guide.right).toEqual({ x: 512, y: 120 });
    expect(guide.vertical).toBeUndefined();
  });

  it("3점 투시는 수직 소실점을 위에 추가한다", () => {
    const guide = createDefaultPerspectiveGuide("three-point", CANVAS);
    expect(guide.vertical).toEqual({ x: 160, y: -288 });
    expect(perspectiveVanishingPoints(guide)).toHaveLength(3);
  });
});

describe("normalizePerspectiveGuide", () => {
  it("two-point에서 vertical을 버리고, 소실점이 하나면 one-point로 내린다", () => {
    const withVertical = normalizePerspectiveGuide({
      kind: "two-point",
      horizonAngle: 0,
      left: { x: 0, y: 0 },
      right: { x: 10, y: 0 },
      vertical: { x: 5, y: -10 },
    });
    expect(withVertical?.kind).toBe("two-point");
    expect(withVertical?.vertical).toBeUndefined();

    const single = normalizePerspectiveGuide({
      kind: "two-point",
      horizonAngle: 0,
      left: { x: 3, y: 4 },
    });
    expect(single?.kind).toBe("one-point");
    expect(single?.left).toEqual({ x: 3, y: 4 });
  });

  it("three-point에 vertical이 없으면 two-point로 내리고, 유효점이 없으면 null", () => {
    const downgraded = normalizePerspectiveGuide({
      kind: "three-point",
      horizonAngle: 0,
      left: { x: 0, y: 0 },
      right: { x: 10, y: 0 },
    });
    expect(downgraded?.kind).toBe("two-point");
    expect(
      normalizePerspectiveGuide({ kind: "one-point", horizonAngle: 0 }),
    ).toBeNull();
    expect(
      normalizePerspectiveGuide({
        kind: "one-point",
        horizonAngle: Number.NaN,
        left: { x: Number.NaN, y: 0 },
      }),
    ).toBeNull();
  });
});

describe("buildVanishingGuideLines / buildPerspectiveGridSegments", () => {
  it("지평선 패밀리를 포함하고 소실점 패밀리별 선을 만든다", () => {
    const guide = createDefaultPerspectiveGuide("two-point", CANVAS);
    const lines = buildVanishingGuideLines({
      guide,
      canvas: CANVAS,
      anchor: { x: 160, y: 120 },
      divisions: 3,
    });
    const families = new Set(lines.map((line) => line.family));
    expect(families).toEqual(new Set(["horizon", "left", "right"]));
    // horizon 1 + (1 + 3*2) * 2 families
    expect(lines).toHaveLength(1 + 7 * 2);
  });

  it("격자 세그먼트는 전부 캔버스 경계 안에 있다", () => {
    const guide = createDefaultPerspectiveGuide("three-point", CANVAS);
    const segments = buildPerspectiveGridSegments({
      guide,
      canvas: CANVAS,
      divisions: 4,
    });
    expect(segments.length).toBeGreaterThan(10);
    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-6);
        expect(point.x).toBeLessThanOrEqual(CANVAS.width + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(-1e-6);
        expect(point.y).toBeLessThanOrEqual(CANVAS.height + 1e-6);
      }
    }
    expect(new Set(segments.map((s) => s.family))).toEqual(
      new Set(["horizon", "left", "right", "vertical"]),
    );
  });

  it("clipGuideLineToCanvas는 밖의 선을 null로, 걸친 선을 안쪽으로 자른다", () => {
    expect(
      clipGuideLineToCanvas(
        { from: { x: -10, y: -10 }, to: { x: -5, y: -5 }, family: "left" },
        CANVAS,
      ),
    ).toBeNull();
    const clipped = clipGuideLineToCanvas(
      { from: { x: -160, y: 120 }, to: { x: 480, y: 120 }, family: "horizon" },
      CANVAS,
    );
    expect(clipped?.from).toEqual({ x: 0, y: 120 });
    expect(clipped?.to).toEqual({ x: 320, y: 120 });
  });
});

describe("snapPointToGuides", () => {
  const lines = [
    { from: { x: 0, y: 100 }, to: { x: 320, y: 100 }, family: "horizon" as const },
  ];

  it("임계 안의 점은 선 위로 투영되고, 밖의 점은 null", () => {
    expect(snapPointToGuides({ x: 50, y: 106 }, lines, 10)).toEqual({
      x: 50,
      y: 100,
    });
    expect(snapPointToGuides({ x: 50, y: 130 }, lines, 10)).toBeNull();
  });

  it("projectPointToLine은 거리를 함께 돌려준다", () => {
    const result = projectPointToLine({ x: 50, y: 106 }, lines[0]);
    expect(result.projected).toEqual({ x: 50, y: 100 });
    expect(result.distance).toBeCloseTo(6);
  });
});

describe("studio-rulers 브리지", () => {
  it("perspectiveKindForPointCount는 1–3만 허용한다", () => {
    expect(perspectiveKindForPointCount(1)).toBe("one-point");
    expect(perspectiveKindForPointCount(3)).toBe("three-point");
    expect(perspectiveKindForPointCount(0)).toBeNull();
    expect(perspectiveKindForPointCount(4)).toBeNull();
  });

  it("자 → 가이드 → 소실점 배열 왕복이 좌표를 보존한다", () => {
    const ruler = createStudioPerspectiveRuler({
      id: "r-persp",
      vanishingPoints: [
        { x: -100, y: 120 },
        { x: 420, y: 120 },
        { x: 160, y: -200 },
      ],
    });
    expect(ruler).not.toBeNull();
    const guide = perspectiveGuideFromPerspectiveRuler(ruler!);
    expect(guide?.kind).toBe("three-point");
    expect(vanishingPointsFromPerspectiveGuide(guide!)).toEqual([
      { x: -100, y: 120 },
      { x: 420, y: 120 },
      { x: 160, y: -200 },
    ]);
  });

  it("소실점이 없는 자는 null 가이드다", () => {
    expect(
      perspectiveGuideFromPerspectiveRuler({ vanishingPoints: [] }),
    ).toBeNull();
  });
});
