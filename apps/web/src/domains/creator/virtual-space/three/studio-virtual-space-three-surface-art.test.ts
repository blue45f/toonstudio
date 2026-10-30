import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import { CAMPUS_INTERACTIONS } from "../studio-virtual-space-campus-blueprint";
import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { studioOfficeEnvironmentManifest } from "../studio-virtual-space-office-environments";
import { studioWorldInteractions } from "../studio-virtual-space-world-manifest";
import { createStudioThreeDeferredArtLoader } from "./studio-virtual-space-three-deferred-art";
import { STUDIO_THREE_SCALE } from "./studio-virtual-space-three-scene";
import { createStudioThreeFloorMaterial, createStudioThreeFloorTexture, createStudioThreeOfficeMural, createStudioThreeSculpturalMural, disposeStudioThreeSurfaceNodes, studioThreeThemeLightingPreset } from "./studio-virtual-space-three-surface-art";
import { studioThreeSurfaceRecipe } from "./studio-virtual-space-three-surface-recipes";
import { buildStudioThreeWorldArchitecture } from "./studio-virtual-space-three-world-layout";
import { DEFAULT_VIRTUAL_THREE_THEME, findVirtualThreeTheme } from "./themes/virtual-three-theme-catalog";
import type { VirtualThreeAssetRecipeThemeId } from "./themes/virtual-three-theme-types";

function recipe(id: VirtualThreeAssetRecipeThemeId) {
  const theme = findVirtualThreeTheme(id);
  if (!theme || theme.kind !== "asset-recipe") throw new Error(`독립 3D 테마가 없습니다: ${id}`);
  return theme;
}

describe("3D 테마 재질·벽면 원화", () => {
  it.each([["forestretreat", "lawn"], ["gardenstudy", "stone"]] as const)("%s의 바닥은 3D PBR 값을 보존하고 실제 타일 무늬를 그린다", (id, pattern) => {
    const theme = recipe(id);
    const spec = studioThreeSurfaceRecipe(theme).floors.grass;
    const context = {
      scale: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    vi.stubGlobal("document", { createElement: () => canvas });
    try {
      expect(spec.pattern).toBe(pattern);
      expect(spec.base).toBe(Number.parseInt(theme.surfacePBR.floor.baseColor.slice(1), 16));
      const material = createStudioThreeFloorMaterial(spec, 10, 8);
      try {
        expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
        expect(context.fillRect).toHaveBeenCalled();
        expect(material.map?.image).toBe(canvas);
        expect(material.roughness).toBe(theme.surfacePBR.floor.roughness);
        expect(material.metalness).toBe(theme.surfacePBR.floor.metalness);
      } finally { material.map?.dispose(); material.dispose(); }
    } finally { vi.unstubAllGlobals(); }
  });

  it("DOM과 WebGL이 없는 환경도 테마 색을 유지하고 Canvas가 없으면 texture 없이 그린다", () => {
    const spec = studioThreeSurfaceRecipe(DEFAULT_VIRTUAL_THREE_THEME, "forest-atelier").floors.wood;
    expect(createStudioThreeFloorTexture(spec, 10, 8)).toBeNull();
    const material = createStudioThreeFloorMaterial(spec, 10, 8);
    expect(material.map).toBeNull();
    expect(material.color.getHex()).toBe(spec.base);
    expect(material.roughness).toBe(spec.roughness);
    expect(material.metalness).toBe(spec.metalness);
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    try { expect(createStudioThreeFloorTexture(spec, 10, 8)).toBeNull(); }
    finally { vi.unstubAllGlobals(); }
    material.dispose();
  });

  it("HQ baseline과 새 3D PBR은 2D 팔레트 없이 적용하고 정본 충돌 자료를 바꾸지 않는다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    const colliders = JSON.stringify(manifest.colliders);
    const colors: number[] = [];
    for (const theme of [DEFAULT_VIRTUAL_THREE_THEME, recipe("sflab")]) {
      const scene = new THREE.Scene();
      const world = buildStudioThreeWorldArchitecture(scene, manifest, theme);
      const desk = scene.getObjectByName("room-floor-hq-ink-bay");
      const review = scene.getObjectByName("room-floor-hq-review-room");
      if (!(desk instanceof THREE.Mesh) || !(desk.material instanceof THREE.MeshStandardMaterial)
        || !(review instanceof THREE.Mesh) || !(review.material instanceof THREE.MeshStandardMaterial)) throw new Error("방 재질을 찾지 못했습니다.");
      const surface = studioThreeSurfaceRecipe(theme);
      expect(desk.material.color.getHex()).toBe(surface.floors.wood.base);
      expect(review.material.color.getHex()).toBe(surface.floors.carpet.base);
      expect(desk.material.roughness).toBe(surface.floors.wood.roughness);
      expect(desk.material.metalness).toBe(surface.floors.wood.metalness);
      const ring = world.workstationRings[0]?.outerRing;
      if (!ring || !(ring.material instanceof THREE.MeshBasicMaterial)) throw new Error("공정 링 재질을 찾지 못했습니다.");
      expect(ring.material.color.getHex()).toBe(surface.decorAccent);
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
    const mural = createStudioThreeOfficeMural(room, DEFAULT_VIRTUAL_THREE_THEME, 1 / 32);
    if (!mural) throw new Error("벽면 액자가 없습니다.");
    expect(mural.artwork.rotation.x).toBe(0);
    expect(mural.artwork.geometry.parameters.width / mural.artwork.geometry.parameters.height).toBeCloseTo(1.5);
    expect(mural.artwork.material.toneMapped).toBe(false);
    expect(createStudioThreeOfficeMural(room, recipe("parkbotanical"), 1 / 32)).toBeNull();
    disposeStudioThreeSurfaceNodes([mural.group]);
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, manifest);
    const texture = new THREE.Texture();
    const load = vi.fn().mockResolvedValue(texture);
    const frame = scene.getObjectByName("office-theme-mural-forest-atelier");
    expect(frame?.userData.assetState).toBe("deferred");
    const loading = world.loadDeferredArt(undefined, load);
    expect(load).not.toHaveBeenCalled();
    await loading;
    expect(frame?.userData.assetState).toBe("ready");
    expect(load).toHaveBeenCalledWith(manifest.backgroundUrl, undefined);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    world.dispose();
  });

  it("원화 로드 실패는 알리고 기존 바닥·액자·장면을 유지한다", async () => {
    const manifest = studioOfficeEnvironmentManifest("orbital-observatory");
    if (!manifest) throw new Error("궤도 테마가 없습니다.");
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, manifest);
    const failed = vi.fn();
    const load = vi.fn().mockRejectedValue(new Error("test image error"));
    await expect(world.loadDeferredArt(failed, load)).rejects.toThrow("test image error");
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
    const world = buildStudioThreeWorldArchitecture(scene, manifest);
    let finish: ((texture: THREE.Texture) => void) | undefined;
    const load = vi.fn(() => new Promise<THREE.Texture>((resolve) => { finish = resolve; }));
    const loading = world.loadDeferredArt(undefined, load);
    const rejected = expect(loading).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    world.dispose();
    await rejected;
    const texture = new THREE.Texture();
    const dispose = vi.spyOn(texture, "dispose");
    finish?.(texture);
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    expect(scene.children).toHaveLength(0);
  });

  it("조명 시작값도 3D recipe 또는 보존 manifest만 읽는다", () => {
    const orbital = studioOfficeEnvironmentManifest("orbital-observatory");
    const forest = studioOfficeEnvironmentManifest("forest-atelier");
    if (!orbital || !forest) throw new Error("공통 manifest가 없습니다.");
    expect(studioThreeThemeLightingPreset(DEFAULT_VIRTUAL_THREE_THEME, orbital)).toBe("studio");
    expect(studioThreeThemeLightingPreset(DEFAULT_VIRTUAL_THREE_THEME, forest)).toBe("day");
    expect(studioThreeThemeLightingPreset(recipe("sflab"))).toBe("studio");
    expect(studioThreeThemeLightingPreset(recipe("gothicarchive"))).toBe("night");
  });

  it.each(["parkbotanical", "fantasyguild", "sflab", "gothicarchive", "vehiclegarage", "cafefood"] as const)("%s의 벽화는 미리보기 교체가 아닌 깊이·PBR을 가진 3D 조형물이다", (id) => {
    const room = studioOfficeEnvironmentManifest("forest-atelier")?.rooms[0];
    if (!room) throw new Error("공통 방이 없습니다.");
    const group = createStudioThreeSculpturalMural(room, recipe(id), 1 / 32);
    expect(group.userData.artworkKind).toBe("sculptural-3d");
    expect(new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).z).toBeGreaterThan(0.2);
    const relief = group.getObjectByName("mural-relief");
    if (!(relief instanceof THREE.InstancedMesh) || !(relief.material instanceof THREE.MeshStandardMaterial)) throw new Error("공유 입체 벽화가 없습니다.");
    expect(relief.count).toBeGreaterThan(1);
    expect(relief.material.map).toBeNull();
    const release = vi.spyOn(relief, "dispose");
    disposeStudioThreeSurfaceNodes([group]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("새 테마는 방·작업점·충돌·spawn 권위를 바꾸거나 baseline 원화를 요청하지 않는다", async () => {
    const manifest = studioVirtualToonHqManifest(false);
    const before = JSON.stringify(manifest);
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, manifest, recipe("parkbotanical"));
    const load = vi.fn();
    await world.loadDeferredArt(undefined, load);
    expect(load).not.toHaveBeenCalled();
    expect(world.workstationRings.map((ring) => ring.id)).toEqual(studioWorldInteractions(manifest).map((interaction) => interaction.id));
    expect(JSON.stringify(manifest)).toBe(before);
    world.dispose();
  });

  it("baseline 원화 loader가 동기로 throw해도 명시적으로 알리고 장면을 유지한다", async () => {
    const manifest = studioOfficeEnvironmentManifest("orbital-observatory");
    if (!manifest) throw new Error("공통 manifest가 없습니다.");
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, manifest);
    const failed = vi.fn();
    await expect(world.loadDeferredArt(failed, () => { throw new Error("synchronous image error"); })).rejects.toThrow("synchronous image error");
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(manifest.backgroundUrl));
    expect(scene.getObjectByName("manifest-walkable-floor")).toBeDefined();
    world.dispose();
  });

  it("미분류 방 이름은 객체 prototype이나 2D 별칭에서 재질을 상속하지 않는다", () => {
    const baseline = studioThreeSurfaceRecipe(DEFAULT_VIRTUAL_THREE_THEME);
    expect(studioThreeSurfaceRecipe(DEFAULT_VIRTUAL_THREE_THEME, "constructor")).toBe(baseline);
    expect(studioThreeSurfaceRecipe(DEFAULT_VIRTUAL_THREE_THEME, "__proto__")).toBe(baseline);
    expect(studioThreeSurfaceRecipe(DEFAULT_VIRTUAL_THREE_THEME, "unknown-custom-room")).toBe(baseline);
  });

  it("시작 timer 전에 취소하면 promise를 끝내고 이미지 요청을 시작하지 않는다", async () => {
    vi.useFakeTimers();
    const manifest = studioOfficeEnvironmentManifest("forest-atelier");
    if (!manifest) throw new Error("공통 manifest가 없습니다.");
    const world = buildStudioThreeWorldArchitecture(new THREE.Scene(), manifest);
    const abort = new AbortController();
    const load = vi.fn();
    try {
      const loading = world.loadDeferredArt(undefined, load, abort.signal);
      const rejected = expect(loading).rejects.toMatchObject({ name: "AbortError" });
      abort.abort();
      await rejected;
      expect(load).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { world.dispose(); vi.useRealTimers(); }
  });

  it("일부 아트 실패는 완료 대기를 reject하고 이미 받은 texture를 해제한다", async () => {
    const room = studioOfficeEnvironmentManifest("forest-atelier")?.rooms[0];
    if (!room) throw new Error("공통 방이 없습니다.");
    const first = createStudioThreeOfficeMural(room, DEFAULT_VIRTUAL_THREE_THEME, 1 / 32);
    const second = createStudioThreeOfficeMural({ ...room, id: "orbital-observatory" }, DEFAULT_VIRTUAL_THREE_THEME, 1 / 32);
    if (!first || !second) throw new Error("보존 액자가 없습니다.");
    const loader = createStudioThreeDeferredArtLoader([first, second]);
    const texture = new THREE.Texture();
    const release = vi.spyOn(texture, "dispose");
    let failSecond: ((error: Error) => void) | undefined;
    const load = vi.fn((url: string) => url === first.url ? Promise.resolve(texture)
      : new Promise<THREE.Texture>((_resolve, reject) => { failSecond = reject; }));
    const loading = loader.load(undefined, load);
    const rejected = expect(loading).rejects.toThrow("second image error");
    await vi.waitFor(() => expect(first.artwork.material.map).toBe(texture));
    failSecond?.(new Error("second image error"));
    await rejected;
    expect(first.artwork.material.map).toBeNull();
    expect(first.group.userData.assetState).toBe("error");
    expect(release).toHaveBeenCalledTimes(1);
    loader.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    disposeStudioThreeSurfaceNodes([first.group, second.group]);
  });

  it("모든 실제 texture가 준비될 때까지 완료 promise를 성공시키지 않는다", async () => {
    const room = studioOfficeEnvironmentManifest("forest-atelier")?.rooms[0];
    if (!room) throw new Error("공통 방이 없습니다.");
    const first = createStudioThreeOfficeMural(room, DEFAULT_VIRTUAL_THREE_THEME, 1 / 32);
    const second = createStudioThreeOfficeMural({ ...room, id: "orbital-observatory" }, DEFAULT_VIRTUAL_THREE_THEME, 1 / 32);
    if (!first || !second) throw new Error("보존 액자가 없습니다.");
    const loader = createStudioThreeDeferredArtLoader([first, second]);
    const firstTexture = new THREE.Texture(), secondTexture = new THREE.Texture();
    let finishSecond: ((texture: THREE.Texture) => void) | undefined;
    const load = vi.fn((url: string) => url === first.url ? Promise.resolve(firstTexture)
      : new Promise<THREE.Texture>((resolve) => { finishSecond = resolve; }));
    let ready = false;
    const loading = loader.load(undefined, load).then(() => { ready = true; });
    await vi.waitFor(() => expect(first.artwork.material.map).toBe(firstTexture));
    expect(ready).toBe(false);
    finishSecond?.(secondTexture);
    await loading;
    expect(ready).toBe(true);
    expect(second.artwork.material.map).toBe(secondTexture);
    loader.dispose();
    disposeStudioThreeSurfaceNodes([first.group, second.group]);
  });

  it("campus 보존 builder의 추가 노드만 한 번 해제하고 기존 scene 노드를 보존한다", () => {
    const scene = new THREE.Scene();
    const existing = new THREE.Group();
    scene.add(existing);
    const manifest = studioVirtualCampusManifest(false);
    const before = JSON.stringify(manifest);
    const world = buildStudioThreeWorldArchitecture(scene, manifest);
    expect(world.floorMesh.name).toBe("campus-walkable-floor");
    expect(world.workstationRings.map(({ id, zoneId, point, radius }) => ({ id, zoneId, point, radius })))
      .toEqual(CAMPUS_INTERACTIONS.map(({ id, zoneId, point, radius }) => ({ id, zoneId, point, radius })));
    for (const ring of world.workstationRings) {
      expect(ring.group.position.x).toBe(ring.point.x * STUDIO_THREE_SCALE);
      expect(ring.group.position.z).toBe(ring.point.y * STUDIO_THREE_SCALE);
      expect(ring.outerRing.parent).toBe(ring.group);
    }
    expect(world.waterMeshes.length).toBeGreaterThan(0);
    const release = vi.spyOn(world.floorMesh.geometry, "dispose");
    world.dispose(); world.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    expect(scene.children).toEqual([existing]);
    expect(JSON.stringify(manifest)).toBe(before);
  });
});
