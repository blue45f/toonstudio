import { describe, expect, it, vi } from "vitest";

import { loadStudioBg3dBundledEnvironmentSource } from "./studio-bg3d-bundled-environment-loader";
import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  getStudioBg3dEnvironmentAsset,
} from "./studio-bg3d-environment-catalog";
import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1_MOBILE,
  STUDIO_BG3D_HERO_V1_ENTRIES,
} from "./studio-bg3d-hero-v1-catalog-entries";
import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2_MOBILE,
  STUDIO_BG3D_HERO_ALL_ENTRIES,
  STUDIO_BG3D_HERO_V2_ENTRIES,
} from "./studio-bg3d-hero-v2-catalog-entries";
import {
  HERO_BG3D_MOBILE_MEMORY_MAX_GB,
  HERO_BG3D_MOBILE_VIEWPORT_MAX_PX,
  formatHeroBg3dDeliveryBadgeKo,
  isHeroCutawayCapableAsset,
  isHeroV1CutawayCapableAsset,
  resolveHeroBg3dDeliveryAsset,
  summarizeHeroAllMobileSavings,
  summarizeHeroV1MobileSavings,
} from "./studio-bg3d-hero-tier-selector";

describe("studio-bg3d-hero-tier-selector", () => {
  it("resolves all 6 hero-v1 scenes to verified -mobile.glb on mobile viewport with real byte savings", () => {
    const mobileById = new Map(
      STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1_MOBILE.map((asset) => [asset.id, asset] as const),
    );

    for (const entry of STUDIO_BG3D_HERO_V1_ENTRIES) {
      const resolved = resolveHeroBg3dDeliveryAsset(entry.desktopAsset.id, {
        viewportWidthPx: HERO_BG3D_MOBILE_VIEWPORT_MAX_PX,
      });

      const expectedMobile = mobileById.get(entry.mobileAsset.id);
      const expectedSavedBytes = entry.desktopAsset.byteSize - entry.mobileAsset.byteSize;

      expect(resolved.tier).toBe("mobile");
      expect(resolved.isHeroV1).toBe(true);
      expect(resolved.switchedToMobile).toBe(true);
      expect(resolved.asset).toBe(expectedMobile);
      expect(resolved.asset?.url).toBe(`/assets/3d/environments/hero-v1/${entry.slug}-mobile.glb`);
      expect(resolved.savedBytes).toBe(expectedSavedBytes);
      expect(resolved.savedPercent).toBeGreaterThanOrEqual(34);
      expect(resolved.savedPercent).toBeLessThanOrEqual(75);
      expect(resolved.cutawayCapable).toBe(true);
      expect(formatHeroBg3dDeliveryBadgeKo(resolved)).toContain("모바일 경량");
      expect(formatHeroBg3dDeliveryBadgeKo(resolved)).toContain("절감");
    }

    const summary = summarizeHeroV1MobileSavings();
    expect(summary.sceneCount).toBe(6);
    expect(summary.totalSavedBytes).toBeGreaterThan(11_000_000);
    expect(summary.averageSavedPercent).toBeGreaterThanOrEqual(42);
  });

  it("triggers mobile tier on low deviceMemoryGb (<= 4) or preferMobileTier === true even on desktop viewport", () => {
    const cafeDesktop = STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1[1]!;

    const lowMemory = resolveHeroBg3dDeliveryAsset(cafeDesktop, {
      viewportWidthPx: 1440,
      deviceMemoryGb: HERO_BG3D_MOBILE_MEMORY_MAX_GB,
    });
    expect(lowMemory.tier).toBe("mobile");
    expect(lowMemory.asset.url).toMatch(/-mobile\.glb$/u);
    const cafeMobile = STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1_MOBILE[1]!;
    expect(lowMemory.savedBytes).toBe(cafeDesktop.byteSize - cafeMobile.byteSize);
    expect(lowMemory.savedPercent).toBe(
      Math.round(((cafeDesktop.byteSize - cafeMobile.byteSize) / cafeDesktop.byteSize) * 1000) / 10,
    );

    const preferMobile = resolveHeroBg3dDeliveryAsset(cafeDesktop.id, {
      viewportWidthPx: 1920,
      deviceMemoryGb: 16,
      preferMobileTier: true,
    });
    expect(preferMobile.tier).toBe("mobile");
    expect(preferMobile.asset?.id).toBe("ts-bg3d-hero-v1-kr_atelier_cafe_interior-mobile");
  });

  it("keeps desktop 8-node GLB with 0 savedBytes on desktop viewport and ample memory", () => {
    const apartmentDesktop = STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1[0]!;
    const resolved = resolveHeroBg3dDeliveryAsset(apartmentDesktop, {
      viewportWidthPx: 1440,
      deviceMemoryGb: 16,
    });

    expect(resolved.tier).toBe("desktop");
    expect(resolved.isHeroV1).toBe(true);
    expect(resolved.switchedToMobile).toBe(false);
    expect(resolved.asset).toBe(apartmentDesktop);
    expect(resolved.asset.url).toBe("/assets/3d/environments/hero-v1/kr_modern_apartment_living.glb");
    expect(resolved.savedBytes).toBe(0);
    expect(resolved.savedPercent).toBe(0);
    expect(formatHeroBg3dDeliveryBadgeKo(resolved)).toContain("데스크톱 8노드");
  });

  it("returns non-hero-v1 legacy assets untouched by reference and value for 100% backward compatibility", () => {
    const legacyObject = STUDIO_BG3D_ENVIRONMENT_ASSETS_V6[0]!;
    const byObject = resolveHeroBg3dDeliveryAsset(legacyObject, {
      viewportWidthPx: 390,
      deviceMemoryGb: 2,
      preferMobileTier: true,
    });

    expect(byObject.asset).toBe(legacyObject);
    expect(byObject.requestedAsset).toBe(legacyObject);
    expect(byObject.tier).toBe("desktop");
    expect(byObject.isHeroV1).toBe(false);
    expect(byObject.switchedToMobile).toBe(false);
    expect(byObject.savedBytes).toBe(0);
    expect(byObject.savedPercent).toBe(0);
    expect(byObject.cutawayCapable).toBe(false);

    const byId = resolveHeroBg3dDeliveryAsset(legacyObject.id, { viewportWidthPx: 390 });
    expect(byId.asset).toBe(getStudioBg3dEnvironmentAsset(legacyObject.id));
    expect(byId.isHeroV1).toBe(false);

    const unknown = resolveHeroBg3dDeliveryAsset("non-existent-asset-id", { viewportWidthPx: 390 });
    expect(unknown.asset).toBeNull();
    expect(unknown.isHeroV1).toBe(false);
    expect(unknown.savedBytes).toBe(0);
  });

  it("identifies all 12 hero-v1 + hero-v2 cutaway-capable scenes via isHeroV1CutawayCapableAsset", () => {
    for (const entry of STUDIO_BG3D_HERO_ALL_ENTRIES) {
      expect(isHeroV1CutawayCapableAsset(entry.desktopAsset.id)).toBe(true);
      expect(isHeroV1CutawayCapableAsset(entry.mobileAsset.id)).toBe(true);
      expect(isHeroCutawayCapableAsset(entry.slug)).toBe(true);
    }

    expect(isHeroV1CutawayCapableAsset(STUDIO_BG3D_ENVIRONMENT_ASSETS_V6[0]?.id)).toBe(false);
    expect(isHeroV1CutawayCapableAsset("")).toBe(false);
    expect(isHeroV1CutawayCapableAsset(null)).toBe(false);
    expect(isHeroV1CutawayCapableAsset(undefined)).toBe(false);
  });

  it("resolves all 6 hero-v2 scenes (total 12 scenes) to verified mobile.glb with real byte savings", () => {
    const mobileV2ById = new Map(
      STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2_MOBILE.map((asset) => [asset.id, asset] as const),
    );
    expect(STUDIO_BG3D_HERO_V2_ENTRIES).toHaveLength(6);
    expect(STUDIO_BG3D_HERO_ALL_ENTRIES).toHaveLength(12);

    for (const entry of STUDIO_BG3D_HERO_V2_ENTRIES) {
      const mobileResolved = resolveHeroBg3dDeliveryAsset(entry.desktopAsset.id, {
        viewportWidthPx: HERO_BG3D_MOBILE_VIEWPORT_MAX_PX,
      });
      const expectedMobile = mobileV2ById.get(entry.mobileAsset.id);
      const expectedSavedBytes = entry.desktopAsset.byteSize - entry.mobileAsset.byteSize;

      expect(mobileResolved.tier).toBe("mobile");
      expect(mobileResolved.isHeroScene).toBe(true);
      expect(mobileResolved.heroGeneration).toBe("v2");
      expect(mobileResolved.switchedToMobile).toBe(true);
      expect(mobileResolved.asset).toBe(expectedMobile);
      expect(mobileResolved.asset?.url).toBe(`/assets/3d/environments/hero-v2/${entry.slug}/mobile.glb`);
      expect(mobileResolved.savedBytes).toBe(expectedSavedBytes);
      expect(mobileResolved.savedPercent).toBeGreaterThanOrEqual(40);
      expect(mobileResolved.cutawayCapable).toBe(true);

      const desktopResolved = resolveHeroBg3dDeliveryAsset(entry.desktopAsset, {
        viewportWidthPx: 1440,
        deviceMemoryGb: 16,
      });
      expect(desktopResolved.tier).toBe("desktop");
      expect(desktopResolved.heroGeneration).toBe("v2");
      expect(desktopResolved.asset).toBe(entry.desktopAsset);
      expect(desktopResolved.savedBytes).toBe(0);
    }

    const summaryAll = summarizeHeroAllMobileSavings();
    expect(summaryAll.sceneCount).toBe(12);
    expect(summaryAll.totalSavedBytes).toBeGreaterThan(20_000_000);
    expect(summaryAll.averageSavedPercent).toBeGreaterThanOrEqual(45);
  });

  it("fetches verified -mobile.glb URL when loadStudioBg3dBundledEnvironmentSource receives mobile deliveryContext", async () => {
    const mobileAsset = STUDIO_BG3D_HERO_V1_ENTRIES[0]!.mobileAsset;
    const desktopAsset = STUDIO_BG3D_HERO_V1_ENTRIES[0]!.desktopAsset;
    const glb = new Uint8Array(mobileAsset.byteSize);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, mobileAsset.byteSize, true);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "model/gltf-binary", "content-length": String(mobileAsset.byteSize) }),
      arrayBuffer: async () => glb.buffer,
    });

    const loaded = await loadStudioBg3dBundledEnvironmentSource(desktopAsset.id, {
      fetcher,
      deliveryContext: { viewportWidthPx: 390 },
    });
    expect(fetcher).toHaveBeenCalledWith(mobileAsset.url, expect.any(Object));
    expect(loaded.asset).toBe(mobileAsset);
  });
});
