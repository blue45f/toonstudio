import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS, StudioZoneChangeTracker, type StudioVirtualSpaceNearbyNpc } from "../studio-virtual-space-engine-events";
import { STUDIO_INTERACT_KEY_CODES } from "../studio-virtual-space-interact-prompt";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioNpcInteraction, studioNpcLabel } from "../studio-virtual-space-npc-director";
import { nearestInteraction, studioFacingToward, studioWorldMayTakeFocus, WORLD_KEY_CODES } from "../studio-virtual-space-phaser-canvas-model";
import { studioPoseSeatAnchors } from "../studio-virtual-space-pose-controller";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { clampStudioWorldPoint } from "../studio-virtual-space-world-pathfinding";
import { studioWorldInteractions, studioWorldPortals, studioWorldRoomAt, studioWorldSpawn, type StudioWorldInteractionDefinition } from "../studio-virtual-space-world-manifest";
import { applyStudioLightingPresetToScene, createStudioThreeChromePostPipeline, createStudioThreeHdriController, findClickedWorldTarget, type ProjectedOverlayItem, type StudioThreeLightingPreset } from "./studio-virtual-space-three-dioramas";
import { applyStudioThreeActorPose, computeStudioThreeCameraOrbitDelta, consumeAndSyncStudioThreeEmotes, isStudioThreeCameraOrbitKey, readStoredStudioThreeLightingPreset, studioThreeFillLightIntensity, writeStoredStudioThreeLightingPreset } from "./studio-virtual-space-three-motion";
import { createStylized3DCharacterNode, facingToYawRadians, loadStudioThreeAssets, shortestAngleLerp, STUDIO_THREE_SCALE, threeToWorld, worldToThree, type StudioThreeActorNode } from "./studio-virtual-space-three-scene";
import { studioThreeRoomSigns } from "./studio-virtual-space-three-world-layout";
import { StudioThreeWorldNavigation } from "./studio-virtual-space-three-navigation";
import { bindStudioThreePointerInput } from "./studio-virtual-space-three-pointer-input";
import { studioThreeThemeLightingPreset } from "./studio-virtual-space-three-surface-art";
import { StudioThreeProximityPublication, StudioThreeRuntimePublication } from "./studio-virtual-space-three-runtime-policy";
import type { StudioVirtualSpaceThreeStageProps } from "./studio-virtual-space-three-stage-props";
import { StudioVirtualSpaceThreeHud } from "./StudioVirtualSpaceThreeHud";
import { projectStudioThreeOverlays } from "./studio-virtual-space-three-hud-projection";
import { DEFAULT_VIRTUAL_THREE_THEME } from "./themes/virtual-three-theme-catalog";
import { createVirtualThreeThemeController } from "./themes/virtual-three-theme-controller";
import { VIRTUAL_THREE_DESKTOP_HIGH_QUALITY_CAPACITY_PROFILE } from "./themes/virtual-three-capacity-profiles";
import type { VirtualThreeTheme } from "./themes/virtual-three-theme-types";
import { applyVirtualThreeThemeLighting, captureVirtualThreeThemeLightingState } from "./themes/virtual-three-theme-lighting";

const NPC_COLORS = [0x6366f1, 0xec4899, 0x06b6d4, 0xf59e0b, 0x10b981, 0x8b5cf6, 0x3b82f6, 0x14b8a6] as const;

/**
 * Three.js + GLB 디오라마 + @pixiv/three-vrm + HDRI IBL + MSAA 후처리 기반 3D 가상 스튜디오 렌더러.
 * 기존 StudioVirtualSpaceEngineBridge 및 2D 월드 좌표계(3072×1984)와 1:1 호환된다.
 */
export function StudioVirtualSpaceThreeCanvas({
  manifest, snapshot, bridge, selfDisplayName, theme, themeRequestRevision,
  onThemePreviewChange, onRuntimeMetrics, onNpcInteract, onLocalState, onInteract,
  onNearbyInteractionChange, onPortal, onZoneChange, onNearbyNpcsChange, onEngineStatusChange,
}: StudioVirtualSpaceThreeStageProps) {
  const bt = useBilingual("StudioVirtualSpaceThreeCanvas");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [overlays, setOverlays] = useState<readonly ProjectedOverlayItem[]>([]);
  const [assetFailureCount, setAssetFailureCount] = useState(0);
  const [lightingPreset, setLightingPreset] = useState<StudioThreeLightingPreset>(() => readStoredStudioThreeLightingPreset(studioThreeThemeLightingPreset(DEFAULT_VIRTUAL_THREE_THEME, manifest)));
  const applyLightingRef = useRef<((preset: StudioThreeLightingPreset) => void) | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const triggerOverlayTargetRef = useRef<((kind: "workstation" | "npc", targetId: string) => void) | null>(null);
  const reloadActorVrmRef = useRef<((actorId: string, index: number) => void) | null>(null);
  const selectThemeRef = useRef<((nextTheme: VirtualThreeTheme) => void) | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const btRef = useRef(bt);
  btRef.current = bt;

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const selfNameRef = useRef(selfDisplayName);
  selfNameRef.current = selfDisplayName;
  const callbacks = { onThemePreviewChange, onRuntimeMetrics, onNpcInteract, onLocalState, onInteract, onNearbyInteractionChange, onPortal, onZoneChange, onNearbyNpcsChange, onEngineStatusChange };
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    selectThemeRef.current?.(theme);
  }, [theme, themeRequestRevision]);

  useEffect(() => {
    reloadActorVrmRef.current?.("self", snapshot.self.avatarIndex);
  }, [snapshot.self.avatarIndex]);

  useEffect(() => {
    const container = containerRef.current;
    const canvasMount = canvasMountRef.current;
    if (!container || !canvasMount) return undefined;

    let disposed = false;
    let failedTextures = 0;
    setAssetFailureCount(0);
    callbacksRef.current.onEngineStatusChange?.("loading");
    bridge.userZoom.setAvailable(true);
    bridge.userZoom.setFloor(0.65);

    const scene = new THREE.Scene();
    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    renderer.domElement.tabIndex = 0;
    canvasMount.innerHTML = "";
    canvasMount.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.04);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.42);
    dirLight.position.set(36, 48, 28);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    Object.assign(dirLight.shadow.camera, { near: 4, far: 140, left: -48, right: 48, top: 48, bottom: -48 });
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0);
    fillLight.castShadow = false;
    scene.add(fillLight, fillLight.target, dirLight.target);

    const hdriController = createStudioThreeHdriController(renderer, scene, () => disposed, () => {
      if (disposed) return;
      failedTextures += 1;
      setAssetFailureCount((count) => count + 1);
    });
    const postPipeline = createStudioThreeChromePostPipeline(renderer, scene, camera, width, height);
    let currentPreset = readStoredStudioThreeLightingPreset(studioThreeThemeLightingPreset(themeRef.current, manifest));
    const syncLighting = (preset: StudioThreeLightingPreset) => {
      currentPreset = preset;
      applyStudioLightingPresetToScene(preset, scene, renderer, hemiLight, dirLight, postPipeline, fillLight);
      hdriController.applyPreset(preset);
    };
    applyLightingRef.current = syncLighting;
    const roomSigns = studioThreeRoomSigns(manifest);
    const allInteractions = studioWorldInteractions(manifest);

    const actorNodes = new Map<string, StudioThreeActorNode>();
    const navigation = new StudioThreeWorldNavigation(manifest);
    const requestedSpawn = snapshotRef.current.self.x > 0 || snapshotRef.current.self.y > 0
      ? { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y }
      : studioWorldSpawn(manifest).point;
    const spawnPoint = navigation.resolveTarget(requestedSpawn) ?? requestedSpawn;

    const selfNode = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const selfPos3 = worldToThree(spawnPoint, 0);
    selfNode.group.position.copy(selfPos3);
    selfNode.targetX = selfPos3.x;
    selfNode.targetZ = selfPos3.z;
    scene.add(selfNode.group);
    actorNodes.set("self", selfNode);

    camera.position.set(selfPos3.x, 10.8, selfPos3.z + 12.8);
    camera.lookAt(selfPos3.x, 1.05, selfPos3.z - 0.9);

    const npcDefinitions = manifest.npcs ?? [];
    npcDefinitions.forEach((npc, index) => {
      const node = createStylized3DCharacterNode(npc.id, NPC_COLORS[index % NPC_COLORS.length] ?? 0x6366f1, false);
      const pos3 = worldToThree(npc.point, 0);
      node.group.position.copy(pos3);
      node.targetX = pos3.x;
      node.targetZ = pos3.z;
      node.currentYaw = facingToYawRadians(npc.facing ?? "down");
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

    const reloadActorVrm = loadStudioThreeAssets(scene, actorNodes, () => disposed, snapshotRef.current.self.avatarIndex, manifest, () => setAssetFailureCount((count) => count + 1));
    reloadActorVrmRef.current = reloadActorVrm;
    const themeController = createVirtualThreeThemeController({
      scene, manifest, renderer, camera, isDisposed: () => disposed,
      capacityProfile: VIRTUAL_THREE_DESKTOP_HIGH_QUALITY_CAPACITY_PROFILE,
      prepareEnvironment: (nextTheme) => hdriController.preparePreset(studioThreeThemeLightingPreset(nextTheme, manifest)),
      waitForEnvironment: hdriController.whenIdle,
      getRenderTargets: hdriController.getRenderTargets,
      getPendingEnvironmentCount: hdriController.getPendingCount,
      waitForCoreAssets: reloadActorVrm.whenIdle,
      getPendingCoreAssetCount: reloadActorVrm.getPendingCount,
      captureCommitState: () => {
        const oldPreset = currentPreset;
        const restore = captureVirtualThreeThemeLightingState({ scene, renderer, lights: { ambient: hemiLight, key: dirLight, fill: fillLight } });
        return () => { hdriController.applyPreset(oldPreset); restore(); currentPreset = oldPreset; setLightingPreset(oldPreset); };
      },
      onPreviewChange: (themeId, preview) => {
        if (!disposed) callbacksRef.current.onThemePreviewChange?.(themeId, preview);
      },
      onCommitted: (committedTheme) => {
        if (disposed) return;
        const preset = readStoredStudioThreeLightingPreset(studioThreeThemeLightingPreset(committedTheme, manifest));
        syncLighting(preset);
        applyVirtualThreeThemeLighting(committedTheme, manifest, { ambient: hemiLight, key: dirLight, fill: fillLight }, studioThreeFillLightIntensity(preset));
        setLightingPreset(preset);
      },
      onAssetError: (_url, kind) => {
        if (disposed) return;
        if (kind === "texture") failedTextures += 1;
        setAssetFailureCount((count) => count + 1);
      },
    });
    selectThemeRef.current = themeController.select;
    themeController.select(themeRef.current);
    const peerAvatarIndices = new Map<string, number>();
    let previousPeers: StudioVirtualSpaceSnapshot["peers"] | null = null;
    const proximity = new StudioThreeProximityPublication<StudioWorldInteractionDefinition, StudioVirtualSpaceNearbyNpc>({
      interaction: (value) => callbacksRef.current.onNearbyInteractionChange?.(value),
      npcs: (value) => callbacksRef.current.onNearbyNpcsChange?.(value),
    });
    const runtime = new StudioThreeRuntimePublication(
      (sample) => callbacksRef.current.onRuntimeMetrics?.(sample),
      () => {
        let visiblePeerCount = 0, visibleNpcCount = 0;
        for (const [id, node] of actorNodes) {
          if (!node.group.visible) continue;
          if (id.startsWith("peer:")) visiblePeerCount += 1;
          else if (id !== "self") visibleNpcCount += 1;
        }
        return {
          // 고정 3D 렌더 설정의 호환 태그다. 자동 품질 하향이나 GPU 성능 증명이 아니다.
          qualityTier: "ultra" as const,
          peerCount: snapshotRef.current.peers.length, visiblePeerCount,
          npcCount: npcDefinitions.length, visibleNpcCount,
          routeWaypoints: navigation.waypointCount, failedTextures,
        };
      },
    );

    const keysDown = new Set<string>();
    let currentPoint: StudioVirtualSpacePoint = { ...spawnPoint };
    let currentFacing: StudioVirtualSpaceFacing = snapshotRef.current.self.facing ?? "down";
    const initialYaw = facingToYawRadians(currentFacing);
    selfNode.currentYaw = initialYaw;
    selfNode.targetYaw = initialYaw;
    selfNode.group.rotation.y = initialYaw;
    const seatAnchors = studioPoseSeatAnchors({ seatedActors: [], interactionSlots: manifest.interactionSlots });
    let lastStopRevision = bridge.getStopRevision();
    let moveDestination: StudioVirtualSpacePoint | null = null;
    let pendingAutoInteract: { readonly kind: "workstation" | "npc"; readonly id: string } | null = null;
    let targetCameraYaw = 0;
    let currentCameraYaw = 0;
    const zoneTracker = new StudioZoneChangeTracker(manifest);
    resetCameraRef.current = () => {
      targetCameraYaw = 0;
    };

    bridge.setFocusHandler(() => renderer.domElement.focus({ preventScroll: true }));

    triggerOverlayTargetRef.current = (kind, targetId) => {
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
        const npc = npcDefinitions.find((item) => item.id === targetId);
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
      if (WORLD_KEY_CODES.has(event.code) || isStudioThreeCameraOrbitKey(event.code)) keysDown.add(event.code);
      if (event.code === "KeyC") targetCameraYaw = 0;
      if (STUDIO_INTERACT_KEY_CODES.has(event.code)) bridge.requestInteract();
    };
    const handleKeyUp = (event: KeyboardEvent) => keysDown.delete(event.code);
    const clearKeys = () => keysDown.clear();
    const handleVisibilityChange = () => { if (document.hidden) keysDown.clear(); };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const peerPositionTarget = new THREE.Vector3();
    const cameraPositionTarget = new THREE.Vector3();
    const handleFloorTap = (event: Pick<PointerEvent, "clientX" | "clientY">) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointerNdc, camera);
      const floorMesh = themeController.getArchitecture()?.floorMesh;
      const hit = floorMesh ? raycaster.intersectObject(floorMesh, false)[0] : undefined;
      if (hit) {
        const clamped = clampStudioWorldPoint(manifest, threeToWorld({ x: hit.point.x, z: hit.point.z }));
        const clickedTarget = findClickedWorldTarget(clamped, allInteractions, npcDefinitions);
        if (clickedTarget) {
          triggerOverlayTargetRef.current?.(clickedTarget.kind, clickedTarget.id);
        } else {
          pendingAutoInteract = null;
          moveDestination = clamped;
          destMarker.position.copy(worldToThree(clamped, 0.04));
          destMarker.visible = true;
        }
      }
    };
    const handleContextMenu = (event: MouseEvent) => event.preventDefault();
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      bridge.userZoom.apply(event.deltaY < 0 ? "in" : "out");
    };

    const pointerInput = bindStudioThreePointerInput(renderer.domElement, {
      onOrbitDelta: (delta) => { targetCameraYaw += delta; }, onTap: handleFloorTap,
    });
    renderer.domElement.addEventListener("contextmenu", handleContextMenu);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(320, container.clientWidth || window.innerWidth);
      const h = Math.max(240, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      postPipeline.setSize(w, h);
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
      const destination = navigation.resolveTarget(target);
      if (!destination) return;
      currentPoint = destination;
      navigation.cancel();
      moveDestination = null;
      pendingAutoInteract = null;
      destMarker.visible = false;
      const p3 = worldToThree(currentPoint, 0);
      selfNode.group.position.copy(p3);
      const zoomFactor = Math.max(0.65, Math.min(1.65, bridge.userZoom.get()));
      camera.position.set(
        p3.x + Math.sin(currentCameraYaw) * (12.8 / zoomFactor),
        10.8 / zoomFactor,
        p3.z + Math.cos(currentCameraYaw) * (12.8 / zoomFactor),
      );
    };

    const animate = (now: number) => {
      if (disposed) return;
      animFrameId = window.requestAnimationFrame(animate);

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      reloadActorVrm.update(dt);
      themeController.update(dt);
      const architecture = themeController.getArchitecture();

      const stopRevision = bridge.getStopRevision();
      if (stopRevision !== lastStopRevision) {
        lastStopRevision = stopRevision;
        navigation.cancel();
        moveDestination = null;
        pendingAutoInteract = null;
        destMarker.visible = false;
        keysDown.clear();
      }
      if (bridge.consumeUnstuck()) snapPlayerAndCamera(studioWorldSpawn(manifest).point);

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

      // 카메라 Q / E / [ / ] 오빗 회전
      const preInteraction = nearestInteraction(allInteractions, currentPoint);
      const preNearbyNpcCount = npcDefinitions.reduce(
        (count, npc) => count + (Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y) <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS ? 1 : 0),
        0,
      );
      targetCameraYaw += computeStudioThreeCameraOrbitDelta({
        keysDown, dt, closestInteraction: preInteraction, nearbyNpcCount: preNearbyNpcCount,
      });
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
        const next = navigation.directional(currentPoint, { x: nx * speedPxPerSec * dt, y: ny * speedPxPerSec * dt });
        moving = Math.hypot(next.x - currentPoint.x, next.y - currentPoint.y) > 0.001;
        currentPoint = next;
        currentFacing = studioFacingToward(nx, ny);
        selfNode.targetYaw = Math.atan2(nx, ny);
      } else if (moveDestination) {
        const step = navigation.toward(currentPoint, moveDestination, speedPxPerSec * dt);
        const dx = step.point.x - currentPoint.x, dy = step.point.y - currentPoint.y;
        currentPoint = step.point;
        moving = step.moving;
        if (moving) { currentFacing = studioFacingToward(dx, dy); selfNode.targetYaw = Math.atan2(dx, dy); }
        if (step.arrived) {
          moveDestination = null;
          destMarker.visible = false;
        }
      }

      const poseState = bridge.updatePoseState({ position: currentPoint, moving, seatAnchors, openArea: true, now });
      selfNode.seated = poseState.pose === "sit";
      if (poseState.pose === "sit" && poseState.anchor && !moving) {
        currentFacing = poseState.anchor.facing;
        selfNode.targetYaw = facingToYawRadians(poseState.anchor.facing);
      }

      // 로컬 캐릭터 3D 위치·회전 업데이트
      selfNode.group.position.x = THREE.MathUtils.lerp(selfNode.group.position.x, currentPoint.x * STUDIO_THREE_SCALE, 0.35);
      selfNode.group.position.z = THREE.MathUtils.lerp(selfNode.group.position.z, currentPoint.y * STUDIO_THREE_SCALE, 0.35);
      selfNode.currentYaw = shortestAngleLerp(selfNode.currentYaw, selfNode.targetYaw, 0.22);
      selfNode.group.rotation.y = selfNode.currentYaw;
      selfNode.moving = moving;

      // 동료(Peers) 3D 노드 동기화
      const peers = snapshotRef.current.peers;
      if (peers !== previousPeers) {
        const activeIds = new Set(peers.map((peer) => `peer:${peer.participant.sessionId}`));
        reloadActorVrm.prunePeerActors(activeIds);
        for (const id of peerAvatarIndices.keys()) if (!activeIds.has(id)) peerAvatarIndices.delete(id);
        previousPeers = peers;
      }
      for (const peer of peers) {
        const peerId = `peer:${peer.participant.sessionId}`;
        let peerNode = actorNodes.get(peerId);
        if (!peerNode) {
          peerNode = createStylized3DCharacterNode(peerId, 0x0ea5e9, false);
          peerNode.group.position.copy(worldToThree(peer.state, 0));
          scene.add(peerNode.group);
          actorNodes.set(peerId, peerNode);
        }
        if (peerAvatarIndices.get(peerId) !== peer.state.avatarIndex) {
          peerAvatarIndices.set(peerId, peer.state.avatarIndex);
          reloadActorVrm(peerId, peer.state.avatarIndex);
        }
        const target3 = peerPositionTarget.set(peer.state.x * STUDIO_THREE_SCALE, 0, peer.state.y * STUDIO_THREE_SCALE);
        const dx = target3.x - peerNode.group.position.x;
        const dz = target3.z - peerNode.group.position.z;
        peerNode.moving = Math.hypot(dx, dz) > 0.03;
        peerNode.targetYaw = peerNode.moving ? Math.atan2(dx, dz) : facingToYawRadians(peer.state.facing);
        peerNode.group.position.lerp(target3, 0.2);
        peerNode.currentYaw = shortestAngleLerp(peerNode.currentYaw, peerNode.targetYaw, 0.2);
        peerNode.group.rotation.y = peerNode.currentYaw;
      }

      // NPC 시선 업데이트 (원거리 구역 외곽 NPC 스키닝 컬링 포함)
      for (const npc of npcDefinitions) {
        const node = actorNodes.get(npc.id);
        if (!node) continue;
        const gapPx = Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y);
        node.group.visible = gapPx <= 920;
        if (!node.group.visible) continue;
        node.targetYaw = gapPx < 240
          ? Math.atan2(currentPoint.x - npc.point.x, currentPoint.y - npc.point.y)
          : facingToYawRadians(npc.facing ?? "down");
        node.currentYaw = shortestAngleLerp(node.currentYaw, node.targetYaw, 0.14);
        node.group.rotation.y = node.currentYaw;
      }

      // 이모트 소비·동기화 및 모든 캐릭터 포즈(보행·착석·이모트·VRM 표정) 업데이트
      consumeAndSyncStudioThreeEmotes({ bridge, snapshot: snapshotRef.current, selfNode, actorNodes, now });
      for (const node of actorNodes.values()) {
        if (node.group.visible) applyStudioThreeActorPose(node, now, dt);
      }

      architecture?.waterMeshes.forEach((water, idx) => {
        water.position.y = 0.05 + Math.sin(now * 0.002 + idx) * 0.012;
      });

      // 카메라 추종 (유저 줌 및 오빗 각도 반영)
      const zoomFactor = Math.max(0.65, Math.min(1.65, bridge.userZoom.get()));
      const camDist = 12.8 / zoomFactor;
      const camHeight = 10.8 / zoomFactor;
      camera.position.lerp(
        cameraPositionTarget.set(
          selfNode.group.position.x + Math.sin(currentCameraYaw) * camDist,
          camHeight,
          selfNode.group.position.z + Math.cos(currentCameraYaw) * camDist,
        ),
        0.16,
      );
      camera.lookAt(
        selfNode.group.position.x - Math.sin(currentCameraYaw) * 0.8,
        1.05,
        selfNode.group.position.z - Math.cos(currentCameraYaw) * 0.8,
      );

      const zoneChanged = zoneTracker.next(currentPoint);
      if (zoneChanged) callbacksRef.current.onZoneChange?.(zoneChanged);

      const closestInteraction = nearestInteraction(allInteractions, currentPoint);

      for (const ringNode of architecture?.workstationRings ?? []) {
        const isActive = closestInteraction?.id === ringNode.id;
        ringNode.group.scale.setScalar(isActive ? 1.12 + Math.sin(now * 0.006) * 0.08 : 1 + Math.sin(now * 0.0025) * 0.025);
      }

      const nearbyNpcs: StudioVirtualSpaceNearbyNpc[] = [];
      for (const npc of npcDefinitions) {
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
      proximity.sample(closestInteraction, nearbyNpcs);

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
          pose: poseState.pose,
        });
      }

      postPipeline.render();
      runtime.frame(now);

      if (now - lastOverlaySync >= 90) {
        lastOverlaySync = now;
        setOverlays(projectStudioThreeOverlays({
          width: renderer.domElement.clientWidth, height: renderer.domElement.clientHeight,
          camera, selfNode, actorNodes, snapshot: snapshotRef.current, currentPoint, manifest,
          allInteractions, roomSigns, closestInteraction,
          selfLabel: selfNameRef.current || btRef.current("나", "Me"),
          isEn: document.documentElement.lang.startsWith("en"),
        }));
      }
    };

    animFrameId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      applyLightingRef.current = null;
      resetCameraRef.current = null;
      triggerOverlayTargetRef.current = null;
      reloadActorVrmRef.current = null;
      selectThemeRef.current = null;
      window.cancelAnimationFrame(animFrameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("resize", handleResize);
      pointerInput.dispose();
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      bridge.setFocusHandler(null);
      destMarker.removeFromParent();
      const failures: unknown[] = [];
      for (const release of [
        () => reloadActorVrm.dispose(), () => themeController.dispose(),
        () => destGeo.dispose(), () => destMat.dispose(), () => dirLight.dispose(), () => fillLight.dispose(),
        () => postPipeline.dispose(), () => hdriController.dispose(), () => renderer.dispose(),
      ]) {
        try { release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "3D 무대 자원 해제에 실패했습니다.");
    };
  }, [bridge, manifest]);

  return (
    <div
      ref={containerRef}
      className="studio-vspace-three-stage"
      data-three-stage="active"
      aria-label={bt("3D 가상 스튜디오 공간", "3D Virtual Studio Space")}
      style={{ position: "relative", width: "100%", height: "100%", outline: "none" }}
    >
      <div ref={canvasMountRef} className="studio-vspace-three-canvas-mount" style={{ position: "absolute", inset: 0, zIndex: 1 }} />
      <StudioVirtualSpaceThreeHud
        overlays={overlays}
        assetFailureCount={assetFailureCount}
        lightingPreset={lightingPreset}
        onLightingPresetChange={(preset) => {
          writeStoredStudioThreeLightingPreset(preset);
          setLightingPreset(preset);
          applyLightingRef.current?.(preset);
        }}
        onResetCamera={() => resetCameraRef.current?.()}
        onTriggerTarget={(kind, targetId) => triggerOverlayTargetRef.current?.(kind, targetId)}
      />
    </div>
  );
}

