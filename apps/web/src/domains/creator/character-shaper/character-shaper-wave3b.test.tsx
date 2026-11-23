// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveStudioVrmSurfaceLineColor,
  resolveStudioVrmSurfaceStrokePressure,
} from "../vrm/studio-vrm-surface-paint-tool";

import {
  applyDuoPosePackToPrimaryHost,
  CHARACTER_SHAPER_DUO_POSE_PACKS,
  createDefaultDuoSceneState,
  resolveDuoSceneActors,
} from "./character-shaper-duo-scene";
import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import { projectCharacterShaperDocument } from "./character-shaper-document-projection";
import {
  applyShaperMtoonUniformsToVrm,
  resetShaperMtoonUniformsOnVrm,
} from "./character-shaper-mtoon-uniforms";
import {
  collectCharacterSceneAttachmentRoots,
  resolveCharacterSemanticSceneInputs,
} from "./character-shaper-psd-scene-inputs";
import { CharacterShaperCameraControls } from "./CharacterShaperCameraControls";
import { CharacterShaperInspector } from "./CharacterShaperInspector";
import { CharacterShaperPaintHud } from "./CharacterShaperPaintHud";
import { CharacterShaperSessionSettingsProvider } from "./CharacterShaperSessionSettingsProvider";
import { installCharacterShaperGaze } from "./character-shaper-camera-runtime";

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
      { id: "hair", label: "헤어", labelEn: "Hair", hint: "헤어", group: "identity", icon: "Scissors", multi: false },
      { id: "body", label: "체형", labelEn: "Body", hint: "체형", group: "figure", icon: "Ruler", multi: false },
      { id: "top", label: "상의", labelEn: "Top", hint: "상의", group: "figure", icon: "Shirt", multi: false },
      { id: "pose", label: "포즈", labelEn: "Pose", hint: "포즈", group: "performance", icon: "Move", multi: false },
    ],
    entries: [],
  };
  const snapshot: CharacterHostSnapshot = {
    forgeFace: { headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 },
    semanticMorphs: {},
    hairStyle: "bob",
    hairBangStyle: "full",
    hairReplaceOriginal: false,
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
      expressions: ["happy"],
      costumeSlots: ["tops"],
      wardrobeMetricsReady: true,
      propsReady: true,
      irisTintable: true,
      originalHairMeshCount: 1,
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

describe("Wave V2-W3B Character Shaper 실연동 검증", () => {
  it("SHAPER 3차 MatCap · 외곽선 · 헤어 내선 억제를 실제 Three.js MToon 재질에 반영하고 원복한다", () => {
    const scene = new THREE.Group();
    const skinMat = makeFakeMtoonMaterial("Body_Skin", 0.002);
    const hairMat = makeFakeMtoonMaterial("Hair_Front", 0.002);
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(), skinMat);
    bodyMesh.name = "BodyMesh";
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(), hairMat);
    hairMesh.name = "HairMesh";
    scene.add(bodyMesh, hairMesh);

    const applied = applyShaperMtoonUniformsToVrm({ scene }, {
      shadePos: 0.7,
      shadeWidth: 0.2,
      rLightWidth: 0.6,
      outlinePressure: true,
      disableHairInline: true,
    });
    expect(applied.updatedMaterials).toBe(2);
    expect(applied.hairSuppressedMaterials).toBe(1);
    expect(skinMat.shadingToonyFactor).toBe(applied.uniforms.mtoonShadingToonyFactor);
    expect(hairMat.outlineWidthFactor).toBeLessThan(skinMat.outlineWidthFactor);
    expect(hairMat.userData.shaperHairInlineSuppressed).toBe(true);

    const restored = resetShaperMtoonUniformsOnVrm({ scene });
    expect(restored).toBe(2);
    expect(skinMat.shadingToonyFactor).toBe(0.9);
    expect(hairMat.outlineWidthFactor).toBe(0.002);
  });

  it("표면 드로잉 필압 모드(fake/real/none)와 선색 모드를 런타임 설정에 실전달한다", () => {
    expect(resolveStudioVrmSurfaceStrokePressure(0.4, 0.5, "none")).toBe(1);
    expect(resolveStudioVrmSurfaceStrokePressure(0.5, 0.5, "fake")).toBeCloseTo(1, 2);
    expect(resolveStudioVrmSurfaceStrokePressure(0.5, 0.04, "fake")).toBeLessThan(0.2);
    expect(resolveStudioVrmSurfaceStrokePressure(0.3, 0.5, "real")).toBeCloseTo(0.6, 2);
    expect(resolveStudioVrmSurfaceLineColor("baseHairColor", "#ffffff", { baseHairColor: "#221a20" })).toBe("#221a20");

    const onChange = vi.fn();
    const h = {
      texturePaintSettings: {
        tool: "surface-brush",
        brushKind: "ink",
        color: "#d85f48",
        sizeTexels: 48,
        opacity: 1,
        blend: "normal",
        fillScope: "contiguous",
        fillTolerance: 24,
        tuning: { flow: 1, hardness: 0.8, minSize: 0.2 },
      },
      avatarForgeState: { hair: { baseColor: "#221a20" } },
      customColors: { body: "#dca581" },
      handleTexturePaintSettingsChange: onChange,
    } as unknown as StudioVrmPoserHost;
    render(<CharacterShaperPaintHud h={h} onExit={vi.fn()} />);

    fireEvent.change(screen.getByTestId("shaper-paint-pressure-mode"), { target: { value: "none" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pressureMode: "none", tuning: { minSize: 1 } }));

    fireEvent.change(screen.getByTestId("shaper-paint-line-color-mode"), { target: { value: "baseHairColor" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ lineColorMode: "baseHairColor", color: "#221a20" }),
    );
  });

  it("시맨틱 PSD 씬 입력 수집기가 의상·소품 루트와 페인트 텍스처 프로바이더를 조립하고 정리한다", () => {
    const scene = new THREE.Scene();
    const garment = new THREE.Group();
    garment.name = "wardrobe:top:shirt";
    const prop = new THREE.Group();
    prop.name = "prop:glasses";
    const skinMat = new THREE.MeshBasicMaterial({ name: "SkinMat" });
    skinMat.userData.studioVrmMaterialLocator = "gltf-material:7";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), skinMat);
    mesh.name = "Face";
    scene.add(garment, prop, mesh);

    const roots = collectCharacterSceneAttachmentRoots(scene);
    expect(roots.garmentRoots).toHaveLength(1);
    expect(roots.propRoots).toHaveLength(1);

    const runtime = {
      exportPaintedTargets: () => ({
        ok: true,
        value: [{
          id: "t1",
          width: 2,
          height: 2,
          pixels: new Uint8ClampedArray(16).fill(255),
          bindings: [{ materialLocator: "gltf-material:7", textureSlot: "baseColor", bindingKey: "gltf-material-7-baseColor" }],
        }],
      }),
    };
    const inputs = resolveCharacterSemanticSceneInputs({ texturePaintRuntimeRef: { current: runtime } } as StudioVrmPoserHost, scene);
    const map = inputs.paintTextureProvider?.();
    expect(map?.get(skinMat)).toBeInstanceOf(THREE.DataTexture);
    inputs.dispose();
  });

  it("단일 44px 카메라 필 바에서 4모드 시선(cam/fix/light/world)과 3×3 시선 그리드가 동작한다", () => {
    const lookAt = { target: undefined as THREE.Object3D | undefined, autoUpdate: false, yaw: 0, pitch: 0, update: vi.fn() };
    const camera = new THREE.PerspectiveCamera();
    const lease = installCharacterShaperGaze(lookAt, camera);
    lease.update("light", false, { yawDeg: 18, pitchDeg: 14 });
    expect(lookAt.yaw).toBeGreaterThan(20);
    expect(lookAt.pitch).toBeGreaterThan(14);
    lease.update("world", false, { yawDeg: -18, pitchDeg: -14 });
    expect(lookAt.yaw).toBe(-18);
    expect(lookAt.pitch).toBe(-14);
    lease.release();

    const h = { status: "ready", activeCameraId: "front", setActiveCameraId: vi.fn(), vrm: { lookAt } } as StudioVrmPoserHost;
    render(
      <CharacterShaperSessionSettingsProvider gazeAvailable>
        <CharacterShaperCameraControls h={h} compact />
      </CharacterShaperSessionSettingsProvider>,
    );
    const select = screen.getByTestId("shaper-eyeball-tracking-select") as HTMLSelectElement;
    expect(Array.from(select.options).every((option) => !option.disabled)).toBe(true);
    fireEvent.click(screen.getByTestId("shaper-gaze-grid-toggle"));
    expect(screen.getByTestId("shaper-gaze-3x3-grid")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "시선 좌상" }));
    expect(select.value).toBe("world");
  });

  it("인스펙터에 두상 믹서·STC 안내·2D 체형 매트릭스·레이어드 의상·2인 포즈 씬·SpringBone이 정식 마운트된다", () => {
    const hairJoint = { bone: { name: "HairTail_01" }, settings: { stiffness: 1, gravityPower: 0.2, dragForce: 0.4 } };
    const binding = makeBinding();
    const h = {
      status: "ready",
      vrm: { scene: new THREE.Group(), springBoneManager: { joints: new Set([hairJoint]) } },
      avatarForgeState: {
        version: 4,
        bodyPresetId: "balanced",
        face: { headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 },
        proportions: { version: 1, overallHeight: 1, headBodyRatio: 1, armLength: 1, legLength: 1, torsoLength: 1, shoulderWidth: 1, handScale: 1, footScale: 1, neckLength: 1 },
        body: { shoulderWidth: 1, torsoLength: 1, hipWidth: 1, armLength: 1, legLength: 1 },
        hair: { style: "bob", bangStyle: "full", baseColor: "#221a20", tipColor: "#4a3f47", length: 1, volume: 1, strandWidth: 1, curl: 0, wave: 0, shine: 0.5, ahoge: 0, fringe: 0.5, replaceOriginal: false },
      },
      wardrobeState: {},
      costumeMeshes: [],
      costumeState: { hidden: [] },
      customBones: { hips: { rotation: [0, 0.5, 0] } },
      bodyRotation: 0,
      handleAvatarForgeChange: vi.fn(),
      handleBodyRotationChange: vi.fn(),
      handleMirrorPose: vi.fn(),
      handleResetActivePose: vi.fn(),
      handleSavePose: vi.fn(),
      handlePoseSelect: vi.fn(),
      setBodyRotation: vi.fn(),
      setActiveCameraId: vi.fn(),
      setCustomBones: vi.fn(),
      equipWardrobeItem: vi.fn(),
      updateWardrobeEquip: vi.fn(),
      recolorCostumeSlot: vi.fn(),
      toggleCostumeMesh: vi.fn(),
    } as unknown as StudioVrmPoserHost;

    const assertAllControlsNamed = () => {
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
    };

    const { rerender } = render(<CharacterShaperInspector h={h} binding={binding} slot="face-shape" hoveredEntryId={null} />);
    expect(screen.getByTestId("studio-3d-head-mixer-panel")).toBeTruthy();
    expect(screen.getByTestId("shaper-stc-guided-flow-mount")).toBeTruthy();
    assertAllControlsNamed();

    rerender(<CharacterShaperInspector h={h} binding={binding} slot="eyes" hoveredEntryId={null} />);
    assertAllControlsNamed();

    rerender(<CharacterShaperInspector h={h} binding={binding} slot="body" hoveredEntryId={null} />);
    expect(screen.getByTestId("studio-body-ratio-matrix-pad")).toBeTruthy();
    assertAllControlsNamed();

    rerender(<CharacterShaperInspector h={h} binding={binding} slot="top" hoveredEntryId={null} />);
    expect(screen.getByTestId("shaper-layered-outfit-overlay")).toBeTruthy();
    assertAllControlsNamed();

    rerender(<CharacterShaperInspector h={h} binding={binding} slot="hair" hoveredEntryId={null} />);
    expect(screen.getByTestId("shaper-hair-three-part-strip")).toBeTruthy();
    expect(screen.getByTestId("shaper-hair-springbone-controls")).toBeTruthy();
    assertAllControlsNamed();

    rerender(<CharacterShaperInspector h={h} binding={binding} slot="pose" hoveredEntryId={null} />);
    expect(screen.getByTestId("shaper-motion-scrubber")).toBeTruthy();
    expect(screen.getByTestId("shaper-duo-scene-panel")).toBeTruthy();
    assertAllControlsNamed();

    const duo = { ...createDefaultDuoSceneState(), enabled: true, activePackId: CHARACTER_SHAPER_DUO_POSE_PACKS[1]!.id };
    const actors = resolveDuoSceneActors(duo);
    expect(actors).toHaveLength(2);
    const applied = applyDuoPosePackToPrimaryHost(h, duo);
    expect(applied.partnerCount).toBe(1);
    expect(h.setBodyRotation).toHaveBeenCalled();

    const projected = projectCharacterShaperDocument({
      documentId: "doc-1",
      recipe: binding.recipe,
      snapshot: binding.snapshot,
      profile: binding.profile,
      shaperMaterial: { shadePos: 0.6, outlinePressure: true, disableHairInline: true },
      springBone: { stiffness: 1.4, gravityPower: 0.4, dragForce: 0.35 },
      motionScrubPct: 75,
    });
    expect(projected.customControls["shaper.shadePos"]).toBe(0.6);
    expect(projected.customControls["hair.spring.stiffness"]).toBe(1.4);
    expect(projected.customControls["pose.motionScrubPct"]).toBe(75);
  });
});
