import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { CAMPUS_INTERACTIONS, CAMPUS_NPCS, CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { loadStudioThreeZoneDioramas } from "./studio-virtual-space-three-dioramas";

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
 * 10개 구역의 풀 3D 건축 디오라마(`STUDIO_THREE_ZONE_DIORAMAS`)와 조화를 이루는
 * 협업 워크스테이션(`CAMPUS_INTERACTIONS`) 포인트별 핵심 3D 장비·소품 배치도.
 */
export const STUDIO_THREE_PROPS: readonly StudioThreePropSpec[] = Object.freeze([
  // LOBBY (skyport — independent_bookshop 디오라마 + 컨시어지·폰부스 워크스테이션)
  { id: "lobby-concierge-desk", url: "/assets/3d/refined-v8/desk.glb", x: 448, y: 344, heightMeters: 1.08, rotationY: 0 },
  { id: "lobby-concierge-tablet", url: "/assets/3d/hologram_tablet.glb", x: 448, y: 344, heightMeters: 0.48, elevationMeters: 0.86, rotationY: 0 },
  { id: "lobby-desk-mug", url: "/assets/3d/everyday_mug.glb", x: 416, y: 340, heightMeters: 0.22, elevationMeters: 0.86, rotationY: 0.4 },
  { id: "lobby-clock", url: "/assets/3d/grandfather_clock.glb", x: 196, y: 210, heightMeters: 2.15, rotationY: 0 },
  { id: "lobby-robot", url: "/assets/3d/refined-v8/robot_pet.glb", x: 540, y: 430, heightMeters: 0.88, rotationY: -0.4 },
  { id: "lobby-phone-mic", url: "/assets/3d/atelier_microphone.glb", x: 660, y: 642, heightMeters: 1.32, rotationY: -0.3 },
  { id: "lobby-plant-east", url: "/assets/3d/potted_monstera.glb", x: 716, y: 240, heightMeters: 1.48, rotationY: -0.3 },

  // STUDIO (personal-atelier — classroom_art_studio 디오라마 + 드로잉·모니터·라이브 세트)
  { id: "studio-drawing-desk", url: "/assets/3d/refined-v8/desk.glb", x: 1000, y: 556, heightMeters: 1.15, rotationY: Math.PI },
  { id: "studio-drawing-chair", url: "/assets/3d/refined-v8/chair.glb", x: 1000, y: 604, heightMeters: 1.1, rotationY: Math.PI },
  { id: "studio-tablet", url: "/assets/3d/hologram_tablet.glb", x: 1000, y: 552, heightMeters: 0.46, elevationMeters: 0.84, rotationY: 0 },
  { id: "studio-desk-camera", url: "/assets/3d/atelier_camera.glb", x: 962, y: 554, heightMeters: 0.22, elevationMeters: 0.84, rotationY: 0.35 },
  { id: "studio-monitor-desk", url: "/assets/3d/refined-v8/desk.glb", x: 1400, y: 576, heightMeters: 1.15, rotationY: Math.PI },
  { id: "studio-monitor-chair", url: "/assets/3d/refined-v8/chair.glb", x: 1400, y: 624, heightMeters: 1.1, rotationY: Math.PI },
  { id: "studio-monitor-tablet", url: "/assets/3d/hologram_tablet.glb", x: 1400, y: 572, heightMeters: 0.48, elevationMeters: 0.84, rotationY: 0 },
  { id: "studio-light-west", url: "/assets/3d/paper_lantern.glb", x: 1130, y: 280, heightMeters: 1.45, rotationY: 0.2 },
  { id: "studio-light-east", url: "/assets/3d/paper_lantern.glb", x: 1302, y: 280, heightMeters: 1.45, rotationY: -0.2 },
  { id: "studio-mic", url: "/assets/3d/atelier_microphone.glb", x: 1216, y: 292, heightMeters: 1.32, rotationY: 0 },

  // CO-WORK (story-lab — library_reading_room 디오라마 + 집중석·보드)
  { id: "cowork-board", url: "/assets/3d/refined-v8/blackboard.glb", x: 1984, y: 236, heightMeters: 1.9, rotationY: 0 },
  { id: "cowork-focus-west", url: "/assets/3d/school_desk.glb", x: 1740, y: 628, heightMeters: 1.08, rotationY: Math.PI },
  { id: "cowork-focus-east", url: "/assets/3d/school_desk.glb", x: 2228, y: 628, heightMeters: 1.08, rotationY: Math.PI },
  { id: "cowork-book-1", url: "/assets/3d/everyday_book.glb", x: 1740, y: 624, heightMeters: 0.2, elevationMeters: 0.82, rotationY: 0.2 },
  { id: "cowork-bonsai", url: "/assets/3d/bonsai_tree.glb", x: 1740, y: 280, heightMeters: 0.72, rotationY: 0.3 },

  // CAFE (creator-cafe — stylized_cafe_interior 디오라마 + 자판기·다기·마스코트)
  { id: "cafe-tea-1", url: "/assets/3d/tea_set.glb", x: 2688, y: 318, heightMeters: 0.32, elevationMeters: 0.92, rotationY: 0.4 },
  { id: "cafe-boba-2", url: "/assets/3d/refined-v8/bubble_tea.glb", x: 2640, y: 318, heightMeters: 0.3, elevationMeters: 0.92, rotationY: -0.3 },
  { id: "cafe-vending", url: "/assets/3d/vending_machine.glb", x: 2470, y: 310, heightMeters: 1.95, rotationY: 0.2 },
  { id: "cafe-cat-mascot", url: "/assets/3d/refined-v8/robot_pet.glb", x: 2890, y: 636, heightMeters: 0.82, rotationY: -0.5 },

  // TALK (team-meeting — science_research_laboratory 디오라마 + 브리핑 장비)
  { id: "talk-holo", url: "/assets/3d/hologram_tablet.glb", x: 448, y: 1148, heightMeters: 0.5, elevationMeters: 0.88, rotationY: 0 },
  { id: "talk-fireplace", url: "/assets/3d/fireplace.glb", x: 210, y: 920, heightMeters: 1.75, rotationY: 0.3 },
  { id: "talk-sofa", url: "/assets/3d/refined-v8/sofa.glb", x: 248, y: 1256, heightMeters: 1.14, rotationY: Math.PI * 0.5 },

  // PLAZA (creator-plaza — park_garden_pavilion 디오라마 + 소원 분수·가로등)
  { id: "plaza-fountain-well", url: "/assets/3d/wishing_well.glb", x: 1472, y: 1210, heightMeters: 2.25, rotationY: 0 },
  { id: "plaza-bench-west", url: "/assets/3d/neom_bench_prop.glb", x: 1150, y: 1290, heightMeters: 0.95, rotationY: 0 },
  { id: "plaza-bench-east", url: "/assets/3d/neom_bench_prop.glb", x: 1794, y: 1290, heightMeters: 0.95, rotationY: 0 },
  { id: "plaza-lamp-nw", url: "/assets/3d/street_lamp.glb", x: 1020, y: 860, heightMeters: 2.65, rotationY: 0 },
  { id: "plaza-lamp-ne", url: "/assets/3d/street_lamp.glb", x: 1924, y: 860, heightMeters: 2.65, rotationY: 0 },
  { id: "plaza-lamp-sw", url: "/assets/3d/street_lamp.glb", x: 1020, y: 1320, heightMeters: 2.65, rotationY: 0 },
  { id: "plaza-lamp-se", url: "/assets/3d/street_lamp.glb", x: 1924, y: 1320, heightMeters: 2.65, rotationY: 0 },

  // EVENT (event-stage — korean_school_rooftop 디오라마 + 라이브 스테이지 장비)
  { id: "event-hologram", url: "/assets/3d/hologram_tablet.glb", x: 2560, y: 1020, heightMeters: 1.55, elevationMeters: 0.32, rotationY: 0 },
  { id: "event-mic", url: "/assets/3d/atelier_microphone.glb", x: 2480, y: 1056, heightMeters: 1.35, rotationY: 0.2 },
  { id: "event-lantern-w", url: "/assets/3d/paper_lantern.glb", x: 2320, y: 960, heightMeters: 1.5, rotationY: 0 },
  { id: "event-lantern-e", url: "/assets/3d/paper_lantern.glb", x: 2800, y: 960, heightMeters: 1.5, rotationY: 0 },

  // GAME (arcade — compact_apartment_interior 컷어웨이 디오라마 + 아케이드 캐비닛 4대)
  { id: "game-cabinet-1", url: "/assets/3d/arcade_game_cabinet.glb", x: 218, y: 1580, heightMeters: 1.82, rotationY: 0 },
  { id: "game-cabinet-2", url: "/assets/3d/arcade_game_cabinet.glb", x: 306, y: 1580, heightMeters: 1.82, rotationY: 0 },
  { id: "game-cabinet-3", url: "/assets/3d/arcade_game_cabinet.glb", x: 590, y: 1580, heightMeters: 1.82, rotationY: 0 },
  { id: "game-cabinet-4", url: "/assets/3d/arcade_game_cabinet.glb", x: 678, y: 1580, heightMeters: 1.82, rotationY: 0 },
  { id: "game-drone-1", url: "/assets/3d/scifi_drone_bot.glb", x: 260, y: 1700, heightMeters: 1.2, rotationY: 0.3 },

  // TERRACE (beach — fantasy_ruin_courtyard 디오라마 + 테라스 휴식 소품)
  { id: "terrace-bench-w", url: "/assets/3d/neom_bench_prop.glb", x: 1120, y: 1620, heightMeters: 0.95, rotationY: 0 },
  { id: "terrace-bench-e", url: "/assets/3d/neom_bench_prop.glb", x: 1820, y: 1620, heightMeters: 0.95, rotationY: 0 },
  { id: "terrace-cat-mascot", url: "/assets/3d/refined-v8/robot_pet.glb", x: 1344, y: 1564, heightMeters: 0.82, rotationY: 0.4 },
  { id: "terrace-campfire", url: "/assets/3d/campfire.glb", x: 1620, y: 1640, heightMeters: 0.65, rotationY: 0 },

  // GALLERY (review-gallery — fashion_boutique ATELIER 07 디오라마 + 전시 오브제)
  { id: "gallery-orb", url: "/assets/3d/crystal_orb.glb", x: 2338, y: 1564, heightMeters: 1.18, rotationY: 0 },
  { id: "gallery-grimoire", url: "/assets/3d/magic_grimoire.glb", x: 2560, y: 1618, heightMeters: 0.36, elevationMeters: 0.72, rotationY: 0.25 },
]);

/**
 * 플레이어(`self`)와 8명의 캠퍼스 NPC에 할당된 고밀도 다중 재질(12~17 Materials) 스튜디오급 VRM 크리에이터 아바타.
 * `@pixiv/three-vrm` `VRMLoaderPlugin`을 통해 VRM 0.0 및 VRM 1.0 정규화 휴머노이드 본과 스프링본 물리를 모두 지원한다.
 */
export const STUDIO_THREE_VRM_URLS: readonly string[] = Object.freeze([
  "/vrm/Victoria_Rubin.vrm",
  "/vrm/AliciaSolid.vrm",
  "/vrm/Vita.vrm",
  "/vrm/Sendagaya_Shino.vrm",
  "/vrm/Vivi.vrm",
  "/vrm/Sakurada_Fumiriya.vrm",
  "/vrm/Robert.vrm",
  "/vrm/Anna.vrm",
  "/vrm/Erika.vrm",
]);

const ZONE_FLOOR_COLORS: Readonly<Record<string, { readonly floor: number; readonly accent: number }>> = Object.freeze({
  skyport: { floor: 0xf4ece1, accent: 0x3b82f6 },
  "personal-atelier": { floor: 0xede3d5, accent: 0x8b5cf6 },
  "story-lab": { floor: 0xe6ecf5, accent: 0x06b6d4 },
  "creator-cafe": { floor: 0xf5e6d8, accent: 0xf59e0b },
  "team-meeting": { floor: 0xe2e8f0, accent: 0x10b981 },
  "creator-plaza": { floor: 0xe8efe6, accent: 0x22c55e },
  "event-stage": { floor: 0x1e1b4b, accent: 0xec4899 },
  arcade: { floor: 0x1e293b, accent: 0x38bdf8 },
  beach: { floor: 0xf7eedc, accent: 0x14b8a6 },
  "review-gallery": { floor: 0xf8fafc, accent: 0xa855f7 },
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
  vrm?: VRM;
  vrmLeftUpperLeg?: THREE.Object3D;
  vrmRightUpperLeg?: THREE.Object3D;
  vrmLeftUpperArm?: THREE.Object3D;
  vrmRightUpperArm?: THREE.Object3D;
  armDownZLeft?: number;
  armDownZRight?: number;
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

  const ringGeo = new THREE.RingGeometry(0.46, 0.62, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isSelf ? 0x38bdf8 : primaryColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: isSelf ? 0.88 : 0.52,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.065;
  group.add(ring);

  const shadowGeo = new THREE.CircleGeometry(0.44, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.26 });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.055;
  group.add(shadow);

  const rigGroup = new THREE.Group();
  rigGroup.position.y = 0.05;
  group.add(rigGroup);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe4d6, roughness: 0.55, metalness: 0.05 });
  const coatMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.42, metalness: 0.12 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.08 });
  const hairMat = new THREE.MeshStandardMaterial({ color: isSelf ? 0x312e81 : 0x3f2e21, roughness: 0.5 });

  const legGeo = new THREE.CapsuleGeometry(0.09, 0.34, 8, 12);
  const leftLeg = new THREE.Mesh(legGeo, darkMat);
  leftLeg.position.set(-0.12, 0.28, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, darkMat);
  rightLeg.position.set(0.12, 0.28, 0);
  rightLeg.castShadow = true;
  rigGroup.add(leftLeg, rightLeg);

  const torsoGeo = new THREE.CapsuleGeometry(0.22, 0.42, 10, 16);
  const torso = new THREE.Mesh(torsoGeo, coatMat);
  torso.position.set(0, 0.78, 0);
  torso.castShadow = true;
  rigGroup.add(torso);

  const armGeo = new THREE.CapsuleGeometry(0.075, 0.32, 8, 12);
  const leftArm = new THREE.Mesh(armGeo, coatMat);
  leftArm.position.set(-0.31, 0.78, 0);
  leftArm.castShadow = true;
  const rightArm = new THREE.Mesh(armGeo, coatMat);
  rightArm.position.set(0.31, 0.78, 0);
  rightArm.castShadow = true;
  rigGroup.add(leftArm, rightArm);

  const headGeo = new THREE.SphereGeometry(0.28, 24, 20);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 1.32, 0);
  head.castShadow = true;
  rigGroup.add(head);

  const hairGeo = new THREE.SphereGeometry(0.295, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.set(0, 1.35, -0.02);
  hair.castShadow = true;
  rigGroup.add(hair);

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
 * 캠퍼스 산책로·구역 기초 플린스·출입문 웰컴 매트·20개 협업 워크스테이션 링·석호 수면을 구성한다.
 * 각 구역의 실제 입체 벽체·바닥·빌트인 가구는 `STUDIO_THREE_ZONE_DIORAMAS` 풀 3D 디오라마가 담당한다.
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
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.82, metalness: 0.06 });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.set(campusW / 2, -0.42, campusH / 2);
  baseMesh.receiveShadow = true;
  scene.add(baseMesh);

  // 레이캐스트용 산책로 바닥 평면 (석재 프롬나드 타일 텍스처)
  const walkwayTex = createArchitecturalTileTexture("#dde5ee", "#c4d0dd", "#d0dae6", 32, 20);
  const floorGeo = new THREE.PlaneGeometry(campusW, campusH);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: walkwayTex,
    roughness: 0.72,
    metalness: 0.06,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(campusW / 2, 0, campusH / 2);
  floorMesh.receiveShadow = true;
  floorMesh.name = "campus-walkable-floor";
  scene.add(floorMesh);

  // 2. 10개 구역별 하부 플린스(Plinth), 경계 액센트 스트립 및 출입문 웰컴 매트
  for (const zone of CAMPUS_ZONES) {
    const palette = ZONE_FLOOR_COLORS[zone.roomId] ?? {
      floor: 0xf1f5f9,
      accent: 0x6366f1,
    };
    const zx = zone.tiles.column * 64 * STUDIO_THREE_SCALE;
    const zz = zone.tiles.row * 64 * STUDIO_THREE_SCALE;
    const zw = zone.tiles.width * 64 * STUDIO_THREE_SCALE;
    const zh = zone.tiles.height * 64 * STUDIO_THREE_SCALE;
    const cx = zx + zw / 2;
    const cz = zz + zh / 2;

    // 디오라마 바닥 아래를 받쳐주는 얇은 기초 플린스 (디오라마 자체 원목/타일 바닥을 가리지 않도록 y=0.006에 배치)
    const plinthGeo = new THREE.BoxGeometry(zw - 0.15, 0.012, zh - 0.15);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: palette.floor,
      roughness: 0.6,
      metalness: 0.08,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(cx, 0.006, cz);
    plinth.receiveShadow = true;
    scene.add(plinth);

    // 남쪽·동쪽 개방 경계선 바닥 액센트 라인 (구역 경계 시인성 확보)
    const southBorderGeo = new THREE.BoxGeometry(zw - 0.2, 0.02, 0.12);
    const borderMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.28,
      roughness: 0.32,
    });
    const southStrip = new THREE.Mesh(southBorderGeo, borderMat);
    southStrip.position.set(cx, 0.055, zz + zh - 0.08);
    scene.add(southStrip);

    // 출입문(Doors) 바닥 웰컴 매트
    for (const door of zone.doors) {
      const doorStart = door.from * 64 * STUDIO_THREE_SCALE;
      const doorEnd = (door.to + 1) * 64 * STUDIO_THREE_SCALE;
      const doorCenter = (doorStart + doorEnd) / 2;
      const doorSpan = doorEnd - doorStart;
      const isHorizontal = door.side === "north" || door.side === "south";
      const matGeo = new THREE.BoxGeometry(
        isHorizontal ? doorSpan : 0.95,
        0.024,
        isHorizontal ? 0.95 : doorSpan,
      );
      const matMesh = new THREE.Mesh(
        matGeo,
        new THREE.MeshStandardMaterial({
          color: palette.accent,
          emissive: palette.accent,
          emissiveIntensity: 0.24,
          roughness: 0.4,
        }),
      );
      const doorX = door.side === "west" ? zx + 0.25 : door.side === "east" ? zx + zw - 0.25 : doorCenter;
      const doorZ = door.side === "north" ? zz + 0.25 : door.side === "south" ? zz + zh - 0.25 : doorCenter;
      matMesh.position.set(doorX, 0.068, doorZ);
      scene.add(matMesh);
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

    const discGeo = new THREE.CircleGeometry(0.62, 28);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    group.add(disc);

    const ringGeo = new THREE.RingGeometry(0.62, 0.78, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
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
    roughness: 0.15,
    metalness: 0.42,
    transparent: true,
    opacity: 0.84,
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
 * VRM 0.0 / 1.0 정규화 휴머노이드 본(`@pixiv/three-vrm`) 또는 폴백 본을 찾아
 * T-포즈 양팔이 항상 지면(-Y) 방향 차렷 자세로 내려오도록 월드 Y 계측 기반으로 보정한다.
 */
export function applyNaturalVrmPosture(
  node: StudioThreeActorNode,
  vrmScene: THREE.Object3D,
  vrm?: VRM,
): void {
  let leftUpperArm: THREE.Object3D | null | undefined = vrm?.humanoid?.getNormalizedBoneNode("leftUpperArm");
  let rightUpperArm: THREE.Object3D | null | undefined = vrm?.humanoid?.getNormalizedBoneNode("rightUpperArm");
  let leftLowerArm: THREE.Object3D | null | undefined = vrm?.humanoid?.getNormalizedBoneNode("leftLowerArm");
  let rightLowerArm: THREE.Object3D | null | undefined = vrm?.humanoid?.getNormalizedBoneNode("rightLowerArm");
  let leftUpperLeg: THREE.Object3D | null | undefined = vrm?.humanoid?.getNormalizedBoneNode("leftUpperLeg");
  let rightUpperLeg: THREE.Object3D | null | undefined = vrm?.humanoid?.getNormalizedBoneNode("rightUpperLeg");

  if (!leftUpperArm || !rightUpperArm) {
    vrmScene.traverse((child) => {
      const n = child.name;
      if (!n) return;
      if (!leftUpperArm && /J_Bip_L_UpperArm|LeftArm$|upper_arm\.?L/i.test(n)) leftUpperArm = child;
      else if (!rightUpperArm && /J_Bip_R_UpperArm|RightArm$|upper_arm\.?R/i.test(n)) rightUpperArm = child;
      else if (!leftLowerArm && /J_Bip_L_LowerArm|LeftForeArm$|forearm\.?L/i.test(n)) leftLowerArm = child;
      else if (!rightLowerArm && /J_Bip_R_LowerArm|RightForeArm$|forearm\.?R/i.test(n)) rightLowerArm = child;
      else if (!leftUpperLeg && /J_Bip_L_UpperLeg|LeftUpLeg$|thigh\.?L/i.test(n)) leftUpperLeg = child;
      else if (!rightUpperLeg && /J_Bip_R_UpperLeg|RightUpLeg$|thigh\.?R/i.test(n)) rightUpperLeg = child;
    });
  }

  const syncHumanoid = () => {
    vrm?.humanoid?.update();
    vrmScene.updateMatrixWorld(true);
  };

  const resolveDownwardArmZ = (
    upperArm: THREE.Object3D,
    lowerArm: THREE.Object3D | null | undefined,
    defaultZ: number,
  ): number => {
    if (!lowerArm) {
      upperArm.rotation.z = defaultZ;
      syncHumanoid();
      return defaultZ;
    }
    const probe = new THREE.Vector3();
    upperArm.rotation.z = Math.abs(defaultZ);
    syncHumanoid();
    const posYPositive = lowerArm.getWorldPosition(probe).y;

    upperArm.rotation.z = -Math.abs(defaultZ);
    syncHumanoid();
    const posYNegative = lowerArm.getWorldPosition(probe).y;

    const bestZ = posYPositive <= posYNegative ? Math.abs(defaultZ) : -Math.abs(defaultZ);
    upperArm.rotation.z = bestZ;
    upperArm.rotation.x = 0.06;
    syncHumanoid();
    return bestZ;
  };

  if (leftUpperArm) {
    node.armDownZLeft = resolveDownwardArmZ(leftUpperArm, leftLowerArm, 1.16);
    node.vrmLeftUpperArm = leftUpperArm;
  }
  if (rightUpperArm) {
    node.armDownZRight = resolveDownwardArmZ(rightUpperArm, rightLowerArm, -1.16);
    node.vrmRightUpperArm = rightUpperArm;
  }
  if (leftLowerArm) {
    leftLowerArm.rotation.y = -0.14;
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.y = 0.14;
  }
  if (leftUpperLeg) node.vrmLeftUpperLeg = leftUpperLeg;
  if (rightUpperLeg) node.vrmRightUpperLeg = rightUpperLeg;
  syncHumanoid();
}

/**
 * 10개 구역 풀 3D 디오라마, `@pixiv/three-vrm` 기반 9종 VRM 아바타, 그리고 3D 협업 소품을 로드한다.
 */
export function loadStudioThreeAssets(
  scene: THREE.Scene,
  actorNodes: ReadonlyMap<string, StudioThreeActorNode>,
  isDisposed: () => boolean,
): void {
  const glbLoader = new GLTFLoader();

  // 1. 로컬 플레이어 및 NPC VRM 아바타 최우선 로드 (표준 PBR GLTFLoader + 공유 정점 버퍼 정규화)
  const npcIds = ["self", ...CAMPUS_NPCS.map((npc) => npc.id)];
  npcIds.forEach((actorId, index) => {
    const vrmUrl = STUDIO_THREE_VRM_URLS[index % STUDIO_THREE_VRM_URLS.length];
    if (!vrmUrl) return;
    glbLoader.load(
      vrmUrl,
      (gltf) => {
        if (isDisposed()) return;
        const vrmScene = gltf.scene;
        if (!vrmScene) return;
        const node = actorNodes.get(actorId);
        if (!node || node.vrmLoaded) return;

        // 보조 기계팔(robo_arm 등) 노드가 있는 샘플은 바운딩 박스 왜곡 방지를 위해 제거
        const auxToRemove: THREE.Object3D[] = [];
        vrmScene.traverse((child) => {
          if (child.name && /robo_/i.test(child.name)) {
            auxToRemove.push(child);
          }
        });
        for (const aux of auxToRemove) {
          aux.removeFromParent();
        }

        // VRM 0.0 에셋은 +Z 정면이므로 Math.PI 회전, VRM 1.0(VRMC_vrm) 에셋은 0 유지
        const isVrm1 = Boolean(
          (gltf as { parser?: { json?: { extensions?: { VRMC_vrm?: unknown } } } }).parser?.json?.extensions?.VRMC_vrm,
        );
        vrmScene.rotation.y = isVrm1 ? 0 : Math.PI;

        vrmScene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = !/hair/i.test(child.name);
            child.receiveShadow = true;
            child.frustumCulled = false;
          }
        });

        applyNaturalVrmPosture(node, vrmScene);
        vrmScene.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(vrmScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetHeight = 1.86;
        const scale = targetHeight / Math.max(0.1, size.y);
        vrmScene.scale.setScalar(scale);
        vrmScene.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(vrmScene);
        vrmScene.position.set(0, -scaledBox.min.y, 0);

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

  // 2. 10개 구역 풀 3D 건축 디오라마 로드
  loadStudioThreeZoneDioramas(scene, glbLoader, isDisposed);

  // 3. 협업 워크스테이션 소품 로드
  const glbCache = new Map<string, Promise<THREE.Group>>();
  const loadNormalizedGlb = (url: string): Promise<THREE.Group> => {
    const cached = glbCache.get(url);
    if (cached) return cached.then((group) => group.clone(true));
    const promise = new Promise<THREE.Group>((resolve, reject) => {
      glbLoader.load(
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
        model.position.set(-center.x, -scaledBox.min.y + 0.05 + (prop.elevationMeters ?? 0), -center.z);
        wrapper.add(model);
        wrapper.position.copy(worldToThree({ x: prop.x, y: prop.y }, 0));
        if (prop.rotationY) wrapper.rotation.y = prop.rotationY;
        scene.add(wrapper);
      })
      .catch(() => {
        // GLB 로드 실패 시 조용히 무시하고 기본 건축 구성을 유지한다.
      });
  }
}
