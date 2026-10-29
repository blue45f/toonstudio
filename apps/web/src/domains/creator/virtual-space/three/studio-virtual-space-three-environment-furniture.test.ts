import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { studioOfficeEnvironmentManifest } from "../studio-virtual-space-office-environments";
import { buildStudioThreeEnvironmentFurniture, studioThreeEnvironmentFurniturePlans } from "./studio-virtual-space-three-environment-furniture";
import { studioThreeGeneratedProps } from "./studio-virtual-space-three-generated-assets";
import { disposeStudioThreeSurfaceNodes } from "./studio-virtual-space-three-surface-art";
import { buildStudioThreeWorldArchitecture } from "./studio-virtual-space-three-world-layout";
import { DEFAULT_VIRTUAL_THREE_THEME, findVirtualThreeTheme } from "./themes/virtual-three-theme-catalog";

const OFFICE_FIXTURES = ["forest-atelier", "orbital-observatory", "tidal-atelier"] as const;
const EXPECTED_FOOTPRINTS = { "forest-atelier": 6, "orbital-observatory": 6, "tidal-atelier": 9 };

describe("새 3D 사무실의 가구 충돌체 시각화", () => {
  it.each(OFFICE_FIXTURES)("%s는 내부 큰 footprint마다 실제 가구/식재를 그리고 외부 배경은 제외한다", (key) => {
    const manifest = studioOfficeEnvironmentManifest(key);
    const room = manifest?.rooms[0];
    if (!manifest || !room) throw new Error(`공통 환경 manifest가 없습니다: ${key}`);
    const original = JSON.stringify(manifest);
    const plans = studioThreeEnvironmentFurniturePlans(manifest);
    expect(plans).toHaveLength(EXPECTED_FOOTPRINTS[key]);
    const groups = buildStudioThreeEnvironmentFurniture(manifest, DEFAULT_VIRTUAL_THREE_THEME, 1 / 32);
    expect(groups).toHaveLength(plans.length);
    for (const [index, plan] of plans.entries()) {
      expect(plan.rect.x).toBeGreaterThanOrEqual(room.x);
      expect(plan.rect.y).toBeGreaterThanOrEqual(room.y);
      expect(plan.rect.x + plan.rect.width).toBeLessThanOrEqual(room.x + room.width);
      expect(plan.rect.y + plan.rect.height).toBeLessThanOrEqual(room.y + room.height);
      const group = groups[index];
      if (!group) throw new Error("footprint 가구가 없습니다.");
      expect(group.userData.sourceColliderRect).toBe(plan.sourceColliderRect);
      expect(manifest.colliders).toContain(plan.sourceColliderRect);
      expect(group.userData.semanticRole).toBe(plan.semanticRole);
      expect(group.userData.replaceableByThemeAsset).toBe(plan.reservedGeneratedIds.length === 0);
      expect(group.children.length).toBeGreaterThan(2);
      const bounds = new THREE.Box3().setFromObject(group);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThanOrEqual(plan.rect.width / 32 * 0.98);
      expect(size.z).toBeGreaterThanOrEqual(plan.rect.height / 32 * 0.98);
      expect(size.y).toBeGreaterThan(0.3);
      expect(size.x).toBeLessThanOrEqual(plan.rect.width / 32 + 0.02);
      expect(size.z).toBeLessThanOrEqual(plan.rect.height / 32 + 0.02);
    }
    expect(JSON.stringify(manifest)).toBe(original);
    disposeStudioThreeSurfaceNodes(groups);
  });

  it.each(OFFICE_FIXTURES)("%s의 기존 실생성 모델은 중복 가구로 가리지 않고 투명 전시 경계만 추가한다", (key) => {
    const manifest = studioOfficeEnvironmentManifest(key);
    if (!manifest) throw new Error(`새 환경이 없습니다: ${key}`);
    const before = studioThreeGeneratedProps(manifest);
    const plans = studioThreeEnvironmentFurniturePlans(manifest);
    const groups = buildStudioThreeEnvironmentFurniture(manifest, DEFAULT_VIRTUAL_THREE_THEME, 1 / 32);
    for (const [index, plan] of plans.entries()) {
      if (plan.reservedGeneratedIds.length === 0) continue;
      expect(plan.kind).toBe("display");
      expect(plan.reservedGeneratedIds.every((id) => before.some((prop) => prop.id === id))).toBe(true);
      const group = groups[index];
      if (!group) throw new Error("실생성 모델의 전시 경계가 없습니다.");
      expect(group.getObjectByName("display-glass")).toBeDefined();
      expect(group.getObjectByName("desktop")).toBeUndefined();
      expect(group.getObjectByName("bookshelf-shelf")).toBeUndefined();
    }
    expect(studioThreeGeneratedProps(manifest)).toEqual(before);
    disposeStudioThreeSurfaceNodes(groups);
  });

  it("HQ와 기존 캠퍼스는 가구 배치를 추가하지 않고 새 환경 builder에서만 연결한다", () => {
    expect(studioThreeEnvironmentFurniturePlans(studioVirtualToonHqManifest(false))).toEqual([]);
    expect(studioThreeEnvironmentFurniturePlans(studioVirtualCampusManifest(false))).toEqual([]);
    const manifest = studioOfficeEnvironmentManifest("forest-atelier");
    if (!manifest) throw new Error("숲 테마가 없습니다.");
    const scene = new THREE.Scene();
    const architecture = buildStudioThreeWorldArchitecture(scene, manifest);
    for (const plan of studioThreeEnvironmentFurniturePlans(manifest)) {
      expect(scene.getObjectByName(`environment-furniture-${plan.id}`)).toBeDefined();
    }
    architecture.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("collider 순서·중복·새 미분류 장애물은 3D 가구 의미와 위치를 바꾸지 않는다", () => {
    const manifest = studioOfficeEnvironmentManifest("forest-atelier");
    if (!manifest) throw new Error("공통 manifest가 없습니다.");
    const before = studioThreeEnvironmentFurniturePlans(manifest);
    const reordered = { ...manifest, colliders: [{ x: 650, y: 730, width: 80, height: 80 }, ...[...manifest.colliders].reverse(), ...manifest.colliders] };
    expect(studioThreeEnvironmentFurniturePlans(reordered)).toEqual(before);
    expect(before.find((plan) => plan.id === "forest-story-shelf")?.reservedGeneratedIds).toContain("tripo-artist-easel");
    expect(before.find((plan) => plan.id === "forest-east-console")?.kind).toBe("console");
  });

  it("정본에서 제거한 footprint를 과거 배열이나 3D fixture로 되살리지 않는다", () => {
    const manifest = studioOfficeEnvironmentManifest("forest-atelier");
    if (!manifest) throw new Error("공통 manifest가 없습니다.");
    const removed = { ...manifest, colliders: manifest.colliders.filter((rect) => rect.x !== 1220 || rect.y !== 390) };
    const plans = studioThreeEnvironmentFurniturePlans(removed);
    expect(plans).toHaveLength(5);
    expect(plans.some((plan) => plan.id === "forest-east-console")).toBe(false);
    expect(studioThreeEnvironmentFurniturePlans({ ...manifest, rooms: manifest.rooms.map((room) => ({ ...room, x: 2000 })) })).toEqual([]);
  });

  it("새 3D PBR은 가구에도 적용하고 공통 footprint와 기존 실생성 모델을 보존한다", () => {
    const theme = findVirtualThreeTheme("sflab");
    const manifest = studioOfficeEnvironmentManifest("forest-atelier");
    if (!manifest || !theme || theme.kind !== "asset-recipe") throw new Error("3D 테마 또는 공통 manifest가 없습니다.");
    const before = JSON.stringify(manifest);
    const groups = buildStudioThreeEnvironmentFurniture(manifest, theme, 1 / 32);
    const desktop = groups.find((group) => group.name === "environment-furniture-forest-east-console")?.getObjectByName("desktop");
    if (!(desktop instanceof THREE.Mesh) || !(desktop.material instanceof THREE.MeshStandardMaterial)) throw new Error("3D 가구 재질이 없습니다.");
    expect(desktop.material.color.getHexString()).toBe(theme.surfacePBR.floor.baseColor.slice(1));
    expect(desktop.material.roughness).toBe(theme.surfacePBR.floor.roughness);
    expect(desktop.material.metalness).toBe(theme.surfacePBR.floor.metalness);
    expect(JSON.stringify(manifest)).toBe(before);
    disposeStudioThreeSurfaceNodes(groups);
  });
});
