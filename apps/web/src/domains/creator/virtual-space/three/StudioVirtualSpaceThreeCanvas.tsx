import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { CAMPUS_NPCS, CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import {
  STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS,
  StudioZoneChangeTracker,
  type StudioVirtualSpaceNearbyNpc,
} from "../studio-virtual-space-engine-events";
import { STUDIO_INTERACT_KEY_CODES } from "../studio-virtual-space-interact-prompt";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioNpcInteraction, studioNpcLabel } from "../studio-virtual-space-npc-director";
import {
  nearestInteraction,
  studioFacingToward,
  studioWorldMayTakeFocus,
  WORLD_KEY_CODES,
  type StudioVirtualSpacePhaserCanvasProps,
} from "../studio-virtual-space-phaser-canvas-model";
import { clampStudioWorldPoint } from "../studio-virtual-space-world-pathfinding";
import {
  studioWorldInteractions,
  studioWorldPortals,
  studioWorldRoomAt,
  studioWorldSpawn,
} from "../studio-virtual-space-world-manifest";
import {
  buildStudioThreeCampusArchitecture,
  createStylized3DCharacterNode,
  facingToYawRadians,
  loadStudioThreeAssets,
  shortestAngleLerp,
  threeToWorld,
  worldToThree,
  type StudioThreeActorNode,
} from "./studio-virtual-space-three-scene";

interface ProjectedOverlayItem {
  readonly id: string;
  readonly targetId?: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly kind: "self" | "peer" | "npc" | "zone" | "workstation";
  readonly x: number;
  readonly y: number;
  readonly accent?: string;
  readonly active?: boolean;
}

const NPC_COLORS = [0x6366f1, 0xec4899, 0x06b6d4, 0xf59e0b, 0x10b981, 0x8b5cf6, 0x3b82f6, 0x14b8a6] as const;

const WORKSTATION_ACTION_BADGES: Readonly<Record<string, { readonly ko: string; readonly en: string; readonly color: string }>> = Object.freeze({
  assistant: { ko: "AI 도우미", en: "AI Assistant", color: "#3b82f6" },
  canvas: { ko: "원고 캔버스", en: "Canvas", color: "#8b5cf6" },
  story: { ko: "스토리·콘티", en: "Story", color: "#06b6d4" },
  live: { ko: "라이브 협업", en: "Live", color: "#10b981" },
  review: { ko: "피드백 리뷰", en: "Review", color: "#a855f7" },
  assets: { ko: "에셋 아카이브", en: "Assets", color: "#f59e0b" },
  community: { ko: "라운지", en: "Lounge", color: "#ec4899" },
  comic: { ko: "플레이", en: "Arcade", color: "#38bdf8" },
});

const DUPLICATE_ARCADE_IDS = new Set([
  "campus-arcade-cabinet-2",
  "campus-arcade-cabinet-3",
  "campus-arcade-cabinet-4",
]);

/**
 * Three.js + GLB/VRM 기반 3D 가상 스튜디오 스테이지 렌더러.
 * 기존 StudioVirtualSpaceEngineBridge 및 2D 월드 좌표계(3072×1984)와 1:1 호환된다.
 */
export function StudioVirtualSpaceThreeCanvas({
  manifest,
  snapshot,
  bridge,
  selfDisplayName,
  spaceTheme = "webtoon-atelier",
  onRuntimeMetrics,
  onNpcInteract,
  onLocalState,
  onInteract,
  onNearbyInteractionChange,
  onPortal,
  onZoneChange,
  onNearbyNpcsChange,
  onEngineStatusChange,
}: StudioVirtualSpacePhaserCanvasProps) {
  const bt = useBilingual("StudioVirtualSpaceThreeCanvas");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [overlays, setOverlays] = useState<readonly ProjectedOverlayItem[]>([]);
  const triggerOverlayTargetRef = useRef<((kind: "workstation" | "npc", targetId: string) => void) | null>(null);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const selfNameRef = useRef(selfDisplayName);
  selfNameRef.current = selfDisplayName;
  const callbacks = { onRuntimeMetrics, onNpcInteract, onLocalState, onInteract, onNearbyInteractionChange, onPortal, onZoneChange, onNearbyNpcsChange, onEngineStatusChange };
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const container = containerRef.current;
    const canvasMount = canvasMountRef.current;
    if (!container || !canvasMount) return undefined;

    let disposed = false;
    callbacksRef.current.onEngineStatusChange?.("loading");

    const scene = new THREE.Scene();
    const bgHex = spaceTheme === "celestial-observatory" ? 0x0f172a : spaceTheme === "neon-night" ? 0x111827 : 0xe2e8f0;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.011);

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    renderer.domElement.tabIndex = 0;
    canvasMount.innerHTML = "";
    canvasMount.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.98);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.38);
    dirLight.position.set(36, 48, 28);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    Object.assign(dirLight.shadow.camera, { near: 4, far: 140, left: -48, right: 48, top: 48, bottom: -48 });
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const { floorMesh, waterMeshes, workstationRings } = buildStudioThreeCampusArchitecture(scene);

    const actorNodes = new Map<string, StudioThreeActorNode>();
    const spawnPoint = snapshotRef.current.self.x > 0 || snapshotRef.current.self.y > 0
      ? { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y }
      : studioWorldSpawn(manifest).point;

    const selfNode = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const selfPos3 = worldToThree(spawnPoint, 0);
    selfNode.group.position.copy(selfPos3);
    selfNode.targetX = selfPos3.x;
    selfNode.targetZ = selfPos3.z;
    scene.add(selfNode.group);
    actorNodes.set("self", selfNode);

    camera.position.set(selfPos3.x, 9.2, selfPos3.z + 11.4);
    camera.lookAt(selfPos3.x, 0.95, selfPos3.z - 0.8);

    const npcDefinitions = manifest.npcs ?? [];
    CAMPUS_NPCS.forEach((npc, index) => {
      const node = createStylized3DCharacterNode(npc.id, NPC_COLORS[index % NPC_COLORS.length] ?? 0x6366f1, false);
      const pos3 = worldToThree(npc.point, 0);
      node.group.position.copy(pos3);
      node.targetX = pos3.x;
      node.targetZ = pos3.z;
      node.currentYaw = facingToYawRadians(npc.facing);
      node.targetYaw = node.currentYaw;
      node.group.rotation.y = node.currentYaw;
      scene.add(node.group);
      actorNodes.set(npc.id, node);
    });

    const destGeo = new THREE.RingGeometry(0.28, 0.42, 28);
    destGeo.rotateX(-Math.PI / 2);
    const destMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const destMarker = new THREE.Mesh(destGeo, destMat);
    destMarker.position.y = 0.04;
    destMarker.visible = false;
    scene.add(destMarker);

    loadStudioThreeAssets(scene, actorNodes, () => disposed);

    const keysDown = new Set<string>();
    let currentPoint: StudioVirtualSpacePoint = { ...spawnPoint };
    let currentFacing: StudioVirtualSpaceFacing = snapshotRef.current.self.facing ?? "down";
    let moveDestination: StudioVirtualSpacePoint | null = null;
    let pendingAutoInteract: { readonly kind: "workstation" | "npc"; readonly id: string } | null = null;
    let targetCameraYaw = 0;
    let currentCameraYaw = 0;
    const zoneTracker = new StudioZoneChangeTracker(manifest);

    bridge.setFocusHandler(() => renderer.domElement.focus({ preventScroll: true }));

    triggerOverlayTargetRef.current = (kind, targetId) => {
      const allInteractions = studioWorldInteractions(manifest);
      if (kind === "workstation") {
        const target = allInteractions.find((item) => item.id === targetId);
        if (!target) return;
        if (Math.hypot(target.point.x - currentPoint.x, target.point.y - currentPoint.y) <= target.radius + 28) {
          callbacksRef.current.onInteract?.(target);
        } else {
          pendingAutoInteract = { kind: "workstation", id: targetId };
          moveDestination = clampStudioWorldPoint(manifest, target.point);
          destMarker.position.copy(worldToThree(moveDestination, 0.04));
          destMarker.visible = true;
        }
      } else {
        const npc = CAMPUS_NPCS.find((item) => item.id === targetId);
        const def = npcDefinitions.find((item) => item.id === targetId);
        if (!npc || !def) return;
        const npcInteract = studioNpcInteraction(manifest, def);
        if (Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y) <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS && npcInteract) {
          callbacksRef.current.onNpcInteract?.(npcInteract, def);
        } else {
          pendingAutoInteract = { kind: "npc", id: targetId };
          moveDestination = clampStudioWorldPoint(manifest, { x: npc.point.x, y: npc.point.y + 54 });
          destMarker.position.copy(worldToThree(moveDestination, 0.04));
          destMarker.visible = true;
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!studioWorldMayTakeFocus(document.activeElement, container)) return;
      if (WORLD_KEY_CODES.has(event.code) || event.code === "KeyQ" || event.code === "KeyE") keysDown.add(event.code);
      if (event.code === "KeyC") targetCameraYaw = 0;
      if (STUDIO_INTERACT_KEY_CODES.has(event.code)) bridge.requestInteract();
    };
    const handleKeyUp = (event: KeyboardEvent) => keysDown.delete(event.code);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos: { x: number; y: number } | null = null;
    let orbitDragLastX: number | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button === 2) orbitDragLastX = event.clientX;
      else if (event.button === 0) pointerDownPos = { x: event.clientX, y: event.clientY };
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (orbitDragLastX !== null) {
        targetCameraYaw -= (event.clientX - orbitDragLastX) * 0.007;
        orbitDragLastX = event.clientX;
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 2) {
        orbitDragLastX = null;
        return;
      }
      if (!pointerDownPos) return;
      const dist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
      pointerDownPos = null;
      if (dist > 8) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObject(floorMesh, false)[0];
      if (hit) {
        const clamped = clampStudioWorldPoint(manifest, threeToWorld({ x: hit.point.x, z: hit.point.z }));
        pendingAutoInteract = null;
        moveDestination = clamped;
        destMarker.position.copy(worldToThree(clamped, 0.04));
        destMarker.visible = true;
      }
    };
    const handleContextMenu = (event: MouseEvent) => event.preventDefault();
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      bridge.userZoom.apply(event.deltaY < 0 ? "in" : "out");
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("contextmenu", handleContextMenu);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(320, container.clientWidth || window.innerWidth);
      const h = Math.max(240, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    callbacksRef.current.onEngineStatusChange?.("ready");
    const initialZone = zoneTracker.next(currentPoint);
    if (initialZone) callbacksRef.current.onZoneChange?.(initialZone);

    let lastTime = performance.now();
    let lastOverlaySync = 0;
    let lastLocalStateSync = 0;
    let animFrameId = 0;

    const snapPlayerAndCamera = (target: StudioVirtualSpacePoint) => {
      currentPoint = target;
      moveDestination = null;
      pendingAutoInteract = null;
      destMarker.visible = false;
      const p3 = worldToThree(currentPoint, 0);
      selfNode.group.position.copy(p3);
      const zoomFactor = Math.max(0.65, Math.min(1.65, bridge.userZoom.get()));
      camera.position.set(
        p3.x + Math.sin(currentCameraYaw) * (11.4 / zoomFactor),
        9.2 / zoomFactor,
        p3.z + Math.cos(currentCameraYaw) * (11.4 / zoomFactor),
      );
    };

    const animate = (now: number) => {
      if (disposed) return;
      animFrameId = window.requestAnimationFrame(animate);

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const teleport = bridge.consumeTeleport();
      if (teleport) snapPlayerAndCamera(clampStudioWorldPoint(manifest, teleport));

      const requestedMove = bridge.consumeMoveTarget();
      if (requestedMove) {
        const clampedTarget = clampStudioWorldPoint(manifest, requestedMove);
        const targetDist = Math.hypot(clampedTarget.x - currentPoint.x, clampedTarget.y - currentPoint.y);
        const fromZone = studioWorldRoomAt(manifest, currentPoint);
        const toZone = studioWorldRoomAt(manifest, clampedTarget);
        if (targetDist > 420 || (toZone && toZone !== fromZone)) {
          snapPlayerAndCamera(clampedTarget);
        } else {
          moveDestination = clampedTarget;
          destMarker.position.copy(worldToThree(moveDestination, 0.04));
          destMarker.visible = true;
        }
      }

      // 카메라 Q / E 오빗 회전
      if (keysDown.has("KeyQ")) targetCameraYaw -= 1.45 * dt;
      if (keysDown.has("KeyE") && !STUDIO_INTERACT_KEY_CODES.has("KeyE")) targetCameraYaw += 1.45 * dt;
      currentCameraYaw = shortestAngleLerp(currentCameraYaw, targetCameraYaw, 0.18);

      // 키보드 + 조이스틱 벡터 계산
      const joy = bridge.getJoystick();
      let rawVx = joy.x;
      let rawVy = joy.y;
      if (keysDown.has("ArrowLeft") || keysDown.has("KeyA")) rawVx -= 1;
      if (keysDown.has("ArrowRight") || keysDown.has("KeyD")) rawVx += 1;
      if (keysDown.has("ArrowUp") || keysDown.has("KeyW")) rawVy -= 1;
      if (keysDown.has("ArrowDown") || keysDown.has("KeyS")) rawVy += 1;

      const cosYaw = Math.cos(currentCameraYaw);
      const sinYaw = Math.sin(currentCameraYaw);
      const vx = rawVx * cosYaw + rawVy * sinYaw;
      const vy = -rawVx * sinYaw + rawVy * cosYaw;

      const speedPxPerSec = keysDown.has("ShiftLeft") || keysDown.has("ShiftRight") ? 320 : 220;
      let moving = false;

      if (Math.hypot(vx, vy) > 0.05) {
        const len = Math.hypot(vx, vy);
        const nx = vx / len;
        const ny = vy / len;
        moveDestination = null;
        pendingAutoInteract = null;
        destMarker.visible = false;
        currentPoint = clampStudioWorldPoint(manifest, {
          x: currentPoint.x + nx * speedPxPerSec * dt,
          y: currentPoint.y + ny * speedPxPerSec * dt,
        });
        currentFacing = studioFacingToward(nx, ny);
        selfNode.targetYaw = Math.atan2(nx, ny);
        moving = true;
      } else if (moveDestination) {
        const dx = moveDestination.x - currentPoint.x;
        const dy = moveDestination.y - currentPoint.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 6) {
          currentPoint = moveDestination;
          moveDestination = null;
          destMarker.visible = false;
        } else {
          const step = Math.min(dist, speedPxPerSec * dt);
          const nx = dx / dist;
          const ny = dy / dist;
          currentPoint = clampStudioWorldPoint(manifest, {
            x: currentPoint.x + nx * step,
            y: currentPoint.y + ny * step,
          });
          currentFacing = studioFacingToward(nx, ny);
          selfNode.targetYaw = Math.atan2(nx, ny);
          moving = true;
        }
      }

      // 로컬 캐릭터 3D 위치·회전·걸음 애니메이션 업데이트
      const selfThree = worldToThree(currentPoint, 0);
      selfNode.group.position.x = THREE.MathUtils.lerp(selfNode.group.position.x, selfThree.x, 0.35);
      selfNode.group.position.z = THREE.MathUtils.lerp(selfNode.group.position.z, selfThree.z, 0.35);
      selfNode.currentYaw = shortestAngleLerp(selfNode.currentYaw, selfNode.targetYaw, 0.22);
      selfNode.group.rotation.y = selfNode.currentYaw;
      selfNode.moving = moving;

      // 동료(Peers) 3D 노드 동기화
      for (const peer of snapshotRef.current.peers) {
        const peerId = `peer:${peer.participant.sessionId}`;
        let peerNode = actorNodes.get(peerId);
        if (!peerNode) {
          peerNode = createStylized3DCharacterNode(peerId, 0x0ea5e9, false);
          const p3 = worldToThree(peer.state, 0);
          peerNode.group.position.copy(p3);
          scene.add(peerNode.group);
          actorNodes.set(peerId, peerNode);
        }
        const target3 = worldToThree(peer.state, 0);
        const dx = target3.x - peerNode.group.position.x;
        const dz = target3.z - peerNode.group.position.z;
        peerNode.moving = Math.hypot(dx, dz) > 0.03;
        if (peerNode.moving) {
          peerNode.targetYaw = Math.atan2(dx, dz);
        } else {
          peerNode.targetYaw = facingToYawRadians(peer.state.facing);
        }
        peerNode.group.position.lerp(target3, 0.2);
        peerNode.currentYaw = shortestAngleLerp(peerNode.currentYaw, peerNode.targetYaw, 0.2);
        peerNode.group.rotation.y = peerNode.currentYaw;
      }

      // NPC 시선 및 절차적 호흡/걸음 모션 업데이트
      for (const npc of CAMPUS_NPCS) {
        const node = actorNodes.get(npc.id);
        if (!node) continue;
        const gapPx = Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y);
        if (gapPx < 240) {
          node.targetYaw = Math.atan2(currentPoint.x - npc.point.x, currentPoint.y - npc.point.y);
        } else {
          node.targetYaw = facingToYawRadians(npc.facing);
        }
        node.currentYaw = shortestAngleLerp(node.currentYaw, node.targetYaw, 0.14);
        node.group.rotation.y = node.currentYaw;
      }

      // 모든 캐릭터 팔다리 스윙 & 호흡 애니메이션 (VRM 본 및 폴백 메쉬 모두 지원)
      const walkPhase = now * 0.011;
      for (const node of actorNodes.values()) {
        if (node.moving) {
          const swing = Math.sin(walkPhase) * 0.42;
          node.leftLeg.rotation.x = swing;
          node.rightLeg.rotation.x = -swing;
          node.leftArm.rotation.x = -swing * 0.65;
          node.rightArm.rotation.x = swing * 0.65;
          if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = swing * 0.65;
          if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = -swing * 0.65;
          if (node.vrmLeftUpperArm) node.vrmLeftUpperArm.rotation.x = 0.06 - swing * 0.45;
          if (node.vrmRightUpperArm) node.vrmRightUpperArm.rotation.x = 0.06 + swing * 0.45;
          node.rigGroup.position.y = Math.abs(Math.cos(walkPhase)) * 0.045;
        } else {
          node.leftLeg.rotation.x = THREE.MathUtils.lerp(node.leftLeg.rotation.x, 0, 0.2);
          node.rightLeg.rotation.x = THREE.MathUtils.lerp(node.rightLeg.rotation.x, 0, 0.2);
          node.leftArm.rotation.x = THREE.MathUtils.lerp(node.leftArm.rotation.x, 0, 0.2);
          node.rightArm.rotation.x = THREE.MathUtils.lerp(node.rightArm.rotation.x, 0, 0.2);
          if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = THREE.MathUtils.lerp(node.vrmLeftUpperLeg.rotation.x, 0, 0.2);
          if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = THREE.MathUtils.lerp(node.vrmRightUpperLeg.rotation.x, 0, 0.2);
          if (node.vrmLeftUpperArm) node.vrmLeftUpperArm.rotation.x = THREE.MathUtils.lerp(node.vrmLeftUpperArm.rotation.x, 0.06, 0.2);
          if (node.vrmRightUpperArm) node.vrmRightUpperArm.rotation.x = THREE.MathUtils.lerp(node.vrmRightUpperArm.rotation.x, 0.06, 0.2);
          node.rigGroup.position.y = Math.sin(now * 0.003) * 0.015;
        }
      }

      waterMeshes.forEach((water, idx) => {
        water.position.y = 0.05 + Math.sin(now * 0.002 + idx) * 0.012;
      });

      // 카메라 추종 (유저 줌 및 오빗 각도 반영)
      const zoomFactor = Math.max(0.65, Math.min(1.65, bridge.userZoom.get()));
      const camDist = 11.4 / zoomFactor;
      const camHeight = 9.2 / zoomFactor;
      camera.position.lerp(
        new THREE.Vector3(
          selfNode.group.position.x + Math.sin(currentCameraYaw) * camDist,
          camHeight,
          selfNode.group.position.z + Math.cos(currentCameraYaw) * camDist,
        ),
        0.16,
      );
      camera.lookAt(
        selfNode.group.position.x - Math.sin(currentCameraYaw) * 0.8,
        0.95,
        selfNode.group.position.z - Math.cos(currentCameraYaw) * 0.8,
      );

      const zoneChanged = zoneTracker.next(currentPoint);
      if (zoneChanged) callbacksRef.current.onZoneChange?.(zoneChanged);

      const allInteractions = studioWorldInteractions(manifest);
      const closestInteraction = nearestInteraction(allInteractions, currentPoint);
      callbacksRef.current.onNearbyInteractionChange?.(closestInteraction);

      for (const ringNode of workstationRings) {
        const isActive = closestInteraction?.id === ringNode.id;
        ringNode.group.scale.setScalar(isActive ? 1.12 + Math.sin(now * 0.006) * 0.08 : 1 + Math.sin(now * 0.0025) * 0.025);
      }

      const nearbyNpcs: StudioVirtualSpaceNearbyNpc[] = [];
      for (const npc of CAMPUS_NPCS) {
        const dist = Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y);
        if (dist <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS) {
          const def = npcDefinitions.find((item) => item.id === npc.id);
          if (def) {
            const label = studioNpcLabel(def);
            nearbyNpcs.push({
              id: npc.id,
              npc: def,
              labelKo: label.ko,
              labelEn: label.en,
              activityKo: "업무 지원 중",
              activityEn: "Assisting",
              skinKey: npc.skinKey,
              distance: dist,
              interaction: studioNpcInteraction(manifest, def),
            });
          }
        }
      }
      callbacksRef.current.onNearbyNpcsChange?.(nearbyNpcs);

      if (pendingAutoInteract) {
        if (pendingAutoInteract.kind === "workstation") {
          const target = allInteractions.find((item) => item.id === pendingAutoInteract?.id);
          if (target && Math.hypot(target.point.x - currentPoint.x, target.point.y - currentPoint.y) <= target.radius + 20) {
            pendingAutoInteract = null;
            moveDestination = null;
            destMarker.visible = false;
            callbacksRef.current.onInteract?.(target);
          }
        } else {
          const matchedNpc = nearbyNpcs.find((item) => item.id === pendingAutoInteract?.id);
          if (matchedNpc?.interaction) {
            pendingAutoInteract = null;
            moveDestination = null;
            destMarker.visible = false;
            callbacksRef.current.onNpcInteract?.(matchedNpc.interaction, matchedNpc.npc);
          }
        }
      }

      if (bridge.consumeInteract()) {
        const nearestNpc = nearbyNpcs[0];
        if (nearestNpc?.interaction) {
          callbacksRef.current.onNpcInteract?.(nearestNpc.interaction, nearestNpc.npc);
        } else if (closestInteraction) {
          callbacksRef.current.onInteract?.(closestInteraction);
        } else {
          const portal = studioWorldPortals(manifest).find(
            (candidate) => Math.hypot(candidate.point.x - currentPoint.x, candidate.point.y - currentPoint.y) <= candidate.radius,
          );
          if (portal) callbacksRef.current.onPortal?.(portal);
        }
      }

      if (now - lastLocalStateSync >= 80) {
        lastLocalStateSync = now;
        callbacksRef.current.onLocalState?.({
          point: { x: Math.round(currentPoint.x), y: Math.round(currentPoint.y) },
          zoneId: studioWorldRoomAt(manifest, currentPoint),
          facing: currentFacing,
          moving,
        });
      }

      renderer.render(scene, camera);

      if (now - lastOverlaySync >= 90) {
        lastOverlaySync = now;
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        const isEn = typeof document !== "undefined" && document.documentElement.lang?.startsWith("en");
        const projected: ProjectedOverlayItem[] = [];

        const projectPoint = (vec: THREE.Vector3): { x: number; y: number; visible: boolean } => {
          const cloned = vec.clone().project(camera);
          if (cloned.z < -1 || cloned.z > 1) return { x: 0, y: 0, visible: false };
          const sx = (cloned.x * 0.5 + 0.5) * w;
          const sy = (-cloned.y * 0.5 + 0.5) * h;
          return { x: sx, y: sy, visible: sx >= -60 && sx <= w + 60 && sy >= -40 && sy <= h + 40 };
        };

        const selfHead = projectPoint(new THREE.Vector3(selfNode.group.position.x, 2.04, selfNode.group.position.z));
        if (selfHead.visible) {
          projected.push({
            id: "self",
            label: selfNameRef.current || bt("나", "Me"),
            sublabel: bt("3D 아바타", "3D Avatar"),
            kind: "self",
            x: selfHead.x,
            y: selfHead.y,
          });
        }

        for (const npc of CAMPUS_NPCS) {
          const dist = Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y);
          if (dist > 640) continue;
          const node = actorNodes.get(npc.id);
          const def = npcDefinitions.find((item) => item.id === npc.id);
          if (!node || !def) continue;
          const label = studioNpcLabel(def);
          const head = projectPoint(new THREE.Vector3(node.group.position.x, 2.12, node.group.position.z));
          if (head.visible) {
            projected.push({
              id: `npc:${npc.id}`,
              targetId: npc.id,
              label: isEn ? label.en : label.ko,
              sublabel: isEn ? "Talk" : "대화",
              kind: "npc",
              x: head.x,
              y: head.y,
              active: dist <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS,
            });
          }
        }

        for (const interaction of allInteractions) {
          if (DUPLICATE_ARCADE_IDS.has(interaction.id)) continue;
          if (Math.hypot(interaction.point.x - currentPoint.x, interaction.point.y - currentPoint.y) > 520) continue;
          const stationPos = projectPoint(worldToThree(interaction.point, 0.92));
          if (stationPos.visible) {
            const meta = WORKSTATION_ACTION_BADGES[interaction.action] ?? { ko: "협업 도구", en: "Tool", color: "#6366f1" };
            projected.push({
              id: `workstation:${interaction.id}`,
              targetId: interaction.id,
              label: isEn ? interaction.labelEn : interaction.labelKo,
              sublabel: isEn ? meta.en : meta.ko,
              kind: "workstation",
              x: stationPos.x,
              y: stationPos.y,
              accent: meta.color,
              active: closestInteraction?.id === interaction.id,
            });
          }
        }

        for (const zone of CAMPUS_ZONES) {
          const zx = (zone.tiles.column + zone.tiles.width / 2) * 64;
          const zy = zone.tiles.row * 64 + 32;
          if (Math.hypot(zx - currentPoint.x, zy - currentPoint.y) > 920) continue;
          const signPos = projectPoint(worldToThree({ x: zx, y: zy }, zone.walls.length > 0 ? 2.95 : 1.55));
          if (signPos.visible) {
            const roomDef = manifest.rooms?.find((room) => room.id === zone.roomId);
            projected.push({
              id: `zone:${zone.roomId}`,
              label: zone.signEn,
              sublabel: isEn ? (roomDef?.labelEn ?? zone.signEn) : (roomDef?.labelKo ?? zone.signEn),
              kind: "zone",
              x: signPos.x,
              y: signPos.y,
            });
          }
        }

        for (let pass = 0; pass < 3; pass += 1) {
          for (let i = 0; i < projected.length; i += 1) {
            for (let j = i + 1; j < projected.length; j += 1) {
              const a = projected[i]!;
              const b = projected[j]!;
              if (Math.abs(a.x - b.x) < 148 && Math.abs(a.y - b.y) < 32) {
                const overlap = 32 - Math.abs(a.y - b.y);
                const [upperIdx, lowerIdx] = a.y <= b.y ? [i, j] : [j, i];
                projected[upperIdx] = { ...projected[upperIdx]!, y: projected[upperIdx]!.y - overlap * 0.65 };
                projected[lowerIdx] = { ...projected[lowerIdx]!, y: projected[lowerIdx]!.y + overlap * 0.35 };
              }
            }
          }
        }

        setOverlays(projected);
      }
    };

    animFrameId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      triggerOverlayTargetRef.current = null;
      window.cancelAnimationFrame(animFrameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      bridge.setFocusHandler(null);
      renderer.dispose();
    };
  }, [bridge, manifest, spaceTheme, bt]);

  return (
    <div
      ref={containerRef}
      className="studio-vspace-three-stage"
      data-three-stage="active"
      aria-label={bt("3D 가상 스튜디오 공간", "3D Virtual Studio Space")}
      style={{ position: "relative", width: "100%", height: "100%", outline: "none" }}
    >
      <div ref={canvasMountRef} className="studio-vspace-three-canvas-mount" style={{ position: "absolute", inset: 0, zIndex: 1 }} />
      <div className="studio-vspace-three-overlays" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 2 }}>
        {overlays.map((item) => {
          const isInteractive = (item.kind === "workstation" || item.kind === "npc") && Boolean(item.targetId);
          return (
            <div
              key={item.id}
              data-overlay-kind={item.kind}
              role={isInteractive ? "button" : undefined}
              tabIndex={isInteractive ? 0 : undefined}
              onClick={
                isInteractive && item.targetId
                  ? (event) => {
                      event.stopPropagation();
                      triggerOverlayTargetRef.current?.(item.kind as "workstation" | "npc", item.targetId!);
                    }
                  : undefined
              }
              onKeyDown={
                isInteractive && item.targetId
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        triggerOverlayTargetRef.current?.(item.kind as "workstation" | "npc", item.targetId!);
                      }
                    }
                  : undefined
              }
              style={{
                position: "absolute",
                left: `${item.x}px`,
                top: `${item.y}px`,
                transform: "translate(-50%, -100%)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: item.kind === "zone" || item.kind === "workstation" ? "4px 10px" : "3px 9px",
                borderRadius: item.kind === "zone" ? "10px" : "999px",
                pointerEvents: isInteractive ? "auto" : "none",
                cursor: isInteractive ? "pointer" : "default",
                background: item.kind === "self" || (item.kind === "workstation" && item.active) ? "rgba(30, 27, 75, 0.92)" : "rgba(15, 23, 42, 0.84)",
                border: item.kind === "zone"
                  ? "1px solid rgba(56, 189, 248, 0.55)"
                  : item.kind === "self"
                    ? "1px solid rgba(129, 140, 248, 0.75)"
                    : item.kind === "workstation"
                      ? `1px solid ${item.active ? "#38bdf8" : item.accent ?? "rgba(148, 163, 184, 0.45)"}`
                      : item.active
                        ? "1px solid rgba(167, 139, 250, 0.85)"
                        : "1px solid rgba(148, 163, 184, 0.35)",
                color: "#f8fafc",
                fontSize: item.kind === "zone" ? "11.5px" : "11px",
                fontWeight: 800,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
                boxShadow: item.active ? "0 0 0 2px rgba(56, 189, 248, 0.28), 0 8px 20px rgba(15, 23, 42, 0.38)" : "0 6px 18px rgba(15, 23, 42, 0.32)",
                backdropFilter: "blur(8px)",
              }}
            >
              {item.kind === "self" ? (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#38bdf8" }} />
              ) : item.kind === "npc" ? (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa" }} />
              ) : item.kind === "workstation" ? (
                <span style={{ width: 7, height: 7, borderRadius: "2px", background: item.accent ?? "#8b5cf6", boxShadow: `0 0 8px ${item.accent ?? "#8b5cf6"}` }} />
              ) : null}
              <span>{item.label}</span>
              {item.sublabel ? (
                <span style={{ opacity: item.kind === "workstation" ? 0.92 : 0.78, fontSize: "10px", fontWeight: 700, color: item.kind === "workstation" ? "#bae6fd" : undefined }}>
                  {item.sublabel}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
