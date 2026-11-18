import { describe, expect, it } from "vitest";

import {
  STUDIO_FLASH_SUBTOOL_PRESETS,
  flashVariantToFocusLinesPatch,
  planStudioFlashGeometry,
} from "./studio-flash-geometry";

import type { StudioFlashVariant } from "./studio-flash-geometry";

describe("studio-flash-geometry", () => {
  it("5종 플래시 보조 도구(flash, dense-flash, sea-urchin, firework, flash-pattern)를 결정적으로 생성한다", () => {
    const variants: readonly StudioFlashVariant[] = [
      "flash",
      "dense-flash",
      "sea-urchin",
      "firework",
      "flash-pattern",
    ];

    for (const variant of variants) {
      expect(STUDIO_FLASH_SUBTOOL_PRESETS[variant]).toBeDefined();
      const a = planStudioFlashGeometry({ variant, seed: `s-${variant}` });
      const b = planStudioFlashGeometry({ variant, seed: `s-${variant}` });
      expect(a).toEqual(b);
      expect(a.rays.length).toBeGreaterThan(20);
      expect(a.corePolygon.points.every((v) => Number.isFinite(v))).toBe(true);
      const patch = flashVariantToFocusLinesPatch(variant);
      expect(patch.lineCount).toBeGreaterThan(0);
    }
  });

  it("StreamUseJag·StreamJagNumber·StreamJagLength·ConcentrateStreamFillOpacity를 코어 별 다각형에 정확히 반영한다", () => {
    const jaggedShort = planStudioFlashGeometry({
      variant: "flash",
      seed: 10,
      centerX: 200,
      centerY: 200,
      innerRadiusX: 80,
      innerRadiusY: 80,
      streamUseJag: true,
      streamJagNumber: 20,
      streamJagLength: 10,
      concentrateStreamFillOpacity: 0.65,
    });
    const jaggedLong = planStudioFlashGeometry({
      variant: "flash",
      seed: 10,
      centerX: 200,
      centerY: 200,
      innerRadiusX: 80,
      innerRadiusY: 80,
      streamUseJag: true,
      streamJagNumber: 20,
      streamJagLength: 45,
      concentrateStreamFillOpacity: 0.65,
    });

    expect(jaggedShort.corePolygon.jagEnabled).toBe(true);
    expect(jaggedShort.corePolygon.jagPeakCount).toBe(20);
    // 20개 봉우리 + 20개 골짜기 = 정확히 40정점.
    expect(jaggedShort.corePolygon.vertices).toHaveLength(40);
    expect(jaggedShort.corePolygon.fillOpacity).toBeCloseTo(0.65, 5);

    const maxRadius = (verts: readonly { readonly x: number; readonly y: number }[]) =>
      Math.max(...verts.map((v) => Math.hypot(v.x - 200, v.y - 200)));

    expect(maxRadius(jaggedLong.corePolygon.vertices)).toBeGreaterThan(
      maxRadius(jaggedShort.corePolygon.vertices) + 20,
    );

    const smoothSeaUrchin = planStudioFlashGeometry({
      variant: "sea-urchin",
      seed: 10,
      concentrateStreamFillOpacity: 0,
    });
    expect(smoothSeaUrchin.corePolygon.jagEnabled).toBe(false);
    expect(smoothSeaUrchin.corePolygon.fillOpacity).toBe(0);
  });

  it("불꽃(firework) 변형은 중심 폭발과 방사형 위성 폭발 군집들을 함께 생성한다", () => {
    const firework = planStudioFlashGeometry({
      variant: "firework",
      seed: "sparkle-scene",
      centerX: 400,
      centerY: 500,
      innerRadiusX: 70,
      outerRadius: 240,
      fireworkSatelliteCount: 6,
    });

    // 중심 1개 + 위성 6개 = 7개 클러스터.
    expect(firework.clusters).toHaveLength(7);
    expect(firework.clusters[0]?.center).toEqual({ x: 400, y: 500 });
    for (let i = 1; i < firework.clusters.length; i += 1) {
      const sat = firework.clusters[i]!;
      const dist = Math.hypot(sat.center.x - 400, sat.center.y - 500);
      expect(dist).toBeGreaterThan(80);
      expect(sat.scale).toBeLessThan(firework.clusters[0]!.scale);
      expect(sat.rays.length).toBeGreaterThanOrEqual(16);
    }

    const totalClusterRays = firework.clusters.reduce((acc, c) => acc + c.rays.length, 0);
    expect(firework.rays).toHaveLength(totalClusterRays);
  });

  it("패턴 플래시(flash-pattern)는 4주기 교차 길이 리듬을 형성한다", () => {
    const patterned = planStudioFlashGeometry({
      variant: "flash-pattern",
      seed: 7,
      rayLengthJitter: 0,
    });
    const r0 = patterned.rays[0]!;
    const r1 = patterned.rays[1]!;
    const r2 = patterned.rays[2]!;
    expect(r0.lengthPx).toBeGreaterThan(r2.lengthPx);
    expect(r2.lengthPx).toBeGreaterThan(r1.lengthPx);
  });
});
