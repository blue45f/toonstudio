import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import { studioOfficeEnvironmentManifest } from "../studio-virtual-space-office-environments";
import { studioSpaceTheme } from "../studio-virtual-space-theme";
import { createStudioThreeFloorMaterial, createStudioThreeFloorTexture, createStudioThreeOfficeMural, studioThreeThemeLightingPreset } from "./studio-virtual-space-three-surface-art";
import { buildStudioThreeWorldArchitecture } from "./studio-virtual-space-three-world-layout";

describe("3D 테마 재질·벽면 원화", () => {
  it("DOM과 WebGL이 없는 환경도 테마 색을 유지하고 Canvas가 없으면 texture 없이 그린다", () => {
    const spec = studioSpaceTheme("forest-atelier").floors.wood;
    expect(createStudioThreeFloorTexture(spec, 10, 8)).toBeNull();
    const material = createStudioThreeFloorMaterial(spec, 10, 8);
    expect(material.map).toBeNull();
    expect(material.color.getHex()).toBe(spec.base);
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    try { expect(createStudioThreeFloorTexture(spec, 10, 8)).toBeNull(); }
    finally { vi.unstubAllGlobals(); }
    material.dispose();
  });

  it("HQ 방의 나무·카펫·타일은 선택한 기존 테마 팔레트를 따르고 충돌 자료를 바꾸지 않는다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    const colliders = JSON.stringify(manifest.colliders);
    const colors: number[] = [];
    for (const key of ["modern-office", "neon-night"] as const) {
      const scene = new THREE.Scene();
      const world = buildStudioThreeWorldArchitecture(scene, manifest, key);
      const desk = scene.getObjectByName("room-floor-hq-ink-bay");
      const review = scene.getObjectByName("room-floor-hq-review-room");
      if (!(desk instanceof THREE.Mesh) || !(desk.material instanceof THREE.MeshStandardMaterial)
        || !(review instanceof THREE.Mesh) || !(review.material instanceof THREE.MeshStandardMaterial)) throw new Error("방 재질을 찾지 못했습니다.");
      expect(desk.material.color.getHex()).toBe(studioSpaceTheme(key).floors.wood.base);
      expect(review.material.color.getHex()).toBe(studioSpaceTheme(key).floors.carpet.base);
      const ring = world.workstationRings[0]?.outerRing;
      if (!ring || !(ring.material instanceof THREE.MeshBasicMaterial)) throw new Error("공정 링 재질을 찾지 못했습니다.");
      expect(ring.material.color.getHex()).toBe(studioSpaceTheme(key).decorAccent);
      colors.push(desk.material.color.getHex());
      world.dispose();
    }
    expect(colors[0]).not.toBe(colors[1]);
    expect(JSON.stringify(manifest.colliders)).toBe(colliders);
  });

  it("원본 3:2 아트는 세로 벽면 액자에만 매핑하고 geometry를 먼저 준비한다", async () => {
    const manifest = studioOfficeEnvironmentManifest("forest-atelier");
    const room = manifest?.rooms[0];
    if (!manifest || !room) throw new Error("숲 테마가 없습니다.");
    const mural = createStudioThreeOfficeMural(room, "forest-atelier", 1 / 32);
    if (!mural) throw new Error("벽면 액자가 없습니다.");
    expect(mural.artwork.rotation.x).toBe(0);
    expect(mural.artwork.geometry.parameters.width / mural.artwork.geometry.parameters.height).toBeCloseTo(1.5);
    expect(mural.artwork.material.toneMapped).toBe(false);
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, manifest, "forest-atelier");
    const texture = new THREE.Texture();
    const load = vi.fn().mockResolvedValue(texture);
    const frame = scene.getObjectByName("office-theme-mural-forest-atelier");
    expect(frame?.userData.assetState).toBe("deferred");
    world.loadDeferredArt(undefined, load);
    expect(load).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(frame?.userData.assetState).toBe("ready"));
    expect(load).toHaveBeenCalledWith(manifest.backgroundUrl);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    world.dispose();
  });

  it("원화 로드 실패는 알리고 기존 바닥·액자·장면을 유지한다", async () => {
    const manifest = studioOfficeEnvironmentManifest("orbital-observatory");
    if (!manifest) throw new Error("궤도 테마가 없습니다.");
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, manifest, "orbital-observatory");
    const failed = vi.fn();
    const load = vi.fn().mockRejectedValue(new Error("test image error"));
    world.loadDeferredArt(failed, load);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(manifest.backgroundUrl));
    expect(scene.getObjectByName("manifest-walkable-floor")).toBeDefined();
    expect(scene.getObjectByName("office-theme-mural-orbital-observatory")?.userData.assetState).toBe("error");
    expect(load).toHaveBeenCalledTimes(1);
    world.dispose();
  });

  it("장면 해제 뒤 도착한 원화 texture는 재연결하지 않고 해제한다", async () => {
    const manifest = studioOfficeEnvironmentManifest("tidal-atelier");
    if (!manifest) throw new Error("산호 테마가 없습니다.");
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, manifest, "tidal-atelier");
    let finish: ((texture: THREE.Texture) => void) | undefined;
    const load = vi.fn(() => new Promise<THREE.Texture>((resolve) => { finish = resolve; }));
    world.loadDeferredArt(undefined, load);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    world.dispose();
    const texture = new THREE.Texture();
    const dispose = vi.spyOn(texture, "dispose");
    finish?.(texture);
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    expect(scene.children).toHaveLength(0);
  });

  it("궤도 관측은 studio 조명, 숲·산호는 day 조명으로 시작한다", () => {
    expect(studioThreeThemeLightingPreset("orbital-observatory")).toBe("studio");
    expect(studioThreeThemeLightingPreset("forest-atelier")).toBe("day");
    expect(studioThreeThemeLightingPreset("tidal-atelier")).toBe("day");
    expect(studioThreeThemeLightingPreset("neon-night")).toBe("night");
  });
});
