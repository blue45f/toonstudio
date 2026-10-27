import { describe, expect, it } from "vitest";

import { DEFAULT_SHADING } from "../contracts";

import {
  applyLabShaperTripoLookToShading,
  buildLabShaperTripoPipelineSpec,
  getLabShaperTripoLookPreset,
  LAB_SHAPER_TRIPO_GENERATED_GLB_ASSETS,
  LAB_SHAPER_TRIPO_LOOK_PRESETS,
} from "./shaper-tripo-mcp-bridge";

describe("shaper-tripo-mcp-bridge (character-lab)", () => {
  it("4종 SHAPER × Tripo 비주얼 프리셋과 셰이딩 프로파일 패치를 생성한다", () => {
    expect(LAB_SHAPER_TRIPO_LOOK_PRESETS).toHaveLength(4);
    const semiReal = getLabShaperTripoLookPreset("shaper-semi-real");
    expect(semiReal.tripoModelVersion).toBe("P2-20260801");
    expect(semiReal.rampSteps).toBe(4);

    const patch = applyLabShaperTripoLookToShading(DEFAULT_SHADING, "shaper-noir-ink");
    expect(patch.mode).toBe("toon");
    expect(patch.toon?.rampSteps).toBe(2);
    expect(patch.toon?.rim).toBe(true);
    expect(patch.toon?.outline).toBe("edge");
    expect(patch.ibl?.intensity).toBe(0.75);
  });

  it("등신비(5~8등신)와 Delight 여부에 따라 Tripo V3 파이프라인 명세와 MatCap 배율을 계산한다", () => {
    const spec7 = buildLabShaperTripoPipelineSpec({
      lookId: "shaper-cel",
      headUnits: 7.0,
      delight: true,
    });
    expect(spec7.poseControlSuffix).toBe(", t-pose:1.0:1.0:1.0:1.0:9.0");
    expect(spec7.delightFlag).toBe(true);
    expect(spec7.pipelineSummaryKo).toContain("delight=true");
    expect(spec7.cliPreview).toContain("--delight");
    expect(spec7.matCapScaleU).toBeGreaterThan(1);

    const spec8 = buildLabShaperTripoPipelineSpec({
      lookId: "shaper-romance-soft",
      headUnits: 8.0,
      delight: false,
      disableHairInline: false,
    });
    expect(spec8.poseControlSuffix).toBe(", t-pose:0.9:1.0:1.2:1.0:9.0");
    expect(spec8.delightFlag).toBe(false);
    expect(spec8.hairShaderVariant).toBe("simpleMatCapShader");
    expect(spec8.pipelineSummaryKo).toContain("delight=false");
    expect(spec8.pipelineSummaryKo).toContain("simpleMatCapShader");
  });

  it("Tripo Studio H3.1/P2.0 + tripo3d MCP + glbforge 검증 3D GLB 에셋 카탈로그 8종 메타데이터를 제공한다", () => {
    expect(LAB_SHAPER_TRIPO_GENERATED_GLB_ASSETS).toHaveLength(8);
    expect(LAB_SHAPER_TRIPO_GENERATED_GLB_ASSETS.every((item) => item.watertight && item.triangles > 1000)).toBe(true);
  });
});
