import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { CAMPUS_NPCS, CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";

/** 2D 월드 좌표(3072×1984 px)를 3D 미터 단위로 변환하는 비율 (32px = 1m). */
export const STUDIO_THREE_SCALE = 1 / 32;

export function worldToThree(point: StudioVirtualSpacePoint, y = 0): THREE.Vector3 {
  return new THREE.Vector3(point.x * STUDIO_THREE_SCALE, y, point.y * STUDIO_THREE_SCALE);
}

export function threeToWorld(vec: { readonly x: number; readonly z: number }): StudioVirtualSpacePoint {
  return {
    x: Math.round(vec.x / STUDIO_THREE_SCALE),
    y: Math.round(vec.z / STUDIO_THREE_SCALE),
  };
}

export function facingToYawRadians(facing: StudioVirtualSpaceFacing): number {
  switch (facing) {
    case "down":
      return 0;
    case "right":
      return Math.PI * 0.5;
    case "up":
      return Math.PI;
    case "left":
      return -Math.PI * 0.5;
  }
}

export function shortestAngleLerp(current: number, target: number, alpha: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, Math.max(0, alpha));
}

export interface StudioThreePropSpec {
  readonly id: string;
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly heightMeters: number;
  readonly rotationY?: number;
  readonly elevationMeters?: number;
}

/**
 * 실제 저장소 3D 에셋(`/assets/3d/...`)을 활용한 10개 구역 입체 가구·소품 배치도.
 */
export const STUDIO_THREE_PROPS: readonly StudioThreePropSpec[] = Object.freeze([
  // LOBBY (skyport)
  { id: "lobby-desk-main", url: "/assets/3d/refined-v8/desk.glb", x: 448, y: 340, heightMeters: 1.15, rotationY: 0 },
  { id: "lobby-chair-main", url: "/assets/3d/refined-v8/chair.glb", x: 448, y: 292, heightMeters: 1.1, rotationY: 0 },
  { id: "lobby-sofa-west", url: "/assets/3d/refined-v8/sofa.glb", x: 256, y: 470, heightMeters: 1.15, rotationY: Math.PI * 0.5 },
  { id: "lobby-sofa-east", url: "/assets/3d/refined-v8/sofa.glb", x: 640, y: 470, heightMeters: 1.15, rotationY: -Math.PI * 0.5 },
  { id: "lobby-clock", url: "/assets/3d/grandfather_clock.glb", x: 220, y: 240, heightMeters: 2.1, rotationY: 0 },
  { id: "lobby-robot", url: "/assets/3d/refined-v8/robot_pet.glb", x: 540, y: 430, heightMeters: 0.85, rotationY: -0.4 },
  { id: "lobby-plant-west", url: "/assets/3d/potted_monstera.glb", x: 180, y: 260, heightMeters: 1.45, rotationY: 0.3 },
  { id: "lobby-plant-east", url: "/assets/3d/potted_monstera.glb", x: 710, y: 260, heightMeters: 1.45, rotationY: -0.3 },

  // STUDIO (personal-atelier)
  { id: "studio-drawing-desk", url: "/assets/3d/refined-v8/desk.glb", x: 1000, y: 540, heightMeters: 1.15, rotationY: Math.PI },
  { id: "studio-drawing-chair", url: "/assets/3d/refined-v8/chair.glb", x: 1000, y: 590, heightMeters: 1.1, rotationY: Math.PI },
  { id: "studio-tablet", url: "/assets/3d/hologram_tablet.glb", x: 1000, y: 536, heightMeters: 0.45, elevationMeters: 0.82, rotationY: 0 },
  { id: "studio-monitor-desk", url: "/assets/3d/refined-v8/desk.glb", x: 1380, y: 540, heightMeters: 1.15, rotationY: Math.PI },
  { id: "studio-monitor-chair", url: "/assets/3d/refined-v8/chair.glb", x: 1380, y: 590, heightMeters: 1.1, rotationY: Math.PI },
  { id: "studio-blackboard", url: "/assets/3d/refined-v8/blackboard.glb", x: 1216, y: 250, heightMeters: 1.85, rotationY: 0 },
  { id: "studio-plant", url: "/assets/3d/potted_monstera.glb", x: 960, y: 260, heightMeters: 1.45, rotationY: 0.5 },

  // CO-WORK (story-lab)
  { id: "cowork-board", url: "/assets/3d/refined-v8/blackboard.glb", x: 1984, y: 246, heightMeters: 1.9, rotationY: 0 },
  { id: "cowork-desk-1", url: "/assets/3d/refined-v8/desk.glb", x: 1820, y: 430, heightMeters: 1.12, rotationY: 0 },
  { id: "cowork-chair-1", url: "/assets/3d/refined-v8/chair.glb", x: 1820, y: 478, heightMeters: 1.08, rotationY: Math.PI },
  { id: "cowork-desk-2", url: "/assets/3d/refined-v8/desk.glb", x: 2140, y: 430, heightMeters: 1.12, rotationY: 0 },
  { id: "cowork-chair-2", url: "/assets/3d/refined-v8/chair.glb", x: 2140, y: 478, heightMeters: 1.08, rotationY: Math.PI },
  { id: "cowork-focus-west", url: "/assets/3d/school_desk.glb", x: 1750, y: 590, heightMeters: 1.05, rotationY: Math.PI },
  { id: "cowork-focus-east", url: "/assets/3d/school_desk.glb", x: 2220, y: 590, heightMeters: 1.05, rotationY: Math.PI },
  { id: "cowork-plant", url: "/assets/3d/potted_monstera.glb", x: 2260, y: 260, heightMeters: 1.45, rotationY: -0.4 },

  // CAFE (creator-cafe)
  { id: "cafe-counter-desk", url: "/assets/3d/refined-v8/desk.glb", x: 2690, y: 290, heightMeters: 1.2, rotationY: 0 },
  { id: "cafe-table-1", url: "/assets/3d/round_table.glb", x: 2540, y: 470, heightMeters: 0.95, rotationY: 0 },
  { id: "cafe-tea-1", url: "/assets/3d/tea_set.glb", x: 2540, y: 470, heightMeters: 0.32, elevationMeters: 0.78, rotationY: 0.4 },
  { id: "cafe-table-2", url: "/assets/3d/round_table.glb", x: 2820, y: 470, heightMeters: 0.95, rotationY: 0.8 },
  { id: "cafe-sofa", url: "/assets/3d/refined-v8/sofa.glb", x: 2840, y: 600, heightMeters: 1.12, rotationY: -Math.PI * 0.5 },
  { id: "cafe-vending", url: "/assets/3d/vending_machine.glb", x: 2468, y: 280, heightMeters: 1.95, rotationY: 0.2 },
  { id: "cafe-plant", url: "/assets/3d/potted_monstera.glb", x: 2910, y: 280, heightMeters: 1.45, rotationY: -0.2 },

  // TALK (team-meeting)
  { id: "talk-table", url: "/assets/3d/round_table.glb", x: 448, y: 1140, heightMeters: 1.1, rotationY: 0 },
  { id: "talk-chair-w", url: "/assets/3d/refined-v8/chair.glb", x: 368, y: 1140, heightMeters: 1.08, rotationY: Math.PI * 0.5 },
  { id: "talk-chair-e", url: "/assets/3d/refined-v8/chair.glb", x: 528, y: 1140, heightMeters: 1.08, rotationY: -Math.PI * 0.5 },
  { id: "talk-board", url: "/assets/3d/refined-v8/blackboard.glb", x: 448, y: 920, heightMeters: 1.85, rotationY: 0 },
  { id: "talk-fireplace", url: "/assets/3d/fireplace.glb", x: 230, y: 930, heightMeters: 1.75, rotationY: 0.3 },

  // PLAZA (creator-plaza)
  { id: "plaza-fountain-well", url: "/assets/3d/wishing_well.glb", x: 1472, y: 1090, heightMeters: 2.35, rotationY: 0 },
  { id: "plaza-bench-west", url: "/assets/3d/neom_bench_prop.glb", x: 1150, y: 1270, heightMeters: 0.95, rotationY: 0 },
  { id: "plaza-bench-east", url: "/assets/3d/neom_bench_prop.glb", x: 1794, y: 1270, heightMeters: 0.95, rotationY: 0 },
  { id: "plaza-lamp-nw", url: "/assets/3d/street_lamp.glb", x: 1088, y: 840, heightMeters: 2.6, rotationY: 0 },
  { id: "plaza-lamp-ne", url: "/assets/3d/street_lamp.glb", x: 1856, y: 840, heightMeters: 2.6, rotationY: 0 },
  { id: "plaza-lamp-sw", url: "/assets/3d/street_lamp.glb", x: 1088, y: 1340, heightMeters: 2.6, rotationY: 0 },
  { id: "plaza-lamp-se", url: "/assets/3d/street_lamp.glb", x: 1856, y: 1340, heightMeters: 2.6, rotationY: 0 },
  { id: "plaza-plant-w", url: "/assets/3d/potted_monstera.glb", x: 1010, y: 1080, heightMeters: 1.7, rotationY: 0.2 },
  { id: "plaza-plant-e", url: "/assets/3d/potted_monstera.glb", x: 1934, y: 1080, heightMeters: 1.7, rotationY: -0.2 },

  // EVENT (event-stage)
  { id: "event-hologram", url: "/assets/3d/hologram_tablet.glb", x: 2560, y: 960, heightMeters: 1.6, elevationMeters: 0.3, rotationY: 0 },
  { id: "event-chair-1", url: "/assets/3d/refined-v8/chair.glb", x: 2420, y: 1210, heightMeters: 1.05, rotationY: Math.PI },
  { id: "event-chair-2", url: "/assets/3d/refined-v8/chair.glb", x: 2560, y: 1210, heightMeters: 1.05, rotationY: Math.PI },
  { id: "event-chair-3", url: "/assets/3d/refined-v8/chair.glb", x: 2700, y: 1210, heightMeters: 1.05, rotationY: Math.PI },
  { id: "event-lantern-w", url: "/assets/3d/paper_lantern.glb", x: 2300, y: 940, heightMeters: 1.5, rotationY: 0 },
  { id: "event-lantern-e", url: "/assets/3d/paper_lantern.glb", x: 2820, y: 940, heightMeters: 1.5, rotationY: 0 },

  // GAME (arcade)
  { id: "game-drone-1", url: "/assets/3d/scifi_drone_bot.glb", x: 260, y: 1600, heightMeters: 1.35, rotationY: 0.3 },
  { id: "game-drone-2", url: "/assets/3d/refined-v8/robot_pet.glb", x: 620, y: 1600, heightMeters: 1.1, rotationY: -0.3 },
  { id: "game-sofa", url: "/assets/3d/refined-v8/sofa.glb", x: 448, y: 1740, heightMeters: 1.12, rotationY: Math.PI },

  // TERRACE (beach)
  { id: "terrace-bench-w", url: "/assets/3d/neom_bench_prop.glb", x: 1120, y: 1620, heightMeters: 0.95, rotationY: 0 },
  { id: "terrace-bench-e", url: "/assets/3d/neom_bench_prop.glb", x: 1820, y: 1620, heightMeters: 0.95, rotationY: 0 },
  { id: "terrace-table", url: "/assets/3d/round_table.glb", x: 1472, y: 1610, heightMeters: 0.95, rotationY: 0 },

  // GALLERY (review-gallery)
  { id: "gallery-orb", url: "/assets/3d/crystal_orb.glb", x: 2560, y: 1620, heightMeters: 1.25, rotationY: 0 },
  { id: "gallery-desk-w", url: "/assets/3d/refined-v8/desk.glb", x: 2340, y: 1600, heightMeters: 1.12, rotationY: 0 },
  { id: "gallery-desk-e", url: "/assets/3d/refined-v8/desk.glb", x: 2780, y: 1600, heightMeters: 1.12, rotationY: 0 },
  { id: "gallery-bench", url: "/assets/3d/neom_bench_prop.glb", x: 2560, y: 1760, heightMeters: 0.95, rotationY: Math.PI },
]);

/** NPC 및 플레이어용 VRM 3D 캐릭터 에셋 매핑. */
export const STUDIO_THREE_VRM_URLS: readonly string[] = Object.freeze([
  "/vrm/Sendagaya_Shibu.vrm",
  "/vrm/Sendagaya_Shino.vrm",
  "/vrm/Vita.vrm",
  "/vrm/Vivi.vrm",
  "/vrm/Anna.vrm",
  "/vrm/Erika.vrm",
  "/vrm/Olivia.vrm",
  "/vrm/Avatar_Orion.vrm",
  "/vrm/Seed_san.vrm",
]);

const ZONE_FLOOR_COLORS: Readonly<Record<string, { readonly floor: number; readonly accent: number; readonly wall: number }>> = Object.freeze({
  skyport: { floor: 0xf4ece1, accent: 0x3b82f6, wall: 0xe5dccf },
  "personal-atelier": { floor: 0xede3d5, accent: 0x8b5cf6, wall: 0xdfd3c3 },
  "story-lab": { floor: 0xe6ecf5, accent: 0x06b6d4, wall: 0xd5dfed },
  "creator-cafe": { floor: 0xf5e6d8, accent: 0xf59e0b, wall: 0xe8d3bf },
  "team-meeting": { floor: 0xe2e8f0, accent: 0x10b981, wall: 0xcbd5e1 },
  "creator-plaza": { floor: 0xe8efe6, accent: 0x22c55e, wall: 0xd4e2d0 },
  "event-stage": { floor: 0x1e1b4b, accent: 0xec4899, wall: 0x312e81 },
  arcade: { floor: 0x1e293b, accent: 0x38bdf8, wall: 0x334155 },
  beach: { floor: 0xf7eedc, accent: 0x14b8a6, wall: 0xe6d7be },
  "review-gallery": { floor: 0xf8fafc, accent: 0xa855f7, wall: 0xe2e8f0 },
});

export interface StudioThreeActorNode {
  readonly id: string;
  readonly group: THREE.Group;
  readonly rigGroup: THREE.Group;
  readonly leftLeg: THREE.Mesh;
  readonly rightLeg: THREE.Mesh;
  readonly leftArm: THREE.Mesh;
  readonly rightArm: THREE.Mesh;
  readonly ring: THREE.Mesh;
  targetX: number;
  targetZ: number;
  currentYaw: number;
  targetYaw: number;
  moving: boolean;
  vrmLoaded: boolean;
}

/**
 * 즉시 표시되는 깔끔한 3D 아틀리에 캐릭터 리그(VRM 비동기 로드 전 또는 폴백용)를 생성한다.
 */
export function createStylized3DCharacterNode(
  id: string,
  primaryColor: number,
  isSelf: boolean,
): StudioThreeActorNode {
  const group = new THREE.Group();
  group.name = `actor-${id}`;

  const ringGeo = new THREE.RingGeometry(0.42, 0.56, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isSelf ? 0x38bdf8 : primaryColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: isSelf ? 0.85 : 0.48,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.03;
  group.add(ring);

  const shadowGeo = new THREE.CircleGeometry(0.4, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.24 });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.015;
  group.add(shadow);

  const rigGroup = new THREE.Group();
  group.add(rigGroup);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe4d6, roughness: 0.55, metalness: 0.05 });
  const coatMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.42, metalness: 0.12 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.08 });
  const hairMat = new THREE.MeshStandardMaterial({ color: isSelf ? 0x312e81 : 0x3f2e21, roughness: 0.5 });

  // 다리
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.34, 8, 12);
  const leftLeg = new THREE.Mesh(legGeo, darkMat);
  leftLeg.position.set(-0.12, 0.28, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, darkMat);
  rightLeg.position.set(0.12, 0.28, 0);
  rightLeg.castShadow = true;
  rigGroup.add(leftLeg, rightLeg);

  // 몸통(재킷)
  const torsoGeo = new THREE.CapsuleGeometry(0.22, 0.42, 10, 16);
  const torso = new THREE.Mesh(torsoGeo, coatMat);
  torso.position.set(0, 0.78, 0);
  torso.castShadow = true;
  rigGroup.add(torso);

  // 팔
  const armGeo = new THREE.CapsuleGeometry(0.075, 0.32, 8, 12);
  const leftArm = new THREE.Mesh(armGeo, coatMat);
  leftArm.position.set(-0.31, 0.78, 0);
  leftArm.castShadow = true;
  const rightArm = new THREE.Mesh(armGeo, coatMat);
  rightArm.position.set(0.31, 0.78, 0);
  rightArm.castShadow = true;
  rigGroup.add(leftArm, rightArm);

  // 머리
  const headGeo = new THREE.SphereGeometry(0.28, 24, 20);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 1.32, 0);
  head.castShadow = true;
  rigGroup.add(head);

  // 헤어 캡
  const hairGeo = new THREE.SphereGeometry(0.295, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.set(0, 1.35, -0.02);
  hair.castShadow = true;
  rigGroup.add(hair);

  // 정면 눈 (+Z 방향이 정면 "down")
  const eyeGeo = new THREE.SphereGeometry(0.036, 12, 12);
  const leftEye = new THREE.Mesh(eyeGeo, darkMat);
  leftEye.position.set(-0.09, 1.31, 0.25);
  const rightEye = new THREE.Mesh(eyeGeo, darkMat);
  rightEye.position.set(0.09, 1.31, 0.25);
  rigGroup.add(leftEye, rightEye);

  return {
    id,
    group,
    rigGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    ring,
    targetX: 0,
    targetZ: 0,
    currentYaw: 0,
    targetYaw: 0,
    moving: false,
    vrmLoaded: false,
  };
}

/**
 * 구역 바닥·유리 파티션·건축 조명·분수 등 3D 캠퍼스 아키텍처를 구성한다.
 */
export function buildStudioThreeCampusArchitecture(scene: THREE.Scene): {
  readonly floorMesh: THREE.Mesh;
  readonly waterMeshes: readonly THREE.Mesh[];
} {
  const campusW = 3072 * STUDIO_THREE_SCALE; // 96m
  const campusH = 1984 * STUDIO_THREE_SCALE; // 62m

  // 1. 메인 캠퍼스 베이스 슬래브
  const baseGeo = new THREE.BoxGeometry(campusW + 4, 0.8, campusH + 4);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85, metalness: 0.05 });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.set(campusW / 2, -0.42, campusH / 2);
  baseMesh.receiveShadow = true;
  scene.add(baseMesh);

  // 레이캐스트용 투명 바닥 평면
  const floorGeo = new THREE.PlaneGeometry(campusW, campusH);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ee,
    roughness: 0.82,
    metalness: 0.04,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(campusW / 2, 0, campusH / 2);
  floorMesh.receiveShadow = true;
  floorMesh.name = "campus-walkable-floor";
  scene.add(floorMesh);

  // 2. 산책로 그리드 라인 (깔끔한 건축 바닥 줄눈)
  const grid = new THREE.GridHelper(campusW, 48, 0x94a3b8, 0xcbd5e1);
  grid.position.set(campusW / 2, 0.008, campusH / 2);
  if (grid.material instanceof THREE.Material) {
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
  }
  scene.add(grid);

  // 3. 10개 구역별 건축 바닥 슬래브 및 반투명 유리·목재 파티션 벽
  for (const zone of CAMPUS_ZONES) {
    const palette = ZONE_FLOOR_COLORS[zone.roomId] ?? { floor: 0xf1f5f9, accent: 0x6366f1, wall: 0xe2e8f0 };
    const zx = zone.tiles.column * 64 * STUDIO_THREE_SCALE;
    const zz = zone.tiles.row * 64 * STUDIO_THREE_SCALE;
    const zw = zone.tiles.width * 64 * STUDIO_THREE_SCALE;
    const zh = zone.tiles.height * 64 * STUDIO_THREE_SCALE;
    const cx = zx + zw / 2;
    const cz = zz + zh / 2;

    // 구역 바닥
    const roomFloorGeo = new THREE.BoxGeometry(zw - 0.3, 0.06, zh - 0.3);
    const roomFloorMat = new THREE.MeshStandardMaterial({
      color: palette.floor,
      roughness: zone.roomId === "event-stage" || zone.roomId === "arcade" ? 0.38 : 0.65,
      metalness: 0.08,
    });
    const roomFloor = new THREE.Mesh(roomFloorGeo, roomFloorMat);
    roomFloor.position.set(cx, 0.03, cz);
    roomFloor.receiveShadow = true;
    scene.add(roomFloor);

    // 구역 테두리 액센트 스트립
    const borderGeo = new THREE.BoxGeometry(zw, 0.04, 0.14);
    const borderMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.22,
      roughness: 0.3,
    });
    const northStrip = new THREE.Mesh(borderGeo, borderMat);
    northStrip.position.set(cx, 0.06, zz + 0.07);
    scene.add(northStrip);

    // 실내 구역은 북쪽 백월 + 좌우 파티션 월을 세워 입체적인 오피스 아키텍처를 표현한다
    if (zone.walls.length > 0) {
      const wallHeight = 2.65;
      const wallMat = new THREE.MeshStandardMaterial({
        color: palette.wall,
        roughness: 0.6,
        metalness: 0.06,
      });
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        roughness: 0.15,
        transmission: 0.4,
      });

      // 북쪽 벽
      const northWallGeo = new THREE.BoxGeometry(zw, wallHeight, 0.24);
      const northWall = new THREE.Mesh(northWallGeo, wallMat);
      northWall.position.set(cx, wallHeight / 2, zz + 0.12);
      northWall.castShadow = true;
      northWall.receiveShadow = true;
      scene.add(northWall);

      // 좌·우 하프 글래스 파티션
      const sideWallGeo = new THREE.BoxGeometry(0.2, wallHeight * 0.65, zh * 0.72);
      for (const sideX of [zx + 0.1, zx + zw - 0.1]) {
        const sideWall = new THREE.Mesh(sideWallGeo, glassMat);
        sideWall.position.set(sideX, (wallHeight * 0.65) / 2, cz - zh * 0.08);
        scene.add(sideWall);
      }
    }
  }

  // 4. 남쪽 테라스 석호(Lagoon) 수면
  const waterMeshes: THREE.Mesh[] = [];
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.82,
  });
  for (const [wx, wz, ww, wh] of [
    [896 * STUDIO_THREE_SCALE, 1664 * STUDIO_THREE_SCALE, 512 * STUDIO_THREE_SCALE, 192 * STUDIO_THREE_SCALE],
    [1536 * STUDIO_THREE_SCALE, 1664 * STUDIO_THREE_SCALE, 512 * STUDIO_THREE_SCALE, 192 * STUDIO_THREE_SCALE],
  ] as const) {
    const waterGeo = new THREE.PlaneGeometry(ww, wh);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(wx + ww / 2, 0.05, wz + wh / 2);
    scene.add(water);
    waterMeshes.push(water);
  }

  return { floorMesh, waterMeshes };
}

/**
 * GLB 에셋과 VRM 아바타를 비동기 로드해 정규화 스케일로 3D 씬에 배치한다.
 */
export function loadStudioThreeAssets(
  scene: THREE.Scene,
  actorNodes: ReadonlyMap<string, StudioThreeActorNode>,
  isDisposed: () => boolean,
): void {
  const loader = new GLTFLoader();
  const glbCache = new Map<string, Promise<THREE.Group>>();

  const loadNormalizedGlb = (url: string): Promise<THREE.Group> => {
    const cached = glbCache.get(url);
    if (cached) return cached.then((group) => group.clone(true));
    const promise = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const root = gltf.scene;
          root.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          resolve(root);
        },
        undefined,
        reject,
      );
    });
    glbCache.set(url, promise);
    return promise.then((group) => group.clone(true));
  };

  for (const prop of STUDIO_THREE_PROPS) {
    void loadNormalizedGlb(prop.url)
      .then((model) => {
        if (isDisposed()) return;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const currentHeight = Math.max(0.05, size.y);
        const scale = prop.heightMeters / currentHeight;
        model.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);

        const wrapper = new THREE.Group();
        wrapper.name = `prop-${prop.id}`;
        model.position.set(-center.x, -scaledBox.min.y + (prop.elevationMeters ?? 0), -center.z);
        wrapper.add(model);
        wrapper.position.copy(worldToThree({ x: prop.x, y: prop.y }, 0));
        if (prop.rotationY) wrapper.rotation.y = prop.rotationY;
        scene.add(wrapper);
      })
      .catch(() => {
        // GLB 로드 실패 시 조용히 무시하고 기본 건축 구성을 유지한다.
      });
  }

  // NPC 및 로컬 플레이어 VRM 모델 로드 (SkinnedMesh 본 바인딩 보존을 위해 직접 로드)
  const npcIds = ["self", ...CAMPUS_NPCS.map((npc) => npc.id)];
  npcIds.forEach((actorId, index) => {
    const vrmUrl = STUDIO_THREE_VRM_URLS[index % STUDIO_THREE_VRM_URLS.length];
    if (!vrmUrl) return;
    loader.load(
      vrmUrl,
      (gltf) => {
        if (isDisposed()) return;
        const vrmScene = gltf.scene;
        if (!vrmScene) return;
        const node = actorNodes.get(actorId);
        if (!node || node.vrmLoaded) return;
        vrmScene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
          }
        });
        const box = new THREE.Box3().setFromObject(vrmScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetHeight = 1.65;
        const scale = targetHeight / Math.max(0.1, size.y);
        vrmScene.scale.setScalar(scale);
        const scaledBox = new THREE.Box3().setFromObject(vrmScene);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);
        vrmScene.position.set(-center.x, -scaledBox.min.y, -center.z);

        node.rigGroup.clear();
        node.rigGroup.add(vrmScene);
        node.vrmLoaded = true;
      },
      undefined,
      () => {
        // VRM 로드 전·실패 시 스타일라이즈드 3D 캐릭터 리그를 그대로 유지한다.
      },
    );
  });
}
