// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyCameraFocalLengthToCamera,
  applyEyeballHighlightSettingsToVrm,
  applyFrontLightLockToScene,
  CHARACTER_GENRE_STARTERS,
  computeOriginalCostumeHiddenKeysForWardrobe,
  computeShaperBodyMetrics,
  deriveHarmoniousHairTipColor,
  focalLengthMmToVerticalFovDeg,
  resolveHairCommitPatch,
  sampleOriginalVrmHairColors,
  syncCustomAttachmentQuality,
} from "./character-shaper-custom-quality";
import { createCharacterCapabilityProfile } from "./character-shaper-capability";
import { findCharacterSlotEntry } from "./character-shaper-catalog";
import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import {
  applyHairSpringBoneToVrm,
  applyShaperMtoonUniformsToVrm,
  DEFAULT_SHAPER_MTOON_SETTINGS,
  resetShaperMtoonUniformsOnVrm,
} from "./character-shaper-mtoon-uniforms";
import { CharacterShaperCameraControls } from "./CharacterShaperCameraControls";
import { CharacterShaperGenreStarters } from "./CharacterShaperGenreStarters";
import { CharacterShaperInspector } from "./CharacterShaperInspector";
import { CharacterShaperSessionSettingsProvider } from "./CharacterShaperSessionSettingsProvider";
import { useCharacterShaperSessionSettings } from "./character-shaper-session-settings";
import { CHARACTER_SHAPER_DESKTOP_QUERY } from "./character-shaper-ui-model";
import { StudioCharacterShaperDialog } from "./StudioCharacterShaperDialog";

import type {
  CharacterCapabilityProfile,
  CharacterHostSnapshot,
  CharacterRecipe,
  CharacterSlotAvailability,
  CharacterSlotCatalog,
} from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

vi.mock("./character-shaper-preview", () => ({
  CharacterSlotPreview: () => <svg data-testid="preview" aria-hidden />,
}));
vi.mock("../vrm/StudioVrmPoserViewport", () => ({
  StudioVrmPoserViewport: () => <div data-testid="viewport" />,
}));

afterEach(cleanup);

function makeFakeMtoonMaterial(name: string, outlineWidthFactor = 0.002) {
  return Object.assign(new THREE.MeshBasicMaterial({ name }), {
    isMToonMaterial: true,
    shadingToonyFactor: 0.9,
    shadingShiftFactor: -0.05,
    parametricRimLiftFactor: 0.1,
    parametricRimFresnelPowerFactor: 4,
    rimLightingMixFactor: 0.3,
    outlineWidthFactor,
    outlineLightingMixFactor: 0.5,
    shadeColorFactor: new THREE.Color("#b08a84"),
    parametricRimColorFactor: new THREE.Color("#ffffff"),
    outlineColorFactor: new THREE.Color("#1c1917"),
  });
}

function makeBinding(): CharacterShaperBinding {
  const slots = Object.fromEntries(
    CHARACTER_SLOT_KINDS.map((slot) => [slot, slot === "accessory" ? [] : null]),
  ) as unknown as CharacterRecipe["slots"];
  const recipe: CharacterRecipe = {
    version: 1,
    slots,
    colors: { skin: null, hairBase: "#221a20", hairTip: "#4a3f47", iris: "#4a3328", top: null, bottom: null, shoes: null },
    handSide: "both",
  };
  const catalog: CharacterSlotCatalog = {
    version: 1,
    slots: [
      { id: "face-shape", label: "얼굴형", labelEn: "Face", hint: "두상", group: "identity", icon: "ScanFace", multi: false },
      { id: "irises", label: "눈동자", labelEn: "Irises", hint: "홍채", group: "identity", icon: "Aperture", multi: false },
      { id: "hair", label: "헤어", labelEn: "Hair", hint: "헤어", group: "identity", icon: "Scissors", multi: false },
      { id: "expression", label: "표정", labelEn: "Expression", hint: "표정", group: "performance", icon: "Laugh", multi: false },
      { id: "pose", label: "포즈", labelEn: "Pose", hint: "포즈", group: "performance", icon: "Move", multi: false },
    ],
    entries: [],
  };
  const snapshot: CharacterHostSnapshot = {
    forgeFace: { headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 },
    semanticMorphs: {},
    hairStyle: "bob",
    hairBangStyle: "full",
    hairReplaceOriginal: true,
    hairBaseColor: "#221a20",
    hairTipColor: "#4a3f47",
    proportionPresetId: "webtoon-7",
    bodyPresetId: "balanced",
    wardrobe: {},
    propIds: [],
    activePoseId: null,
    activeExpressionId: null,
    expressionWeights: {},
    customColors: {},
    irisColor: "#4a3328",
    handSide: "both",
    lastHandPoseType: null,
  };
  return {
    catalog,
    profile: {
      status: "ready",
      modelId: "hero-1",
      modelName: "히어로 1",
      humanoid: true,
      semanticMorphs: {} as CharacterCapabilityProfile["semanticMorphs"],
      expressions: ["happy", "angry", "sad"],
      costumeSlots: ["tops", "bottoms", "shoes"],
      wardrobeMetricsReady: true,
      propsReady: true,
      irisTintable: true,
      originalHairMeshCount: 2,
      surfacePaintReady: true,
    },
    snapshot,
    recipe,
    baselineRecipe: recipe,
    history: { canUndo: false, canRedo: false, recentLabels: [], length: 0 },
    busyReason: null,
    handSide: "both",
    compareActive: false,
    evaluate: vi.fn((): CharacterSlotAvailability => ({ status: "available", reason: null, missing: [] })),
    plan: vi.fn(),
    commitPreset: vi.fn(),
    commit: vi.fn(),
    clear: vi.fn(() => null),
    remove: vi.fn(() => null),
    setHandSide: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    setCompareActive: vi.fn(),
    resetToBaseline: vi.fn(),
    commitFaceParams: vi.fn(),
    commitSemanticMorphs: vi.fn(),
    commitHairParams: vi.fn(),
    commitColor: vi.fn(),
  };
}

function assertAllControlsNamed(): void {
  const unnamed = Array.from(
    document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button]"),
  ).filter((el) => !(
    el.getAttribute("aria-label")
    || el.getAttribute("aria-labelledby")
    || el.getAttribute("title")
    || (el as HTMLInputElement).placeholder
    || el.textContent?.trim()
  ));
  expect(unnamed.map((el) => `${el.tagName.toLowerCase()}.${el.className}`)).toEqual([]);
}

describe("#236 커스텀 3D 품질 일관성 & #234 SHAPER REA 완전 내재화 검증", () => {
  it("비-MToon 커스텀 헤어·의상·소품의 플라스틱 광택·flatShading·색공간·그림자를 본체 톤에 맞게 보정한다", () => {
    const root = new THREE.Group();
    const hairMat = new THREE.MeshStandardMaterial({ name: "CustomHairStrand", roughness: 0.2, metalness: 0.35, flatShading: true });
    hairMat.map = new THREE.Texture();
    hairMat.map.colorSpace = THREE.NoColorSpace;
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(), hairMat);
    hairMesh.name = "avatar-forge-hair-back";
    hairMesh.castShadow = false;

    const metalMat = new THREE.MeshStandardMaterial({ name: "SwordBladeMetal", roughness: 0.25, metalness: 0.9 });
    const swordMesh = new THREE.Mesh(new THREE.BoxGeometry(), metalMat);
    swordMesh.name = "prop:sword";

    const sourceMaterial = new THREE.MeshStandardMaterial({ roughness: 0.21, flatShading: true });
    const sourceHair = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial);
    sourceHair.name = "Hair"; // 원본 VRM에 포함된 머리카락
    root.add(hairMesh, swordMesh, sourceHair);

    const synced = syncCustomAttachmentQuality([root], DEFAULT_SHAPER_MTOON_SETTINGS);
    expect(synced.harmonizedMaterials).toBe(2);
    expect(synced.smoothShadedMeshes).toBe(1);
    expect(synced.srgbMapsNormalized).toBe(1);
    expect(hairMat.roughness).toBeGreaterThanOrEqual(0.58);
    expect(hairMat.metalness).toBeLessThanOrEqual(0.12);
    expect(hairMat.flatShading).toBe(false);
    expect(hairMat.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(hairMesh.castShadow).toBe(true);
    expect(hairMesh.receiveShadow).toBe(true);
    // 금속 소품은 고유 금속 광택을 보존한다
    expect(metalMat.metalness).toBe(0.9);
    expect(metalMat.roughness).toBe(0.25);
    expect(sourceMaterial.roughness).toBe(0.21);
    expect(sourceMaterial.flatShading).toBe(true);
    const version = hairMat.version;
    syncCustomAttachmentQuality([root, hairMesh], DEFAULT_SHAPER_MTOON_SETTINGS);
    expect(hairMat.version).toBe(version);
  });

  it("SHAPER Toon ↔ Modeling 셰이더 토글, _ShadeColor/_RLightColor/외곽선 배율 적용과 원복, SpringBone hitRadius 하한을 검증한다", () => {
    const scene = new THREE.Group();
    const skinMat = makeFakeMtoonMaterial("BodySkin", 0.002);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), skinMat);
    mesh.name = "Body";
    scene.add(mesh);

    applyShaperMtoonUniformsToVrm({ scene }, {
      ...DEFAULT_SHAPER_MTOON_SETTINGS,
      shaderMode: "toon",
      shadeColorHex: "#9da8c4",
      rimColorHex: "#d9ecff",
      outlineColorHex: "#2b3048",
      outlineScale: 1.5,
    });
    expect(skinMat.shadeColorFactor.getHexString()).toBe("9da8c4");
    expect(skinMat.parametricRimColorFactor.getHexString()).toBe("d9ecff");
    expect(skinMat.outlineColorFactor.getHexString()).toBe("2b3048");
    expect(skinMat.outlineWidthFactor).toBeGreaterThan(0.003);

    applyShaperMtoonUniformsToVrm({ scene }, {
      ...DEFAULT_SHAPER_MTOON_SETTINGS,
      shaderMode: "modeling",
    });
    expect(skinMat.shadingToonyFactor).toBe(0.25);
    expect(skinMat.outlineWidthFactor).toBe(0);

    resetShaperMtoonUniformsOnVrm({ scene });
    expect(skinMat.shadingToonyFactor).toBe(0.9);
    expect(skinMat.outlineWidthFactor).toBe(0.002);
    expect(skinMat.shadeColorFactor.getHexString()).toBe("b08a84");

    const hairJoint = { bone: { name: "HairBack_01" }, settings: { stiffness: 1, gravityPower: 0.2, dragForce: 0.4, hitRadius: 0 } };
    const updated = applyHairSpringBoneToVrm({ springBoneManager: { joints: [hairJoint] } }, { stiffness: 1.4, gravityPower: 0.5, dragForce: 0.35 });
    expect(updated).toBe(1);
    expect(hairJoint.settings.hitRadius).toBeGreaterThanOrEqual(0.015);
  });

  it("이중 헤어 겹침 방지(resolveHairCommitPatch)와 이중 의상 겹침 방지(computeOriginalCostumeHiddenKeysForWardrobe)가 동작한다", () => {
    expect(resolveHairCommitPatch({ style: "ponytail" }, { style: "none", replaceOriginal: false }))
      .toEqual({ style: "ponytail", replaceOriginal: true });
    expect(resolveHairCommitPatch({ style: "ponytail", replaceOriginal: false }, { style: "none", replaceOriginal: false }))
      .toEqual({ style: "ponytail", replaceOriginal: false });
    expect(resolveHairCommitPatch({ style: "none" }, { style: "bob", replaceOriginal: true }))
      .toEqual({ style: "none" });

    const meshes = [
      { key: "Tops_Orig", slot: "tops" as const },
      { key: "Onepiece_Orig", slot: "onepiece" as const },
      { key: "Bottoms_Orig", slot: "bottoms" as const },
      { key: "Shoes_Orig", slot: "shoes" as const },
    ];
    const afterEquipTop = computeOriginalCostumeHiddenKeysForWardrobe({
      currentHidden: [],
      costumeMeshes: meshes,
      changedSlot: "top",
      nextWardrobe: { top: { itemId: "shirt", color: "#ffffff", fit: 1, fitMode: "auto", fabricId: "cotton" } },
    });
    expect(afterEquipTop).toEqual(["Tops_Orig", "Onepiece_Orig"]);

    const afterUnequipTop = computeOriginalCostumeHiddenKeysForWardrobe({
      currentHidden: afterEquipTop,
      costumeMeshes: meshes,
      changedSlot: "top",
      nextWardrobe: {},
    });
    expect(afterUnequipTop).toEqual([]);
  });

  it("SHAPER 초점거리(24~135mm) FOV 변환·정면광 고정·안구 하이라이트·신장/등신비 계산이 정확하다", () => {
    expect(focalLengthMmToVerticalFovDeg(24)).toBeCloseTo(53.1, 1);
    expect(focalLengthMmToVerticalFovDeg(50)).toBeCloseTo(27.0, 1);
    expect(focalLengthMmToVerticalFovDeg(135)).toBeCloseTo(10.2, 1);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.5, 2.2);
    const spyProj = vi.spyOn(camera, "updateProjectionMatrix");
    const nextFov = applyCameraFocalLengthToCamera(camera, 85);
    expect(nextFov).toBeCloseTo(16.1, 1);
    expect(camera.fov).toBeCloseTo(16.1, 1);
    expect(spyProj).toHaveBeenCalledTimes(1);

    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight("#ffffff", 1.2);
    light.position.set(3, 4, 5);
    scene.add(light);
    expect(applyFrontLightLockToScene(scene, camera.position, true)).toBe(1);
    expect(light.position.x).toBeCloseTo(0.25, 2);
    expect(applyFrontLightLockToScene(scene, camera.position, false)).toBe(1);
    expect(light.position.x).toBeCloseTo(3, 2);

    const metrics = computeShaperBodyMetrics({ overallHeight: 1.05, headBodyRatio: 1.1 });
    expect(metrics.heightCm).toBe(173);
    expect(metrics.headRatio).toBe(7.7);

    const vrmGroup = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ name: "Eye_Highlight_Mat", opacity: 1 });
    const eyeMesh = new THREE.Mesh(new THREE.PlaneGeometry(), eyeMat);
    eyeMesh.name = "EyeHighlight";
    vrmGroup.add(eyeMesh);
    expect(applyEyeballHighlightSettingsToVrm({ scene: vrmGroup }, { mode: "light", offsetX: 0.1, offsetY: -0.1, alpha: 0.65 })).toBe(1);
    expect(eyeMat.opacity).toBeCloseTo(0.65, 2);
  });

  it("초보자 장르별 바로 시작, 카메라 초점거리·정면광, 인스펙터 신규 컨트롤이 동작하고 aria-label 누락이 0건이다", () => {
    const binding = makeBinding();
    render(
      <CharacterShaperSessionSettingsProvider gazeAvailable>
        <CharacterShaperGenreStarters binding={binding} disabled={false} />
      </CharacterShaperSessionSettingsProvider>,
    );
    expect(CHARACTER_GENRE_STARTERS).toHaveLength(6);
    assertAllControlsNamed();
    fireEvent.click(screen.getByTestId("shaper-genre-starter-rofan-noble"));
    expect(binding.commitFaceParams).toHaveBeenCalled();
    expect(binding.commitHairParams).toHaveBeenCalledWith(expect.objectContaining({ replaceOriginal: true }), expect.any(String));
    expect(binding.commitColor).toHaveBeenCalledWith("skin", "#f9e4d6");
    cleanup();

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const scene = new THREE.Scene();
    scene.add(new THREE.DirectionalLight("#ffffff", 1));
    const invalidateViewport = vi.fn();
    const host = {
      status: "ready",
      activeCameraId: "front",
      setActiveCameraId: vi.fn(),
      invalidateViewport,
      captureRef: { current: { camera, scene } },
      vrm: { scene: new THREE.Group(), lookAt: { yaw: 0, pitch: 0 } },
      avatarForgeState: {
        version: 4,
        bodyPresetId: "balanced",
        face: { headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 },
        proportions: { version: 1, overallHeight: 1, headBodyRatio: 1, armLength: 1, legLength: 1, torsoLength: 1, shoulderWidth: 1, handScale: 1, footScale: 1, neckLength: 1 },
        body: { shoulderWidth: 1, torsoLength: 1, hipWidth: 1, armLength: 1, legLength: 1 },
        hair: { style: "bob", bangStyle: "full", baseColor: "#221a20", tipColor: "#4a3f47", length: 1, volume: 1, strandWidth: 1, curl: 0, wave: 0, shine: 0.5, ahoge: 0, fringe: 0.5, replaceOriginal: true },
      },
      availableExpressionActions: [
        { id: "happy", label: "기쁨", name: "happy", tone: "밝음" },
        { id: "angry", label: "화남", name: "angry", tone: "강함" },
      ],
      expressionWeights: { happy: 0.5 },
      updateExpressionWeight: vi.fn(),
      customBones: {},
      setCustomBones: vi.fn(),
      bodyRotation: 0,
      handleBodyRotationChange: vi.fn(),
      handleMirrorPose: vi.fn(),
      handleResetActivePose: vi.fn(),
      handleSavePose: vi.fn(),
    } as unknown as StudioVrmPoserHost;

    render(
      <CharacterShaperSessionSettingsProvider gazeAvailable>
        <CharacterShaperCameraControls h={host} compact />
      </CharacterShaperSessionSettingsProvider>,
    );
    assertAllControlsNamed();
    const extrasToggle = screen.getByTestId("shaper-camera-extras-toggle");
    const extrasPanel = document.querySelector<HTMLElement>('[data-character-camera-selects="true"]')!;
    expect(extrasToggle.getAttribute("aria-expanded")).toBe("false");
    expect(extrasPanel.getAttribute("data-compact-extras-open")).toBe("false");
    expect(extrasPanel.classList.contains("hidden")).toBe(true);
    fireEvent.click(extrasToggle);
    expect(extrasToggle.getAttribute("aria-expanded")).toBe("true");
    expect(extrasPanel.getAttribute("data-compact-extras-open")).toBe("true");
    expect(extrasPanel.classList.contains("hidden")).toBe(false);
    fireEvent.change(screen.getByTestId("shaper-camera-focal-select"), { target: { value: "85" } });
    expect(camera.fov).toBeCloseTo(16.1, 1);
    const cameraStyleSelect = screen.getByTestId("shaper-camera-style-select") as HTMLSelectElement;
    const unityOption = Array.from(cameraStyleSelect.options).find((option) => option.value === "unity");
    expect(unityOption?.textContent).toBe("기본 · 우클릭 회전");
    expect(cameraStyleSelect.className).toContain("md:max-w-[12.5rem]");
    fireEvent.click(screen.getByTestId("shaper-front-light-toggle"));
    expect(screen.getByTestId("shaper-front-light-toggle").getAttribute("aria-pressed")).toBe("true");
    cleanup();

    const { rerender } = render(
      <CharacterShaperSessionSettingsProvider gazeAvailable>
        <CharacterShaperInspector h={host} binding={binding} slot="irises" hoveredEntryId={null} />
      </CharacterShaperSessionSettingsProvider>,
    );
    expect(screen.getByTestId("shaper-eyeball-highlight-controls")).toBeTruthy();
    assertAllControlsNamed();

    rerender(
      <CharacterShaperSessionSettingsProvider gazeAvailable>
        <CharacterShaperInspector h={host} binding={binding} slot="expression" hoveredEntryId={null} />
      </CharacterShaperSessionSettingsProvider>,
    );
    expect(screen.getByTestId("shaper-expression-mixer-bar")).toBeTruthy();
    assertAllControlsNamed();

    rerender(
      <CharacterShaperSessionSettingsProvider gazeAvailable>
        <CharacterShaperInspector h={host} binding={binding} slot="pose" hoveredEntryId={null} />
      </CharacterShaperSessionSettingsProvider>,
    );
    expect(screen.getByTestId("shaper-pose-body-height").textContent).toContain("165cm");
    fireEvent.click(screen.getByTestId("shaper-pose-bind-a"));
    expect(host.setCustomBones).toHaveBeenCalled();
    assertAllControlsNamed();

    rerender(
      <CharacterShaperSessionSettingsProvider gazeAvailable>
        <CharacterShaperInspector h={host} binding={binding} slot="face-shape" hoveredEntryId={null} />
      </CharacterShaperSessionSettingsProvider>,
    );
    fireEvent.click(screen.getByTestId("shaper-shader-mode-modeling"));
    expect(screen.getByTestId("shaper-shader-mode-modeling").getAttribute("aria-pressed")).toBe("true");
    assertAllControlsNamed();
  });

  it("원본 VRM 헤어 메시·텍스처에서 모발색을 샘플링하고 원본 유지 → 절차형 전환 시 조화로운 base/tip을 상속한다", () => {
    const scene = new THREE.Group();
    // 1) 솔리드 컬러 원본 헤어
    const hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#3b5d9a") });
    hairMat.name = "N00_000_Hair_00_HAIR";
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(), hairMat);
    hairMesh.name = "Head_4";

    // 외곽선·헤어 액세서리·생성 포지 헤어는 샘플링을 오염시키지 않아야 한다.
    const outlineMat = Object.assign(new THREE.MeshBasicMaterial({ color: new THREE.Color("#000000") }), {
      name: "N00_000_Hair_00_HAIR (Outline)",
      isOutline: true,
    });
    const outlineMesh = new THREE.Mesh(new THREE.BoxGeometry(), outlineMat);
    outlineMesh.name = "Head_4_Outline";

    const ribbonMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#ff0044") });
    ribbonMat.name = "HairAccessory_Ribbon";
    const ribbonMesh = new THREE.Mesh(new THREE.BoxGeometry(), ribbonMat);
    ribbonMesh.name = "HairAccessory_Ribbon";

    const forgeGroup = new THREE.Group();
    forgeGroup.userData.toonSpectrumAvatarForge = true;
    const forgeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#00ff00") });
    forgeMat.name = "Hair_Generated";
    forgeGroup.add(new THREE.Mesh(new THREE.BoxGeometry(), forgeMat));

    scene.add(hairMesh, outlineMesh, ribbonMesh, forgeGroup);
    const sampled = sampleOriginalVrmHairColors({ scene });
    expect(sampled).not.toBeNull();
    expect(sampled?.baseColor).toBe("#3b5d9a");
    expect(sampled?.tipColor).toBe(deriveHarmoniousHairTipColor("#3b5d9a"));
    expect(sampled?.tipColor).not.toBe("#3b5d9a");

    // 2) VRoid 스타일 흰색 factor + RGBA 텍스처 헤어
    const texData = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      texData[i * 4] = 0xc7;
      texData[i * 4 + 1] = 0x9b;
      texData[i * 4 + 2] = 0x4b;
      texData[i * 4 + 3] = 255;
    }
    const hairTex = new THREE.DataTexture(texData, 4, 4, THREE.RGBAFormat);
    const vroidHairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#ffffff"), map: hairTex });
    vroidHairMat.name = "HairBack_00_HAIR";
    const vroidScene = new THREE.Group();
    const vroidHairMesh = new THREE.Mesh(new THREE.BoxGeometry(), vroidHairMat);
    vroidHairMesh.name = "HairBack";
    vroidScene.add(vroidHairMesh);

    const vroidSampled = sampleOriginalVrmHairColors({ scene: vroidScene });
    expect(vroidSampled?.baseColor).toBe("#c79b4b");

    // 3) capability profile에 originalHairColors 반영 및 resolveHairCommitPatch 상속 검증
    const profile = createCharacterCapabilityProfile({
      vrm: { scene: vroidScene } as unknown as Parameters<typeof createCharacterCapabilityProfile>[0]["vrm"],
      status: "ready",
      modelId: "vroid-blonde",
      modelName: "블론드",
      wardrobeMetricsReady: true,
      originalHairMeshCount: 1,
      surfacePaintReady: true,
    });
    expect(profile.originalHairColors?.baseColor).toBe("#c79b4b");

    const inheritedPatch = resolveHairCommitPatch(
      { style: "wavy" },
      { style: "none", replaceOriginal: false, baseColor: "#352a28", tipColor: "#6b5148" },
      profile.originalHairColors,
    );
    expect(inheritedPatch).toEqual({
      style: "wavy",
      replaceOriginal: true,
      baseColor: "#c79b4b",
      tipColor: vroidSampled!.tipColor,
    });

    // 사용자가 직접 고른 색은 덮어쓰지 않는다.
    const preservedPatch = resolveHairCommitPatch(
      { style: "wavy" },
      { style: "none", replaceOriginal: false, baseColor: "#9d174d", tipColor: "#fbcfe8" },
      profile.originalHairColors,
    );
    expect(preservedPatch).toEqual({ style: "wavy", replaceOriginal: true });
    hairTex.dispose();
  });

  it("다이얼로그에서 1280px 정밀 조절 버튼이 우측 줌 레일과 겹치지 않고(right-16 · min-h-11), 포즈 적용 시 gazeIntent가 실시간 반영된다", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === CHARACTER_SHAPER_DESKTOP_QUERY,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    try {
      const phonePose = findCharacterSlotEntry("pose:xp_phone_look")!;
      const wavePose = findCharacterSlotEntry("pose:xp_wave_greeting")!;
      const binding = makeBinding();
      const customBinding: CharacterShaperBinding = {
        ...binding,
        catalog: {
          ...binding.catalog,
          entries: [phonePose, wavePose],
        },
        commit: vi.fn((entry) => ({
          ok: true,
          plan: {
            entryId: entry.id,
            slot: entry.slot,
            label: entry.label,
            steps: [],
            availability: { status: "available" as const, reason: null, missing: [] },
          },
          reason: null,
        })),
      };
      const host = {
        status: "ready",
        dialogRef: { current: null },
        closeButtonRef: { current: null },
        vrm: { scene: new THREE.Group(), lookAt: { yaw: 0, pitch: 0 } },
        activeCameraId: "front",
        setActiveCameraId: vi.fn(),
        setTurntable: vi.fn(),
        setLightingTone: vi.fn(),
        setTransparentBackground: vi.fn(),
        zoomViewport: vi.fn(),
        handleViewReset: vi.fn(),
        handlePanelTabChange: vi.fn(),
        handleCharacterSectionChange: vi.fn(),
        onClose: vi.fn(),
        libraryEntries: [],
      } as unknown as StudioVrmPoserHost;

      function GazeObserver() {
        const settings = useCharacterShaperSessionSettings();
        return (
          <output data-testid="gaze-observer">
            {`${settings?.gazeMode}:${settings?.gazeOffset.yawDeg}:${settings?.gazeOffset.pitchDeg}`}
          </output>
        );
      }

      render(
        <CharacterShaperSessionSettingsProvider gazeAvailable>
          <GazeObserver />
          <StudioCharacterShaperDialog h={host} binding={customBinding} />
        </CharacterShaperSessionSettingsProvider>,
      );

      // 1) 정밀 조절 플로팅 버튼: 열림/닫힘 모두 right-16으로 우측 줌 레일(right-2)과 분리 + min-h-11 유지
      const inspectorToggle = screen.getByRole("button", { name: "정밀 조절" });
      expect(inspectorToggle.className).toContain("right-16");
      expect(inspectorToggle.className).toContain("min-h-11");
      expect(inspectorToggle.className).not.toContain("right-2");
      fireEvent.click(inspectorToggle);
      expect(inspectorToggle.getAttribute("aria-expanded")).toBe("false");
      expect(inspectorToggle.className).toContain("right-16");

      // 2) 포즈 탭에서 xp_phone_look 클릭 -> world + pitchDeg=-22, xp_wave_greeting 클릭 -> cam
      fireEvent.click(screen.getByRole("tab", { name: "포즈" }));
      const phoneBtn = document.querySelector<HTMLButtonElement>('[data-character-performance-entry="pose:xp_phone_look"]')
        ?? (() => {
          fireEvent.click(screen.getByRole("button", { name: "일상" }));
          return document.querySelector<HTMLButtonElement>('[data-character-performance-entry="pose:xp_phone_look"]')!;
        })();
      expect(phoneBtn).toBeTruthy();
      fireEvent.click(phoneBtn);
      expect(screen.getByTestId("gaze-observer").textContent).toBe("world:0:-22");

      const waveBtn = document.querySelector<HTMLButtonElement>('[data-character-performance-entry="pose:xp_wave_greeting"]')!;
      expect(waveBtn).toBeTruthy();
      fireEvent.click(waveBtn);
      expect(screen.getByTestId("gaze-observer").textContent).toBe("cam:4:2");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
