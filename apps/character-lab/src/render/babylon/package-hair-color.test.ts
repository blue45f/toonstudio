import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Scene } from "@babylonjs/core/scene.js";
import { expect, it } from "vitest";

import { DEFAULT_RECIPE_COLORS } from "../../contracts";
import { applyPackageHairColor } from "../package-hair-color";

it("패키지 머리색을 반복 변경해도 원본 색 계수·알베도 텍스처·외곽을 복구한다", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const material = new PBRMaterial("hair", scene);
    const outline = new PBRMaterial("outline", scene);
    material.albedoColor.set(0.75, 0.8, 0.9);
    const base = [0.75, 0.8, 0.9] as const;
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([100, 95, 230, 255]), 1, 1, scene);
    material.albedoTexture = texture;
    const untouched = outline.albedoColor.clone();
    const hair = [{ material, base }];
    applyPackageHairColor(hair, "#6fbfa3");
    const mint = material.albedoColor.clone();
    expect(mint.g).toBeGreaterThan(mint.r);
    applyPackageHairColor(hair, "#5b3a24");
    expect(material.albedoColor.equals(mint)).toBe(false);
    applyPackageHairColor(hair, "#6fbfa3");
    expect(material.albedoColor.equals(mint)).toBe(true);
    applyPackageHairColor(hair, DEFAULT_RECIPE_COLORS.hair);
    expect(material.albedoColor.asArray()).toEqual(base);
    expect(material.albedoTexture).toBe(texture);
    expect(outline.albedoColor.equals(untouched)).toBe(true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
