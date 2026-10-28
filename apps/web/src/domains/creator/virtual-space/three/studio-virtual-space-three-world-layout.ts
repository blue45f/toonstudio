import * as THREE from "three";

import { CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import { studioSpaceTheme, type StudioSpaceThemeKey } from "../studio-virtual-space-theme";
import { studioWorldInteractions, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { isStudioThreeCampusManifest } from "./studio-virtual-space-three-generated-assets";
import { buildStudioThreeCampusArchitecture, STUDIO_THREE_SCALE, worldToThree, type StudioThreeWorkstationRing } from "./studio-virtual-space-three-scene";
import { createStudioThreeFloorMaterial, createStudioThreeOfficeMural, disposeStudioThreeSurfaceNodes, studioThreeRoomTone, type StudioThreeMural } from "./studio-virtual-space-three-surface-art";
import { buildStudioThreeEnvironmentFurniture } from "./studio-virtual-space-three-environment-furniture";

interface StudioThreeWorldArchitecture {
  readonly floorMesh: THREE.Mesh;
  readonly waterMeshes: readonly THREE.Mesh[];
  readonly workstationRings: readonly StudioThreeWorkstationRing[];
  readonly loadDeferredArt: (onAssetError?: (url: string) => void, loadTexture?: (url: string) => Promise<THREE.Texture>) => void;
  readonly dispose: () => void;
}

/** 기존 캠퍼스의 디오라마는 유지하고, 본사·발행 월드는 같은 manifest의 방·벽·상호작용 좌표를 그린다. */
export function buildStudioThreeWorldArchitecture(scene: THREE.Scene, manifest: StudioVirtualSpaceWorldManifest, spaceTheme: StudioSpaceThemeKey = "modern-office"): StudioThreeWorldArchitecture {
  if (isStudioThreeCampusManifest(manifest)) return { ...buildStudioThreeCampusArchitecture(scene), loadDeferredArt() {}, dispose() {} };
  const palette = studioSpaceTheme(spaceTheme);
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
    const tone = studioThreeRoomTone(room);
    const width = Math.max(0.1, room.width * STUDIO_THREE_SCALE - 0.1);
    const depth = Math.max(0.1, room.height * STUDIO_THREE_SCALE - 0.1);
    const geometry = new THREE.BoxGeometry(width, 0.035, depth);
    const panel = new THREE.Mesh(geometry, createStudioThreeFloorMaterial(palette.floors[tone], width, depth));
    panel.name = `room-floor-${room.id}`;
    panel.position.copy(worldToThree({ x: room.x + room.width / 2, y: room.y + room.height / 2 }, 0.015));
    panel.receiveShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.065), new THREE.MeshStandardMaterial({ color: palette.decorAccent, roughness: 0.45, metalness: 0.22 }));
    trim.position.set(0, 0.035, -depth / 2 + 0.04);
    panel.add(trim);
    add(panel);
    const mural = createStudioThreeOfficeMural(room, spaceTheme, STUDIO_THREE_SCALE);
    if (mural) { murals.push(mural); add(mural.group); }
  });
  for (const furniture of buildStudioThreeEnvironmentFurniture(manifest, spaceTheme, STUDIO_THREE_SCALE)) add(furniture);
  for (const wall of manifest.colliders) {
    if (wall.width <= 0 || wall.height <= 0 || (wall.width > 30 && wall.height > 30)) continue;
    const geometry = new THREE.BoxGeometry(wall.width * STUDIO_THREE_SCALE, 1.65, wall.height * STUDIO_THREE_SCALE);
    const room = manifest.rooms.find((candidate) => wall.x + wall.width / 2 >= candidate.x && wall.x + wall.width / 2 <= candidate.x + candidate.width && wall.y + wall.height / 2 >= candidate.y && wall.y + wall.height / 2 <= candidate.y + candidate.height);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: palette.wallTints[room ? studioThreeRoomTone(room) : "marble"], roughness: 0.85, transparent: true, opacity: 0.9 }));
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
  let artRequested = false;
  let pending: ReturnType<typeof globalThis.setTimeout> | undefined;
  return {
    floorMesh, workstationRings, waterMeshes: [],
    loadDeferredArt(onAssetError, loadTexture) {
      if (disposed || artRequested || murals.length === 0 || (!loadTexture && typeof document === "undefined")) return;
      artRequested = true;
      const load = loadTexture ?? ((url: string) => new THREE.TextureLoader().loadAsync(url));
      // 첫 geometry·조작 화면을 준비한 다음 원본 아트를 비동기로 읽는다.
      pending = globalThis.setTimeout(() => {
        for (const mural of murals) void load(mural.url).then((texture) => {
          if (disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          mural.artwork.material.map = texture;
          mural.artwork.material.color.setHex(0xffffff);
          mural.artwork.material.needsUpdate = true;
          mural.group.userData.assetState = "ready";
        }).catch(() => {
          if (!disposed) { mural.group.userData.assetState = "error"; onAssetError?.(mural.url); }
        });
      }, 0);
    },
    dispose() {
      disposed = true;
      if (pending !== undefined) globalThis.clearTimeout(pending);
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
