import { describe, expect, it } from "vitest";

import {
  applyStudioBg3dRealisticRenderPreset,
  resolveStudioBg3dRealisticRenderPreset,
  STUDIO_BG3D_REALISTIC_RENDER_PRESETS,
} from "./studio-bg3d-realistic-render-presets";

describe("studio-bg3d-realistic-render-presets", () => {
  it("4개 실사 세트가 모두 HDRI·PBR·선화로 해석된다", () => {
    expect(STUDIO_BG3D_REALISTIC_RENDER_PRESETS).toHaveLength(4);
    for (const preset of STUDIO_BG3D_REALISTIC_RENDER_PRESETS) {
      const resolved = resolveStudioBg3dRealisticRenderPreset(preset.id);
      expect(resolved).not.toBeNull();
      expect(resolved?.hdri.id).toBe(preset.hdriPresetId);
      expect(resolved?.pbrMaterial.id).toBe(preset.pbrMaterialId);
      expect(resolved?.pbrMaterial.category).toBe(preset.pbrSurfaceCategory);
      expect(resolved?.lineJob.source).toBe("bg3d-lt");
      expect(resolved?.lineJob.depthNeeded).toBe(true);
      const passes = resolved?.preset.cyclesPasses.map((entry) => entry.pass);
      expect(passes).toEqual(["beauty", "ao", "normal", "depth"]);
      const beauty = resolved?.preset.cyclesPasses.find((entry) => entry.pass === "beauty");
      expect(beauty?.visible).toBe(true);
      expect(beauty?.opacity).toBe(1);
    }
  });

  it("알 수 없는 id는 fail-closed로 null이다", () => {
    expect(resolveStudioBg3dRealisticRenderPreset("no-such-preset")).toBeNull();
    expect(resolveStudioBg3dRealisticRenderPreset(undefined)).toBeNull();
    expect(applyStudioBg3dRealisticRenderPreset("no-such-preset")).toBeNull();
  });

  it("적용 값은 장면 문서에 꽂히는 조명·노출·날씨·선화를 그대로 담는다", () => {
    const applied = applyStudioBg3dRealisticRenderPreset("daylight-real");
    expect(applied).not.toBeNull();
    expect(applied?.exposure).toBeGreaterThan(0);
    expect(applied?.sunTimeHours).toBeGreaterThanOrEqual(0);
    expect(applied?.sunTimeHours).toBeLessThan(24);
    expect(applied?.weatherPresetId.length).toBeGreaterThan(0);
    expect(applied?.pbrMaterialId).toBe("polyhaven-white-rough-plaster");
    expect(applied?.lineJob.algorithm).toBe("hybrid");
    expect(applied?.lighting.key.castsShadow).toBe(true);
  });

  it("야간 세트는 3D 형상 기반 선화를 쓴다", () => {
    const applied = applyStudioBg3dRealisticRenderPreset("night-real");
    expect(applied?.lineJob.algorithm).toBe("normal-depth");
    expect(applied?.lineJob.depthNeeded).toBe(true);
  });
});
