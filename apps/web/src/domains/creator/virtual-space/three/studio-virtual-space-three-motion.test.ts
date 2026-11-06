import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldInteractions } from "../studio-virtual-space-world-manifest";
import {
  applyStudioLightingPresetToScene,
  formatParticipantOverlayBadge,
  type StudioThreeChromePostPipeline,
} from "./studio-virtual-space-three-dioramas";
import { projectStudioThreeOverlays } from "./studio-virtual-space-three-hud-projection";
import {
  applyStudioThreeActorPose,
  computeStudioThreeCameraOrbitDelta,
  consumeAndSyncStudioThreeEmotes,
  isStudioThreeCameraOrbitKey,
  readStoredStudioThreeLightingPreset,
  STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY,
  studioThreeFillLightIntensity,
  triggerStudioThreeActorEmote,
  writeStoredStudioThreeLightingPreset,
} from "./studio-virtual-space-three-motion";
import { applyNaturalVrmPosture, createStylized3DCharacterNode, worldToThree } from "./studio-virtual-space-three-scene";
import { studioThreeRoomSigns } from "./studio-virtual-space-three-world-layout";

function createMockVrm() {
  const setValue = vi.fn();
  const update = vi.fn();
  const humanoidUpdate = vi.fn();
  const bones = {
    leftUpperArm: new THREE.Object3D(),
    rightUpperArm: new THREE.Object3D(),
    leftLowerArm: new THREE.Object3D(),
    rightLowerArm: new THREE.Object3D(),
    leftUpperLeg: new THREE.Object3D(),
    rightUpperLeg: new THREE.Object3D(),
  };
  const vrm = {
    humanoid: {
      getNormalizedBoneNode: vi.fn((name: keyof typeof bones) => bones[name] ?? null),
      update: humanoidUpdate,
    },
    expressionManager: {
      setValue,
    },
    update,
  } as unknown as VRM;
  return { vrm, bones, setValue, update, humanoidUpdate };
}

function createBaseSnapshot(overrides: Partial<StudioVirtualSpaceSnapshot> = {}): StudioVirtualSpaceSnapshot {
  return {
    self: {
      x: 780,
      y: 900,
      zoneId: "lobby",
      facing: "down",
      activity: "available",
      moving: false,
      avatarIndex: 0,
    },
    peers: [],
    nearbyPeers: [],
    selfReaction: null,
    peerReactions: [],
    chatMessages: [],
    chatBubbles: [],
    selfChatBubble: null,
    peerTyping: [],
    peerImpacts: [],
    objectStates: [],
    peerFixtures: [],
    direct: true,
    ...overrides,
  };
}

describe("studio-virtual-space-three-motion", () => {
  it("VRM 정규화 본 연결 후 보행·착석·이모트·표정 적용과 만료 원복을 수행한다", () => {
    const node = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const vrmScene = new THREE.Group();
    const { vrm, bones, setValue, update } = createMockVrm();
    vrmScene.add(
      bones.leftUpperArm,
      bones.rightUpperArm,
      bones.leftLowerArm,
      bones.rightLowerArm,
      bones.leftUpperLeg,
      bones.rightUpperLeg,
    );
    applyNaturalVrmPosture(node, vrmScene, vrm);
    expect(node.vrm).toBe(vrm);
    expect(node.vrmLeftUpperArm).toBe(bones.leftUpperArm);
    expect(node.vrmLeftLowerArm).toBe(bones.leftLowerArm);
    expect(node.vrmRightLowerArm).toBe(bones.rightLowerArm);
    expect(node.vrmLeftUpperLeg).toBe(bones.leftUpperLeg);
    expect(node.vrmRightUpperLeg).toBe(bones.rightUpperLeg);

    // 1. 이동 중 보행 스윙 + 팔꿈치 보조 회전
    node.moving = true;
    applyStudioThreeActorPose(node, 150, 0.016);
    expect(node.leftLeg.rotation.x).not.toBe(0);
    expect(bones.leftUpperLeg.rotation.x).not.toBe(0);
    expect(bones.leftLowerArm.rotation.x).toBeGreaterThan(0);
    expect(update).toHaveBeenCalledWith(0.016);

    // 2. 착석 자세 (node.seated && !node.moving)
    node.moving = false;
    node.seated = true;
    applyStudioThreeActorPose(node, 300, 0.016);
    expect(node.leftLeg.rotation.x).toBeCloseTo(-1.35);
    expect(node.rightLeg.rotation.x).toBeCloseTo(-1.35);
    expect(bones.leftUpperLeg.rotation.x).toBeCloseTo(-1.35);
    expect(bones.rightUpperLeg.rotation.x).toBeCloseTo(-1.35);
    expect(node.rigGroup.position.y).toBeCloseTo(-0.22);

    // 3. wave 이모트
    node.seated = false;
    triggerStudioThreeActorEmote(node, "wave", 1000, 2000);
    applyStudioThreeActorPose(node, 1200, 0.016);
    expect(node.rightArm.rotation.x).toBeLessThan(-1.5);
    expect(setValue).toHaveBeenCalledWith("happy", 0.85);

    // 4. hop / cheers 점프 바운스
    triggerStudioThreeActorEmote(node, "cheers", 2000, 2000);
    applyStudioThreeActorPose(node, 2100, 0.016);
    expect(node.rigGroup.position.y).toBeGreaterThan(0.03);
    expect(node.leftArm.rotation.x).toBeLessThan(-1.0);

    // 5. dance / kpop-dance / shuffle / moonwalk 리듬 바운스 및 회전
    for (const danceId of ["dance", "kpop-dance", "shuffle", "moonwalk"] as const) {
      triggerStudioThreeActorEmote(node, danceId, 3000, 4000);
      applyStudioThreeActorPose(node, 3150, 0.016);
      expect(node.rigGroup.position.y).toBeGreaterThan(0.01);
      expect(node.rigGroup.rotation.y).not.toBe(0);
    }

    // 6. think / yoga 고개·상체 기울기 및 relaxed 표정
    for (const calmId of ["think", "yoga"] as const) {
      triggerStudioThreeActorEmote(node, calmId, 4000, 3000);
      applyStudioThreeActorPose(node, 4200, 0.016);
      expect(node.rigGroup.rotation.z).not.toBe(0);
      expect(node.rigGroup.rotation.x).toBeGreaterThan(0);
      expect(setValue).toHaveBeenCalledWith("relaxed", 0.75);
    }

    // 7. 만료 시 원복
    applyStudioThreeActorPose(node, 8000, 0.016);
    expect(node.emoteId).toBeNull();
    expect(node.rigGroup.rotation.x).toBe(0);
    expect(node.rigGroup.rotation.y).toBe(0);
    expect(node.rigGroup.rotation.z).toBe(0);
    expect(setValue).toHaveBeenLastCalledWith("surprised", 0);
  });

  it("bridge.consumeEmote와 snapshot.peerReactions를 소비하여 3D 이모트와 동료 착석을 동기화한다", () => {
    const bridge = new StudioVirtualSpaceEngineBridge();
    bridge.requestEmote("kpop-dance");

    const selfNode = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const peerNode = createStylized3DCharacterNode("peer:s-2", 0x0ea5e9, false);
    const actorNodes = new Map([
      ["self", selfNode],
      ["peer:s-2", peerNode],
    ]);

    const snapshot = createBaseSnapshot({
      peers: [
        {
          participant: {
            sessionId: "s-2",
            displayName: "민지",
            role: "editor",
          },
          sequence: 1,
          lastSeen: 1000,
          state: {
            x: 820,
            y: 900,
            zoneId: "lobby",
            facing: "down",
            activity: "available",
            moving: false,
            avatarIndex: 1,
            emote: "sit",
          },
        },
      ],
      peerReactions: [
        { sessionId: "s-2", reaction: "cheers", expiresAt: Date.now() + 3000 },
      ],
    });

    consumeAndSyncStudioThreeEmotes({
      bridge,
      snapshot,
      selfNode,
      actorNodes,
      now: 500,
    });

    // bridge에서 즉시 소비되어 2D 전환 시 재발화하지 않는다.
    expect(bridge.consumeEmote()).toBeNull();
    expect(selfNode.emoteId).toBe("kpop-dance");
    expect(selfNode.emoteUntil).toBeGreaterThan(500);
    expect(peerNode.seated).toBe(true);
    expect(peerNode.emoteId).toBe("cheers");
  });

  it("카메라 오빗 회전 키([, ], Q, E)가 상호작용 대상 유무에 따라 정확히 동작한다", () => {
    expect(isStudioThreeCameraOrbitKey("KeyQ")).toBe(true);
    expect(isStudioThreeCameraOrbitKey("KeyE")).toBe(true);
    expect(isStudioThreeCameraOrbitKey("BracketLeft")).toBe(true);
    expect(isStudioThreeCameraOrbitKey("BracketRight")).toBe(true);
    expect(isStudioThreeCameraOrbitKey("KeyW")).toBe(false);

    // 근처에 상호작용 대상이 없을 때 KeyE는 우회전
    expect(
      computeStudioThreeCameraOrbitDelta({
        keysDown: new Set(["KeyE"]),
        dt: 0.1,
        closestInteraction: null,
        nearbyNpcCount: 0,
      }),
    ).toBeCloseTo(0.145);

    // 근처에 상호작용 대상이나 NPC가 있을 때 KeyE는 카메라를 돌리지 않음
    expect(
      computeStudioThreeCameraOrbitDelta({
        keysDown: new Set(["KeyE"]),
        dt: 0.1,
        closestInteraction: { id: "desk" },
        nearbyNpcCount: 0,
      }),
    ).toBe(0);
    expect(
      computeStudioThreeCameraOrbitDelta({
        keysDown: new Set(["KeyE"]),
        dt: 0.1,
        closestInteraction: null,
        nearbyNpcCount: 1,
      }),
    ).toBe(0);

    // BracketLeft([)와 BracketRight(])는 상호작용 대상이 있어도 언제든 회전 가능
    expect(
      computeStudioThreeCameraOrbitDelta({
        keysDown: new Set(["BracketLeft"]),
        dt: 0.1,
        closestInteraction: { id: "desk" },
        nearbyNpcCount: 2,
      }),
    ).toBeCloseTo(-0.145);
    expect(
      computeStudioThreeCameraOrbitDelta({
        keysDown: new Set(["BracketRight"]),
        dt: 0.1,
        closestInteraction: { id: "desk" },
        nearbyNpcCount: 2,
      }),
    ).toBeCloseTo(0.145);
  });

  it("조명 프리셋별 fillLight 강도를 갱신하고 sessionStorage에 보존·복원한다", () => {
    expect(studioThreeFillLightIntensity("day")).toBe(0.35);
    expect(studioThreeFillLightIntensity("studio")).toBe(0.6);
    expect(studioThreeFillLightIntensity("night")).toBe(0.22);

    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    };

    expect(readStoredStudioThreeLightingPreset("day", mockStorage)).toBe("day");
    writeStoredStudioThreeLightingPreset("night", mockStorage);
    expect(store.get(STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY)).toBe("night");
    expect(readStoredStudioThreeLightingPreset("day", mockStorage)).toBe("night");

    const scene = new THREE.Scene();
    const renderer = { toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;
    const hemi = new THREE.HemisphereLight();
    const dir = new THREE.DirectionalLight();
    const fill = new THREE.DirectionalLight();
    const pipeline: StudioThreeChromePostPipeline = {
      render: vi.fn(),
      setSize: vi.fn(),
      setBloomStrength: vi.fn(),
      dispose: vi.fn(),
    };

    applyStudioLightingPresetToScene("studio", scene, renderer, hemi, dir, pipeline, fill);
    expect(fill.intensity).toBe(0.6);
    applyStudioLightingPresetToScene("night", scene, renderer, hemi, dir, pipeline, fill);
    expect(fill.intensity).toBe(0.22);
    applyStudioLightingPresetToScene("day", scene, renderer, hemi, dir, pipeline, fill);
    expect(fill.intensity).toBe(0.35);
  });

  it("실시간 리액션·채팅 말풍선·타이핑을 3D 오버레이 배지로 즉시 투영한다", () => {
    const baseState = createBaseSnapshot().self;
    expect(
      formatParticipantOverlayBadge(baseState, false, "3D 아바타", "3D Avatar", {
        reactionId: "kpop-dance",
      }),
    ).toEqual({
      sublabel: "🕺 아이돌 군무",
      accent: "#10b981",
    });

    expect(
      formatParticipantOverlayBadge(baseState, false, "3D 아바타", "3D Avatar", {
        chatBubbleText: "3D 스테이지 최고!",
      }),
    ).toEqual({
      sublabel: "💬 3D 스테이지 최고!",
      accent: "#10b981",
    });

    expect(
      formatParticipantOverlayBadge(baseState, false, "3D 아바타", "3D Avatar", {
        chatTyping: true,
      }),
    ).toEqual({
      sublabel: "💬 입력 중...",
      accent: "#10b981",
    });

    const camera = new THREE.PerspectiveCamera(36, 800 / 600, 0.5, 220);
    const selfNode = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const selfPos3 = worldToThree({ x: 780, y: 900 }, 0);
    selfNode.group.position.copy(selfPos3);
    camera.position.set(selfPos3.x, 10.8, selfPos3.z + 12.8);
    camera.lookAt(selfPos3.x, 1.05, selfPos3.z - 0.9);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const peerNode = createStylized3DCharacterNode("peer:p-1", 0x0ea5e9, false);
    peerNode.group.position.copy(worldToThree({ x: 800, y: 900 }, 0));
    const actorNodes = new Map([
      ["self", selfNode],
      ["peer:p-1", peerNode],
    ]);

    const nowWall = Date.now();
    const snapshot = createBaseSnapshot({
      selfReaction: "cheers",
      selfChatBubble: { sessionId: "self", text: "마감 완료!", expiresAt: nowWall + 5000 },
      peers: [
        {
          participant: {
            sessionId: "p-1",
            displayName: "동료작가",
            role: "editor",
          },
          sequence: 1,
          lastSeen: nowWall,
          state: {
            x: 800,
            y: 900,
            zoneId: "lobby",
            facing: "down",
            activity: "available",
            moving: false,
            avatarIndex: 2,
          },
        },
      ],
      peerReactions: [{ sessionId: "p-1", reaction: "moonwalk", expiresAt: nowWall + 5000 }],
    });

    const overlays = projectStudioThreeOverlays({
      width: 800,
      height: 600,
      camera,
      selfNode,
      actorNodes,
      snapshot,
      currentPoint: { x: 780, y: 900 },
      manifest: DEFAULT_STUDIO_WORLD_MANIFEST,
      allInteractions: studioWorldInteractions(DEFAULT_STUDIO_WORLD_MANIFEST),
      roomSigns: studioThreeRoomSigns(DEFAULT_STUDIO_WORLD_MANIFEST),
      selfLabel: "나",
      isEn: false,
      closestInteraction: null,
    });

    const selfOverlay = overlays.find((item) => item.id === "self");
    const peerOverlay = overlays.find((item) => item.id === "peer:p-1");
    expect(selfOverlay?.sublabel).toBe("💬 마감 완료!");
    expect(peerOverlay?.sublabel).toBe("🕴️ 문워크 슬라이드");
  });
});
