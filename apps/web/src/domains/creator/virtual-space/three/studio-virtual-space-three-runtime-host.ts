import type { MutableRefObject } from "react";
import * as THREE from "three";

import { setActiveMountedCameraPanStore, StudioCameraPanRuntime } from "../studio-virtual-space-camera-pan";
import { getStudioSpaceSelectedObjectTarget, subscribeStudioSpaceSelectedObjectTarget } from "../studio-virtual-space-camera-recovery";
import { STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS, StudioZoneChangeTracker, type StudioVirtualSpaceNearbyNpc } from "../studio-virtual-space-engine-events";
import { isStudioSpaceJoystickActive, isStudioSpaceTextEntryTarget } from "../studio-virtual-space-input-guard";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioNpcInteraction, studioNpcLabel } from "../studio-virtual-space-npc-director";
import { nearestInteraction, studioFacingToward } from "../studio-virtual-space-phaser-canvas-model";
import { studioCameraLerp } from "../studio-virtual-space-presentation";
import { clampStudioWorldPoint } from "../studio-virtual-space-world-pathfinding";
import { studioWorldInteractions, studioWorldPortals, studioWorldRoomAt, studioWorldSpawn, type StudioWorldInteractionDefinition } from "../studio-virtual-space-world-manifest";
import { createStudioThreeGlbLoader } from "./studio-virtual-space-three-asset-loader";
import { setStudioThreeActorHeadVisible } from "./studio-virtual-space-three-actor-loader";
import { applyStudioThreeCutaway } from "./studio-virtual-space-three-cutaway";
import { createStudioThreeDecorationsController } from "./studio-virtual-space-three-decorations";
import {
  applyStudioLightingPresetToScene,
  captureStudioThreeCanvasToCut,
  createStudioThreeChromePostPipeline,
  createStudioThreeHdriController,
  findClickedWorldTarget,
  type ProjectedOverlayItem,
  type StudioThreeLightingPreset,
} from "./studio-virtual-space-three-dioramas";
import {
  clampStudioThreeCameraPitch,
  shouldHideSelfHeadForCameraMode,
  STUDIO_THREE_THIRD_PERSON_DEFAULT_PITCH,
  StudioThreeFollowCamera,
  StudioThreePeerMotion,
} from "./studio-virtual-space-three-follow";
import { StudioThreeFootstepFx } from "./studio-virtual-space-three-footstep-fx";
import { projectStudioThreeOverlays } from "./studio-virtual-space-three-hud-projection";
import { bindStudioThreeKeyboardInput } from "./studio-virtual-space-three-keyboard-input";
import { applyHeroSceneInteriorLighting, applyStudioThreeLightingState, restoreBaselineShadowFrustum } from "./studio-virtual-space-three-lighting";
import {
  applyStudioThreeActorPose,
  applyStudioThreeVisemeFrame,
  computeStudioThreeCameraOrbitDelta,
  consumeAndSyncStudioThreeEmotes,
  readStoredStudioThreeLightingPreset,
  studioThreeFillLightIntensity,
  updateStudioThreeActorLookAt,
} from "./studio-virtual-space-three-motion";
import { StudioThreeWorldNavigation } from "./studio-virtual-space-three-navigation";
import { bindStudioThreePointerInput } from "./studio-virtual-space-three-pointer-input";
import {
  bindStudioVirtualThreeContextRecovery,
  resolveStudioVirtualThreeRendererParams,
  type StudioVirtualThreeQualityMode,
} from "./studio-virtual-space-three-renderer-recovery";
import { StudioThreeProximityPublication, StudioThreeRuntimePublication } from "./studio-virtual-space-three-runtime-policy";
import {
  createStylized3DCharacterNode,
  facingToYawRadians,
  loadStudioThreeAssets,
  shortestAngleLerp,
  STUDIO_THREE_SCALE,
  threeToWorld,
  worldToThree,
  type StudioThreeActorNode,
} from "./studio-virtual-space-three-scene";
import {
  applyStudioThreeActorGhostVisual,
  createStudioThreeLiveScreenController,
  createStudioThreeProximityRing,
  createStudioThreeStuckDetector,
  findClickedPeerSessionId,
  findNearestLookAtWorldPosition,
  mergeStudioThreeSeatAnchors,
} from "./studio-virtual-space-three-stage-features";
import type { StudioThreeCameraMode, StudioVirtualSpaceThreeStageProps } from "./studio-virtual-space-three-stage-props";
import { studioThreeThemeLightingPreset } from "./studio-virtual-space-three-surface-art";
import { studioThreeRoomSigns } from "./studio-virtual-space-three-world-layout";
import { VIRTUAL_THREE_DESKTOP_HIGH_QUALITY_CAPACITY_PROFILE } from "./themes/virtual-three-capacity-profiles";
import { createVirtualThreeThemeController } from "./themes/virtual-three-theme-controller";
import { applyVirtualThreeThemeLighting, captureVirtualThreeThemeLightingState } from "./themes/virtual-three-theme-lighting";
import type { VirtualThreeTheme } from "./themes/virtual-three-theme-types";

const NPC_COLORS = [0x6366f1, 0xec4899, 0x06b6d4, 0xf59e0b, 0x10b981, 0x8b5cf6, 0x3b82f6, 0x14b8a6] as const;

export interface StudioThreeResumePose {
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly cameraYaw: number;
  readonly cameraPitch: number;
}

export interface StudioThreeStageRuntimeHandle {
  readonly applyLighting: (preset: StudioThreeLightingPreset) => void;
  readonly applyDynamicLighting: () => void;
  readonly resetCamera: () => void;
  readonly triggerOverlayTarget: (kind: "workstation" | "npc", targetId: string) => void;
  readonly reloadActorVrm: (actorId: string, index: number) => void;
  readonly selectTheme: (nextTheme: VirtualThreeTheme) => void;
  readonly syncDecorations: () => void;
  readonly capturePhoto: () => void;
  readonly dispose: () => void;
}

export interface StudioThreeStageMountInput {
  readonly container: HTMLDivElement;
  readonly canvasMount: HTMLDivElement;
  readonly manifest: StudioVirtualSpaceThreeStageProps["manifest"];
  readonly bridge: StudioVirtualSpaceThreeStageProps["bridge"];
  readonly qualityMode: StudioVirtualThreeQualityMode;
  readonly resumePoseRef: MutableRefObject<StudioThreeResumePose | null>;
  readonly getLatest: () => {
    readonly theme: VirtualThreeTheme;
    readonly snapshot: StudioVirtualSpaceThreeStageProps["snapshot"];
    readonly selfDisplayName?: string;
    readonly reducedMotion: boolean;
    readonly cameraMode: StudioThreeCameraMode;
    readonly ghostMode: boolean;
    readonly seatedActors: StudioVirtualSpaceThreeStageProps["seatedActors"];
    readonly lightingState: StudioVirtualSpaceThreeStageProps["lightingState"];
    readonly visemeByActorId: StudioVirtualSpaceThreeStageProps["visemeByActorId"];
    readonly liveScreenStream: StudioVirtualSpaceThreeStageProps["liveScreenStream"];
    readonly proximityRadiusPx: StudioVirtualSpaceThreeStageProps["proximityRadiusPx"];
    readonly decorations: StudioVirtualSpaceThreeStageProps["decorations"];
    readonly placedFixtures: StudioVirtualSpaceThreeStageProps["placedFixtures"];
    readonly bt: (ko: string, en: string) => string;
    readonly callbacks: Pick<
      StudioVirtualSpaceThreeStageProps,
      | "onThemePreviewChange" | "onRuntimeMetrics" | "onNpcInteract" | "onLocalState" | "onInteract"
      | "onNearbyInteractionChange" | "onPortal" | "onZoneChange" | "onNearbyNpcsChange"
      | "onEngineStatusChange" | "onPeerSelect" | "onStuckChange" | "onPhotoCaptureToCut"
    >;
  };
  readonly actions: {
    readonly setOverlays: (items: readonly ProjectedOverlayItem[]) => void;
    readonly incrementAssetFailure: () => void;
    readonly resetAssetFailure: () => void;
    readonly setBootFailureReason: (reason: string | null) => void;
    readonly setContextLost: (lost: boolean) => void;
    readonly setLightingPreset: (preset: StudioThreeLightingPreset) => void;
    readonly setCutawayHiddenCount: (count: number) => void;
    readonly setCameraMode: (mode: StudioThreeCameraMode) => void;
    readonly toggleGhostMode: () => void;
  };
}

/** Three.js 3D 가상 스튜디오 씬·입력·루프·자원 해제를 소유하는 명령형 런타임 마운터. */
export function mountStudioThreeStageRuntime(
  input: StudioThreeStageMountInput,
): StudioThreeStageRuntimeHandle | null {
  const { container, canvasMount, manifest, bridge, qualityMode, resumePoseRef, getLatest, actions } = input;
  let disposed = false;
  let isContextLost = false;
  let failedTextures = 0;

  actions.resetAssetFailure();
  actions.setBootFailureReason(null);
  actions.setContextLost(false);
  getLatest().callbacks.onEngineStatusChange?.("loading");
  bridge.userZoom.setAvailable(true);
  bridge.userZoom.setFloor(0.65);

  const renderParams = resolveStudioVirtualThreeRendererParams(qualityMode, window.devicePixelRatio || 1);
  const scene = new THREE.Scene();
  const width = Math.max(320, container.clientWidth || window.innerWidth);
  const height = Math.max(240, container.clientHeight || window.innerHeight);

  const camera = new THREE.PerspectiveCamera(36, width / height, 0.2, 220);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: renderParams.antialias, powerPreference: renderParams.powerPreference });
  } catch (error: unknown) {
    const detail = error instanceof Error && error.message.trim() ? error.message.trim() : null;
    actions.setBootFailureReason(
      detail ?? getLatest().bt("이 브라우저에서 WebGL 3D 렌더러를 시작하지 못했습니다.", "Could not start the WebGL 3D renderer in this browser."),
    );
    getLatest().callbacks.onEngineStatusChange?.("error");
    return null;
  }
  renderer.setSize(width, height);
  renderer.setPixelRatio(renderParams.pixelRatio);
  renderer.shadowMap.enabled = renderParams.shadowsEnabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  renderer.domElement.tabIndex = 0;
  canvasMount.innerHTML = "";
  canvasMount.appendChild(renderer.domElement);
  const contextRecovery = bindStudioVirtualThreeContextRecovery(renderer.domElement, {
    onContextLost: () => { if (!disposed) { isContextLost = true; actions.setContextLost(true); } },
    onContextRestored: () => {
      if (disposed) return;
      isContextLost = false;
      renderer.resetState?.();
      actions.setContextLost(false);
    },
  });

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.04);
  hemiLight.position.set(0, 40, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.42);
  dirLight.position.set(36, 48, 28);
  dirLight.castShadow = renderParams.shadowsEnabled;
  dirLight.shadow.mapSize.set(renderParams.shadowMapSize, renderParams.shadowMapSize);
  Object.assign(dirLight.shadow.camera, { near: 4, far: 140, left: -48, right: 48, top: 48, bottom: -48 });
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0);
  fillLight.castShadow = false;
  const interiorPointLight = new THREE.PointLight(0xffe7c2, 0, 22, 1.6);
  interiorPointLight.position.set(manifest.width * STUDIO_THREE_SCALE / 2, 2.8, manifest.height * STUDIO_THREE_SCALE / 2);
  interiorPointLight.visible = false;
  scene.add(fillLight, fillLight.target, dirLight.target, interiorPointLight);

  const hdriController = createStudioThreeHdriController(renderer, scene, () => disposed, () => {
    if (disposed) return;
    failedTextures += 1;
    actions.incrementAssetFailure();
  });
  const postPipeline = createStudioThreeChromePostPipeline(renderer, scene, camera, width, height);
  let currentPreset = readStoredStudioThreeLightingPreset(studioThreeThemeLightingPreset(getLatest().theme, manifest));
  let heroLightingOrigin: readonly [number, number, number] | null = null;
  const syncLighting = (preset: StudioThreeLightingPreset) => {
    currentPreset = preset;
    applyStudioLightingPresetToScene(preset, scene, renderer, hemiLight, dirLight, postPipeline, fillLight);
    hdriController.applyPreset(preset);
    if (heroLightingOrigin) applyHeroSceneInteriorLighting({ preset, heroOrigin: heroLightingOrigin, scene, renderer, hemiLight, dirLight, fillLight, interiorPointLight });
  };
  const syncDynamicLighting = () => {
    if (heroLightingOrigin) { applyHeroSceneInteriorLighting({ preset: currentPreset, heroOrigin: heroLightingOrigin, scene, renderer, hemiLight, dirLight, fillLight, interiorPointLight }); return; }
    const nextLighting = getLatest().lightingState;
    if (!nextLighting) return;
    const center = new THREE.Vector3(manifest.width * STUDIO_THREE_SCALE / 2, 0, manifest.height * STUDIO_THREE_SCALE / 2);
    applyStudioThreeLightingState(nextLighting, { scene, renderer, hemiLight, dirLight, fillLight, interiorPointLight, center });
  };

  const roomSigns = studioThreeRoomSigns(manifest);
  const allInteractions = studioWorldInteractions(manifest);
  const actorNodes = new Map<string, StudioThreeActorNode>();
  const navigation = new StudioThreeWorldNavigation(manifest);
  const resumedPose = resumePoseRef.current;
  const initialSnap = getLatest().snapshot;
  const requestedSpawn = resumedPose?.point
    ?? (initialSnap.self.x > 0 || initialSnap.self.y > 0
      ? { x: initialSnap.self.x, y: initialSnap.self.y }
      : studioWorldSpawn(manifest).point);
  const spawnPoint = navigation.resolveTarget(requestedSpawn) ?? requestedSpawn;

  const selfNode = createStylized3DCharacterNode("self", 0x4f46e5, true);
  const selfPos3 = worldToThree(spawnPoint, 0);
  selfNode.group.position.copy(selfPos3);
  selfNode.targetX = selfPos3.x;
  selfNode.targetZ = selfPos3.z;
  scene.add(selfNode.group);
  actorNodes.set("self", selfNode);

  const proximityRing = createStudioThreeProximityRing(selfNode.group);
  const footstepFx = new StudioThreeFootstepFx(scene);
  const liveScreenController = createStudioThreeLiveScreenController(scene, selfPos3);
  const decorLoader = createStudioThreeGlbLoader();
  const decorationsController = createStudioThreeDecorationsController(scene, decorLoader);
  const syncDecorations = () => {
    const latest = getLatest();
    decorationsController.sync({
      decorations: latest.decorations,
      placedFixtures: latest.placedFixtures,
      worldSize: { width: manifest.width, height: manifest.height },
    });
  };
  syncDecorations();

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

  const campusPropsGroup = new THREE.Group();
  campusPropsGroup.name = "campus-baseline-props-root";
  scene.add(campusPropsGroup);
  const resolvedSelfAvatar = initialSnap.self.avatarIndex >= 0 ? initialSnap.self.avatarIndex : 0;
  const reloadActorVrm = loadStudioThreeAssets(campusPropsGroup, actorNodes, () => disposed, resolvedSelfAvatar, manifest, () => actions.incrementAssetFailure());
  let currentPoint: StudioVirtualSpacePoint = { ...spawnPoint };
  let currentFacing: StudioVirtualSpaceFacing = resumedPose?.facing ?? initialSnap.self.facing ?? "down";
  const initialYaw = facingToYawRadians(currentFacing);
  selfNode.currentYaw = initialYaw;
  selfNode.targetYaw = initialYaw;
  selfNode.group.rotation.y = initialYaw;
  let activeIsHeroScene = getLatest().theme.kind === "hero-scene";
  campusPropsGroup.visible = !activeIsHeroScene;

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
      const prevHero = activeIsHeroScene;
      const restore = captureVirtualThreeThemeLightingState({ scene, renderer, lights: { ambient: hemiLight, key: dirLight, fill: fillLight } });
      return () => { activeIsHeroScene = prevHero; campusPropsGroup.visible = !prevHero; hdriController.applyPreset(oldPreset); restore(); currentPreset = oldPreset; actions.setLightingPreset(oldPreset); };
    },
    onPreviewChange: (themeId, preview) => {
      if (!disposed) getLatest().callbacks.onThemePreviewChange?.(themeId, preview);
    },
    onCommitted: (committedTheme) => {
      if (disposed) return;
      const wasHero = activeIsHeroScene;
      activeIsHeroScene = committedTheme.kind === "hero-scene";
      campusPropsGroup.visible = !activeIsHeroScene;
      heroLightingOrigin = activeIsHeroScene ? (themeController.getArchitecture()?.heroRootOrigin ?? null) : null;
      if (!activeIsHeroScene && wasHero) restoreBaselineShadowFrustum(dirLight, interiorPointLight);
      if (activeIsHeroScene && !wasHero) {
        currentPoint = { ...studioWorldSpawn(manifest).point };
        selfNode.group.position.copy(worldToThree(currentPoint, 0));
        targetCameraYaw = 0; currentCameraYaw = 0;
      }
      const preset = readStoredStudioThreeLightingPreset(studioThreeThemeLightingPreset(committedTheme, manifest));
      syncLighting(preset);
      if (!activeIsHeroScene) applyVirtualThreeThemeLighting(committedTheme, manifest, { ambient: hemiLight, key: dirLight, fill: fillLight }, studioThreeFillLightIntensity(preset));
      syncDynamicLighting();
      actions.setLightingPreset(preset);
    },
    onAssetError: (_url, kind) => {
      if (disposed) return;
      if (kind === "texture") failedTextures += 1;
      actions.incrementAssetFailure();
    },
  });
  themeController.select(getLatest().theme);

  const peerAvatarIndices = new Map<string, number>();
  let previousPeers: StudioVirtualSpaceThreeStageProps["snapshot"]["peers"] | null = null;
  const proximity = new StudioThreeProximityPublication<StudioWorldInteractionDefinition, StudioVirtualSpaceNearbyNpc>({
    interaction: (value) => getLatest().callbacks.onNearbyInteractionChange?.(value),
    npcs: (value) => getLatest().callbacks.onNearbyNpcsChange?.(value),
  });
  const runtime = new StudioThreeRuntimePublication(
    (sample) => getLatest().callbacks.onRuntimeMetrics?.(sample),
    () => {
      let visiblePeerCount = 0, visibleNpcCount = 0;
      for (const [id, node] of actorNodes) {
        if (!node.group.visible) continue;
        if (id.startsWith("peer:")) visiblePeerCount += 1;
        else if (id !== "self") visibleNpcCount += 1;
      }
      return {
        qualityTier: (qualityMode === "low" ? "battery" : "ultra") as "battery" | "ultra",
        peerCount: getLatest().snapshot.peers.length, visiblePeerCount,
        npcCount: npcDefinitions.length, visibleNpcCount,
        routeWaypoints: navigation.waypointCount, failedTextures,
      };
    },
  );

  const keysDown = new Set<string>();
  const stuckDetector = createStudioThreeStuckDetector(1.2);
  let lastStopRevision = bridge.getStopRevision();
  let moveDestination: StudioVirtualSpacePoint | null = null;
  let pendingAutoInteract: { readonly kind: "workstation" | "npc"; readonly id: string } | null = null;
  let targetCameraYaw = resumedPose?.cameraYaw ?? 0;
  let currentCameraYaw = targetCameraYaw;
  let targetCameraPitch = resumedPose?.cameraPitch ?? STUDIO_THREE_THIRD_PERSON_DEFAULT_PITCH;
  let currentCameraPitch = targetCameraPitch;
  let lastGhostApplied = false;
  let lastCutawayHidden = -1;
  let lastHeadHidden = false;

  const zoneTracker = new StudioZoneChangeTracker(manifest);
  const cameraPanRuntime = new StudioCameraPanRuntime(bridge.cameraPan);
  bridge.cameraPan.attachZoomStore(bridge.userZoom);
  bridge.cameraPan.attachHomeResetCallback(() => {
    targetCameraYaw = 0; currentCameraYaw = 0;
    targetCameraPitch = STUDIO_THREE_THIRD_PERSON_DEFAULT_PITCH; currentCameraPitch = targetCameraPitch;
  });
  setActiveMountedCameraPanStore(bridge.cameraPan);
  bridge.cameraPan.setFocusTarget(getStudioSpaceSelectedObjectTarget());
  const unbindSelectedObjectTarget = subscribeStudioSpaceSelectedObjectTarget((target) => bridge.cameraPan.setFocusTarget(target));
  bridge.setFocusHandler(() => renderer.domElement.focus({ preventScroll: true }));

  const clearDestination = () => {
    navigation.cancel();
    moveDestination = null;
    pendingAutoInteract = null;
    destMarker.visible = false;
  };
  const triggerOverlayTarget = (kind: "workstation" | "npc", targetId: string) => {
    clearDestination();
    if (kind === "workstation") {
      const target = allInteractions.find((item) => item.id === targetId);
      if (!target) return;
      if (Math.hypot(target.point.x - currentPoint.x, target.point.y - currentPoint.y) <= target.radius + 28) {
        getLatest().callbacks.onInteract?.(target);
      } else {
        pendingAutoInteract = { kind: "workstation", id: targetId };
        moveDestination = clampStudioWorldPoint(manifest, target.point);
        destMarker.position.copy(worldToThree(moveDestination, 0.04)); destMarker.visible = true;
      }
    } else {
      const npc = npcDefinitions.find((item) => item.id === targetId);
      if (!npc) return;
      const npcInteract = studioNpcInteraction(manifest, npc);
      if (Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y) <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS && npcInteract) {
        getLatest().callbacks.onNpcInteract?.(npcInteract, npc);
      } else {
        pendingAutoInteract = { kind: "npc", id: targetId };
        moveDestination = clampStudioWorldPoint(manifest, { x: npc.point.x, y: npc.point.y + 54 });
        destMarker.position.copy(worldToThree(moveDestination, 0.04)); destMarker.visible = true;
      }
    }
  };

  const haltMovementForTextInput = () => {
    keysDown.clear(); clearDestination();
    if (isStudioSpaceJoystickActive(bridge.getJoystick())) bridge.setJoystick({ x: 0, y: 0 });
    bridge.clearMovement();
  };
  const hasMovementKeyHeld = () =>
    keysDown.has("ArrowLeft") || keysDown.has("ArrowRight") || keysDown.has("ArrowUp") || keysDown.has("ArrowDown") ||
    keysDown.has("KeyA") || keysDown.has("KeyD") || keysDown.has("KeyW") || keysDown.has("KeyS");
  const unbindKeyboard = bindStudioThreeKeyboardInput(container, keysDown, {
    stop: haltMovementForTextInput, home: () => bridge.cameraPan.homeView(), interact: () => bridge.requestInteract(),
    onJump: () => { footstepFx.unlockAudio(); footstepFx.triggerJump(currentPoint, studioWorldRoomAt(manifest, currentPoint), Boolean(selfNode.seated), getLatest().reducedMotion); },
    onCameraMode: actions.setCameraMode, onToggleGhost: actions.toggleGhostMode,
  });

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const remoteMotion = new WeakMap<StudioThreeActorNode, StudioThreePeerMotion>();
  const followCamera = new StudioThreeFollowCamera(selfPos3.x, selfPos3.z);

  const handleFloorTap = (event: Pick<PointerEvent, "clientX" | "clientY">) => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerNdc, camera);
    const clickedPeer = findClickedPeerSessionId(raycaster, actorNodes);
    if (clickedPeer) { getLatest().callbacks.onPeerSelect?.(clickedPeer); return; }
    const floorMesh = themeController.getArchitecture()?.floorMesh;
    const hit = floorMesh ? raycaster.intersectObject(floorMesh, false)[0] : undefined;
    if (!hit) return;
    const clamped = clampStudioWorldPoint(manifest, threeToWorld({ x: hit.point.x, z: hit.point.z }));
    const clickedTarget = findClickedWorldTarget(clamped, allInteractions, npcDefinitions);
    if (clickedTarget) {
      triggerOverlayTarget(clickedTarget.kind, clickedTarget.id);
    } else {
      clearDestination();
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
  const pointerInput = bindStudioThreePointerInput(renderer.domElement, {
    onOrbitDelta: (delta) => { targetCameraYaw += delta; },
    onPitchDelta: (delta) => { targetCameraPitch = clampStudioThreeCameraPitch(getLatest().cameraMode, targetCameraPitch + delta); },
    onPinchZoomDelta: (zoomDelta) => { if (Math.abs(zoomDelta) >= 0.02) bridge.userZoom.apply(zoomDelta > 0 ? "in" : "out"); },
    onTap: handleFloorTap,
    canOrbit: () => !isStudioSpaceJoystickActive(bridge.getJoystick()) && !hasMovementKeyHeld(),
  });
  renderer.domElement.addEventListener("contextmenu", handleContextMenu);
  renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

  const handleResize = () => {
    if (disposed) return;
    const w = Math.max(320, container.clientWidth || window.innerWidth), h = Math.max(240, container.clientHeight || window.innerHeight);
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); postPipeline.setSize(w, h);
  };
  window.addEventListener("resize", handleResize);

  getLatest().callbacks.onEngineStatusChange?.("ready");
  const initialZone = zoneTracker.next(currentPoint);
  if (initialZone) getLatest().callbacks.onZoneChange?.(initialZone);

  let lastTime = performance.now();
  let lastOverlaySync = 0;
  let lastLocalStateSync = 0;
  let animFrameId = 0;

  const snapPlayerAndCamera = (target: StudioVirtualSpacePoint) => {
    const destination = navigation.resolveTarget(target);
    if (!destination) return;
    currentPoint = destination;
    clearDestination();
    const p3 = worldToThree(currentPoint, 0);
    selfNode.group.position.copy(p3);
    const zoomFactor = Math.max(0.65, Math.min(1.65, bridge.userZoom.get()));
    followCamera.update(camera, p3.x, p3.z, currentCameraYaw, zoomFactor, 0, true, {
      mode: getLatest().cameraMode, pitch: currentCameraPitch, seated: Boolean(selfNode.seated),
    });
  };

  const animate = (now: number) => {
    if (disposed) return;
    animFrameId = window.requestAnimationFrame(animate);
    const latest = getLatest();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    reloadActorVrm.update(dt);
    themeController.update(dt);
    const architecture = themeController.getArchitecture();
    liveScreenController.sync(latest.liveScreenStream, architecture);
    proximityRing.update(latest.proximityRadiusPx);

    const stopRevision = bridge.getStopRevision();
    if (stopRevision !== lastStopRevision) { lastStopRevision = stopRevision; clearDestination(); keysDown.clear(); }
    if (bridge.consumeUnstuck()) snapPlayerAndCamera(studioWorldSpawn(manifest).point);
    const teleport = bridge.consumeTeleport();
    if (teleport) snapPlayerAndCamera(clampStudioWorldPoint(manifest, teleport));
    const requestedMove = bridge.consumeMoveTarget();
    if (requestedMove) {
      clearDestination();
      const clampedTarget = clampStudioWorldPoint(manifest, requestedMove);
      const targetDist = Math.hypot(clampedTarget.x - currentPoint.x, clampedTarget.y - currentPoint.y);
      const fromZone = studioWorldRoomAt(manifest, currentPoint);
      const toZone = studioWorldRoomAt(manifest, clampedTarget);
      if (targetDist > 420 || (toZone && toZone !== fromZone)) snapPlayerAndCamera(clampedTarget);
      else { moveDestination = clampedTarget; destMarker.position.copy(worldToThree(moveDestination, 0.04)); destMarker.visible = true; }
    }
    if (isStudioSpaceTextEntryTarget(document.activeElement) && (keysDown.size > 0 || moveDestination !== null || isStudioSpaceJoystickActive(bridge.getJoystick()))) {
      haltMovementForTextInput();
    }

    const preInteraction = nearestInteraction(allInteractions, currentPoint);
    const preNearbyNpcCount = npcDefinitions.reduce(
      (count, npc) => count + (Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y) <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS ? 1 : 0), 0,
    );
    if (!isStudioSpaceJoystickActive(bridge.getJoystick())) {
      targetCameraYaw += computeStudioThreeCameraOrbitDelta({ keysDown, dt, closestInteraction: preInteraction, nearbyNpcCount: preNearbyNpcCount });
    }
    currentCameraYaw = shortestAngleLerp(currentCameraYaw, targetCameraYaw, studioCameraLerp(dt, 0.18));
    currentCameraPitch = THREE.MathUtils.lerp(currentCameraPitch, clampStudioThreeCameraPitch(latest.cameraMode, targetCameraPitch), studioCameraLerp(dt, 0.18));

    const joy = bridge.getJoystick();
    let rawVx = joy.x, rawVy = joy.y;
    if (!bridge.cameraPan.isLooking()) {
      if (keysDown.has("ArrowLeft") || keysDown.has("KeyA")) rawVx -= 1;
      if (keysDown.has("ArrowRight") || keysDown.has("KeyD")) rawVx += 1;
      if (keysDown.has("ArrowUp") || keysDown.has("KeyW")) rawVy -= 1;
      if (keysDown.has("ArrowDown") || keysDown.has("KeyS")) rawVy += 1;
    }
    const cosYaw = Math.cos(currentCameraYaw), sinYaw = Math.sin(currentCameraYaw);
    const vx = rawVx * cosYaw + rawVy * sinYaw, vy = -rawVx * sinYaw + rawVy * cosYaw;
    const speedPxPerSec = keysDown.has("ShiftLeft") || keysDown.has("ShiftRight") ? 320 : 220;
    if (latest.ghostMode !== lastGhostApplied) {
      lastGhostApplied = latest.ghostMode;
      applyStudioThreeActorGhostVisual(selfNode, latest.ghostMode);
    }

    let moving = false;
    const tryingDirectional = Math.hypot(vx, vy) > 0.05;
    if (tryingDirectional) {
      const len = Math.hypot(vx, vy);
      const nx = vx / len, ny = vy / len;
      moveDestination = null; pendingAutoInteract = null; destMarker.visible = false;
      const deltaX = nx * speedPxPerSec * dt, deltaY = ny * speedPxPerSec * dt;
      const next = latest.ghostMode
        ? clampStudioWorldPoint(manifest, { x: currentPoint.x + deltaX, y: currentPoint.y + deltaY })
        : navigation.directional(currentPoint, { x: deltaX, y: deltaY });
      moving = Math.hypot(next.x - currentPoint.x, next.y - currentPoint.y) > 0.001;
      currentPoint = next;
      currentFacing = studioFacingToward(nx, ny);
      selfNode.targetYaw = Math.atan2(nx, ny);
    } else if (moveDestination) {
      const step = navigation.toward(currentPoint, moveDestination, speedPxPerSec * dt);
      const dx = step.point.x - currentPoint.x, dy = step.point.y - currentPoint.y;
      currentPoint = step.point; moving = step.moving;
      if (moving) { currentFacing = studioFacingToward(dx, dy); selfNode.targetYaw = Math.atan2(dx, dy); }
      if (step.arrived) { moveDestination = null; destMarker.visible = false; }
    }
    const stuckResult = stuckDetector.sample({ tryingToMove: tryingDirectional, point: currentPoint, dt, ghostMode: latest.ghostMode });
    if (stuckResult.changed) latest.callbacks.onStuckChange?.(stuckResult.stuck);

    const seatAnchors = mergeStudioThreeSeatAnchors({ seatedActors: latest.seatedActors, interactionSlots: manifest.interactionSlots, architecture });
    const poseState = bridge.updatePoseState({ position: currentPoint, moving, seatAnchors, openArea: true, now });
    const explicitSelfSeat = latest.seatedActors?.find((actor) => actor.id === "self");
    selfNode.seated = poseState.pose === "sit" || Boolean(explicitSelfSeat && !moving);
    if (poseState.pose === "sit" && poseState.anchor && !moving) {
      currentFacing = poseState.anchor.facing; selfNode.targetYaw = facingToYawRadians(poseState.anchor.facing);
    } else if (explicitSelfSeat && !moving) {
      currentFacing = explicitSelfSeat.facing; selfNode.targetYaw = facingToYawRadians(explicitSelfSeat.facing);
    }

    selfNode.group.position.x = THREE.MathUtils.lerp(selfNode.group.position.x, currentPoint.x * STUDIO_THREE_SCALE, studioCameraLerp(dt, 0.35));
    selfNode.group.position.z = THREE.MathUtils.lerp(selfNode.group.position.z, currentPoint.y * STUDIO_THREE_SCALE, studioCameraLerp(dt, 0.35));
    selfNode.currentYaw = shortestAngleLerp(selfNode.currentYaw, selfNode.targetYaw, studioCameraLerp(dt, 0.22));
    selfNode.group.rotation.y = selfNode.currentYaw;
    selfNode.moving = moving;
    selfNode.group.userData.jumpHeight = footstepFx.update({
      point: currentPoint, roomId: studioWorldRoomAt(manifest, currentPoint), moving, sprinting: speedPxPerSec > 260,
      seated: Boolean(selfNode.seated), emoteId: selfNode.emoteId, dt, reducedMotion: latest.reducedMotion,
    });

    const shouldHideHead = shouldHideSelfHeadForCameraMode(latest.cameraMode);
    if (shouldHideHead !== lastHeadHidden) { lastHeadHidden = shouldHideHead; setStudioThreeActorHeadVisible(selfNode, !shouldHideHead); }

    const peers = latest.snapshot.peers;
    if (peers !== previousPeers) {
      const activeIds = new Set(peers.map((peer) => `peer:${peer.participant.sessionId}`));
      reloadActorVrm.prunePeerActors(activeIds);
      for (const id of peerAvatarIndices.keys()) if (!activeIds.has(id)) peerAvatarIndices.delete(id);
      previousPeers = peers;
    }
    const wallNow = Date.now();
    const seatedById = new Map((latest.seatedActors ?? []).map((actor) => [actor.id, actor] as const));
    for (const peer of peers) {
      const sessionId = peer.participant.sessionId;
      const peerId = `peer:${sessionId}`;
      let peerNode = actorNodes.get(peerId);
      if (!peerNode) {
        peerNode = createStylized3DCharacterNode(peerId, 0x0ea5e9, false);
        peerNode.group.userData.peerSessionId = sessionId;
        peerNode.group.position.copy(worldToThree(peer.state, 0));
        scene.add(peerNode.group);
        actorNodes.set(peerId, peerNode);
      }
      if (peerAvatarIndices.get(peerId) !== peer.state.avatarIndex) {
        peerAvatarIndices.set(peerId, peer.state.avatarIndex);
        const peerAvatar = peer.state.avatarIndex >= 0 ? peer.state.avatarIndex : ([...sessionId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 8);
        reloadActorVrm(peerId, peerAvatar);
      }
      let motion = remoteMotion.get(peerNode);
      if (!motion) { motion = new StudioThreePeerMotion(); remoteMotion.set(peerNode, motion); }
      motion.update(peerNode, peer, wallNow, dt);
      const seatedPeer = seatedById.get(sessionId) ?? seatedById.get(peerId);
      if (seatedPeer && !peerNode.moving) { peerNode.seated = true; peerNode.targetYaw = facingToYawRadians(seatedPeer.facing); }
    }

    for (const npc of npcDefinitions) {
      const node = actorNodes.get(npc.id);
      if (!node) continue;
      const gapPx = Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y);
      node.group.visible = !activeIsHeroScene && gapPx <= 920;
      if (!node.group.visible) continue;
      node.targetYaw = gapPx < 240 ? Math.atan2(currentPoint.x - npc.point.x, currentPoint.y - npc.point.y) : facingToYawRadians(npc.facing ?? "down");
      node.currentYaw = shortestAngleLerp(node.currentYaw, node.targetYaw, studioCameraLerp(dt, 0.14));
      node.group.rotation.y = node.currentYaw;
    }

    consumeAndSyncStudioThreeEmotes({ bridge, snapshot: latest.snapshot, selfNode, actorNodes, now });
    const selfLookAtTarget = findNearestLookAtWorldPosition(selfNode, actorNodes);
    for (const [actorId, node] of actorNodes) {
      if (!node.group.visible) continue;
      applyStudioThreeActorPose(node, now, dt);
      const visemeKey = actorId.startsWith("peer:") ? actorId.slice(5) : actorId;
      applyStudioThreeVisemeFrame(node, latest.visemeByActorId?.[actorId] ?? latest.visemeByActorId?.[visemeKey]);
      updateStudioThreeActorLookAt(node, actorId === "self" ? selfLookAtTarget : selfNode.group.position, dt);
    }

    architecture?.waterMeshes.forEach((water, idx) => { water.position.y = 0.05 + Math.sin(now * 0.002 + idx) * 0.012; });

    const zoomFactor = Math.max(0.65, Math.min(1.65, bridge.userZoom.get()));
    const panSample = cameraPanRuntime.sample({
      deltaSeconds: dt, available: true, directed: false, snap: false, reducedMotion: latest.reducedMotion, moving,
      cssToWorld: 1 / zoomFactor, base: currentPoint, center: currentPoint,
      view: { width: 960 / zoomFactor, height: 640 / zoomFactor }, world: { width: manifest.width, height: manifest.height },
    });
    followCamera.update(
      camera, selfNode.group.position.x + panSample.x * STUDIO_THREE_SCALE, selfNode.group.position.z + panSample.y * STUDIO_THREE_SCALE,
      currentCameraYaw, zoomFactor, dt, panSample.direct || latest.reducedMotion,
      { mode: latest.cameraMode, pitch: currentCameraPitch, seated: Boolean(selfNode.seated) },
    );

    const cutaway = applyStudioThreeCutaway(scene, {
      cameraMode: latest.cameraMode, cameraYaw: currentCameraYaw,
      enabledWalls: architecture?.heroPreset?.entry.cutawayEnabledWalls,
    });
    if (cutaway.hiddenCount !== lastCutawayHidden) { lastCutawayHidden = cutaway.hiddenCount; actions.setCutawayHiddenCount(cutaway.hiddenCount); }

    const zoneChanged = zoneTracker.next(currentPoint);
    if (zoneChanged) latest.callbacks.onZoneChange?.(zoneChanged);
    const closestInteraction = nearestInteraction(allInteractions, currentPoint);
    if (!getStudioSpaceSelectedObjectTarget()) {
      bridge.cameraPan.setFocusTarget(closestInteraction
        ? { id: closestInteraction.id, labelKo: closestInteraction.labelKo, labelEn: closestInteraction.labelEn, x: closestInteraction.point.x, y: closestInteraction.point.y }
        : null);
    }
    for (const ringNode of architecture?.workstationRings ?? []) {
      const isActive = closestInteraction?.id === ringNode.id;
      ringNode.group.scale.setScalar(isActive ? 1.12 + Math.sin(now * 0.006) * 0.08 : 1 + Math.sin(now * 0.0025) * 0.025);
    }

    const nearbyNpcs: StudioVirtualSpaceNearbyNpc[] = [];
    for (const npc of npcDefinitions) {
      const dist = Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y);
      if (dist <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS) {
        const label = studioNpcLabel(npc);
        nearbyNpcs.push({ id: npc.id, npc, labelKo: label.ko, labelEn: label.en, activityKo: "업무 지원 중", activityEn: "Assisting", skinKey: npc.skinKey, distance: dist, interaction: studioNpcInteraction(manifest, npc) });
      }
    }
    nearbyNpcs.sort((a, b) => a.distance - b.distance);
    proximity.sample(closestInteraction, nearbyNpcs);

    if (pendingAutoInteract) {
      if (pendingAutoInteract.kind === "workstation") {
        const target = allInteractions.find((item) => item.id === pendingAutoInteract?.id);
        if (target && Math.hypot(target.point.x - currentPoint.x, target.point.y - currentPoint.y) <= target.radius + 20) {
          pendingAutoInteract = null; moveDestination = null; destMarker.visible = false;
          latest.callbacks.onInteract?.(target);
        }
      } else {
        const matchedNpc = nearbyNpcs.find((item) => item.id === pendingAutoInteract?.id);
        if (matchedNpc?.interaction) {
          pendingAutoInteract = null; moveDestination = null; destMarker.visible = false;
          latest.callbacks.onNpcInteract?.(matchedNpc.interaction, matchedNpc.npc);
        }
      }
    }
    if (!moveDestination) pendingAutoInteract = null;

    if (bridge.consumeInteract()) {
      clearDestination();
      const nearestNpc = nearbyNpcs.find((item) => item.interaction);
      if (nearestNpc?.interaction) latest.callbacks.onNpcInteract?.(nearestNpc.interaction, nearestNpc.npc);
      else if (closestInteraction) latest.callbacks.onInteract?.(closestInteraction);
      else {
        const portal = studioWorldPortals(manifest).find((candidate) => Math.hypot(candidate.point.x - currentPoint.x, candidate.point.y - currentPoint.y) <= candidate.radius);
        if (portal) latest.callbacks.onPortal?.(portal);
      }
    }

    resumePoseRef.current = { point: { ...currentPoint }, facing: currentFacing, cameraYaw: currentCameraYaw, cameraPitch: currentCameraPitch };
    if (now - lastLocalStateSync >= 80) {
      lastLocalStateSync = now;
      latest.callbacks.onLocalState?.({ point: { x: Math.round(currentPoint.x), y: Math.round(currentPoint.y) }, zoneId: studioWorldRoomAt(manifest, currentPoint), facing: currentFacing, moving, pose: poseState.pose });
    }
    if (isContextLost) return;
    if (renderParams.usePostPipeline) postPipeline.render();
    else renderer.render(scene, camera);
    runtime.frame(now);

    if (now - lastOverlaySync >= 90) {
      lastOverlaySync = now;
      actions.setOverlays(projectStudioThreeOverlays({
        width: renderer.domElement.clientWidth, height: renderer.domElement.clientHeight,
        camera, selfNode, actorNodes, snapshot: latest.snapshot, currentPoint,
        manifest: activeIsHeroScene ? { ...manifest, npcs: [] } : manifest,
        allInteractions: activeIsHeroScene ? [] : allInteractions, roomSigns: activeIsHeroScene ? [] : roomSigns,
        closestInteraction: activeIsHeroScene ? null : closestInteraction,
        selfLabel: latest.selfDisplayName || latest.bt("나", "Me"), isEn: document.documentElement.lang.startsWith("en"),
      }));
    }
  };
  animFrameId = window.requestAnimationFrame(animate);
  return {
    applyLighting: syncLighting, applyDynamicLighting: syncDynamicLighting,
    resetCamera: () => bridge.cameraPan.homeView(), triggerOverlayTarget, reloadActorVrm,
    selectTheme: themeController.select, syncDecorations,
    capturePhoto() {
      const latest = getLatest();
      const capture = captureStudioThreeCanvasToCut({ renderer, scene, camera, label: latest.theme.copy.ko.name || "3D 스튜디오 포토부스 컷" });
      if (capture) latest.callbacks.onPhotoCaptureToCut?.(capture);
    },
    dispose() {
      disposed = true; contextRecovery.dispose(); window.cancelAnimationFrame(animFrameId);
      unbindKeyboard(); window.removeEventListener("resize", handleResize); pointerInput.dispose();
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu); renderer.domElement.removeEventListener("wheel", handleWheel);
      unbindSelectedObjectTarget(); bridge.cameraPan.attachZoomStore(null); bridge.cameraPan.attachHomeResetCallback(null);
      setActiveMountedCameraPanStore(null); bridge.setFocusHandler(null); destMarker.removeFromParent(); campusPropsGroup.removeFromParent();
      const failures: unknown[] = [];
      for (const release of [() => reloadActorVrm.dispose(), () => themeController.dispose(), () => decorationsController.dispose(), () => liveScreenController.dispose(), () => proximityRing.dispose(), () => footstepFx.dispose(), () => destGeo.dispose(), () => destMat.dispose(), () => dirLight.dispose(), () => fillLight.dispose(), () => interiorPointLight.dispose(), () => postPipeline.dispose(), () => hdriController.dispose(), () => renderer.dispose()]) {
        try { release(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "3D 무대 자원 해제에 실패했습니다.");
    },
  };
}
