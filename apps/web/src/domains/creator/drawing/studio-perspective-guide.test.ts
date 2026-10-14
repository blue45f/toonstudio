import { describe, expect, it } from "vitest";

import { createStudioPerspectiveRuler } from "./studio-rulers";
import {
  buildPerspectiveAuxiliarySegments,
  buildPerspectiveDisplaySegments,
  buildPerspectiveGridSegments,
  buildPerspectiveGuideSegments,
  buildVanishingGuideLines,
  clipGuideLineToCanvas,
  createDefaultPerspectiveGuide,
  createPerspectiveGuideFromScenePreset,
  isPerspectiveScenePresetId,
  normalizePerspectiveGuide,
  normalizePerspectiveGridDensity,
  PERSPECTIVE_GRID_DENSITY_DIVISIONS,
  PERSPECTIVE_SCENE_PRESETS,
  perspectiveGridDivisionsForDensity,
  perspectiveGuideFromPerspectiveRuler,
  perspectiveKindForPointCount,
  perspectiveScenePresetById,
  perspectiveVanishingPoints,
  projectPointToLine,
  snapPointToGuides,
  vanishingPointsFromPerspectiveGuide,
  warpPerspectivePointForFisheye,
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

describe("장면 프리셋 (PERSPECTIVE_SCENE_PRESETS)", () => {
  it("프리셋 6종이 있고 id가 유일하며 종류·수평선이 정합하다", () => {
    expect(PERSPECTIVE_SCENE_PRESETS).toHaveLength(6);
    const ids = PERSPECTIVE_SCENE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(6);
    for (const preset of PERSPECTIVE_SCENE_PRESETS) {
      expect(isPerspectiveScenePresetId(preset.id)).toBe(true);
      expect(preset.left.yRatio).toBeCloseTo(preset.horizonYRatio);
      if (preset.right) {
        expect(preset.right.yRatio).toBeCloseTo(preset.horizonYRatio);
      }
      const guide = createPerspectiveGuideFromScenePreset(preset.id, CANVAS);
      expect(guide).not.toBeNull();
      expect(guide!.kind).toBe(preset.kind);
      expect(normalizePerspectiveGuide(guide!)).toEqual(guide);
      const segments = buildPerspectiveGridSegments({ guide: guide!, canvas: CANVAS });
      expect(segments.length).toBeGreaterThan(0);
    }
    expect(isPerspectiveScenePresetId("nope")).toBe(false);
    expect(perspectiveScenePresetById("nope")).toBeNull();
    expect(createPerspectiveGuideFromScenePreset("nope", CANVAS)).toBeNull();
  });

  it("복도 프리셋은 중앙 1점·수평선 0.46 배치다", () => {
    const guide = createPerspectiveGuideFromScenePreset("corridor", CANVAS)!;
    expect(guide.kind).toBe("one-point");
    expect(guide.left!.x).toBeCloseTo(160);
    expect(guide.left!.y).toBeCloseTo(110.4);
    expect(guide.right).toBeUndefined();
    expect(guide.vertical).toBeUndefined();
  });

  it("거리 프리셋은 비대칭 2점이고 좌·우 소실점이 수평선 높이를 공유한다", () => {
    const guide = createPerspectiveGuideFromScenePreset("street", CANVAS)!;
    expect(guide.kind).toBe("two-point");
    expect(guide.left!.y).toBeCloseTo(guide.right!.y);
    expect(Math.abs(guide.left!.x - 160)).not.toBeCloseTo(
      Math.abs(guide.right!.x - 160),
    );
  });

  it("올려보기는 수평선이 아래·수직 소실점이 위, 내려보기는 그 반대다", () => {
    const up = createPerspectiveGuideFromScenePreset("high-rise-up", CANVAS)!;
    expect(up.kind).toBe("three-point");
    expect(up.left!.y).toBeGreaterThan(CANVAS.height / 2);
    expect(up.vertical!.y).toBeLessThan(0);
    expect(up.vertical!.x).toBeCloseTo(160);

    const down = createPerspectiveGuideFromScenePreset("overlook-down", CANVAS)!;
    expect(down.kind).toBe("three-point");
    expect(down.left!.y).toBeLessThan(CANVAS.height / 2);
    expect(down.vertical!.y).toBeGreaterThan(CANVAS.height);
  });

  it("프리셋 가이드는 캔버스 크기에 비례하고, 유효하지 않은 캔버스는 null", () => {
    const big = createPerspectiveGuideFromScenePreset("corridor", {
      width: 640,
      height: 480,
    })!;
    expect(big.left!.x).toBeCloseTo(320);
    expect(big.left!.y).toBeCloseTo(220.8);
    expect(
      createPerspectiveGuideFromScenePreset("corridor", { width: 0, height: 240 }),
    ).toBeNull();
    expect(
      createPerspectiveGuideFromScenePreset("corridor", {
        width: Number.NaN,
        height: 240,
      }),
    ).toBeNull();
  });

  it("프리셋 격자에서도 스냅이 동작한다 (복도 수평선으로 투영)", () => {
    const guide = createPerspectiveGuideFromScenePreset("corridor", CANVAS)!;
    const segments = buildPerspectiveGridSegments({ guide, canvas: CANVAS });
    const snapped = snapPointToGuides({ x: 100, y: 115 }, segments, 10);
    expect(snapped).not.toBeNull();
    expect(snapped!.y).toBeCloseTo(110.4, 5);
  });
});

describe("격자 밀도", () => {
  it("밀도 이름과 divisions 매핑이 안정적이고, 모르는 값은 standard", () => {
    expect(PERSPECTIVE_GRID_DENSITY_DIVISIONS).toEqual({
      sparse: 3,
      standard: 6,
      dense: 10,
      fine: 16,
    });
    expect(perspectiveGridDivisionsForDensity("dense")).toBe(10);
    expect(perspectiveGridDivisionsForDensity(undefined)).toBe(6);
    expect(normalizePerspectiveGridDensity("fine")).toBe("fine");
    expect(normalizePerspectiveGridDensity("huge")).toBe("standard");
  });

  it("밀도가 오르면 세그먼트가 늘고, standard는 종전 기본값과 같다", () => {
    const guide = createDefaultPerspectiveGuide("two-point", CANVAS);
    const count = (density: "sparse" | "standard" | "dense" | "fine") =>
      buildPerspectiveGridSegments({ guide, canvas: CANVAS, density }).length;
    expect(count("sparse")).toBeLessThan(count("standard"));
    expect(count("standard")).toBeLessThan(count("dense"));
    expect(count("dense")).toBeLessThan(count("fine"));
    expect(
      buildPerspectiveGridSegments({ guide, canvas: CANVAS, density: "standard" }),
    ).toEqual(buildPerspectiveGridSegments({ guide, canvas: CANVAS }));
    expect(
      buildVanishingGuideLines({
        guide,
        canvas: CANVAS,
        anchor: { x: 160, y: 120 },
        density: "fine",
        divisions: 3,
      }),
    ).toEqual(
      buildVanishingGuideLines({
        guide,
        canvas: CANVAS,
        anchor: { x: 160, y: 120 },
        divisions: 3,
      }),
    );
  });
});

describe("피쉬아이 표시 모드", () => {
  const guide = createDefaultPerspectiveGuide("two-point", CANVAS);

  it("linear(기본)는 종전 격자와 완전히 동일하다", () => {
    expect(buildPerspectiveDisplaySegments({ guide, canvas: CANVAS })).toEqual(
      buildPerspectiveGridSegments({ guide, canvas: CANVAS }),
    );
    expect(
      buildPerspectiveDisplaySegments({
        guide,
        canvas: CANVAS,
        displayMode: "fisheye",
        fisheyeStrength: 0,
      }),
    ).toEqual(buildPerspectiveGridSegments({ guide, canvas: CANVAS }));
  });

  it("fisheye는 세그먼트가 늘고 전부 캔버스 안에 있으며 직선과 달라진다", () => {
    const linear = buildPerspectiveDisplaySegments({ guide, canvas: CANVAS });
    const fish = buildPerspectiveDisplaySegments({
      guide,
      canvas: CANVAS,
      displayMode: "fisheye",
    });
    expect(fish.length).toBeGreaterThan(linear.length);
    expect(fish).not.toEqual(linear);
    for (const segment of fish) {
      for (const point of [segment.from, segment.to]) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-6);
        expect(point.x).toBeLessThanOrEqual(CANVAS.width + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(-1e-6);
        expect(point.y).toBeLessThanOrEqual(CANVAS.height + 1e-6);
      }
    }
  });

  it("왜곡된 중간점은 원래 직선의 현(chord)에서 벗어난다 — 곡선이다", () => {
    const warpedFrom = warpPerspectivePointForFisheye({ x: 0, y: 40 }, CANVAS, 0.6);
    const warpedTo = warpPerspectivePointForFisheye({ x: 320, y: 40 }, CANVAS, 0.6);
    const warpedMid = warpPerspectivePointForFisheye({ x: 160, y: 40 }, CANVAS, 0.6);
    const chordMidY = (warpedFrom.y + warpedTo.y) / 2;
    expect(Math.abs(warpedMid.y - chordMidY)).toBeGreaterThan(1);
    expect(warpPerspectivePointForFisheye({ x: 160, y: 120 }, CANVAS, 1)).toEqual({
      x: 160,
      y: 120,
    });
  });

  it("곡선 근사 세그먼트에도 snapPointToGuides가 붙는다", () => {
    const fish = buildPerspectiveDisplaySegments({
      guide,
      canvas: CANVAS,
      displayMode: "fisheye",
    });
    const target = fish[Math.floor(fish.length / 2)];
    const mid = {
      x: (target.from.x + target.to.x) / 2 + 2,
      y: (target.from.y + target.to.y) / 2 + 2,
    };
    expect(snapPointToGuides(mid, fish, 10)).not.toBeNull();
  });
});

describe("보조 격자 (동심원·방사)", () => {
  it("none·유효하지 않은 캔버스는 빈 배열이다", () => {
    expect(
      buildPerspectiveAuxiliarySegments({ canvas: CANVAS, kind: "none" }),
    ).toEqual([]);
    expect(
      buildPerspectiveAuxiliarySegments({
        canvas: { width: 0, height: 0 },
        kind: "radial",
      }),
    ).toEqual([]);
  });

  it("동심원은 auxiliary 패밀리로 캔버스 안에서만 그려진다", () => {
    const segments = buildPerspectiveAuxiliarySegments({
      canvas: CANVAS,
      kind: "concentric",
    });
    expect(segments.length).toBeGreaterThan(40);
    expect(new Set(segments.map((s) => s.family))).toEqual(new Set(["auxiliary"]));
    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-6);
        expect(point.x).toBeLessThanOrEqual(CANVAS.width + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(-1e-6);
        expect(point.y).toBeLessThanOrEqual(CANVAS.height + 1e-6);
      }
    }
  });

  it("방사는 스포크 수만큼의 직선을 중심 기준으로 만든다", () => {
    const segments = buildPerspectiveAuxiliarySegments({
      canvas: CANVAS,
      kind: "radial",
      spokes: 8,
    });
    expect(segments).toHaveLength(8);
    expect(new Set(segments.map((s) => s.family))).toEqual(new Set(["auxiliary"]));
  });

  it("통합 빌더는 기본값에서 종전 격자와 같고, 보조를 켜면 auxiliary가 붙는다", () => {
    const guide = createDefaultPerspectiveGuide("two-point", CANVAS);
    expect(buildPerspectiveGuideSegments({ guide, canvas: CANVAS })).toEqual(
      buildPerspectiveGridSegments({ guide, canvas: CANVAS }),
    );
    const withAux = buildPerspectiveGuideSegments({
      guide,
      canvas: CANVAS,
      options: { auxiliaryKind: "radial" },
    });
    expect(withAux.length).toBeGreaterThan(
      buildPerspectiveGridSegments({ guide, canvas: CANVAS }).length,
    );
    expect(withAux.some((s) => s.family === "auxiliary")).toBe(true);
    expect(withAux.some((s) => s.family === "horizon")).toBe(true);
  });
});
