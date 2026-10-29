import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import type { StudioVirtualSpaceWorldManifest } from "../../studio-virtual-space-world-manifest";
import { STUDIO_THREE_SCALE } from "../studio-virtual-space-three-scene";
import { createVirtualThreeThemePlacementPlanner } from "./virtual-three-theme-placement";

const owned: { dispose(): void }[] = [];
afterEach(() => { for (const resource of owned.splice(0)) resource.dispose(); });

function world(): StudioVirtualSpaceWorldManifest {
  return {
    id: "theme-core-bounds-fixture", version: 1, width: 1600, height: 1200,
    backgroundAssetKey: "fixture", backgroundUrl: "/fixture.webp",
    rooms: [{ id: "room", x: 0, y: 0, width: 1600, height: 1200, labelKo: "방", labelEn: "Room" }],
    props: [], colliders: [{ x: 100, y: 100, width: 512, height: 512 }],
    interactions: [], portals: [], spawns: [], npcs: [],
  };
}
function box(name: string, size: THREE.Vector3): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z), material = new THREE.MeshStandardMaterial();
  owned.push(geometry, material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.y = size.y / 2;
  return mesh;
}

describe("3D 테마 배치의 영속 core 실제 경계 보호", () => {
  it("회전·크기·자식 offset이 있는 실제 디오라마와 장비의 Box3 및 0.2m 여유를 침범하지 않는다", () => {
    const manifest = world(), scene = new THREE.Scene(), diorama = new THREE.Group();
    diorama.name = "zone-diorama-fixture";
    diorama.position.set(6, 0, 6); diorama.rotation.y = Math.PI / 4; diorama.scale.set(1.3, 1, 0.8);
    const model = box("actual-diorama-mesh", new THREE.Vector3(4, 2, 4)); model.position.x = 0.5; diorama.add(model);
    const prop = box("prop-existing-reference", new THREE.Vector3(2, 2, 3)); prop.position.x = 15; prop.position.z = 6;
    scene.add(diorama, prop);
    const before = JSON.stringify(manifest), children = [...scene.children];
    const planner = createVirtualThreeThemePlacementPlanner(manifest, scene);
    const protectedBounds = [diorama, prop].map((node) => new THREE.Box3().setFromObject(node).expandByVector(new THREE.Vector3(0.2, 0, 0.2)));
    const size = new THREE.Vector3(1, 1.5, 1);
    for (let index = 0; index < 12; index += 1) {
      const placement = planner.place(size, "storage");
      const placedBounds = new THREE.Box3().setFromCenterAndSize(placement.position.clone().add(new THREE.Vector3(0, size.y / 2, 0)), size);
      for (const bounds of protectedBounds) expect(placedBounds.intersectsBox(bounds)).toBe(false);
      expect(placement.footprint.x).toBeGreaterThanOrEqual(100);
      expect(placement.footprint.y).toBeGreaterThanOrEqual(100);
      expect(placement.footprint.x + placement.footprint.width).toBeLessThanOrEqual(612);
      expect(placement.footprint.y + placement.footprint.height).toBeLessThanOrEqual(612);
    }
    expect(JSON.stringify(manifest)).toBe(before);
    expect(scene.children).toEqual(children);
    expect(diorama.parent).toBe(scene); expect(prop.parent).toBe(scene);
    expect(diorama.visible).toBe(true); expect(prop.visible).toBe(true);
  });

  it("유일한 collider를 실제 core가 모두 차지하면 임의 겹침이나 바닥 fallback 대신 거부한다", () => {
    const manifest = world(), scene = new THREE.Scene();
    const core = box("prop-blocks-entire-site", new THREE.Vector3(20, 2, 20));
    core.position.x = 356 * STUDIO_THREE_SCALE; core.position.z = 356 * STUDIO_THREE_SCALE;
    scene.add(core);
    const size = new THREE.Vector3(1, 1, 1);
    expect(() => createVirtualThreeThemePlacementPlanner(manifest).place(size, "workstation")).not.toThrow();
    expect(() => createVirtualThreeThemePlacementPlanner(manifest, scene).place(size, "workstation"))
      .toThrow("배치 공간이 부족");
    expect(core.parent).toBe(scene); expect(core.visible).toBe(true);
    expect(scene.children).toEqual([core]);
  });

  it("원자적으로 교체될 이전 theme의 중첩 Scene 안 prop·diorama는 영속 core로 잘못 예약하지 않는다", () => {
    const manifest = world(), scene = new THREE.Scene(), previousTheme = new THREE.Scene();
    previousTheme.name = "virtual-three-theme-previous";
    const oldProp = box("prop-old-theme-model", new THREE.Vector3(40, 2, 40));
    const oldDiorama = box("zone-diorama-old-theme-model", new THREE.Vector3(40, 2, 40));
    previousTheme.position.set(356 * STUDIO_THREE_SCALE, 0, 356 * STUDIO_THREE_SCALE);
    previousTheme.add(oldProp, oldDiorama); scene.add(previousTheme);
    const size = new THREE.Vector3(1, 1, 1);
    const expected = createVirtualThreeThemePlacementPlanner(manifest).place(size, "accent");
    const actual = createVirtualThreeThemePlacementPlanner(manifest, scene).place(size, "accent");
    expect(actual.footprint).toEqual(expected.footprint);
    expect(actual.position.toArray()).toEqual(expected.position.toArray());
    expect(actual.sourceFootprintId).toBe(expected.sourceFootprintId);
    expect(scene.children).toEqual([previousTheme]);
    expect(previousTheme.children).toEqual([oldProp, oldDiorama]);
    expect(previousTheme.parent).toBe(scene);
    expect(oldProp.visible).toBe(true); expect(oldDiorama.visible).toBe(true);
  });
});
