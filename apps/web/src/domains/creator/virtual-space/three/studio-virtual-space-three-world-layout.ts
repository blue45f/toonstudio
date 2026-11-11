import * as THREE from "three";

import { CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import { studioWorldInteractions, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { isStudioThreeCampusManifest } from "./studio-virtual-space-three-generated-assets";
import { buildStudioThreeCampusArchitecture, STUDIO_THREE_SCALE, worldToThree, type StudioThreeWorkstationRing } from "./studio-virtual-space-three-scene";
import { createStudioThreeFloorMaterial, createStudioThreeOfficeMural, createStudioThreeSculpturalMural, disposeStudioThreeSurfaceNodes, studioThreeRoomTone, type StudioThreeMural } from "./studio-virtual-space-three-surface-art";
import { buildStudioThreeEnvironmentFurniture } from "./studio-virtual-space-three-environment-furniture";
import { createStudioThreeDeferredArtLoader, type StudioThreeArtTextureLoader } from "./studio-virtual-space-three-deferred-art";
import { studioThreeSurfaceRecipe } from "./studio-virtual-space-three-surface-recipes";
import { DEFAULT_VIRTUAL_THREE_THEME } from "./themes/virtual-three-theme-catalog";
import type { VirtualThreeTheme } from "./themes/virtual-three-theme-types";

export interface StudioThreeWorldArchitecture {
  readonly floorMesh: THREE.Mesh;
  readonly waterMeshes: readonly THREE.Mesh[];
  readonly workstationRings: readonly StudioThreeWorkstationRing[];
  readonly loadDeferredArt: (onAssetError?: (url: string) => void, loadTexture?: StudioThreeArtTextureLoader, signal?: AbortSignal) => Promise<void>;
  readonly dispose: () => void;
}

/** 테마는 3D 표면만 소유하며 방·벽·작업점과 보행 권위는 공통 manifest가 유지한다. */
export function buildStudioThreeWorldArchitecture(scene: THREE.Scene, manifest: StudioVirtualSpaceWorldManifest, theme: VirtualThreeTheme = DEFAULT_VIRTUAL_THREE_THEME): StudioThreeWorldArchitecture {
  if (theme.kind === "preserved-baseline" && isStudioThreeCampusManifest(manifest)) {
    const previous = new Set(scene.children);
    const architecture = buildStudioThreeCampusArchitecture(scene);
    const owned = scene.children.filter((node) => !previous.has(node));
    const art = createStudioThreeDeferredArtLoader([]);
    let disposed = false;
    return { ...architecture, loadDeferredArt: art.load, dispose() {
      if (disposed) return;
      disposed = true;
      art.dispose();
      disposeStudioThreeSurfaceNodes(owned);
    } };
  }
  const palette = studioThreeSurfaceRecipe(theme, manifest.rooms[0]?.id);
  const hqFallbackRoomId = manifest.rooms.find((room) => room.id.startsWith("hq-"))?.id;
  const owned: THREE.Object3D[] = [];
  const murals: StudioThreeMural[] = [];
  const add = (node: THREE.Object3D) => { owned.push(node); scene.add(node); };
  const floorGeometry = new THREE.PlaneGeometry(manifest.width * STUDIO_THREE_SCALE, manifest.height * STUDIO_THREE_SCALE);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMesh = new THREE.Mesh(floorGeometry, createStudioThreeFloorMaterial(palette.floors.stone, manifest.width * STUDIO_THREE_SCALE, manifest.height * STUDIO_THREE_SCALE));
  floorMesh.name = "manifest-walkable-floor";
  floorMesh.position.copy(worldToThree({ x: manifest.width / 2, y: manifest.height / 2 }));
  floorMesh.receiveShadow = true;
  add(floorMesh);
  manifest.rooms.forEach((room) => {
    const roomPalette = studioThreeSurfaceRecipe(theme, room.id);
    const tone = studioThreeRoomTone(room);
    const width = Math.max(0.1, room.width * STUDIO_THREE_SCALE - 0.1);
    const depth = Math.max(0.1, room.height * STUDIO_THREE_SCALE - 0.1);
    const geometry = new THREE.BoxGeometry(width, 0.035, depth);
    const panel = new THREE.Mesh(geometry, createStudioThreeFloorMaterial(roomPalette.floors[tone], width, depth));
    panel.name = `room-floor-${room.id}`;
    panel.position.copy(worldToThree({ x: room.x + room.width / 2, y: room.y + room.height / 2 }, 0.015));
    panel.receiveShadow = true;
    const finish = theme.kind === "asset-recipe" ? theme.surfacePBR.trim : null;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.065), new THREE.MeshStandardMaterial({ color: roomPalette.decorAccent, roughness: finish?.roughness ?? 0.45, metalness: finish?.metalness ?? 0.22 }));
    trim.position.set(0, 0.035, -depth / 2 + 0.04);
    panel.add(trim);
    add(panel);
    if (theme.kind === "asset-recipe") add(createStudioThreeSculpturalMural(room, theme, STUDIO_THREE_SCALE));
    else {
      const mural = createStudioThreeOfficeMural(room, theme, STUDIO_THREE_SCALE);
      if (mural) { murals.push(mural); add(mural.group); }
    }
  });
  for (const furniture of buildStudioThreeEnvironmentFurniture(manifest, theme, STUDIO_THREE_SCALE)) add(furniture);
  for (const wall of manifest.colliders) {
    if (wall.width <= 0 || wall.height <= 0 || (wall.width > 30 && wall.height > 30)) continue;
    const geometry = new THREE.BoxGeometry(wall.width * STUDIO_THREE_SCALE, 1.65, wall.height * STUDIO_THREE_SCALE);
    const room = manifest.rooms.find((candidate) => wall.x + wall.width / 2 >= candidate.x && wall.x + wall.width / 2 <= candidate.x + candidate.width && wall.y + wall.height / 2 >= candidate.y && wall.y + wall.height / 2 <= candidate.y + candidate.height);
    const wallPalette = studioThreeSurfaceRecipe(theme, room?.id ?? hqFallbackRoomId);
    const finish = theme.kind === "asset-recipe" ? theme.surfacePBR.wall : null;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: wallPalette.wallTints[room ? studioThreeRoomTone(room) : "marble"], roughness: finish?.roughness ?? 0.85, metalness: finish?.metalness ?? 0, transparent: theme.kind === "preserved-baseline", opacity: theme.kind === "preserved-baseline" ? 0.9 : 1 }));
    mesh.name = "manifest-wall";
    mesh.position.copy(worldToThree({ x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 }, 0.825));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
  }
  const workstationRings: StudioThreeWorkstationRing[] = studioWorldInteractions(manifest).map((interaction) => {
    const geometry = new THREE.RingGeometry(0.62, 0.78, 32);
    geometry.rotateX(-Math.PI / 2);
    const outerRing = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: palette.decorAccent, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
    const group = new THREE.Group();
    group.position.copy(worldToThree(interaction.point, 0.055));
    group.add(outerRing);
    add(group);
    return { id: interaction.id, zoneId: interaction.zoneId, point: interaction.point, radius: interaction.radius, group, outerRing };
  });
  let disposed = false;
  const art = createStudioThreeDeferredArtLoader(murals);
  return {
    floorMesh, workstationRings, waterMeshes: [],
    loadDeferredArt: art.load,
    dispose() {
      if (disposed) return;
      disposed = true;
      art.dispose();
      disposeStudioThreeSurfaceNodes(owned);
    },
  };
}

export function studioThreeRoomSigns(manifest: StudioVirtualSpaceWorldManifest) {
  if (isStudioThreeCampusManifest(manifest)) return CAMPUS_ZONES.map((zone) => ({
    roomId: zone.roomId, x: (zone.tiles.column + zone.tiles.width / 2) * 64, y: zone.tiles.row * 64 + 32,
    heightMeters: zone.walls.length > 0 ? 2.95 : 1.55, label: zone.signEn,
  }));
  return manifest.rooms.map((room) => ({
    roomId: room.id, x: room.x + room.width / 2, y: room.y + 32, heightMeters: 2.2, label: room.labelEn,
  }));
}
