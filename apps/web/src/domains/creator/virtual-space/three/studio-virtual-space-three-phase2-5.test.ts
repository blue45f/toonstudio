// @vitest-environment jsdom
import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_WORLD_MANIFEST } from "../studio-virtual-space-world-manifest";
import { createStudioThreeDecorationsController } from "./studio-virtual-space-three-decorations";
import {
  clampStudioThreeCameraPitch,
  shouldHideSelfHeadForCameraMode,
  STUDIO_THREE_FIRST_PERSON_EYE_HEIGHT_M,
  STUDIO_THREE_FIRST_PERSON_SEATED_EYE_HEIGHT_M,
  StudioThreeFollowCamera,
} from "./studio-virtual-space-three-follow";
import { bindStudioThreeKeyboardInput } from "./studio-virtual-space-three-keyboard-input";
import { applyStudioThreeLightingState, computeStudioThreeLightingParameters } from "./studio-virtual-space-three-lighting";
import {
  applyStudioThreeActorPose,
  applyStudioThreeVisemeFrame,
  applyStudioThreeVrmExpression,
  STUDIO_THREE_VRM_CUSTOM_EXPRESSIONS,
  STUDIO_THREE_VRM_PRESET_EXPRESSIONS,
  updateStudioThreeActorAutoBlink,
  updateStudioThreeActorLookAt,
} from "./studio-virtual-space-three-motion";
import { bindStudioThreePointerInput } from "./studio-virtual-space-three-pointer-input";
import { applyNaturalVrmPosture, createStylized3DCharacterNode } from "./studio-virtual-space-three-scene";
import {
  applyStudioThreeActorGhostVisual,
  createStudioThreeProximityRing,
  createStudioThreeStuckDetector,
  findClickedPeerSessionId,
  mergeStudioThreeSeatAnchors,
} from "./studio-virtual-space-three-stage-features";
import {
  applyStudioThreeVrmaGesturePose,
  clearStudioThreeVrmaGestureCacheForTests,
  loadStudioThreeVrmaGesture,
  STUDIO_THREE_KIT_V2_GESTURES,
  STUDIO_THREE_KIT_V2_PUBLIC_BASE_URL,
} from "./studio-virtual-space-three-vrma-emotes";

function create14BoneMockVrm() {
  const setValue = vi.fn();
  const update = vi.fn();
  const lookAtFn = vi.fn();
  const bones: Record<string, THREE.Object3D> = {
    hips: new THREE.Object3D(),
    spine: new THREE.Object3D(),
    chest: new THREE.Object3D(),
    neck: new THREE.Object3D(),
    head: new THREE.Object3D(),
    leftUpperArm: new THREE.Object3D(),
    rightUpperArm: new THREE.Object3D(),
    leftLowerArm: new THREE.Object3D(),
    rightLowerArm: new THREE.Object3D(),
    leftUpperLeg: new THREE.Object3D(),
    rightUpperLeg: new THREE.Object3D(),
    leftLowerLeg: new THREE.Object3D(),
    rightLowerLeg: new THREE.Object3D(),
    rightIndexProximal: new THREE.Object3D(),
    rightThumbMetacarpal: new THREE.Object3D(),
  };
  bones.hips!.position.y = 0.92;
  const vrm = {
    humanoid: {
      getNormalizedBoneNode: vi.fn((name: string) => bones[name] ?? null),
      update: vi.fn(),
    },
    expressionManager: {
      setValue,
      getExpression: vi.fn(() => ({ name: "mock" })),
    },
    lookAt: {
      lookAt: lookAtFn,
      target: null,
    },
    update,
  } as unknown as VRM;
  return { vrm, bones, setValue, update, lookAtFn };
}

describe("3모드 카메라 · 포인터/핀치 · 단축키", () => {
  it("쿼터뷰·3인칭 숄더 오빗(피치 클램프)·1인칭 눈높이(1.52m/착석 1.12m)를 지원한다", () => {
    const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.2, 220);
    const follow = new StudioThreeFollowCamera(10, 10);

    follow.update(cam, 10, 10, 0, 1, 0, true, { mode: "first-person", pitch: 0.1, seated: false });
    expect(cam.position.y).toBeCloseTo(STUDIO_THREE_FIRST_PERSON_EYE_HEIGHT_M, 2);
    expect(shouldHideSelfHeadForCameraMode("first-person")).toBe(true);
    expect(shouldHideSelfHeadForCameraMode("third-person")).toBe(false);

    follow.update(cam, 10, 10, 0, 1, 0, true, { mode: "first-person", pitch: 0, seated: true });
    expect(cam.position.y).toBeCloseTo(STUDIO_THREE_FIRST_PERSON_SEATED_EYE_HEIGHT_M, 2);

    follow.update(cam, 10, 10, 0, 1, 0, true, { mode: "third-person", pitch: 5.0 });
    expect(clampStudioThreeCameraPitch("third-person", 5.0)).toBeLessThanOrEqual(0.95);
    expect(clampStudioThreeCameraPitch("third-person", -5.0)).toBeGreaterThanOrEqual(-0.35);
    expect(cam.position.y).toBeGreaterThanOrEqual(0.45);
    expect(cam.position.z).toBeGreaterThan(10);
  });

  it("모바일 단일 손가락 오빗·탭 이동과 두 손가락 핀치 줌을 충돌 없이 처리한다", () => {
    const canvas = document.createElement("canvas");
    const onOrbitDelta = vi.fn();
    const onPitchDelta = vi.fn();
    const onPinchZoomDelta = vi.fn();
    const onTap = vi.fn();
    const input = bindStudioThreePointerInput(canvas, { onOrbitDelta, onPitchDelta, onPinchZoomDelta, onTap });

    const touch = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const ev = new Event(type);
      Object.assign(ev, { pointerId, pointerType: "touch", button: 0, buttons: 1, clientX, clientY });
      canvas.dispatchEvent(ev);
    };

    try {
      // 단일 손가락 빠른 탭 → 이동
      touch("pointerdown", 1, 100, 100);
      touch("pointerup", 1, 102, 102);
      expect(onTap).toHaveBeenCalledTimes(1);

      // 단일 손가락 드래그 → 오빗 + 피치
      touch("pointerdown", 2, 100, 100);
      touch("pointermove", 2, 140, 120);
      touch("pointerup", 2, 140, 120);
      expect(onOrbitDelta).toHaveBeenCalled();
      expect(onPitchDelta).toHaveBeenCalled();
      expect(onTap).toHaveBeenCalledTimes(1);

      // 두 손가락 핀치 줌 → onPinchZoomDelta만 호출, 탭 미호출
      touch("pointerdown", 10, 100, 100);
      touch("pointerdown", 11, 200, 100);
      touch("pointermove", 11, 260, 100);
      touch("pointerup", 10, 100, 100);
      touch("pointerup", 11, 260, 100);
      expect(onPinchZoomDelta).toHaveBeenCalled();
      expect(onTap).toHaveBeenCalledTimes(1);
    } finally {
      input.dispose();
    }
  });

  it("단축키 1/2/3으로 카메라 모드를 전환하고 G로 고스트 모드를 토글한다", () => {
    const stage = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    stage.appendChild(canvas);
    document.body.appendChild(stage);
    const keys = new Set<string>();
    const onCameraMode = vi.fn();
    const onToggleGhost = vi.fn();
    const unbind = bindStudioThreeKeyboardInput(stage, keys, {
      stop: vi.fn(), home: vi.fn(), interact: vi.fn(), onCameraMode, onToggleGhost,
    });
    try {
      canvas.focus();
      for (const code of ["Digit1", "Digit2", "Digit3", "KeyG"]) {
        canvas.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
      }
      expect(onCameraMode.mock.calls.map(([m]) => m)).toEqual(["quarter", "third-person", "first-person"]);
      expect(onToggleGhost).toHaveBeenCalledTimes(1);
    } finally {
      unbind();
      stage.remove();
    }
  });
});

describe("실시간 시간대 조명 · 3D 가구/고정물 배치", () => {
  it("timeOfDayHours(정오/야간)·interiorDimmer·colorTemperatureK를 Three 광원에 실시간 반영한다", () => {
    const noon = computeStudioThreeLightingParameters({ timeOfDayHours: 12, interiorDimmer: 0.2 });
    const night = computeStudioThreeLightingParameters({ timeOfDayHours: 23, interiorDimmer: 0.9 });
    expect(noon.isNight).toBe(false);
    expect(night.isNight).toBe(true);
    expect(noon.keyIntensity).toBeGreaterThan(night.keyIntensity);
    expect(night.interiorPointIntensity).toBeGreaterThan(noon.interiorPointIntensity);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xffffff, 0.008);
    const renderer = { toneMappingExposure: 1 };
    const hemiLight = new THREE.HemisphereLight();
    const dirLight = new THREE.DirectionalLight();
    const fillLight = new THREE.DirectionalLight();
    const interiorPointLight = new THREE.PointLight();

    const applied = applyStudioThreeLightingState(
      { timeOfDayHours: 18.5, interiorDimmer: 0.75, colorTemperatureK: 3200 },
      { scene, renderer, hemiLight, dirLight, fillLight, interiorPointLight },
    );
    expect(applied.colorTemperatureK).toBe(3200);
    expect(interiorPointLight.visible).toBe(true);
    expect(interiorPointLight.intensity).toBeGreaterThan(1.5);
  });

  it("decorations와 placedFixtures를 바닥 스냅(Y=0)해 배치하고 dispose로 완전 정리한다", () => {
    const scene = new THREE.Scene();
    const controller = createStudioThreeDecorationsController(scene, null);
    controller.sync({
      decorations: {
        presetKey: "creator-garden",
        districtKey: "commons-market",
        presentationMode: "decorated",
        revision: 1,
        layoutWidth: 1280,
        layoutHeight: 960,
        placements: [
          { id: "d1", type: "sofa", x: 320, y: 240, rotation: 90, scale: 1 },
          { id: "d2", type: "lamp", x: 420, y: 280, rotation: 0, scale: 1.1 },
        ],
      },
      placedFixtures: [
        {
          objectId: "build:lamp@640,480",
          kind: "light-switch",
          point: { x: 640, y: 480 },
          anchor: { x: 640, y: 426, baseY: 480 },
          labelKo: "플로어 램프",
          labelEn: "Floor Lamp",
        },
      ],
      worldSize: { width: 3072, height: 1984 },
    });
    expect(controller.getPlacedCount()).toBe(3);
    expect(controller.group.children).toHaveLength(3);
    for (const child of controller.group.children) {
      const box = new THREE.Box3().setFromObject(child);
      expect(box.min.y).toBeCloseTo(0, 2);
    }
    controller.dispose();
    expect(controller.getPlacedCount()).toBe(0);
    expect(controller.group.parent).toBeNull();
  });
});

describe("14본 착석 무릎굴곡 · 호흡 · 18+8표정 · 눈깜빡임 · LookAt · 립싱크 · kit-v2 16 VRMA", () => {
  it("14본 바인딩 후 착석 시 무릎(+1.35rad)·허벅지(-1.35rad)·hips 하강 및 호흡·눈깜빡임·LookAt·립싱크가 동작한다", () => {
    const node = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const vrmScene = new THREE.Group();
    const { vrm, bones, setValue, lookAtFn } = create14BoneMockVrm();
    for (const bone of Object.values(bones)) vrmScene.add(bone);

    applyNaturalVrmPosture(node, vrmScene, vrm);
    expect(node.vrmHips).toBe(bones.hips);
    expect(node.vrmSpine).toBe(bones.spine);
    expect(node.vrmChest).toBe(bones.chest);
    expect(node.vrmNeck).toBe(bones.neck);
    expect(node.vrmHead).toBe(bones.head);
    expect(node.vrmLeftLowerLeg).toBe(bones.leftLowerLeg);
    expect(node.vrmRightLowerLeg).toBe(bones.rightLowerLeg);

    // 착석 포즈: 허벅지 -1.35rad + 무릎 +1.35rad + hips 하강
    node.seated = true;
    applyStudioThreeActorPose(node, 1000, 0.016);
    expect(bones.leftUpperLeg!.rotation.x).toBeCloseTo(-1.35);
    expect(bones.rightUpperLeg!.rotation.x).toBeCloseTo(-1.35);
    expect(bones.leftLowerLeg!.rotation.x).toBeCloseTo(1.35);
    expect(bones.rightLowerLeg!.rotation.x).toBeCloseTo(1.35);
    expect(bones.hips!.position.y).toBeCloseTo(0.92 - 0.32);

    // 18 프리셋 + 8 커스텀 표정 계약
    expect(STUDIO_THREE_VRM_PRESET_EXPRESSIONS).toHaveLength(18);
    expect(STUDIO_THREE_VRM_CUSTOM_EXPRESSIONS).toHaveLength(8);
    expect(applyStudioThreeVrmExpression(node, "wink", 0.9)).toBe(true);
    expect(setValue).toHaveBeenCalledWith("wink", 0.9);

    // 3~6초 지터 자동 눈깜빡임 (초기 상태 리셋 후 3000ms 뒤 블링크 피크 검증)
    node.nextBlinkAt = undefined;
    node.blinkStartedAt = undefined;
    node.blinkWasActive = false;
    const blinkStart = updateStudioThreeActorAutoBlink(node, 10_000, 0);
    expect(blinkStart).toBe(0);
    const blinkMid = updateStudioThreeActorAutoBlink(node, 13_070, 0);
    expect(blinkMid).toBeGreaterThan(0.8);
    expect(setValue).toHaveBeenCalledWith("blink", expect.any(Number));

    // LookAt 근접 대상 응시
    updateStudioThreeActorLookAt(node, new THREE.Vector3(1.5, 1.5, 2.0), 0.5);
    expect(lookAtFn).toHaveBeenCalled();
    expect(bones.head!.rotation.y).not.toBe(0);

    // 립싱크 Viseme 실시간 블렌드
    applyStudioThreeVisemeFrame(node, { aa: 0.7, ih: 0.2, ou: 0, ee: 0.1, oh: 0.4 });
    expect(setValue).toHaveBeenCalledWith("aa", 0.7);
    expect(setValue).toHaveBeenCalledWith("oh", 0.4);
  });

  it("toonstudio-kit-v2 16종 손포즈·제스처를 public URL 지연 fetch 및 프로시저럴 폴백으로 지원한다", async () => {
    clearStudioThreeVrmaGestureCacheForTests();
    expect(STUDIO_THREE_KIT_V2_GESTURES).toHaveLength(16);
    for (const gesture of STUDIO_THREE_KIT_V2_GESTURES) {
      expect(gesture.vrmaUrl.startsWith(`${STUDIO_THREE_KIT_V2_PUBLIC_BASE_URL}/gestures/`)).toBe(true);
      expect(gesture.vrmaUrl.endsWith(".vrma")).toBe(true);
    }

    // 404 시 안전하게 프로시저럴 폴백 반환
    const fallback = await loadStudioThreeVrmaGesture("finger-heart", {
      fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
      bypassCache: true,
    });
    expect(fallback?.source).toBe("procedural-fallback");

    // 정상 바이너리 수신 시 vrma-asset 반환
    const loaded = await loadStudioThreeVrmaGesture("thumbs-up", {
      fetchImpl: vi.fn(async () => new Response(new Uint8Array(64), { status: 200 })),
      bypassCache: true,
    });
    expect(loaded?.source).toBe("vrma-asset");
    expect(loaded?.vrmaBytes?.byteLength).toBe(64);

    // VRM 손가락·팔 본 프로시저럴 포즈 적용
    const node = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const { vrm, bones } = create14BoneMockVrm();
    node.vrm = vrm;
    node.vrmRightUpperArm = bones.rightUpperArm;
    node.vrmRightLowerArm = bones.rightLowerArm;
    expect(applyStudioThreeVrmaGesturePose(node, "finger-heart", 0.4)).toBe(true);
    expect(bones.rightUpperArm!.rotation.x).toBeLessThan(0);
    expect(bones.rightIndexProximal!.rotation.z).not.toBe(0);
  });

  it("피어 클릭 레이캐스트·고스트 반투명·근접 반경 링·막힘 감지·seatedActors 병합이 정상 동작한다", () => {
    const peer = createStylized3DCharacterNode("peer:s-42", 0x0ea5e9, false);
    peer.group.userData.peerSessionId = "s-42";
    peer.group.position.set(0, 0, -5);
    peer.group.updateMatrixWorld(true);
    const actorNodes = new Map([["peer:s-42", peer]]);

    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0, -1));
    expect(findClickedPeerSessionId(raycaster, actorNodes)).toBe("s-42");

    applyStudioThreeActorGhostVisual(peer, true);
    const firstMesh = peer.rigGroup.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect((firstMesh?.material as THREE.MeshStandardMaterial).opacity).toBeCloseTo(0.42);
    applyStudioThreeActorGhostVisual(peer, false);
    expect((firstMesh?.material as THREE.MeshStandardMaterial).opacity).toBe(1);

    const ring = createStudioThreeProximityRing(peer.group);
    ring.update(160);
    expect(ring.mesh.visible).toBe(true);
    expect(ring.mesh.scale.x).toBeCloseTo(5);
    ring.update(0);
    expect(ring.mesh.visible).toBe(false);
    ring.dispose();

    const detector = createStudioThreeStuckDetector(1.0);
    expect(detector.sample({ tryingToMove: true, point: { x: 100, y: 100 }, dt: 0.5, ghostMode: false }).stuck).toBe(false);
    expect(detector.sample({ tryingToMove: true, point: { x: 100, y: 100 }, dt: 0.6, ghostMode: false }).stuck).toBe(false);
    expect(detector.sample({ tryingToMove: true, point: { x: 100, y: 100 }, dt: 0.6, ghostMode: false }).stuck).toBe(true);
    expect(detector.sample({ tryingToMove: true, point: { x: 100, y: 100 }, dt: 0.1, ghostMode: true }).stuck).toBe(false);

    const anchors = mergeStudioThreeSeatAnchors({
      seatedActors: [{ id: "self", anchorPoint: { x: 300, y: 300 }, facing: "down" }],
      interactionSlots: DEFAULT_STUDIO_WORLD_MANIFEST.interactionSlots,
      architecture: null,
    });
    expect(anchors.some((a) => a.point.x === 300 && a.point.y === 300)).toBe(true);
  });
});
