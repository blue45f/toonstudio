import { describe, expect, it } from "vitest";

import { resolveStudioBg3dMaterialBackend, studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";

describe("실제 renderer와 명시적 재질 backend", () => {
  it("CPU 기본 호출은 WebGL이며 초기 canvas 요청은 renderer 없이도 WebGPU를 명시한다", () => {
    expect(resolveStudioBg3dMaterialBackend()).toBe("webgl");
    expect(resolveStudioBg3dMaterialBackend({ renderer: null, materialBackend: "webgpu" })).toBe("webgpu");
  });
  it("장치 품질 대신 실제 renderer 브랜드로 재질을 선택한다", () => {
    expect(resolveStudioBg3dMaterialBackend({ renderer: { isWebGPURenderer: true } })).toBe("webgpu");
    expect(resolveStudioBg3dMaterialBackend({ renderer: { isWebGLRenderer: true } })).toBe("webgl");
    expect(() => resolveStudioBg3dMaterialBackend({ renderer: { isWebGLRenderer: true }, materialBackend: "webgpu" })).toThrow(/실제 renderer/u);
  });
  it("브랜드가 없거나 동시에 두 renderer를 주장하면 파싱을 시작하지 않는다", () => {
    expect(() => resolveStudioBg3dMaterialBackend({ renderer: {} })).toThrow(/명확/u);
    expect(() => resolveStudioBg3dMaterialBackend({ renderer: { isWebGLRenderer: true, isWebGPURenderer: true } })).toThrow(/명확/u);
  });
  it("storage ID 문자열과 재질 backend를 구분하며 서로 다른 variant key를 만든다", () => {
    const id = 'model:["webgpu"]';
    expect(studioBg3dModelCacheKey(id, "webgl")).not.toBe(studioBg3dModelCacheKey(id, "webgpu"));
    expect(JSON.parse(studioBg3dModelCacheKey(id, "webgl"))).toEqual([id, studioBg3dModelRuntimeVariant("webgl")]);
  });
});
