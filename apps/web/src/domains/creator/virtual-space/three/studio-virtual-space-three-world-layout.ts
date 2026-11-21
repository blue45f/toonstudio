import * as THREE from "three";

import { CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import { studioWorldInteractions, studioWorldSpawn, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { isStudioThreeCampusManifest } from "./studio-virtual-space-three-generated-assets";
import { buildStudioThreeCampusArchitecture, STUDIO_THREE_SCALE, worldToThree, type StudioThreeWorkstationRing } from "./studio-virtual-space-three-scene";
import { createStudioThreeFloorMaterial, createStudioThreeOfficeMural, createStudioThreeSculpturalMural, disposeStudioThreeSurfaceNodes, studioThreeRoomTone, type StudioThreeMural } from "./studio-virtual-space-three-surface-art";
import { buildStudioThreeEnvironmentFurniture } from "./studio-virtual-space-three-environment-furniture";
import { createStudioThreeDeferredArtLoader, type StudioThreeArtTextureLoader } from "./studio-virtual-space-three-deferred-art";
import { studioThreeSurfaceRecipe } from "./studio-virtual-space-three-surface-recipes";
import { DEFAULT_VIRTUAL_THREE_THEME } from "./themes/virtual-three-theme-catalog";
import { findVirtualThreeHeroBgPreset, type VirtualThreeHeroBgRoomPreset } from "./themes/virtual-three-hero-bg-presets";
import type { VirtualThreeTheme } from "./themes/virtual-three-theme-types";

export interface StudioThreeWorldArchitecture {
  readonly floorMesh: THREE.Mesh;
  readonly waterMeshes: readonly THREE.Mesh[];
  readonly workstationRings: readonly StudioThreeWorkstationRing[];
  readonly reviewScreenMesh?: THREE.Mesh;
  readonly heroPreset?: VirtualThreeHeroBgRoomPreset;
  readonly heroRootOrigin?: readonly [number, number, number];
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
  if (theme.kind === "hero-scene") {
    const preset = findVirtualThreeHeroBgPreset(theme.id) ?? findVirtualThreeHeroBgPreset(theme.heroSlug);
    const owned: THREE.Object3D[] = [];
    const addHero = (node: THREE.Object3D) => { owned.push(node); scene.add(node); };
    const spawnAnchor = worldToThree(studioWorldSpawn(manifest).point, 0);
    const spawnOffset = preset?.spawnMeters ?? ([0, 0, 0] as const);
    const rootOrigin: readonly [number, number, number] = [
      spawnAnchor.x - spawnOffset[0],
      0,
      spawnAnchor.z - spawnOffset[2],
    ];

    // 클릭 이동 레이캐스트용 투명 바닥 충돌 평면 (Hero GLB 바닥을 가리지 않으면서 전체 룸 영역을 커버)
    const floorWidth = Math.max(manifest.width * STUDIO_THREE_SCALE, (preset?.entry.desktopAsset.bounds[0] ?? 16) + 8);
    const floorDepth = Math.max(manifest.height * STUDIO_THREE_SCALE, (preset?.entry.desktopAsset.bounds[2] ?? 16) + 8);
    const floorGeo = new THREE.PlaneGeometry(floorWidth, floorDepth);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.001,
      depthWrite: false,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.name = "hero-scene-walkable-floor";
    floorMesh.position.set(rootOrigin[0], 0.002, rootOrigin[2]);
    floorMesh.receiveShadow = true;
    addHero(floorMesh);

    // Hero 룸 내 3D 리뷰 시어터 월 스크린 (liveScreenStream VideoTexture 투사용)
    const screenSpec = preset?.reviewScreen ?? {
      positionMeters: [0, 1.8, -3.2] as const,
      rotationY: 0,
      widthMeters: 2.8,
      heightMeters: 1.58,
    };
    const screenGroup = new THREE.Group();
    screenGroup.name = `hero-scene-review-screen-rig-${theme.heroSlug}`;
    screenGroup.position.set(
      rootOrigin[0] + screenSpec.positionMeters[0],
      screenSpec.positionMeters[1],
      rootOrigin[2] + screenSpec.positionMeters[2],
    );
    screenGroup.rotation.y = screenSpec.rotationY;
    // 라이브 화면 공유가 꺼져 있을 때는 빈 검정 스크린 패널이 Hero 룸 배경을 가리지 않게 숨긴다.
    screenGroup.visible = false;

    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(screenSpec.widthMeters + 0.14, screenSpec.heightMeters + 0.14, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x1e2436, roughness: 0.42, metalness: 0.35 }),
    );
    bezel.name = "hero-scene-review-screen-bezel";
    bezel.castShadow = true;
    bezel.receiveShadow = true;
    screenGroup.add(bezel);

    const reviewScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screenSpec.widthMeters, screenSpec.heightMeters),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.08 }),
    );
    reviewScreenMesh.name = "hero-scene-review-screen";
    reviewScreenMesh.position.z = 0.042;
    screenGroup.add(reviewScreenMesh);
    addHero(screenGroup);

    const art = createStudioThreeDeferredArtLoader([]);
    let disposed = false;
    return {
      floorMesh,
      waterMeshes: [],
      workstationRings: [],
      reviewScreenMesh,
      ...(preset ? { heroPreset: preset } : {}),
      heroRootOrigin: rootOrigin,
      loadDeferredArt: art.load,
      dispose() {
        if (disposed) return;
        disposed = true;
        art.dispose();
        disposeStudioThreeSurfaceNodes(owned);
      },
    };
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
