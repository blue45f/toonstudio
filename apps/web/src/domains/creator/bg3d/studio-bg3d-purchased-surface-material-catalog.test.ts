import { describe, expect, it } from "vitest";

import { buildStudioBg3dCc0SurfaceMaterialOverride, STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG } from "./studio-bg3d-cc0-surface-material-catalog";
import source from "./studio-bg3d-plasticine-materials.generated.json";
import { STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS } from "./studio-bg3d-purchased-surface-material-catalog";
import { buildStudioBg3dSurfaceMaterialOverride, findStudioBg3dSurfaceMaterial } from "./studio-bg3d-surface-material-catalog";

describe("구매 표면 재질 카탈로그", () => {
  it("확보한 8K 8종·2K 11종을 별도 원본으로 보존하고 최고 확보 해상도를 기본값으로 둔다", () => {
    expect(STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS).toHaveLength(11);
    const variants = STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.flatMap((material) => material.variants);
    expect(variants).toHaveLength(19);
    expect(variants.filter((variant) => variant.resolution === 8192)).toHaveLength(8);
    expect(variants.filter((variant) => variant.resolution === 2048)).toHaveLength(11);
    for (const [index, material] of STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.entries()) {
      const current = findStudioBg3dSurfaceMaterial(material.defaultVariantId);
      expect(current?.resolution).toBe(index < 8 ? 8192 : 2048);
      expect(material.variants.some((variant) => variant.id === material.defaultVariantId)).toBe(true);
      expect(material.previewUrl).toBe(material.variants.find((variant) => variant.resolution === 2048)?.baseColorUrl);
    }
    expect(findStudioBg3dSurfaceMaterial("emaceart-plasticine-09-native-8k")).toBeUndefined();
  });

  it("등록한 65개 논리 채널이 감사한 content address 59개만 참조하며 없는 채널을 만들지 않는다", () => {
    const known = new Set(source.assets.map((asset) => asset.url));
    let channels = 0;
    for (const material of STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS) {
      for (const variant of material.variants) {
        const maps = variant.pbrMaps;
        expect(maps).not.toBeNull();
        const urls = [variant.baseColorUrl, maps?.roughnessUrl, maps?.normalGlUrl, maps?.metalnessUrl].filter((url) => url !== undefined);
        expect(urls).toHaveLength(variant.sourceVariant === "native-8k" ? 4 : 3);
        for (const url of urls) expect(known.has(url)).toBe(true);
        expect(maps?.aoUrl).toBeUndefined();
        expect(maps?.displacementUrl).toBeUndefined();
        expect(variant.normalStrength).toBe(1);
        expect(variant.metalness).toBe(variant.sourceVariant === "native-8k" ? 1 : 0);
        channels += urls.length;
      }
    }
    expect(channels).toBe(65);
    expect(known.size).toBe(59);
    expect(source.assets.every((asset) => asset.url.endsWith(`/${asset.sha256}.png`))).toBe(true);
    expect(source.license.kind).toBe("purchased-project-use");
  });

  it("구매 원본에 중립 흰색을 사용하고 기존 CC0 82개 오버라이드는 보존한다", () => {
    for (const material of STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS) {
      const override = buildStudioBg3dSurfaceMaterialOverride(material.defaultVariantId);
      expect(override).toMatchObject({ surfaceMaterialId: material.defaultVariantId, colorMode: "replace",
        color: "#ffffff", colorStrength: 1, roughness: 1 });
    }
    for (const entry of STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG) {
      expect(buildStudioBg3dSurfaceMaterialOverride(entry.id)).toEqual(buildStudioBg3dCc0SurfaceMaterialOverride(entry.id));
      expect(findStudioBg3dSurfaceMaterial(entry.id)).toBe(entry);
    }
    expect(buildStudioBg3dSurfaceMaterialOverride("unknown-purchased-material")).toBeNull();
  });
});
