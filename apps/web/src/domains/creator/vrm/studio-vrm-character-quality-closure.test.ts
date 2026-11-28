import { readFileSync } from "node:fs";

import { MToonMaterial } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createStudioVrmAuthoredHairGeometry } from "./studio-vrm-authored-hair-geometry";
import { applyAvatarForgeHairStyleRecipe, buildAvatarForgeHairParts, createAvatarForgeState } from "./studio-vrm-avatar-forge";
import { addAvatarForgeHairParts, disposeAvatarForgeObject, expandAvatarForgeHairPartsForRender } from "./studio-vrm-avatar-forge-hair-object";
import { resolveStudioVrmHeadFit } from "./studio-vrm-head-fit";

const semantic = readFileSync(new URL("./studio-vrm-semantic-face-morph.ts", import.meta.url), "utf8");
const adaptive = readFileSync(new URL("./studio-vrm-adaptive-face-deformer.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("./StudioVrmAvatarForgePanel.tsx", import.meta.url), "utf8");

function measureCapHairline(style: "short" | "pixie") {
  const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), style);
  const cap = buildAvatarForgeHairParts(state, expandAvatarForgeHairPartsForRender).find((part) => part.role === "cap");
  if (!cap) throw new Error(`${style}의 헤어 캡이 없습니다.`);
  const geometry = createStudioVrmAuthoredHairGeometry(cap);
  try {
    const vertices = geometry.getAttribute("position");
    const heights = { forehead: Infinity, leftTemple: Infinity, rightTemple: Infinity, nape: Infinity };
    // 네 주축의 ±10° 범위에서 가장 낮은 정점이 이마·양옆·목덜미의 실제 캡 경계다.
    const axisThreshold = Math.cos(THREE.MathUtils.degToRad(10));
    for (let i = 0; i < vertices.count; i += 1) {
      const x = vertices.getX(i);
      const z = vertices.getZ(i);
      const radius = Math.hypot(x, z);
      if (radius === 0) continue;
      const y = vertices.getY(i);
      if (z / radius > axisThreshold) heights.forehead = Math.min(heights.forehead, y);
      if (-x / radius > axisThreshold) heights.leftTemple = Math.min(heights.leftTemple, y);
      if (x / radius > axisThreshold) heights.rightTemple = Math.min(heights.rightTemple, y);
      if (-z / radius > axisThreshold) heights.nape = Math.min(heights.nape, y);
    }
    return heights;
  } finally {
    geometry.dispose();
  }
}

describe("VRM character quality closure", () => {
  it("uses exact native morphs before adaptive mesh deformation", () => {
    expect(semantic).toContain("nativeSemanticIds");
    expect(semantic).toContain("applyStudioVrmAdaptiveFaceMorphs(vrm, state, nativeSemanticIds)");
    expect(semantic).toContain('provider: "native-morph"');
    expect(semantic).toContain('provider: "adaptive-mesh"');
    expect(adaptive).toContain("excludedSemanticIds");
    expect(adaptive).toContain("binding.mesh.geometry = deformed");
    expect(adaptive).toContain("binding.mesh.geometry = originalGeometry");
  });

  it("롱 헤어 다발이 하나의 채색 메시와 하나의 셀 외곽선으로 조립된다", () => {
    const group = new THREE.Group();
    const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), "long");
    const fit = resolveStudioVrmHeadFit({ profile: null, eyeCenter: null, eyeDistance: 0, frontSign: 1, modelHeight: 1.65 });
    try {
      addAvatarForgeHairParts(group, state, fit);
      const meshes: THREE.Mesh[] = [];
      group.traverse((node) => { if (node instanceof THREE.Mesh) meshes.push(node); });
      expect(meshes).toHaveLength(2);
      const outline = meshes.find((mesh): mesh is THREE.Mesh<THREE.BufferGeometry, MToonMaterial> =>
        mesh.material instanceof MToonMaterial && mesh.material.isOutline);
      const main = meshes.find((mesh) => mesh.material instanceof MToonMaterial && !mesh.material.isOutline);
      if (!main || !outline) throw new Error("본체와 외곽선에 각각 MToon 재질이 필요합니다.");
      const position = main.geometry.getAttribute("position");
      expect(position.count).toBeGreaterThan(0);
      expect(main.geometry.getAttribute("color").count).toBe(position.count);
      expect(main.material).toMatchObject({ vertexColors: true, ignoreVertexColor: false });
      expect(outline.geometry.getAttribute("position").count).toBe(position.count);
      expect(outline.material.side).toBe(THREE.BackSide);
      expect(outline.material.outlineWidthFactor).toBeGreaterThan(0);
      const bounds = new THREE.Box3().setFromObject(main);
      expect(bounds.max.y).toBeGreaterThan(fit.center[1] + fit.radiusY * 0.85);
      expect(bounds.min.y).toBeLessThan(fit.center[1] - fit.radiusY * 2);
    } finally {
      disposeAvatarForgeObject(group);
    }
  });

  it("숏·픽시 모두 이마에서 목덜미로 내려가고 픽시는 이마와 귀를 더 드러낸다", () => {
    const short = measureCapHairline("short");
    const pixie = measureCapHairline("pixie");
    for (const { forehead, leftTemple, rightTemple, nape } of [short, pixie]) {
      expect([forehead, leftTemple, rightTemple, nape].every(Number.isFinite)).toBe(true);
      expect(forehead).toBeGreaterThan(0);
      for (const temple of [leftTemple, rightTemple]) {
        expect(forehead).toBeGreaterThan(temple);
        expect(temple).toBeGreaterThan(nape);
      }
    }
    // 두상 반경의 10% 이상 짧아야 눈썹과 귀 옆에서 두 커트의 차이가 읽힌다.
    expect(pixie.forehead - short.forehead).toBeGreaterThan(0.1);
    expect(pixie.leftTemple - short.leftTemple).toBeGreaterThan(0.1);
    expect(pixie.rightTemple - short.rightTemple).toBeGreaterThan(0.1);
  });

  it("팔레트 그림자색을 바꾸면 실제 앞머리 다발의 정점색이 해당 색으로 바뀐다", () => {
    const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), "short");
    const bang = buildAvatarForgeHairParts(state).find((part) => part.role === "bang");
    if (!bang) throw new Error("숏 커트의 앞머리 다발이 없습니다.");
    const red = createStudioVrmAuthoredHairGeometry({ ...bang, shadowColor: "#990000" });
    const blue = createStudioVrmAuthoredHairGeometry({ ...bang, shadowColor: "#000099" });
    try {
      const a = red.getAttribute("color");
      const b = blue.getAttribute("color");
      expect(a.count).toBe(b.count);
      let tinted = 0;
      for (let i = 0; i < a.count; i += 1) {
        if (a.getX(i) > b.getX(i) + 0.01 && b.getZ(i) > a.getZ(i) + 0.01) tinted += 1;
      }
      expect(tinted).toBeGreaterThan(a.count * 0.1);
    } finally {
      red.dispose();
      blue.dispose();
    }
  });

  it("exposes a three-stop palette and honest provider labels", () => {
    expect(panel).toContain("shadowColor");
    expect(panel).toContain("적응형 얼굴 디테일");
    expect(panel).toContain("모델 morph");
    expect(panel).toContain("적응형 mesh");
  });
});
