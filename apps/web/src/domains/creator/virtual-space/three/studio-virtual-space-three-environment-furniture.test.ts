import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { STUDIO_OFFICE_ENVIRONMENT_KEYS, studioOfficeEnvironment, studioOfficeEnvironmentManifest } from "../studio-virtual-space-office-environments";
import { buildStudioThreeEnvironmentFurniture, studioThreeEnvironmentFurniturePlans } from "./studio-virtual-space-three-environment-furniture";
import { studioThreeGeneratedProps } from "./studio-virtual-space-three-generated-assets";
import { disposeStudioThreeSurfaceNodes } from "./studio-virtual-space-three-surface-art";
import { buildStudioThreeWorldArchitecture } from "./studio-virtual-space-three-world-layout";

describe("새 3D 사무실의 가구 충돌체 시각화", () => {
  it.each(STUDIO_OFFICE_ENVIRONMENT_KEYS)("%s는 내부 큰 footprint마다 실제 가구/식재를 그리고 외부 배경은 제외한다", (key) => {
    const manifest = studioOfficeEnvironmentManifest(key);
    const environment = studioOfficeEnvironment(key);
    const room = manifest?.rooms[0];
    if (!manifest || !environment || !room) throw new Error(`새 환경이 없습니다: ${key}`);
    const original = JSON.stringify(manifest);
    const plans = studioThreeEnvironmentFurniturePlans(manifest);
    expect(plans.map((plan) => plan.sourceColliderIndex)).toEqual(environment.colliders.map((_, index) => index).slice(1));
    const groups = buildStudioThreeEnvironmentFurniture(manifest, key, 1 / 32);
    expect(groups).toHaveLength(plans.length);
    for (const [index, plan] of plans.entries()) {
      expect(plan.rect.x).toBeGreaterThanOrEqual(room.x);
      expect(plan.rect.y).toBeGreaterThanOrEqual(room.y);
      expect(plan.rect.x + plan.rect.width).toBeLessThanOrEqual(room.x + room.width);
      expect(plan.rect.y + plan.rect.height).toBeLessThanOrEqual(room.y + room.height);
      const group = groups[index];
      if (!group) throw new Error("footprint 가구가 없습니다.");
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

  it.each(STUDIO_OFFICE_ENVIRONMENT_KEYS)("%s의 기존 실생성 모델은 중복 가구로 가리지 않고 투명 전시 경계만 추가한다", (key) => {
    const manifest = studioOfficeEnvironmentManifest(key);
    if (!manifest) throw new Error(`새 환경이 없습니다: ${key}`);
    const before = studioThreeGeneratedProps(manifest);
    const plans = studioThreeEnvironmentFurniturePlans(manifest);
    const groups = buildStudioThreeEnvironmentFurniture(manifest, key, 1 / 32);
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
    const architecture = buildStudioThreeWorldArchitecture(scene, manifest, "forest-atelier");
    for (const plan of studioThreeEnvironmentFurniturePlans(manifest)) {
      expect(scene.getObjectByName(`environment-furniture-${plan.roomId}-${plan.sourceColliderIndex}`)).toBeDefined();
    }
    architecture.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
