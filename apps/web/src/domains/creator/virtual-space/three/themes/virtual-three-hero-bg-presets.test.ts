import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { STUDIO_BG3D_HERO_V1_ENTRIES, type StudioBg3dHeroV1SceneEntry } from "../../../bg3d/studio-bg3d-hero-v1-catalog-entries";
import { STUDIO_BG3D_HERO_ALL_ENTRIES } from "../../../bg3d/studio-bg3d-hero-v2-catalog-entries";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../../studio-virtual-space-world-manifest";
import { buildStudioThreeWorldArchitecture } from "../studio-virtual-space-three-world-layout";
import {
  buildHeroBgRoomPresets,
  findVirtualThreeHeroBgPreset,
  toHeroBgThemeId,
  VIRTUAL_THREE_HERO_BG_PRESETS,
  VIRTUAL_THREE_HERO_SCENE_THEMES,
} from "./virtual-three-hero-bg-presets";
import { findVirtualThreeTheme } from "./virtual-three-theme-catalog";
import { loadVirtualThreeHeroSceneSource } from "./virtual-three-theme-model-source";
import { prepareVirtualThreeHeroSceneStage } from "./virtual-three-theme-model-stage";

function minimalGlbBuffer(): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "BG_Floor" }],
  }));
  const padded = Math.ceil(json.byteLength / 4) * 4;
  const result = new ArrayBuffer(20 + padded);
  const view = new DataView(result);
  const bytes = new Uint8Array(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(json, 20);
  return result;
}

describe("Hero 3D BG 12씬(v1 6 + v2 6) 동적 룸 프리셋 및 확장성", () => {
  it("STUDIO_BG3D_HERO_ALL_ENTRIES 12씬을 모두 동적으로 변환해 테마·좌석·리뷰스크린·Desktop/Mobile 티어를 제공한다", () => {
    expect(VIRTUAL_THREE_HERO_BG_PRESETS).toHaveLength(STUDIO_BG3D_HERO_ALL_ENTRIES.length);
    expect(VIRTUAL_THREE_HERO_SCENE_THEMES).toHaveLength(12);

    const expectedThemeIds = [
      "hero-bg-kr-modern-apartment-living",
      "hero-bg-kr-atelier-cafe-interior",
      "hero-bg-kr-highschool-classroom-corridor",
      "hero-bg-kr-school-rooftop-hero",
      "hero-bg-kr-seoul-alley-street-hero",
      "hero-bg-rofan-imperial-palace-hall-balcony",
      "hero-bg-kr-modern-office-suite",
      "hero-bg-kr-seoul-subway-train-platform",
      "hero-bg-kr-hospital-ward-corridor",
      "hero-bg-rofan-noble-study-parlor",
      "hero-bg-kr-rooftop-studio-oneroom",
      "hero-bg-kr-convenience-store-night",
    ];
    expect(VIRTUAL_THREE_HERO_BG_PRESETS.map((p) => p.themeId)).toEqual(expectedThemeIds);

    for (const preset of VIRTUAL_THREE_HERO_BG_PRESETS) {
      expect(findVirtualThreeTheme(preset.themeId)?.kind).toBe("hero-scene");
      expect(findVirtualThreeHeroBgPreset(preset.themeId)).toBe(preset);
      expect(findVirtualThreeHeroBgPreset(preset.slug)).toBe(preset);
      expect(preset.desktopNodeNames).toHaveLength(8);
      expect(preset.mobileNodeNames).toHaveLength(4);
      expect(preset.seatAnchors.length).toBeGreaterThanOrEqual(2);
      expect(preset.reviewScreen.widthMeters).toBeGreaterThan(2);
      expect(preset.navBoundsMeters.maxX).toBeGreaterThan(preset.navBoundsMeters.minX);
      expect(preset.navBoundsMeters.maxZ).toBeGreaterThan(preset.navBoundsMeters.minZ);

      const desktop = preset.resolveDelivery({ viewportWidthPx: 1440, deviceMemoryGb: 16 });
      expect(desktop.tier).toBe("desktop");
      expect(desktop.asset?.url).toBe(preset.theme.desktopUrl);

      const mobile = preset.resolveDelivery({ viewportWidthPx: 390, deviceMemoryGb: 4 });
      expect(mobile.tier).toBe("mobile");
      expect(mobile.asset?.url).toBe(preset.theme.mobileUrl);
    }
  });

  it("향후 v2 신규 씬 엔트리가 카탈로그에 추가되면 하드코딩 없이 스폰·좌석·리뷰스크린·바운드를 자동 생성한다", () => {
    const baseEntry = STUDIO_BG3D_HERO_V1_ENTRIES[0]!;
    const syntheticV2 = {
      ...baseEntry,
      slug: "kr_hanok_courtyard_v2" as StudioBg3dHeroV1SceneEntry["slug"],
      labelKo: "한옥 중정 아틀리에 (v2)",
      genreKo: "사극·로판",
      desktopAsset: {
        ...baseEntry.desktopAsset,
        id: "ts-bg3d-hero-v2-kr_hanok_courtyard_v2-desktop",
        url: "/assets/3d/environments/hero-v2/kr_hanok_courtyard_v2.glb",
        bounds: [12.0, 4.2, 10.0] as const,
      },
      mobileAsset: {
        ...baseEntry.mobileAsset,
        id: "ts-bg3d-hero-v2-kr_hanok_courtyard_v2-mobile",
        url: "/assets/3d/environments/hero-v2/kr_hanok_courtyard_v2-mobile.glb",
        bounds: [12.0, 4.2, 10.0] as const,
      },
    } satisfies StudioBg3dHeroV1SceneEntry;

    const presets = buildHeroBgRoomPresets([...STUDIO_BG3D_HERO_V1_ENTRIES, syntheticV2]);
    expect(presets).toHaveLength(STUDIO_BG3D_HERO_V1_ENTRIES.length + 1);
    const added = presets.at(-1)!;
    expect(added.themeId).toBe(toHeroBgThemeId("kr_hanok_courtyard_v2"));
    expect(added.theme.copy.ko.name).toBe("한옥 중정 아틀리에 (v2)");
    expect(added.theme.copy.en.name).toBe("Kr Hanok Courtyard V2");
    expect(added.seatAnchors).toHaveLength(2);
    expect(added.reviewScreen.widthMeters).toBeGreaterThan(2.5);
    expect(added.navBoundsMeters.maxX - added.navBoundsMeters.minX).toBeGreaterThan(9);
  });

  it("hero-scene 아키텍처는 바닥 충돌 메쉬와 3D 리뷰 스크린 메쉬를 생성하고 해제한다", () => {
    const theme = VIRTUAL_THREE_HERO_SCENE_THEMES[1]!;
    const scene = new THREE.Scene();
    const arch = buildStudioThreeWorldArchitecture(scene, DEFAULT_STUDIO_WORLD_MANIFEST, theme);
    expect(arch.floorMesh.name).toBe("hero-scene-walkable-floor");
    expect(arch.reviewScreenMesh?.name).toBe("hero-scene-review-screen");
    expect(arch.heroPreset?.themeId).toBe(theme.id);
    arch.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("Hero 3D BG 소스 로더와 스테이지 준비기가 Desktop/Mobile 티어 GLB를 fetch·파싱하고 정리한다", async () => {
    const theme = VIRTUAL_THREE_HERO_SCENE_THEMES[0]!;
    const glb = minimalGlbBuffer();
    const fetchMock = vi.fn(async () => new Response(glb, { status: 200 }));
    const verified = await loadVirtualThreeHeroSceneSource(theme, {
      deliveryContext: { viewportWidthPx: 390, deviceMemoryGb: 4 },
      fetchImpl: fetchMock,
    });
    expect(verified.tier).toBe("mobile");
    expect(verified.url).toBe(theme.mobileUrl);
    expect(fetchMock).toHaveBeenCalledWith(theme.mobileUrl, expect.objectContaining({ credentials: "same-origin" }));

    vi.stubGlobal("fetch", vi.fn(async () => new Response(glb, { status: 200 })));
    const parseSpy = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValueOnce({
      scene: (() => {
        const g = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6), new THREE.MeshStandardMaterial());
        mesh.name = "BG_Floor";
        mesh.position.y = 1.5;
        g.add(mesh);
        return g;
      })(),
      scenes: [],
      animations: [],
      cameras: [],
      asset: {},
      parser: {} as never,
      userData: {},
    });
    try {
      const stageScene = new THREE.Scene();
      const onProgress = vi.fn();
      const stage = await prepareVirtualThreeHeroSceneStage({
        scene: stageScene,
        manifest: DEFAULT_STUDIO_WORLD_MANIFEST,
        theme,
        signal: new AbortController().signal,
        onProgress,
        deliveryContext: { viewportWidthPx: 1440, deviceMemoryGb: 16 },
      });
      expect(onProgress).toHaveBeenCalledWith(1, 1);
      expect(stage.sourceInputs).toHaveLength(1);
      const heroRoot = stageScene.getObjectByName(`hero-bg-scene-${theme.heroSlug}`);
      expect(heroRoot).toBeTruthy();
      expect(heroRoot?.userData.heroDeliveryTier).toBe("desktop");
      stage.dispose();
      expect(stageScene.getObjectByName(`hero-bg-scene-${theme.heroSlug}`)).toBeUndefined();
    } finally {
      parseSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
