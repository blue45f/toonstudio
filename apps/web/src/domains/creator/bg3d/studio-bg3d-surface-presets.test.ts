import { applyProps } from "@react-three/fiber";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE } from "./studio-bg3d-scene-document";
import {
  STUDIO_BG3D_SURFACE_PRESETS,
  buildStudioBg3dSurfacePresetOverride,
  isStudioBg3dSurfacePresetId,
  resolveStudioBg3dPrimitiveSurfaceMaterialProps,
  resolveStudioBg3dSurfaceMaterialProps,
  spreadStudioBg3dSurfaceMaterialProps,
} from "./studio-bg3d-surface-presets";

describe("STUDIO_BG3D_SURFACE_PRESETS", () => {
  it("프리셋 id는 유일하고 기존 8종과 건축·고급 PBR 7종(총 15종)을 한글 라벨·설명으로 제공한다", () => {
    expect(STUDIO_BG3D_SURFACE_PRESETS).toHaveLength(15);
    expect(new Set(STUDIO_BG3D_SURFACE_PRESETS.map((preset) => preset.id)).size).toBe(
      STUDIO_BG3D_SURFACE_PRESETS.length,
    );
    for (const preset of STUDIO_BG3D_SURFACE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
    const expectedArchPresets = [
      { id: "warm-oak", label: "새틴 원목", roughness: 0.36, metalness: 0 },
      { id: "exposed-concrete", label: "노출 콘크리트·석재", roughness: 0.78, metalness: 0 },
      { id: "brushed-brass", label: "브러시드 황동", roughness: 0.24, metalness: 1 },
      { id: "anodized-steel", label: "아노다이징 스틸", roughness: 0.28, metalness: 1 },
      { id: "matte-plaster", label: "매트 회벽·도장", roughness: 0.88, metalness: 0 },
      { id: "crystal-prism", label: "프리즘 크리스탈", roughness: 0.06, metalness: 0 },
      { id: "royal-velvet", label: "로열 벨벳·패브릭", roughness: 0.84, metalness: 0 },
    ] as const;
    for (const expected of expectedArchPresets) {
      expect(isStudioBg3dSurfacePresetId(expected.id)).toBe(true);
      const preset = STUDIO_BG3D_SURFACE_PRESETS.find((item) => item.id === expected.id);
      expect(preset?.label).toBe(expected.label);
      expect(preset?.patch.roughness).toBe(expected.roughness);
      expect(preset?.patch.metalness).toBe(expected.metalness);
      expect([0, 1]).toContain(preset?.patch.metalness);
      const override = buildStudioBg3dSurfacePresetOverride(expected.id);
      expect(override).toMatchObject({
        ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
        ...preset?.patch,
        roughness: expected.roughness,
        metalness: expected.metalness,
      });
    }
  });

  it("패치는 roughness·metalness 0..1 한도와 양수 반투명 계수를 벗어나지 않는다", () => {
    for (const preset of STUDIO_BG3D_SURFACE_PRESETS) {
      if (preset.patch.roughness !== null) {
        expect(preset.patch.roughness).toBeGreaterThanOrEqual(0);
        expect(preset.patch.roughness).toBeLessThanOrEqual(1);
      }
      if (preset.patch.metalness !== null) {
        expect(preset.patch.metalness).toBeGreaterThanOrEqual(0);
        expect(preset.patch.metalness).toBeLessThanOrEqual(1);
      }
      if (preset.patch.emissiveIntensity !== null) {
        expect(preset.patch.emissiveIntensity).toBeGreaterThan(0);
      }
      expect(preset.patch.opacityMultiplier).toBeGreaterThan(0);
      expect(preset.patch.opacityMultiplier).toBeLessThanOrEqual(1);
    }
  });
});

describe("프리미티브 표면 기본값 복원", () => {
  function state(material: THREE.MeshStandardMaterial) {
    return {
      roughness: material.roughness,
      metalness: material.metalness,
      emissive: `#${material.emissive.getHexString()}`,
      emissiveIntensity: material.emissiveIntensity,
      opacity: material.opacity,
      transparent: material.transparent,
      wireframe: material.wireframe,
    };
  }

  it("bare 도형의 명시적 소품은 실제 MeshStandardMaterial 생성 기본값과 같다", () => {
    const material = new THREE.MeshStandardMaterial();
    try {
      expect(resolveStudioBg3dPrimitiveSurfaceMaterialProps(undefined)).toEqual(state(material));
    } finally { material.dispose(); }
  });

  it.each(["chrome", "glass", "neon", "warm-oak", "exposed-concrete", "brushed-brass", "anodized-steel", "matte-plaster"])("%s 적용·Undo·재적용·해제에서 숫자와 boolean 소품을 생략하지 않는다", (id) => {
    const override = buildStudioBg3dSurfacePresetOverride(id);
    if (!override) throw new Error("검증할 실제 프리셋이 필요합니다.");
    const material = new THREE.MeshStandardMaterial();
    const baseline = state(material);
    const selected = resolveStudioBg3dPrimitiveSurfaceMaterialProps({ ...override, wireframe: true });
    const cleared = resolveStudioBg3dPrimitiveSurfaceMaterialProps(undefined);
    try {
      // 제거한 숫자 소품을 0으로 돌리는 diff 경로에 의존하지 않도록 모든 키를 유지한다.
      expect(Object.keys(cleared).sort()).toEqual(Object.keys(selected).sort());
      applyProps(material, selected);
      const applied = state(material);
      expect(applied).not.toEqual(baseline);
      applyProps(material, cleared);
      expect(state(material)).toEqual(baseline);
      applyProps(material, selected);
      expect(state(material)).toEqual(applied);
      applyProps(material, resolveStudioBg3dPrimitiveSurfaceMaterialProps(DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE));
      expect(state(material)).toEqual(baseline);
    } finally { material.dispose(); }
  });

  it("명시한 0은 기본값으로 바꾸지 않고 custom 재질용 생략 계약도 유지한다", () => {
    const explicit = resolveStudioBg3dPrimitiveSurfaceMaterialProps({
      ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
      roughness: 0, metalness: 0, emissiveIntensity: 0,
    });
    expect(explicit).toMatchObject({ roughness: 0, metalness: 0, emissiveIntensity: 0 });
    const custom = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.27, opacity: 0.8, emissiveIntensity: 0.6 });
    try {
      const baseline = state(custom);
      const unchanged = spreadStudioBg3dSurfaceMaterialProps(resolveStudioBg3dSurfaceMaterialProps(undefined));
      expect(unchanged).toEqual({});
      applyProps(custom, unchanged);
      expect(state(custom)).toEqual(baseline);
    } finally { custom.dispose(); }
  });
});

describe("buildStudioBg3dSurfacePresetOverride", () => {
  it("알려진 프리셋은 기본 오버라이드 위에 패치를 얹은 완전한 객체를 돌려준다", () => {
    const chrome = buildStudioBg3dSurfacePresetOverride("chrome");
    expect(chrome).toEqual({
      ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
      roughness: 0.08,
      metalness: 1,
    });
    expect(chrome?.colorMode).toBe("original");
    expect(chrome?.wireframe).toBe(false);
    expect(Object.isFrozen(DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE)).toBe(true);
  });

  it("유리는 반투명 계수를, 네온은 발광 색·강도를 함께 설정한다", () => {
    expect(buildStudioBg3dSurfacePresetOverride("glass")?.opacityMultiplier).toBeLessThan(1);
    const neon = buildStudioBg3dSurfacePresetOverride("neon");
    expect(neon?.emissiveColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(neon?.emissiveIntensity).toBeGreaterThan(1);
  });

  it("모르는 id는 null이다", () => {
    expect(buildStudioBg3dSurfacePresetOverride("nope")).toBeNull();
    expect(isStudioBg3dSurfacePresetId("chrome")).toBe(true);
    expect(isStudioBg3dSurfacePresetId("nope")).toBe(false);
  });
});

describe("resolveStudioBg3dSurfaceMaterialProps", () => {
  it("오버라이드가 없으면 빈 소품이다", () => {
    expect(resolveStudioBg3dSurfaceMaterialProps(undefined)).toEqual({});
  });

  it("null 필드는 생략하고 실측값만 옮긴다", () => {
    const matte = resolveStudioBg3dSurfaceMaterialProps({
      ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
      roughness: 0.85,
      metalness: 0,
    });
    expect(matte).toEqual({ roughness: 0.85, metalness: 0 });
    expect(matte.emissive).toBeUndefined();
    expect(matte.opacity).toBeUndefined();
  });

  it("발광은 강도가 있을 때만 색과 함께 옮겨진다", () => {
    const neon = resolveStudioBg3dSurfaceMaterialProps({
      ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
      emissiveColor: "#fff3d6",
      emissiveIntensity: 2.2,
    });
    expect(neon.emissive).toBe("#fff3d6");
    expect(neon.emissiveIntensity).toBe(2.2);

    const unlitEmissive = resolveStudioBg3dSurfaceMaterialProps({
      ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
      emissiveColor: "#fff3d6",
      emissiveIntensity: null,
    });
    expect(unlitEmissive.emissive).toBeUndefined();
  });

  it("반투명·와이어프레임이 스프레드 소품으로 전달된다", () => {
    const glass = resolveStudioBg3dSurfaceMaterialProps({
      ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
      opacityMultiplier: 0.35,
    });
    expect(glass.opacity).toBe(0.35);

    const glassSpread = spreadStudioBg3dSurfaceMaterialProps(glass);
    expect(glassSpread.transparent).toBe(true);
    expect(glassSpread.opacity).toBe(0.35);
    expect(glassSpread.wireframe).toBeUndefined();

    const wireSpread = spreadStudioBg3dSurfaceMaterialProps(
      resolveStudioBg3dSurfaceMaterialProps({
        ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
        wireframe: true,
      }),
    );
    expect(wireSpread.wireframe).toBe(true);
    expect(wireSpread.transparent).toBeUndefined();
  });
});
