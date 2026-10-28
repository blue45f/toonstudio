import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { studioOfficeEnvironment, type StudioOfficeEnvironmentKey } from "../studio-virtual-space-office-environments";
import { studioSpaceTheme, type StudioSpaceThemeKey } from "../studio-virtual-space-theme";
import type { StudioVirtualSpaceWorldManifest, StudioWorldRect } from "../studio-virtual-space-world-manifest";
import { studioThreeGeneratedProps } from "./studio-virtual-space-three-generated-assets";

type FurnitureKind = "bookshelf" | "console" | "sofa" | "table" | "boundary" | "display";
interface FurniturePlan {
  readonly roomId: StudioOfficeEnvironmentKey;
  readonly sourceColliderIndex: number;
  readonly rect: StudioWorldRect;
  readonly kind: FurnitureKind;
  readonly reservedGeneratedIds: readonly string[];
}

/** 원화의 북쪽부터 전경까지 배치한 충돌체의 의미. 0번 외부 배경은 가구로 생성하지 않는다. */
const FURNITURE_KINDS: Readonly<Record<StudioOfficeEnvironmentKey, readonly (FurnitureKind | null)[]>> = {
  "forest-atelier": [null, "bookshelf", "boundary", "console", "boundary", "boundary", "console"],
  "orbital-observatory": [null, "console", "console", "sofa", "table", "boundary", "boundary"],
  "tidal-atelier": [null, "boundary", "sofa", "console", "console", "table", "table", "table", "table", "boundary"],
};

/** 새 사무실에서 실제 방과 겹치는 큰 가구만 표시한다. 월드 경계와 북쪽 외부 배경은 제외한다. */
export function studioThreeEnvironmentFurniturePlans(manifest: StudioVirtualSpaceWorldManifest): readonly FurniturePlan[] {
  const generated = studioThreeGeneratedProps(manifest);
  return manifest.rooms.flatMap((room) => {
    const environment = studioOfficeEnvironment(room.id);
    if (!environment) return [];
    return environment.colliders.flatMap((collider, sourceColliderIndex) => {
      const kind = FURNITURE_KINDS[environment.key][sourceColliderIndex];
      if (!kind || collider.width <= 30 || collider.height <= 30) return [];
      if (!manifest.colliders.some((active) => active.x === collider.x && active.y === collider.y && active.width === collider.width && active.height === collider.height)) return [];
      const x = Math.max(room.x, collider.x), y = Math.max(room.y, collider.y);
      const width = Math.min(room.x + room.width, collider.x + collider.width) - x;
      const height = Math.min(room.y + room.height, collider.y + collider.height) - y;
      if (width <= 0 || height <= 0) return [];
      const rect = { x, y, width, height };
      const reservedGeneratedIds = generated.filter((prop) => prop.x >= x && prop.x <= x + width && prop.y >= y && prop.y <= y + height).map((prop) => prop.id);
      return [{ roomId: environment.key, sourceColliderIndex, rect, kind: reservedGeneratedIds.length > 0 ? "display" as const : kind, reservedGeneratedIds }];
    });
  });
}

/** 실제 책상/서가/소파/식재 구조를 만들어 기존 비보행 footprint를 눈으로도 읽을 수 있게 한다. */
export function buildStudioThreeEnvironmentFurniture(manifest: StudioVirtualSpaceWorldManifest, theme: StudioSpaceThemeKey, scale: number): readonly THREE.Group[] {
  const plans = studioThreeEnvironmentFurniturePlans(manifest);
  if (plans.length === 0) return [];
  const palette = studioSpaceTheme(theme);
  const wood = new THREE.MeshStandardMaterial({ color: palette.floors.wood.base, roughness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: palette.decorAccent, roughness: 0.4, metalness: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: palette.wallTints.stone, roughness: 0.32, metalness: 0.65 });
  const fabric = new THREE.MeshStandardMaterial({ color: palette.floors.carpet.base, roughness: 0.96 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x152735, emissive: palette.decorAccent, emissiveIntensity: 0.3, roughness: 0.28 });
  const glass = new THREE.MeshStandardMaterial({ color: palette.decorAccent, transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0.08, depthWrite: false });
  const foliage = new THREE.MeshStandardMaterial({ color: theme === "orbital-observatory" ? 0x7790b8 : theme === "tidal-atelier" ? 0x3b9b88 : 0x557a45, roughness: 0.92 });

  return plans.map((plan) => {
    const group = new THREE.Group();
    group.name = `environment-furniture-${plan.roomId}-${plan.sourceColliderIndex}`;
    group.userData.furnitureKind = plan.kind;
    group.userData.sourceColliderIndex = plan.sourceColliderIndex;
    group.userData.colliderRect = plan.rect;
    group.userData.reservedGeneratedIds = plan.reservedGeneratedIds;
    const width = plan.rect.width * scale, depth = plan.rect.height * scale;
    group.position.set((plan.rect.x + plan.rect.width / 2) * scale, 0, (plan.rect.y + plan.rect.height / 2) * scale);
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, rounded = true) => {
      const geometry = rounded ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.07, w / 4, h / 4, d / 4)) : new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.castShadow = material !== glass;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    const legs = () => {
      for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) for (const z of [-depth / 2 + 0.12, depth / 2 - 0.12]) box("desk-leg", 0.1, 0.84, 0.1, x, 0.42, z, metal);
    };

    if (plan.kind === "display") {
      // 실생성 모델은 그대로 두고 투명 전시 경계만 만든다. 불투명 대체 가구로 모델을 덮지 않는다.
      for (const z of [-depth / 2 + 0.045, depth / 2 - 0.045]) {
        box("display-rail", width, 0.06, 0.08, 0, 0.78, z, accent);
        box("display-glass", width - 0.12, 0.62, 0.035, 0, 0.42, z, glass, false);
      }
      for (const x of [-width / 2 + 0.045, width / 2 - 0.045]) {
        box("display-rail", 0.08, 0.06, depth, x, 0.78, 0, accent);
        box("display-glass", 0.035, 0.62, depth - 0.12, x, 0.42, 0, glass, false);
        for (const z of [-depth / 2 + 0.06, depth / 2 - 0.06]) box("display-post", 0.075, 0.76, 0.075, x, 0.38, z, metal);
      }
    } else if (plan.kind === "console" || plan.kind === "table") {
      legs();
      box("desktop", width, 0.16, depth, 0, 0.91, 0, wood);
      const stations = Math.max(1, Math.min(8, Math.floor(width / 1.8)));
      for (let station = 0; station < stations; station += 1) {
        const x = -width / 2 + width * (station + 0.5) / stations;
        box("desk-cabinet", Math.min(0.48, width / stations * 0.5), 0.66, Math.min(0.55, depth * 0.65), x, 0.42, -depth / 2 + Math.min(0.35, depth / 2), wood);
        if (plan.kind === "console") {
          box("monitor-base", 0.3, 0.04, 0.23, x, 1.02, -depth / 2 + 0.38, metal);
          box("monitor-stand", 0.055, 0.2, 0.055, x, 1.14, -depth / 2 + 0.38, metal);
          box("monitor-frame", 0.86, 0.56, 0.065, x, 1.48, -depth / 2 + 0.38, metal);
          box("monitor-screen", 0.77, 0.45, 0.025, x, 1.48, -depth / 2 + 0.425, screen);
        } else {
          const tablet = box("drawing-tablet", 0.58, 0.05, 0.4, x, 1.03, 0, screen);
          tablet.rotation.x = -0.12;
        }
      }
    } else if (plan.kind === "sofa") {
      box("sofa-plinth", width, 0.22, depth, 0, 0.16, 0, wood);
      box("sofa-back", width, 0.86, Math.min(0.28, depth * 0.2), 0, 0.73, -depth / 2 + 0.14, fabric);
      const seats = Math.max(1, Math.min(8, Math.round(width / 1.35)));
      for (let seat = 0; seat < seats; seat += 1) {
        const w = (width - 0.24) / seats;
        box("sofa-cushion", w - 0.035, 0.3, depth - 0.32, -width / 2 + 0.12 + w * (seat + 0.5), 0.42, 0.08, fabric);
      }
      for (const x of [-width / 2 + 0.11, width / 2 - 0.11]) box("sofa-arm", 0.22, 0.56, depth, x, 0.49, 0, fabric);
    } else if (plan.kind === "bookshelf") {
      box("bookshelf-base", width, 0.2, depth, 0, 0.12, 0, wood);
      box("bookshelf-back", width, 2.15, 0.12, 0, 1.1, -depth / 2 + 0.06, wood);
      for (let shelf = 1; shelf <= 4; shelf += 1) box("bookshelf-shelf", width, 0.08, depth, 0, shelf * 0.5, 0, wood);
      const volumes = Math.min(36, Math.max(6, Math.floor(width * 7)));
      for (let volume = 0; volume < volumes; volume += 1) for (let shelf = 0; shelf < 4; shelf += 1) {
        const x = -width / 2 + width * (volume + 0.5) / volumes;
        box("book-spine", Math.min(0.1, width / volumes * 0.72), 0.26 + volume % 3 * 0.04, 0.2, x, 0.29 + shelf * 0.5, depth / 2 - 0.14, volume % 2 ? accent : fabric, false);
      }
    } else {
      // 외곽의 연못·계단·난간 영역은 높은 가구가 아니라 낮은 식재/난간으로 표현한다.
      box("planter-bed", width, 0.34, depth, 0, 0.19, 0, wood);
      box("planter-soil", width - 0.1, 0.06, depth - 0.1, 0, 0.39, 0, metal);
      const columns = Math.max(1, Math.min(4, Math.floor(width / 1.3)));
      const rows = Math.max(1, Math.min(4, Math.floor(depth / 1.3)));
      const radius = Math.min(0.38, width / columns * 0.35, depth / rows * 0.35);
      const leaf = new THREE.SphereGeometry(radius, 10, 7);
      for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
        const plant = new THREE.Mesh(leaf, foliage);
        plant.name = "planter-foliage";
        plant.position.set(-width / 2 + width * (col + 0.5) / columns, 0.75, -depth / 2 + depth * (row + 0.5) / rows);
        plant.scale.set(1, 1.25 + (col + row) % 3 * 0.25, 0.8);
        plant.castShadow = true;
        group.add(plant);
      }
    }
    return group;
  });
}
