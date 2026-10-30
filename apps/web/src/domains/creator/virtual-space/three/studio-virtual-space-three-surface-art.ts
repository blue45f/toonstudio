import * as THREE from "three";

import type { StudioVirtualSpaceWorldManifest, StudioWorldRoomDefinition } from "../studio-virtual-space-world-manifest";
import type { StudioThreeLightingPreset } from "./studio-virtual-space-three-dioramas";
import { STUDIO_THREE_FLOOR_TILE, paintStudioThreeFloor, type StudioThreeFloorSpec } from "./studio-virtual-space-three-floor-patterns";
import { studioThreePreservedOfficeSurface, studioThreeSurfaceRecipe, type StudioThreeRoomTone } from "./studio-virtual-space-three-surface-recipes";
import type { VirtualThreeAssetRecipeTheme, VirtualThreeTheme } from "./themes/virtual-three-theme-types";

/** 제작 공정의 재질 성격을 유지하면서 현재 테마의 팔레트를 적용한다. */
export function studioThreeRoomTone(room: Pick<StudioWorldRoomDefinition, "id" | "action">): StudioThreeRoomTone {
  if (/color|letter/.test(room.id)) return "lavender";
  if (/library|story/.test(room.id)) return "oak";
  if (/lounge|cafe/.test(room.id)) return "cafe";
  if (/review|meeting|focus/.test(room.id)) return "carpet";
  if (/3d|war/.test(room.id)) return "stone";
  return room.action === "canvas" ? "wood" : room.action === "story" ? "oak" : "marble";
}

export function studioThreeThemeLightingPreset(theme: VirtualThreeTheme, manifest?: StudioVirtualSpaceWorldManifest): StudioThreeLightingPreset {
  if (theme.kind === "asset-recipe") {
    if (theme.lighting.ambientIlluminanceLux < 70) return "night";
    return theme.lighting.key.temperatureKelvin >= 6000 ? "studio" : "day";
  }
  if (manifest?.rooms.some((room) => room.id === "orbital-observatory")) return "studio";
  return "day";
}

/** DOM/Canvas가 없는 검증 환경에서는 texture 없이 같은 base 색 재질로 그릴 수 있다. */
export function createStudioThreeFloorTexture(spec: StudioThreeFloorSpec, widthMeters: number, depthMeters: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = STUDIO_THREE_FLOOR_TILE * 2;
    context = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!context) return null;
  context.scale(2, 2);
  paintStudioThreeFloor(context, spec);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, widthMeters / 4), Math.max(1, depthMeters / 4));
  texture.anisotropy = 4;
  return texture;
}

export function createStudioThreeFloorMaterial(spec: StudioThreeFloorSpec, widthMeters: number, depthMeters: number): THREE.MeshStandardMaterial {
  const map = createStudioThreeFloorTexture(spec, widthMeters, depthMeters);
  return new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : spec.base, map,
    roughness: spec.roughness, metalness: spec.metalness,
  });
}

export interface StudioThreeMural {
  readonly group: THREE.Group;
  readonly artwork: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly url: string;
}

/** 새 사무실 원화는 바닥과 구분된 세로 갤러리 벽면에만 놓는다. 원본 3:2 비율과 색을 보존한다. */
export function createStudioThreeOfficeMural(room: StudioWorldRoomDefinition, theme: VirtualThreeTheme, scale: number): StudioThreeMural | null {
  if (theme.kind !== "preserved-baseline") return null;
  const surface = studioThreePreservedOfficeSurface(room.id);
  if (!surface) return null;
  const palette = studioThreeSurfaceRecipe(theme, room.id);
  const width = Math.min(8, room.width * scale * 0.72);
  const height = width * 2 / 3;
  const group = new THREE.Group();
  group.name = `office-theme-mural-${room.id}`;
  group.userData.assetState = "deferred";
  group.position.set((room.x + room.width / 2) * scale, height / 2 + 0.6, (room.y + 18) * scale);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.32, height + 0.32, 0.16), new THREE.MeshStandardMaterial({ color: palette.decorAccent, roughness: 0.4, metalness: 0.3 }));
  frame.castShadow = true;
  group.add(frame);
  const artwork = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: palette.wallTints.wood, toneMapped: false }));
  artwork.name = "vertical-original-office-art";
  artwork.position.z = 0.09;
  group.add(artwork);
  return { group, artwork, url: surface.artworkUrl };
}

/** 새 3D 테마의 벽화는 깊이·PBR 재질을 가진 조형물이며 2D 원화/미리보기를 읽지 않는다. */
export function createStudioThreeSculpturalMural(room: StudioWorldRoomDefinition, theme: VirtualThreeAssetRecipeTheme, scale: number): THREE.Group {
  const width = Math.min(8, room.width * scale * 0.72);
  const height = width * 2 / 3;
  const group = new THREE.Group();
  group.name = `three-theme-mural-${room.id}`;
  group.userData.artworkKind = "sculptural-3d";
  group.userData.themeId = theme.id;
  group.position.set((room.x + room.width / 2) * scale, height / 2 + 0.6, (room.y + 18) * scale);
  const wall = new THREE.MeshStandardMaterial({ color: theme.surfacePBR.wall.baseColor, roughness: theme.surfacePBR.wall.roughness, metalness: theme.surfacePBR.wall.metalness });
  const trim = new THREE.MeshStandardMaterial({ color: theme.surfacePBR.trim.baseColor, roughness: theme.surfacePBR.trim.roughness, metalness: theme.surfacePBR.trim.metalness });
  const face = new THREE.MeshStandardMaterial({ color: theme.surfacePBR.floor.baseColor, roughness: theme.surfacePBR.floor.roughness, metalness: theme.surfacePBR.floor.metalness });
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const node = new THREE.Mesh(geometry, material);
    node.name = name; node.position.set(x, y, z); node.castShadow = true; node.receiveShadow = true; group.add(node);
    return node;
  };
  mesh("mural-frame", new THREE.BoxGeometry(width + 0.32, height + 0.32, 0.16), trim);
  mesh("mural-recess", new THREE.BoxGeometry(width, height, 0.08), wall, 0, 0, 0.11);
  const radius = height * 0.27;
  mesh("mural-relief-ring", new THREE.TorusGeometry(radius, radius * 0.07, 8, 40), trim, 0, 0, 0.24);
  const count = theme.id === "sflab" ? 12 : theme.id === "gothicarchive" ? 5 : 8;
  const relief = new THREE.InstancedMesh(theme.id === "parkbotanical"
    ? new THREE.SphereGeometry(radius * 0.2, 10, 6)
    : new THREE.BoxGeometry(radius * 0.16, radius * 0.62, 0.12), face, count);
  relief.name = "mural-relief";
  relief.castShadow = relief.receiveShadow = true;
  const transform = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2;
    transform.position.set(Math.cos(angle) * radius * 0.65, Math.sin(angle) * radius * 0.65, 0.24);
    transform.rotation.z = angle; transform.updateMatrix(); relief.setMatrixAt(index, transform.matrix);
  }
  relief.instanceMatrix.needsUpdate = true;
  group.add(relief);
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(width * 0.025, height * 0.7, 0.18), trim, 6);
  fins.name = "mural-acoustic-fin"; fins.castShadow = fins.receiveShadow = true;
  let instance = 0;
  transform.rotation.z = 0;
  for (const side of [-1, 1]) for (let index = 0; index < 3; index += 1) {
    transform.position.set(side * width * (0.34 + index * 0.05), 0, 0.23);
    transform.updateMatrix(); fins.setMatrixAt(instance, transform.matrix); instance += 1;
  }
  fins.instanceMatrix.needsUpdate = true;
  group.add(fins);
  return group;
}

export function disposeStudioThreeSurfaceNodes(nodes: readonly THREE.Object3D[]): void {
  const geometry = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instances = new Set<THREE.InstancedMesh>();
  for (const node of nodes) {
    node.removeFromParent();
    node.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child instanceof THREE.InstancedMesh) instances.add(child);
      geometry.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  }
  for (const value of geometry) value.dispose();
  for (const value of materials) value.dispose();
  for (const value of textures) value.dispose();
  for (const value of instances) value.dispose();
}
