import { MToonMaterial, VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";
import { SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAvatarForgeState } from "./studio-vrm-avatar-forge";
import { createStudioVrmGenerateRecipe, exportStudioVrmFromGenerateRecipe } from "./studio-vrm-generate-recipe";

describe("생성한 VRM의 모발 부분 염색", () => {
  beforeEach(() => { vi.stubGlobal("self", globalThis); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("파츠 색이 같은 앞·옆머리를 하나의 재질로 내보내고 VRM 재로드 후에도 색과 스키닝을 유지한다", async () => {
    const state = createAvatarForgeState("soft-bob");
    state.hair = { ...state.hair, frontTint: "#579ad0", sideTint: "#579ad0", backTint: "#913172" };
    const bytes = exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ state }));
    const loader = new GLTFLoader().register((parser) => new VRMLoaderPlugin(parser));
    const { userData } = await loader.parseAsync(bytes.buffer, "");
    const vrm: VRM = userData.vrm;
    const colors = new Map<string, string>();
    vrm.scene.traverse((node) => {
      if (!(node instanceof SkinnedMesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!(material instanceof MToonMaterial) || material.isOutline || !material.name.startsWith("Hair")) continue;
        expect(node.geometry.getAttribute("skinWeight").count).toBe(node.geometry.getAttribute("position").count);
        colors.set(material.name, material.color.getHexString());
      }
    });
    expect(colors.size).toBe(3);
    expect(colors.get("Hair_579ad0")).toBe("579ad0");
    expect(colors.get("Hair_913172")).toBe("913172");
    expect(colors.has("Hair")).toBe(true);
  });
});
