import { describe, expect, it } from "vitest";

import {
  getStudioHybridDccPbrPreset,
  resolveStudioHybridDccPhysicalProps,
  STUDIO_HYBRID_DCC_PBR_PRESETS,
} from "./studio-hybrid-dcc-pbr-presets";

describe("studio-hybrid-dcc-pbr-presets", () => {
  it("모든 프리셋이 이진 금속도(0 또는 1)와 유효한 clearcoat·sheen·ior 범위를 지킨다", () => {
    expect(STUDIO_HYBRID_DCC_PBR_PRESETS).toHaveLength(6);
    for (const preset of STUDIO_HYBRID_DCC_PBR_PRESETS) {
      expect([0, 1]).toContain(preset.metalness);
      expect(preset.roughness).toBeGreaterThanOrEqual(0.05);
      expect(preset.roughness).toBeLessThanOrEqual(1);
      expect(preset.clearcoat).toBeGreaterThanOrEqual(0);
      expect(preset.clearcoat).toBeLessThanOrEqual(1);
      expect(preset.sheen).toBeGreaterThanOrEqual(0);
      expect(preset.sheen).toBeLessThanOrEqual(1);
      expect(preset.ior).toBeGreaterThanOrEqual(1.3);
      expect(preset.ior).toBeLessThanOrEqual(2.4);
    }
  });

  it("스튜디오 점토는 뷰포트 선택 색상을 보존하고 원목·황동·패브릭은 전용 물리 파라미터를 반영한다", () => {
    const clay = resolveStudioHybridDccPhysicalProps("studio-clay", "#a0a0a0", false);
    const claySelected = resolveStudioHybridDccPhysicalProps("studio-clay", "#e08040", true);
    expect(clay.color).toBe("#a0a0a0");
    expect(clay.metalness).toBe(0);
    expect(claySelected.color).toBe("#e08040");

    const oak = resolveStudioHybridDccPhysicalProps("satin-oak", "#a0a0a0", false);
    expect(oak.metalness).toBe(0);
    expect(oak.clearcoat).toBeGreaterThan(0.4);

    const brass = resolveStudioHybridDccPhysicalProps("brushed-brass", "#a0a0a0", false);
    expect(brass.metalness).toBe(1);
    expect(brass.roughness).toBeLessThan(0.3);

    const fabric = resolveStudioHybridDccPhysicalProps("matte-fabric", "#a0a0a0", false);
    expect(fabric.metalness).toBe(0);
    expect(fabric.sheen).toBeGreaterThan(0.4);

    expect(getStudioHybridDccPbrPreset("studio-clay").id).toBe("studio-clay");
  });
});
