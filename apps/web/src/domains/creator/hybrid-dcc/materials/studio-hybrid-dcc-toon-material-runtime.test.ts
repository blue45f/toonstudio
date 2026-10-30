import { MToonMaterial } from "@pixiv/three-vrm";
import { BackSide, Color, DoubleSide, Matrix4, Vector4 } from "three";
import { describe, expect, it, vi } from "vitest";

import { createStudioHybridDccToonGltfMaterial } from "./studio-hybrid-dcc-toon-gltf";
import { createStudioHybridDccDefaultToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";
import { createStudioHybridDccToonMaterialRuntime, patchStudioHybridDccMToonEqualBoundary, patchStudioHybridDccMToonProjectionWidth } from "./studio-hybrid-dcc-toon-material-runtime";

describe("실제 MToon GPU 재질의 구성·수명 계약", () => {
  it("facade의 MToon 본체와 BackSide inverted hull을 별도 생성하며 GPU와 glTF의 linear 색이 같다", () => {
    const dto: StudioHybridDccToonMaterial = { ...createStudioHybridDccDefaultToonMaterial(), baseColorSrgb: "#808080", shadeColorSrgb: "#2a4050", outline: { ...createStudioHybridDccDefaultToonMaterial().outline, colorSrgb: "#102030" } };
    const source = JSON.stringify(dto); const runtime = createStudioHybridDccToonMaterialRuntime(dto);
    try {
      expect(runtime.body).toBeInstanceOf(MToonMaterial); expect(runtime.outline).toBeInstanceOf(MToonMaterial);
      expect(runtime.body.side).toBe(DoubleSide); expect(runtime.body.isOutline).toBe(false);
      expect(runtime.outline?.side).toBe(BackSide); expect(runtime.outline?.isOutline).toBe(true);
      expect(runtime.body.transparent).toBe(false); expect(runtime.body.opacity).toBe(1); expect(runtime.body.depthWrite).toBe(true);
      expect(runtime.body.lights).toBe(true); expect(runtime.body.alphaTest).toBe(0);
      const gltf = createStudioHybridDccToonGltfMaterial(dto);
      expect(runtime.body.color.toArray()).toEqual(gltf.pbrMetallicRoughness.baseColorFactor.slice(0, 3));
      expect(runtime.body.shadeColorFactor.toArray()).toEqual(gltf.extensions.VRMC_materials_mtoon.shadeColorFactor);
      expect(runtime.outline?.outlineColorFactor.toArray()).toEqual(gltf.extensions.VRMC_materials_mtoon.outlineColorFactor);
      expect(runtime.outline?.outlineLightingMixFactor).toBe(0);
      expect(runtime.outline?.color).not.toBe(runtime.body.color);
      runtime.outline?.color.copy(new Color(0, 0, 0)); expect(runtime.body.color.r).toBeGreaterThan(0);
      expect(JSON.stringify(dto)).toBe(source);
    } finally { runtime.dispose(); }
  });

  it.each(["worldCoordinates", "screenCoordinates"] as const)("%s width와 exact toony=1을 clamp 없이 보존한다", (mode) => {
    const dto = createStudioHybridDccDefaultToonMaterial(); const runtime = createStudioHybridDccToonMaterialRuntime({ ...dto, shadingToony: 1, outline: { ...dto.outline, mode, width: 0.007 } });
    try {
      expect(runtime.body.shadingToonyFactor).toBe(1); expect(runtime.outline?.outlineWidthMode).toBe(mode);
      expect(runtime.outline?.outlineWidthFactor).toBe(0.007);
      expect(runtime.body.customProgramCacheKey()).toContain("toonstudio-mtoon-equal-boundary/1");
      expect(runtime.outline?.customProgramCacheKey()).toContain("OUTLINE:true");
      expect(runtime.outline?.customProgramCacheKey()).toContain(`OUTLINE_WIDTH_SCREEN:${mode === "screenCoordinates"}`);
      expect(runtime.body.customProgramCacheKey()).not.toBe(runtime.outline?.customProgramCacheKey());
    } finally { runtime.dispose(); }
  });

  it("outline 비활성·폭 0은 추가 GPU 재질을 만들지 않고 dispose는 각 소유 재질에 한 번만 전달한다", () => {
    const dto = createStudioHybridDccDefaultToonMaterial();
    for (const outline of [{ ...dto.outline, enabled: false }, { ...dto.outline, width: 0 }]) {
      const runtime = createStudioHybridDccToonMaterialRuntime({ ...dto, outline }); const disposed = vi.fn(); runtime.body.addEventListener("dispose", disposed);
      expect(runtime.outline).toBeNull(); runtime.dispose(); runtime.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
    }
    const runtime = createStudioHybridDccToonMaterialRuntime(dto); const body = vi.fn(), outline = vi.fn();
    runtime.body.addEventListener("dispose", body); runtime.outline?.addEventListener("dispose", outline);
    runtime.dispose(); runtime.dispose(); expect(body).toHaveBeenCalledTimes(1); expect(outline).toHaveBeenCalledTimes(1);
  });

  it("vendor toony=1의 equal-boundary 0/0을 정확한 단일 함수의 step 분기로만 보정한다", () => {
    const material = new MToonMaterial();
    try {
      const a = -1 + 1, b = 1 - 1; expect(Number.isNaN((0 - a) / (b - a))).toBe(true);
      const original = material.fragmentShader; const patched = patchStudioHybridDccMToonEqualBoundary(original);
      expect(patched).toContain("if ( a == b ) { return step( a, t ); }");
      expect(patched.replace("  if ( a == b ) { return step( a, t ); }\n", "")).toBe(original);
      expect(() => patchStudioHybridDccMToonEqualBoundary(patched)).toThrow(/일치하지 않거나 중복/u);
      expect(() => patchStudioHybridDccMToonEqualBoundary(original + original)).toThrow(/일치하지 않거나 중복/u);
      expect(() => patchStudioHybridDccMToonEqualBoundary("void main() {}")).toThrow(/일치하지 않거나 중복/u);
      expect(material.fragmentShader).toBe(original);
    } finally { material.dispose(); }
  });

  it("정확한 screen-width 문장 하나만 직교 분기로 보정하고 이미 보정된·중복·다른 source는 거부한다", () => {
    const material = new MToonMaterial();
    try {
      const source = "      outlineOffset *= vViewPosition.z / projectionMatrix[ 1 ].y;";
      const guarded = "      outlineOffset *= ( projectionMatrix[ 3 ][ 3 ] == 0.0 ? vViewPosition.z : 1.0 ) / projectionMatrix[ 1 ].y;";
      const original = material.vertexShader; const patched = patchStudioHybridDccMToonProjectionWidth(original);
      expect(patched).toContain(guarded); expect(patched.replace(guarded, source)).toBe(original);
      expect(() => patchStudioHybridDccMToonProjectionWidth(patched)).toThrow(/일치하지 않거나 중복/u);
      expect(() => patchStudioHybridDccMToonProjectionWidth(original + original)).toThrow(/일치하지 않거나 중복/u);
      expect(() => patchStudioHybridDccMToonProjectionWidth("void main() {}")).toThrow(/일치하지 않거나 중복/u);
      expect(material.vertexShader).toBe(original);
    } finally { material.dispose(); }
  });

  it.each([0.5, 1, 2])("종횡비 %s에서 두 원근·직교 거리의 screen 폭을 독립 clip/NDC 계산으로 확인한다", (aspect) => {
    const near = 0.1, far = 100, fov = Math.PI / 3, halfHeight = near * Math.tan(fov / 2), width = 0.007, viewportHeight = 700;
    const perspective = new Matrix4().makePerspective(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, near, far);
    const orthographic = new Matrix4().makeOrthographic(-2 * aspect, 2 * aspect, 2, -2, near, far);
    for (const projection of [perspective, orthographic]) for (const distance of [2, 20]) {
      const focal = projection.elements[5]; const isPerspective = projection.elements[15] === 0;
      const offset = width * (isPerspective ? distance : 1) / focal;
      // 실제 GPU 실행이 아니라 독립적인 동차 좌표 투영이다. MToon factor의 세로 NDC 폭을 기대한다.
      const base = new Vector4(0, 0, -distance, 1).applyMatrix4(projection);
      const vertical = new Vector4(0, offset, -distance, 1).applyMatrix4(projection);
      const horizontal = new Vector4(offset, 0, -distance, 1).applyMatrix4(projection);
      const dy = vertical.y / vertical.w - base.y / base.w, dx = horizontal.x / horizontal.w - base.x / base.w;
      expect(dy).toBeCloseTo(width, 14); expect(dx).toBeCloseTo(width / aspect, 14);
      expect(dy * viewportHeight / 2).toBeCloseTo(width * viewportHeight / 2, 12);
      expect(dx * viewportHeight * aspect / 2).toBeCloseTo(width * viewportHeight / 2, 12);
      if (isPerspective) expect(offset).toBe(width * distance / focal);
      else expect(width * distance / focal * focal).toBeCloseTo(width * distance, 14);
    }
  });
});
