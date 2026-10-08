import { describe, expect, it } from "vitest";

import { DEFAULT_SHADING, KIT_DEFAULT_TOON, QUALITY_PRESETS, createKitDefaultRecipe } from "../../contracts";

import { defaultShadingFor, resolveViewerShading } from "./kit-shading";

describe("defaultShadingFor", () => {
  it("키트 소스는 앱 키트 기본 레시피의 셰이딩(램프 2단·림 끔, A-10)이고 병합 소스는 기존 DEFAULT_SHADING", () => {
    expect(defaultShadingFor("kit")).toEqual(createKitDefaultRecipe().shading);
    expect(defaultShadingFor("kit").toon).toMatchObject({ rampSteps: KIT_DEFAULT_TOON.rampSteps, rim: KIT_DEFAULT_TOON.rim });
    expect(defaultShadingFor("kit").toon.rampSteps).toBe(2);
    expect(defaultShadingFor("kit").toon.rim).toBe(false);
    expect(defaultShadingFor("package")).toBe(DEFAULT_SHADING);
    expect(defaultShadingFor("package").toon).toMatchObject({ rampSteps: 3, rim: true });
  });
});

describe("resolveViewerShading", () => {
  it("덮어쓰기가 없으면 소스 종류별 기본 툰 값 + 요청한 모드·품질 프리셋", () => {
    const kit = resolveViewerShading({ sourceKind: "kit", mode: "toon", quality: "standard", toon: {} });
    expect(kit.mode).toBe("toon");
    expect(kit.toon).toEqual({ ...DEFAULT_SHADING.toon, rampSteps: 2, rim: false });
    const legacy = resolveViewerShading({ sourceKind: "package", mode: "toon", quality: "standard", toon: {} });
    expect(legacy.toon).toEqual(DEFAULT_SHADING.toon);
    expect(resolveViewerShading({ sourceKind: "kit", mode: "pbr", quality: "hero", toon: {} }).shadows).toEqual(QUALITY_PRESETS.hero.shadows);
    expect(resolveViewerShading({ sourceKind: "kit", mode: "pbr", quality: "preview", toon: {} }).postfx).toEqual(QUALITY_PRESETS.preview.postfx);
  });

  it("--ramp-steps·--rim·--outline 덮어쓰기는 두 경로 모두에 같은 의미로 적용되고 나머지 값은 유지한다", () => {
    const kit = resolveViewerShading({ sourceKind: "kit", mode: "toon", quality: "standard", toon: { rampSteps: 4, rim: true, outline: "edge" } });
    expect(kit.toon).toEqual({ rampSteps: 4, rim: true, outline: "edge", faceSdfShadow: DEFAULT_SHADING.toon.faceSdfShadow });
    const legacy = resolveViewerShading({ sourceKind: "package", mode: "toon", quality: "standard", toon: { rampSteps: 2, rim: false } });
    expect(legacy.toon).toEqual({ ...DEFAULT_SHADING.toon, rampSteps: 2, rim: false });
    const partial = resolveViewerShading({ sourceKind: "kit", mode: "toon", quality: "standard", toon: { rim: true } });
    expect(partial.toon).toMatchObject({ rampSteps: 2, rim: true });
  });

  it("기본 객체를 변형하지 않는다", () => {
    resolveViewerShading({ sourceKind: "package", mode: "toon", quality: "hero", toon: { rampSteps: 2, rim: false, outline: "none" } });
    expect(DEFAULT_SHADING.toon).toEqual({ rampSteps: 3, faceSdfShadow: true, outline: "hull", rim: true });
  });
});
