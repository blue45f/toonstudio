import { describe, expect, it } from "vitest";

import { createSpatialPanelGeometry } from "./spatial-reader-surface";

describe("공간 리더 컷 곡면", () => {
  it.each([
    ["cylinder-90deg-canopy", 90],
    ["dome-120deg-cinema", 120],
  ] as const)("%s의 왼쪽과 오른쪽 끝이 지정한 중심각을 이룬다", (surface, degrees) => {
    const width = 1.3;
    const geometry = createSpatialPanelGeometry(width, 1.65, surface);
    const { widthSegments, heightSegments } = geometry.parameters;
    const position = geometry.getAttribute("position");
    const midRow = Math.floor(heightSegments / 2) * (widthSegments + 1);
    const edgeX = position.getX(midRow + widthSegments);
    const edgeZ = position.getZ(midRow + widthSegments);
    const radius = width / (degrees * Math.PI / 180);
    expect(2 * Math.atan2(edgeX, radius - edgeZ) * 180 / Math.PI).toBeCloseTo(degrees, 4);
    expect(position.getX(midRow)).toBeCloseTo(-edgeX);
    expect(position.getZ(midRow)).toBeCloseTo(edgeZ);
    // 돔은 가로 중앙의 위아래 끝도 시청자 쪽으로 굽고, 원통의 같은 선은 수직이다.
    const topCenterZ = position.getZ(widthSegments / 2);
    if (surface === "dome-120deg-cinema") expect(topCenterZ).toBeGreaterThan(0.05);
    else expect(topCenterZ).toBeCloseTo(0);
    expect(geometry.getAttribute("uv").count).toBe(position.count);
    geometry.dispose();
  });

  it("평면 컷은 네 꼭짓점 모두 같은 깊이에서 원화 비율을 유지한다", () => {
    const geometry = createSpatialPanelGeometry(1.25, 1.65, "floating-panel-stack");
    const positions = geometry.getAttribute("position");
    expect(positions.count).toBe(4);
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getZ(i)).toBe(0);
      expect(Math.abs(positions.getX(i))).toBeCloseTo(0.625);
      expect(Math.abs(positions.getY(i))).toBeCloseTo(0.825);
    }
    geometry.dispose();
  });
});
