import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { CAMPUS_INTERACTIONS, CAMPUS_NPCS, CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
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
  { id: "lobby-desk-mug", url: "/assets/3d/everyday_mug.glb", x: 416, y: 336, heightMeters: 0.22, elevationMeters: 0.82, rotationY: 0.4 },
  { id: "lobby-desk-book", url: "/assets/3d/everyday_book.glb", x: 478, y: 338, heightMeters: 0.18, elevationMeters: 0.82, rotationY: -0.3 },
  { id: "lobby-sofa-west", url: "/assets/3d/refined-v8/sofa.glb", x: 256, y: 470, heightMeters: 1.15, rotationY: Math.PI * 0.5 },
  { id: "lobby-sofa-east", url: "/assets/3d/refined-v8/sofa.glb", x: 640, y: 470, heightMeters: 1.15, rotationY: -Math.PI * 0.5 },
  { id: "lobby-bonsai", url: "/assets/3d/bonsai_tree.glb", x: 350, y: 470, heightMeters: 0.65, rotationY: 0.2 },
  { id: "lobby-clock", url: "/assets/3d/grandfather_clock.glb", x: 220, y: 240, heightMeters: 2.1, rotationY: 0 },
  { id: "lobby-robot", url: "/assets/3d/refined-v8/robot_pet.glb", x: 540, y: 430, heightMeters: 0.85, rotationY: -0.4 },
  { id: "lobby-plant-west", url: "/assets/3d/potted_monstera.glb", x: 180, y: 260, heightMeters: 1.45, rotationY: 0.3 },
  { id: "lobby-plant-east", url: "/assets/3d/potted_monstera.glb", x: 710, y: 260, heightMeters: 1.45, rotationY: -0.3 },

  // STUDIO (personal-atelier)
  { id: "studio-drawing-desk", url: "/assets/3d/refined-v8/desk.glb", x: 1000, y: 540, heightMeters: 1.15, rotationY: Math.PI },
  { id: "studio-drawing-chair", url: "/assets/3d/refined-v8/chair.glb", x: 1000, y: 590, heightMeters: 1.1, rotationY: Math.PI },
  { id: "studio-tablet", url: "/assets/3d/hologram_tablet.glb", x: 1000, y: 536, heightMeters: 0.45, elevationMeters: 0.82, rotationY: 0 },
  { id: "studio-desk-camera", url: "/assets/3d/atelier_camera.glb", x: 962, y: 538, heightMeters: 0.22, elevationMeters: 0.82, rotationY: 0.35 },
  { id: "studio-monitor-desk", url: "/assets/3d/refined-v8/desk.glb", x: 1380, y: 540, heightMeters: 1.15, rotationY: Math.PI },
  { id: "studio-monitor-chair", url: "/assets/3d/refined-v8/chair.glb", x: 1380, y: 590, heightMeters: 1.1, rotationY: Math.PI },
  { id: "studio-monitor-tablet", url: "/assets/3d/hologram_tablet.glb", x: 1380, y: 536, heightMeters: 0.48, elevationMeters: 0.82, rotationY: 0 },
  { id: "studio-light-west", url: "/assets/3d/paper_lantern.glb", x: 1110, y: 290, heightMeters: 1.42, rotationY: 0.2 },
  { id: "studio-light-east", url: "/assets/3d/paper_lantern.glb", x: 1322, y: 290, heightMeters: 1.42, rotationY: -0.2 },
  { id: "studio-mic", url: "/assets/3d/atelier_microphone.glb", x: 1216, y: 320, heightMeters: 1.28, rotationY: 0 },
  { id: "studio-blackboard", url: "/assets/3d/refined-v8/blackboard.glb", x: 1216, y: 250, heightMeters: 1.85, rotationY: 0 },
  { id: "studio-plant", url: "/assets/3d/potted_monstera.glb", x: 960, y: 260, heightMeters: 1.45, rotationY: 0.5 },

  // CO-WORK (story-lab)
  { id: "cowork-board", url: "/assets/3d/refined-v8/blackboard.glb", x: 1984, y: 246, heightMeters: 1.9, rotationY: 0 },
  { id: "cowork-desk-1", url: "/assets/3d/refined-v8/desk.glb", x: 1820, y: 430, heightMeters: 1.12, rotationY: 0 },
  { id: "cowork-chair-1", url: "/assets/3d/refined-v8/chair.glb", x: 1820, y: 478, heightMeters: 1.08, rotationY: Math.PI },
  { id: "cowork-book-1", url: "/assets/3d/everyday_book.glb", x: 1820, y: 426, heightMeters: 0.2, elevationMeters: 0.8, rotationY: 0.2 },
  { id: "cowork-desk-2", url: "/assets/3d/refined-v8/desk.glb", x: 2140, y: 430, heightMeters: 1.12, rotationY: 0 },
  { id: "cowork-chair-2", url: "/assets/3d/refined-v8/chair.glb", x: 2140, y: 478, heightMeters: 1.08, rotationY: Math.PI },
  { id: "cowork-mug-2", url: "/assets/3d/everyday_mug.glb", x: 2140, y: 426, heightMeters: 0.22, elevationMeters: 0.8, rotationY: -0.4 },
  { id: "cowork-focus-west", url: "/assets/3d/school_desk.glb", x: 1750, y: 590, heightMeters: 1.05, rotationY: Math.PI },
  { id: "cowork-focus-east", url: "/assets/3d/school_desk.glb", x: 2220, y: 590, heightMeters: 1.05, rotationY: Math.PI },
  { id: "cowork-bonsai", url: "/assets/3d/bonsai_tree.glb", x: 1740, y: 270, heightMeters: 0.72, rotationY: 0.3 },
  { id: "cowork-plant", url: "/assets/3d/potted_monstera.glb", x: 2260, y: 260, heightMeters: 1.45, rotationY: -0.4 },

  // CAFE (creator-cafe)
  { id: "cafe-counter-desk", url: "/assets/3d/refined-v8/desk.glb", x: 2690, y: 290, heightMeters: 1.2, rotationY: 0 },
  { id: "cafe-hanging-sign", url: "/assets/3d/refined-v8/hanging_sign.glb", x: 2690, y: 240, heightMeters: 0.85, elevationMeters: 1.65, rotationY: 0 },
  { id: "cafe-table-1", url: "/assets/3d/round_table.glb", x: 2540, y: 470, heightMeters: 0.95, rotationY: 0 },
  { id: "cafe-tea-1", url: "/assets/3d/tea_set.glb", x: 2540, y: 470, heightMeters: 0.32, elevationMeters: 0.78, rotationY: 0.4 },
  { id: "cafe-table-2", url: "/assets/3d/round_table.glb", x: 2820, y: 470, heightMeters: 0.95, rotationY: 0.8 },
  { id: "cafe-boba-2", url: "/assets/3d/refined-v8/bubble_tea.glb", x: 2820, y: 470, heightMeters: 0.3, elevationMeters: 0.78, rotationY: -0.3 },
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
  { id: "event-mic", url: "/assets/3d/atelier_microphone.glb", x: 2480, y: 1010, heightMeters: 1.32, rotationY: 0.2 },
  { id: "event-chair-1", url: "/assets/3d/refined-v8/chair.glb", x: 2420, y: 1210, heightMeters: 1.05, rotationY: Math.PI },
  { id: "event-chair-2", url: "/assets/3d/refined-v8/chair.glb", x: 2560, y: 1210, heightMeters: 1.05, rotationY: Math.PI },
  { id: "event-chair-3", url: "/assets/3d/refined-v8/chair.glb", x: 2700, y: 1210, heightMeters: 1.05, rotationY: Math.PI },
  { id: "event-lantern-w", url: "/assets/3d/paper_lantern.glb", x: 2300, y: 940, heightMeters: 1.5, rotationY: 0 },
  { id: "event-lantern-e", url: "/assets/3d/paper_lantern.glb", x: 2820, y: 940, heightMeters: 1.5, rotationY: 0 },

  // GAME (arcade)
  { id: "game-cabinet-1", url: "/assets/3d/arcade_game_cabinet.glb", x: 218, y: 1580, heightMeters: 1.78, rotationY: 0 },
  { id: "game-cabinet-2", url: "/assets/3d/arcade_game_cabinet.glb", x: 306, y: 1580, heightMeters: 1.78, rotationY: 0 },
  { id: "game-cabinet-3", url: "/assets/3d/arcade_game_cabinet.glb", x: 590, y: 1580, heightMeters: 1.78, rotationY: 0 },
  { id: "game-cabinet-4", url: "/assets/3d/arcade_game_cabinet.glb", x: 678, y: 1580, heightMeters: 1.78, rotationY: 0 },
  { id: "game-drone-1", url: "/assets/3d/scifi_drone_bot.glb", x: 260, y: 1690, heightMeters: 1.25, rotationY: 0.3 },
  { id: "game-drone-2", url: "/assets/3d/refined-v8/robot_pet.glb", x: 620, y: 1690, heightMeters: 1.05, rotationY: -0.3 },
  { id: "game-sofa", url: "/assets/3d/refined-v8/sofa.glb", x: 448, y: 1740, heightMeters: 1.12, rotationY: Math.PI },

  // TERRACE (beach)
  { id: "terrace-bench-w", url: "/assets/3d/neom_bench_prop.glb", x: 1120, y: 1620, heightMeters: 0.95, rotationY: 0 },
  { id: "terrace-bench-e", url: "/assets/3d/neom_bench_prop.glb", x: 1820, y: 1620, heightMeters: 0.95, rotationY: 0 },
  { id: "terrace-table", url: "/assets/3d/round_table.glb", x: 1472, y: 1610, heightMeters: 0.95, rotationY: 0 },
  { id: "terrace-campfire", url: "/assets/3d/campfire.glb", x: 1620, y: 1640, heightMeters: 0.65, rotationY: 0 },

  // GALLERY (review-gallery)
  { id: "gallery-orb", url: "/assets/3d/crystal_orb.glb", x: 2560, y: 1620, heightMeters: 1.25, rotationY: 0 },
  { id: "gallery-desk-w", url: "/assets/3d/refined-v8/desk.glb", x: 2340, y: 1600, heightMeters: 1.12, rotationY: 0 },
  { id: "gallery-desk-e", url: "/assets/3d/refined-v8/desk.glb", x: 2780, y: 1600, heightMeters: 1.12, rotationY: 0 },
  { id: "gallery-bench", url: "/assets/3d/neom_bench_prop.glb", x: 2560, y: 1760, heightMeters: 0.95, rotationY: Math.PI },
]);

/** NPC 및 플레이어용 개별 구분된 VRM 0.0 크리에이터 아바타 에셋 매핑 (쌍둥이 중복 제거). */
export const STUDIO_THREE_VRM_URLS: readonly string[] = Object.freeze([
  "/vrm/AliciaSolid.vrm",
  "/vrm/Victoria_Rubin.vrm",
  "/vrm/Vita.vrm",
  "/vrm/Sakurada_Fumiriya.vrm",
  "/vrm/Vivi.vrm",
  "/vrm/Robert.vrm",
  "/vrm/Anna.vrm",
  "/vrm/Erika.vrm",
  "/vrm/Olivia.vrm",
]);

const ZONE_FLOOR_COLORS: Readonly<Record<string, { readonly floor: number; readonly accent: number; readonly wall: number; readonly rug: number }>> = Object.freeze({
  skyport: { floor: 0xf4ece1, accent: 0x3b82f6, wall: 0xe5dccf, rug: 0xdbeafe },
  "personal-atelier": { floor: 0xede3d5, accent: 0x8b5cf6, wall: 0xdfd3c3, rug: 0xede9fe },
  "story-lab": { floor: 0xe6ecf5, accent: 0x06b6d4, wall: 0xd5dfed, rug: 0xcffafe },
  "creator-cafe": { floor: 0xf5e6d8, accent: 0xf59e0b, wall: 0xe8d3bf, rug: 0xfef3c7 },
  "team-meeting": { floor: 0xe2e8f0, accent: 0x10b981, wall: 0xcbd5e1, rug: 0xd1fae5 },
  "creator-plaza": { floor: 0xe8efe6, accent: 0x22c55e, wall: 0xd4e2d0, rug: 0xdcfce7 },
  "event-stage": { floor: 0x1e1b4b, accent: 0xec4899, wall: 0x312e81, rug: 0x311042 },
  arcade: { floor: 0x1e293b, accent: 0x38bdf8, wall: 0x334155, rug: 0x0f172a },
  beach: { floor: 0xf7eedc, accent: 0x14b8a6, wall: 0xe6d7be, rug: 0xccfbf1 },
  "review-gallery": { floor: 0xf8fafc, accent: 0xa855f7, wall: 0xe2e8f0, rug: 0xf3e8ff },
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
  vrmLeftUpperLeg?: THREE.Object3D;
  vrmRightUpperLeg?: THREE.Object3D;
  vrmLeftUpperArm?: THREE.Object3D;
  vrmRightUpperArm?: THREE.Object3D;
  targetX: number;
  targetZ: number;
  currentYaw: number;
  targetYaw: number;
  moving: boolean;
  vrmLoaded: boolean;
}

function createArchitecturalTileTexture(
  baseHex: string,
  lineHex: string,
  subLineHex: string,
  repeatX: number,
  repeatY: number,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = subLineHex;
  ctx.lineWidth = 2;
  for (let i = 64; i < 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 253, 253);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
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

export interface StudioThreeWorkstationRing {
  readonly id: string;
  readonly zoneId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly group: THREE.Group;
  readonly outerRing: THREE.Mesh;
}

const ACTION_RING_COLORS: Readonly<Record<string, number>> = Object.freeze({
  assistant: 0x3b82f6,
  canvas: 0x8b5cf6,
  story: 0x06b6d4,
  live: 0x10b981,
  review: 0xa855f7,
  assets: 0xf59e0b,
  community: 0xec4899,
  comic: 0x38bdf8,
});

/**
 * 구역 바닥·유리 파티션·출입문 포털·협업 워크스테이션 링·분수 등 3D 캠퍼스 아키텍처를 구성한다.
 */
export function buildStudioThreeCampusArchitecture(scene: THREE.Scene): {
  readonly floorMesh: THREE.Mesh;
  readonly waterMeshes: readonly THREE.Mesh[];
  readonly workstationRings: readonly StudioThreeWorkstationRing[];
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

  // 레이캐스트용 바닥 평면 (석재 프롬나드 타일 텍스처)
  const walkwayTex = createArchitecturalTileTexture("#dde5ee", "#c2cedb", "#cfd9e5", 32, 20);
  const floorGeo = new THREE.PlaneGeometry(campusW, campusH);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: walkwayTex,
    roughness: 0.78,
    metalness: 0.04,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(campusW / 2, 0, campusH / 2);
  floorMesh.receiveShadow = true;
  floorMesh.name = "campus-walkable-floor";
  scene.add(floorMesh);

  // 2. 10개 구역별 건축 바닥 슬래브, 인테리어 러그, 출입문 매트 및 유리·목재 파티션 벽
  for (const zone of CAMPUS_ZONES) {
    const palette = ZONE_FLOOR_COLORS[zone.roomId] ?? {
      floor: 0xf1f5f9,
      accent: 0x6366f1,
      wall: 0xe2e8f0,
      rug: 0xe0e7ff,
    };
    const zx = zone.tiles.column * 64 * STUDIO_THREE_SCALE;
    const zz = zone.tiles.row * 64 * STUDIO_THREE_SCALE;
    const zw = zone.tiles.width * 64 * STUDIO_THREE_SCALE;
    const zh = zone.tiles.height * 64 * STUDIO_THREE_SCALE;
    const cx = zx + zw / 2;
    const cz = zz + zh / 2;

    const isDarkZone = zone.roomId === "event-stage" || zone.roomId === "arcade";
    const roomTex = createArchitecturalTileTexture(
      isDarkZone ? "#1e293b" : "#f5efe6",
      isDarkZone ? "#334155" : "#e2d6c5",
      isDarkZone ? "#263348" : "#ebe2d4",
      Math.max(4, Math.round(zw / 2.2)),
      Math.max(4, Math.round(zh / 2.2)),
    );

    // 구역 바닥
    const roomFloorGeo = new THREE.BoxGeometry(zw - 0.3, 0.06, zh - 0.3);
    const roomFloorMat = new THREE.MeshStandardMaterial({
      color: palette.floor,
      map: roomTex,
      roughness: isDarkZone ? 0.38 : 0.58,
      metalness: 0.08,
    });
    const roomFloor = new THREE.Mesh(roomFloorGeo, roomFloorMat);
    roomFloor.position.set(cx, 0.03, cz);
    roomFloor.receiveShadow = true;
    scene.add(roomFloor);

    // 실내 중앙 인테리어 러그 또는 광장 원형 메달리온
    if (zone.roomId === "creator-plaza") {
      const plazaCircleGeo = new THREE.CircleGeometry(Math.min(zw, zh) * 0.32, 48);
      plazaCircleGeo.rotateX(-Math.PI / 2);
      const plazaCircleMat = new THREE.MeshStandardMaterial({
        color: 0xd1fae5,
        roughness: 0.65,
        metalness: 0.05,
      });
      const plazaCircle = new THREE.Mesh(plazaCircleGeo, plazaCircleMat);
      plazaCircle.position.set(cx, 0.068, cz);
      plazaCircle.receiveShadow = true;
      scene.add(plazaCircle);
    } else {
      const rugGeo = new THREE.BoxGeometry(zw * 0.56, 0.018, zh * 0.48);
      const rugMat = new THREE.MeshStandardMaterial({
        color: palette.rug,
        roughness: 0.82,
        metalness: 0.02,
      });
      const rug = new THREE.Mesh(rugGeo, rugMat);
      rug.position.set(cx, 0.066, cz + 0.3);
      rug.receiveShadow = true;
      scene.add(rug);
    }

    // 구역 테두리 액센트 스트립
    const borderGeo = new THREE.BoxGeometry(zw, 0.05, 0.16);
    const borderMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });
    const northStrip = new THREE.Mesh(borderGeo, borderMat);
    northStrip.position.set(cx, 0.065, zz + 0.08);
    scene.add(northStrip);

    // 출입문(Doors) 바닥 웰컴 매트 & 액센트 문턱 바
    for (const door of zone.doors) {
      const doorStart = door.from * 64 * STUDIO_THREE_SCALE;
      const doorEnd = (door.to + 1) * 64 * STUDIO_THREE_SCALE;
      const doorCenter = (doorStart + doorEnd) / 2;
      const doorSpan = doorEnd - doorStart;
      const isHorizontal = door.side === "north" || door.side === "south";
      const matGeo = new THREE.BoxGeometry(
        isHorizontal ? doorSpan : 0.9,
        0.024,
        isHorizontal ? 0.9 : doorSpan,
      );
      const matMesh = new THREE.Mesh(
        matGeo,
        new THREE.MeshStandardMaterial({
          color: palette.accent,
          emissive: palette.accent,
          emissiveIntensity: 0.18,
          roughness: 0.45,
        }),
      );
      const doorX = door.side === "west" ? zx + 0.25 : door.side === "east" ? zx + zw - 0.25 : doorCenter;
      const doorZ = door.side === "north" ? zz + 0.25 : door.side === "south" ? zz + zh - 0.25 : doorCenter;
      matMesh.position.set(doorX, 0.068, doorZ);
      scene.add(matMesh);
    }

    // 실내 구역은 북쪽 백월 + 좌우 파티션 월 + 남쪽 낮은 건축 난간을 세워 입체적인 오피스 아키텍처를 표현한다
    if (zone.walls.length > 0) {
      const wallHeight = 2.65;
      const wallMat = new THREE.MeshStandardMaterial({
        color: palette.wall,
        roughness: 0.55,
        metalness: 0.06,
      });
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.35,
        metalness: 0.45,
      });
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        roughness: 0.15,
        transmission: 0.4,
      });

      // 북쪽 벽 + 상단 몰딩 캡
      const northWallGeo = new THREE.BoxGeometry(zw, wallHeight, 0.24);
      const northWall = new THREE.Mesh(northWallGeo, wallMat);
      northWall.position.set(cx, wallHeight / 2, zz + 0.12);
      northWall.castShadow = true;
      northWall.receiveShadow = true;
      scene.add(northWall);

      const capGeo = new THREE.BoxGeometry(zw + 0.08, 0.09, 0.3);
      const northCap = new THREE.Mesh(capGeo, frameMat);
      northCap.position.set(cx, wallHeight + 0.045, zz + 0.12);
      scene.add(northCap);

      // 좌·우 하프 글래스 파티션
      const sideWallGeo = new THREE.BoxGeometry(0.18, wallHeight * 0.65, zh * 0.72);
      for (const sideX of [zx + 0.1, zx + zw - 0.1]) {
        const sideWall = new THREE.Mesh(sideWallGeo, glassMat);
        sideWall.position.set(sideX, (wallHeight * 0.65) / 2, cz - zh * 0.08);
        scene.add(sideWall);
      }

      // 남쪽 낮은 건축 파티션 난간 (출입구 양옆으로 배치하여 시야를 가리지 않으면서 방 경계를 명확히 표시)
      if (zone.walls.includes("south")) {
        const southCurbH = 0.48;
        const wingWidth = Math.max(1.8, (zw - 4.4) * 0.42);
        const wingGeo = new THREE.BoxGeometry(wingWidth, southCurbH, 0.22);
        const leftWing = new THREE.Mesh(wingGeo, wallMat);
        leftWing.position.set(zx + wingWidth / 2 + 0.15, southCurbH / 2, zz + zh - 0.14);
        leftWing.castShadow = true;
        leftWing.receiveShadow = true;
        const rightWing = new THREE.Mesh(wingGeo, wallMat);
        rightWing.position.set(zx + zw - wingWidth / 2 - 0.15, southCurbH / 2, zz + zh - 0.14);
        rightWing.castShadow = true;
        rightWing.receiveShadow = true;
        scene.add(leftWing, rightWing);
      }
    }
  }

  // 3. 20개 협업 워크스테이션 바닥 인터랙션 링 (CAMPUS_INTERACTIONS)
  const workstationRings: StudioThreeWorkstationRing[] = [];
  for (const interaction of CAMPUS_INTERACTIONS) {
    const color = ACTION_RING_COLORS[interaction.action] ?? 0x6366f1;
    const group = new THREE.Group();
    group.name = `workstation-${interaction.id}`;
    const pos3 = worldToThree(interaction.point, 0.072);
    group.position.copy(pos3);

    const discGeo = new THREE.CircleGeometry(0.56, 28);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    group.add(disc);

    const ringGeo = new THREE.RingGeometry(0.56, 0.72, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(ringGeo, ringMat);
    outerRing.position.y = 0.004;
    group.add(outerRing);

    scene.add(group);
    workstationRings.push({
      id: interaction.id,
      zoneId: interaction.zoneId,
      point: interaction.point,
      radius: interaction.radius,
      group,
      outerRing,
    });
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

  return { floorMesh, waterMeshes, workstationRings };
}

/**
 * VRM 0.0 휴머노이드 본을 찾아 T-포즈 양팔을 자연스러운 차렷/아틀리에 자세로 내리고
 * 보행 애니메이션용 상완·대퇴 본 참조를 연결한다.
 */
export function applyNaturalVrmPosture(node: StudioThreeActorNode, vrmScene: THREE.Object3D): void {
  let leftUpperArm: THREE.Object3D | undefined;
  let rightUpperArm: THREE.Object3D | undefined;
  let leftLowerArm: THREE.Object3D | undefined;
  let rightLowerArm: THREE.Object3D | undefined;
  let leftUpperLeg: THREE.Object3D | undefined;
  let rightUpperLeg: THREE.Object3D | undefined;

  vrmScene.traverse((child) => {
    const n = child.name;
    if (!n) return;
    if (/J_Bip_L_UpperArm|LeftArm$/i.test(n)) leftUpperArm = child;
    else if (/J_Bip_R_UpperArm|RightArm$/i.test(n)) rightUpperArm = child;
    else if (/J_Bip_L_LowerArm|LeftForeArm$/i.test(n)) leftLowerArm = child;
    else if (/J_Bip_R_LowerArm|RightForeArm$/i.test(n)) rightLowerArm = child;
    else if (/J_Bip_L_UpperLeg|LeftUpLeg$/i.test(n)) leftUpperLeg = child;
    else if (/J_Bip_R_UpperLeg|RightUpLeg$/i.test(n)) rightUpperLeg = child;
  });

  // T-pose 양팔을 몸통 옆 자연스러운 각도(약 68도)로 내리고 팔꿈치를 살짝 굽힌다
  if (leftUpperArm) {
    leftUpperArm.rotation.z = 1.18;
    leftUpperArm.rotation.x = 0.06;
    node.vrmLeftUpperArm = leftUpperArm;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = -1.18;
    rightUpperArm.rotation.x = 0.06;
    node.vrmRightUpperArm = rightUpperArm;
  }
  if (leftLowerArm) {
    leftLowerArm.rotation.y = -0.18;
    leftLowerArm.rotation.z = 0.08;
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.y = 0.18;
    rightLowerArm.rotation.z = -0.08;
  }
  if (leftUpperLeg) node.vrmLeftUpperLeg = leftUpperLeg;
  if (rightUpperLeg) node.vrmRightUpperLeg = rightUpperLeg;
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
        // VRM 0.0 기본 정면(-Z)을 Three.js +Z("down") 정면으로 회전
        vrmScene.rotation.y = Math.PI;
        applyNaturalVrmPosture(node, vrmScene);
        vrmScene.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(vrmScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetHeight = 1.65;
        const scale = targetHeight / Math.max(0.1, size.y);
        vrmScene.scale.setScalar(scale);
        vrmScene.updateMatrixWorld(true);

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
