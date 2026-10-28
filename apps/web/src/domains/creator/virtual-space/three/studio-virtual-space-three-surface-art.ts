import * as THREE from "three";

import type { StudioCampusZoneTone } from "../studio-virtual-space-campus-blueprint";
import { CAMPUS_THEME_FLOOR_TILE, paintStudioSpaceThemeFloor } from "../studio-virtual-space-campus-floor-textures";
import { studioOfficeEnvironment } from "../studio-virtual-space-office-environments";
import { studioSpaceTheme, type StudioSpaceThemeFloorSpec, type StudioSpaceThemeKey } from "../studio-virtual-space-theme";
import type { StudioWorldRoomDefinition } from "../studio-virtual-space-world-manifest";
import type { StudioThreeLightingPreset } from "./studio-virtual-space-three-dioramas";

/** 제작 공정의 재질 성격을 유지하면서 현재 테마의 팔레트를 적용한다. */
export function studioThreeRoomTone(room: Pick<StudioWorldRoomDefinition, "id" | "action">): StudioCampusZoneTone {
  if (/color|letter/.test(room.id)) return "lavender";
  if (/library|story/.test(room.id)) return "oak";
  if (/lounge|cafe/.test(room.id)) return "cafe";
  if (/review|meeting|focus/.test(room.id)) return "carpet";
  if (/3d|war/.test(room.id)) return "stone";
  return room.action === "canvas" ? "wood" : room.action === "story" ? "oak" : "marble";
}

export function studioThreeThemeLightingPreset(theme: StudioSpaceThemeKey): StudioThreeLightingPreset {
  if (theme === "neon-night") return "night";
  if (theme === "celestial-observatory" || theme === "orbital-observatory") return "studio";
  return "day";
}

/** DOM/Canvas가 없는 검증 환경에서는 texture 없이 같은 base 색 재질로 그릴 수 있다. */
export function createStudioThreeFloorTexture(spec: StudioSpaceThemeFloorSpec, widthMeters: number, depthMeters: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = CAMPUS_THEME_FLOOR_TILE * 2;
    context = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!context) return null;
  context.scale(2, 2);
  paintStudioSpaceThemeFloor(context, spec);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, widthMeters / 4), Math.max(1, depthMeters / 4));
  texture.anisotropy = 4;
  return texture;
}

export function createStudioThreeFloorMaterial(spec: StudioSpaceThemeFloorSpec, widthMeters: number, depthMeters: number): THREE.MeshStandardMaterial {
  const map = createStudioThreeFloorTexture(spec, widthMeters, depthMeters);
  return new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : spec.base, map,
    roughness: spec.pattern === "marble" || spec.pattern === "checker" ? 0.4 : spec.pattern === "carpet" || spec.pattern === "lawn" ? 0.95 : 0.74,
    metalness: spec.pattern === "marble" || spec.pattern === "slate" ? 0.05 : 0,
  });
}

export interface StudioThreeMural {
  readonly group: THREE.Group;
  readonly artwork: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly url: string;
}

/** 새 사무실 원화는 바닥과 구분된 세로 갤러리 벽면에만 놓는다. 원본 3:2 비율과 색을 보존한다. */
export function createStudioThreeOfficeMural(room: StudioWorldRoomDefinition, theme: StudioSpaceThemeKey, scale: number): StudioThreeMural | null {
  const environment = studioOfficeEnvironment(room.id);
  if (!environment) return null;
  const palette = studioSpaceTheme(theme);
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
  return { group, artwork, url: environment.previewUrl };
}

export function disposeStudioThreeSurfaceNodes(nodes: readonly THREE.Object3D[]): void {
  const geometry = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  for (const node of nodes) {
    node.removeFromParent();
    node.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
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
}
