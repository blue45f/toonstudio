/**
 * 3D 캐릭터 커스터마이징(헤어 변경 · 의상/스커트 · 소품 · 그룸 · 입체선) 품질 회귀 게이트.
 *
 * 검증 축:
 *  1) 커스텀 장착·교체·해제 전후 렌더 정책/DPR 강제 하향 0건
 *  2) 분리·분할 프리미티브(Head_4/Body_5)·다국어 헤어 탐지 및 원본 이중 머리 0건
 *  3) 모든 커스텀 파츠의 용접 smooth normals · 비퇴화 지오메트리 · 본체 VRM과 통합된 MToon 셰이딩/외곽선 ·
 *     VRM0/VRM1 본 앵커·두상 바운딩 정합
 *  4) 다중 장착/색상·원단 교체/해제 반복 시 GPU geometry·material·texture·skeleton dispose 누수 0건 및 원본 재질 100% 복구
 */
import { MToonMaterial, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { executeCharacterAuthoringTask } from "../character-platform/runtime/character-authoring-worker-runtime";
import { CharacterGeometryStrokeThreeRuntime } from "../character-platform/runtime/character-geometry-stroke-three-runtime";
import { addCharacterGroomGroup } from "../character-platform/groom/character-groom-edit";
import { createEmptyCharacterGroomDocument } from "../character-platform/groom/character-groom-document";
import { CharacterGroomThreeRuntime, type CharacterGroomTaskExecutor } from "../character-platform/groom/character-groom-three-runtime";
import {
  createStudioVrmAuthoredHairClumpGeometry,
  createStudioVrmAuthoredHairGeometry,
  createStudioVrmAuthoredHairGradientTexture,
} from "./studio-vrm-authored-hair-geometry";
import {
  applyAvatarForgeHairStyleRecipe,
  buildAvatarForgeHairParts,
  createAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  AVATAR_FORGE_OWNED_TEXTURES,
  addAvatarForgeHairParts,
  disposeAvatarForgeObject,
} from "./studio-vrm-avatar-forge-hair-object";
import { classifyMeshName } from "./studio-vrm-costume";
import {
  createStudioVrmFeatheredDiscAlphaTexture,
  createStudioVrmSmoothOutlineGeometry,
  smoothStudioVrmCoincidentNormals,
} from "./studio-vrm-custom-part-geometry";
import { harmonizeStudioVrmPropObject } from "./studio-vrm-custom-part-harmonizer";
import {
  STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY,
  applyStudioVrmGarmentMToonStyle,
  applyStudioVrmMtoonControlsToVrm,
  attachStudioVrmGarmentOutlineMesh,
  createStudioVrmGarmentMToonMaterial,
  createStudioVrmGarmentWeaveNormalTexture,
  createStudioVrmHairMToonMaterials,
  disposeStudioVrmGarmentOwnedMatcap,
  sampleStudioVrmBodyMtoonProfile,
  syncStudioVrmCustomPartToActiveVrm,
  syncStudioVrmGarmentOutlineColor,
} from "./studio-vrm-custom-part-material";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";
import { measureStudioVrmHeadSurface } from "./studio-vrm-head-surface";
import { isStudioVrmMtoonMaterial } from "./studio-vrm-mtoon-brand";
import { DEFAULT_STUDIO_VRM_MTOON_CONTROLS } from "./studio-vrm-mtoon-controls";
import { DEFAULT_VRM_MATERIAL_FX, applyVrmMaterialFx } from "./studio-vrm-poser-utils";
import { applyStudioVrmPropTint } from "./studio-vrm-prop-material";
import { measureFaceSocket } from "./studio-vrm-prop-rig";
import { VRM_PROPS, buildPropObject } from "./studio-vrm-props";
import { resolveStudioVrmFrameLoop, type StudioVrmRenderActivity } from "./studio-vrm-render-policy";
import { FALLBACK_WARDROBE_METRICS, buildGarmentParts } from "./studio-vrm-wardrobe";
import { countDetectedVrmHairMeshes } from "./StudioVrmAvatarForge";
import {
  createStudioVrmXpbdSkirtAttachmentRuntime,
  planStudioVrmXpbdSkirtDeviceTier,
} from "./StudioVrmXpbdSkirtAttachment";

function createBodyMToonVrm(options: { metaVersion?: "0" | "1" } = {}): {
  vrm: VRM;
  bodyMaterial: MToonMaterial;
  bones: Map<VRMHumanBoneName, THREE.Bone>;
} {
  const scene = new THREE.Group();
  const bones = new Map<VRMHumanBoneName, THREE.Bone>();
  const addBone = (name: VRMHumanBoneName, pos: [number, number, number]) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(...pos);
    scene.add(bone);
    bones.set(name, bone);
  };
  addBone("hips", [0, 0.92, 0]);
  addBone("spine", [0, 1.14, 0]);
  addBone("neck", [0, 1.46, 0]);
  addBone("head", [0, 1.56, 0]);
  addBone("leftUpperLeg", [0.1, 0.88, 0]);
  addBone("rightUpperLeg", [-0.1, 0.88, 0]);
  addBone("leftLowerLeg", [0.1, 0.48, 0]);
  addBone("rightLowerLeg", [-0.1, 0.48, 0]);
  addBone("leftFoot", [0.1, 0.08, 0.08]);
  addBone("rightFoot", [-0.1, 0.08, 0.08]);

  const bodyMaterial = new MToonMaterial({
    color: new THREE.Color(0xfbe5d6),
    shadeColorFactor: new THREE.Color(0xd1b3c4),
    shadingToonyFactor: 0.91,
    shadingShiftFactor: -0.11,
    giEqualizationFactor: 0.85,
    parametricRimColorFactor: new THREE.Color(0xffe8d6),
    rimLightingMixFactor: 0.48,
    outlineWidthMode: "worldCoordinates",
    outlineWidthFactor: 0.0021,
    outlineColorFactor: new THREE.Color(0x2a1d28),
    outlineLightingMixFactor: 0.52,
  });
  bodyMaterial.name = "Body_Skin_MToon";
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), bodyMaterial);
  bodyMesh.name = "Body_Skin";
  scene.add(bodyMesh);
  scene.updateMatrixWorld(true);

  const vrm = {
    scene,
    meta: { metaVersion: options.metaVersion ?? "1" },
    humanoid: {
      getRawBoneNode: (name: VRMHumanBoneName) => bones.get(name) ?? null,
      getNormalizedBoneNode: (name: VRMHumanBoneName) => bones.get(name) ?? null,
    },
  } as unknown as VRM;
  return { vrm, bodyMaterial, bones };
}

function assertValidSmoothNormals(geometry: THREE.BufferGeometry, label: string): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  expect(position, `${label}: position`).toBeDefined();
  expect(normal, `${label}: normal`).toBeDefined();
  expect(normal.count, `${label}: normal count`).toBe(position.count);
  for (let index = 0; index < normal.count; index += 1) {
    const nx = normal.getX(index);
    const ny = normal.getY(index);
    const nz = normal.getZ(index);
    const len = Math.hypot(nx, ny, nz);
    expect(Number.isFinite(len), `${label}[${index}] finite`).toBe(true);
    expect(len, `${label}[${index}] unit length`).toBeGreaterThan(0.95);
    expect(len, `${label}[${index}] unit length`).toBeLessThan(1.05);
  }
}

describe("3D 커스터마이징 품질 회귀 검증 (헤어 · 의상 · 소품 · 그룸 · 자원 정리)", () => {
  it("원본 헤어 탐지가 GLTF 분할 프리미티브(Head_4/Body_5)와 다국어·숫자 접미사 헤어를 잡고 이중 머리를 차단한다", () => {
    const mat = (name: string) => {
      const m = new THREE.MeshBasicMaterial();
      m.name = name;
      return m;
    };
    const mkMesh = (name: string, materials: THREE.Material | THREE.Material[]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), materials);
      m.name = name;
      return m;
    };

    const scene = new THREE.Group();
    // 독립/분할 헤어 프리미티브 (모두 탐지되어야 함 = 5개)
    scene.add(
      mkMesh("Head_4", mat("N00_000_Hair_00_HAIR (Outline)")),
      mkMesh("Body_5", [mat("HairBack_00_HAIR"), mat("HairBack_00_HAIR (Outline)")]),
      mkMesh("Hair01", mat("Mat_01")),
      mkMesh("Node_Bangs", mat("前髪_MToon")),
      mkMesh("Node_Ponytail", mat("앞머리_재질")),
    );
    // 결합·의상 장신구·보호 메시 (절대 숨기면 안 됨 = 0개)
    scene.add(
      mkMesh("Face_Hair_Combined", mat("Hair")),
      mkMesh("Head_0", [mat("Body_Skin"), mat("Hair_00_HAIR")]),
      mkMesh("HairAccessory_Ribbon", mat("HairAccessory_Ribbon")),
      mkMesh("Body_Skin", mat("Skin_MToon")),
    );

    expect(classifyMeshName("Hair01").protected).toBe("hair");
    expect(classifyMeshName("LongHair").protected).toBe("hair");
    expect(classifyMeshName("HairAccessory_Ribbon").slot).toBe("accessory");
    expect(countDetectedVrmHairMeshes({ scene } as unknown as VRM)).toBe(5);
  });

  it("헤어 지오메트리·외곽선 법선이 앞/뒤 경계와 캡 UV 심에서 용접되고, MToon 본체 프로필·엔젤링·실시간 MaterialFx와 동기화된다", () => {
    const { vrm } = createBodyMToonVrm({ metaVersion: "1" });
    const profile = sampleStudioVrmBodyMtoonProfile(vrm);
    expect(profile.hasMToon).toBe(true);
    expect(profile.shadingToonyFactor).toBeCloseTo(0.91, 2);
    expect(profile.shadingShiftFactor).toBeCloseTo(-0.11, 2);
    expect(profile.outlineWidthMode).toBe("worldCoordinates");

    // 1) 가닥 앞/뒤 경계(column=0, 8) 및 캡 UV 심(column=0, 28) 용접 법선 확인
    const longState = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), "long");
    const parts = buildAvatarForgeHairParts(longState);
    const clumpPart = parts.find((part) => part.primitive === "tapered-capsule")!;
    const clumpGeo = createStudioVrmAuthoredHairClumpGeometry(clumpPart);
    assertValidSmoothNormals(clumpGeo, "hair-clump");
    const clumpNormal = clumpGeo.getAttribute("normal");
    const stride = 25 * 9;
    // 앞면 좌측 경계(row=10, col=0)와 뒷면 동일 위치 경계의 법선이 용접되어 일치해야 한다.
    const frontEdge = new THREE.Vector3().fromBufferAttribute(clumpNormal, 10 * 9);
    const backEdge = new THREE.Vector3().fromBufferAttribute(clumpNormal, stride + 10 * 9);
    expect(frontEdge.dot(backEdge)).toBeGreaterThan(0.99);
    clumpGeo.dispose();

    const capPart = parts.find((part) => part.role === "cap")!;
    const capGeo = createStudioVrmAuthoredHairGeometry(capPart);
    assertValidSmoothNormals(capGeo, "hair-cap");
    const capNormal = capGeo.getAttribute("normal");
    // 캡 UV 심(col=0 vs col=28)의 법선이 끊기지 않고 일치해야 한다.
    const seamA = new THREE.Vector3().fromBufferAttribute(capNormal, 8 * 29 + 0);
    const seamB = new THREE.Vector3().fromBufferAttribute(capNormal, 8 * 29 + 28);
    expect(seamA.dot(seamB)).toBeGreaterThan(0.99);
    capGeo.dispose();

    // 레거시 gradient 텍스처 sRGB 색공간 보정 확인
    const gradTex = createStudioVrmAuthoredHairGradientTexture();
    expect(gradTex.colorSpace).toBe(THREE.SRGBColorSpace);
    gradTex.dispose();

    // 2) 여러 스타일 교체 + VRM0/VRM1 두상 정합 + MToon 재질 + GPU dispose 0누수 확인
    const activeFx = {
      ...DEFAULT_VRM_MATERIAL_FX,
      shadeColor: "#6a5acd",
      outlineColor: "#14101c",
      rimColor: "#ffeedd",
      rimIntensity: 0.72,
    };
    applyVrmMaterialFx(vrm, activeFx);

    for (const frontSign of [1, -1] as const) {
      const fit: StudioVrmHeadFit = {
        source: "mesh",
        center: [0, 0.11, 0],
        eyeCenter: [0, 0.085, frontSign * 0.082],
        radiusX: 0.098,
        radiusY: 0.108,
        radiusZ: 0.102,
        faceFront: 0.095,
        frontSign,
      };
      for (const style of ["bob", "long", "ponytail", "wavy", "wolf"] as const) {
        const state = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), style);
        const group = new THREE.Group();
        addAvatarForgeHairParts(group, state, fit, profile);
        syncStudioVrmCustomPartToActiveVrm(group, vrm);

        const meshes: THREE.Mesh[] = [];
        group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
        });
        expect(meshes.length).toBe(2);
        const mainMesh = meshes.find((m) => m.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] !== true)!;
        const outlineMesh = meshes.find((m) => m.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true)!;
        const mainMat = mainMesh.material as MToonMaterial;
        const outlineMat = outlineMesh.material as MToonMaterial;

        expect(isStudioVrmMtoonMaterial(mainMat)).toBe(true);
        expect(isStudioVrmMtoonMaterial(outlineMat)).toBe(true);
        expect(mainMat.vertexColors).toBe(true);
        expect(mainMat.ignoreVertexColor).toBe(false);
        expect(mainMat.matcapTexture).toBeInstanceOf(THREE.DataTexture);
        expect(mainMat.transparent).toBe(false);
        expect(mainMat.depthWrite).toBe(true);
        expect(outlineMat.isOutline).toBe(true);
        expect(outlineMat.side).toBe(THREE.BackSide);
        expect(outlineMat.transparent).toBe(false);
        expect(outlineMat.depthWrite).toBe(true);
        // 활성 MaterialFx 동기화 검증
        expect(mainMat.shadeColorFactor.getHexString()).toBe("6a5acd");
        expect(outlineMat.outlineColorFactor.getHexString()).toBe("14101c");
        expect(mainMat.rimLightingMixFactor).toBeCloseTo(0.72, 4);

        // 두상 밀착 바운딩 검증 (공중 부양/붕괴 없음)
        assertValidSmoothNormals(mainMesh.geometry, `hair-${style}`);
        assertValidSmoothNormals(outlineMesh.geometry, `hair-outline-${style}`);
        mainMesh.geometry.computeBoundingBox();
        const box = mainMesh.geometry.boundingBox!;
        const center = box.getCenter(new THREE.Vector3());
        expect(Math.abs(center.x - fit.center[0])).toBeLessThan(fit.radiusX * 0.75);
        expect(box.max.y).toBeGreaterThan(fit.center[1] + fit.radiusY * 0.85);
        expect(box.max.y).toBeLessThan(fit.center[1] + fit.radiusY * 2.4);

        // GPU 자원 1회 정확 폐기 검증
        const geoSpies = meshes.map((m) => vi.spyOn(m.geometry, "dispose"));
        const matSpies = meshes.map((m) => vi.spyOn(m.material as THREE.Material, "dispose"));
        const ownedTextures = group.userData[AVATAR_FORGE_OWNED_TEXTURES] as THREE.Texture[];
        expect(ownedTextures.length).toBeGreaterThan(0);
        const texSpies = ownedTextures.map((tex) => vi.spyOn(tex, "dispose"));
        disposeAvatarForgeObject(group);
        geoSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
        matSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
        texSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
      }
    }

    // 교체 헤어 재질 엔젤링 밝기·셀 음영·외곽선 조화 검증 (원본 VRM 대비 어둡고 평면적인 붕괴 방지)
    const defaultHairMats = createStudioVrmHairMToonMaterials(
      { baseColor: "#352a28", tipColor: "#6b5148", shine: 0.42 },
      profile,
    );
    const glossyHairMats = createStudioVrmHairMToonMaterials(
      { baseColor: "#352a28", tipColor: "#6b5148", shine: 0.85 },
      profile,
    );
    const matcapLum = (c: THREE.Color) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    expect(matcapLum(defaultHairMats.main.matcapFactor)).toBeGreaterThanOrEqual(0.32);
    expect(matcapLum(glossyHairMats.main.matcapFactor)).toBeGreaterThan(matcapLum(defaultHairMats.main.matcapFactor) * 1.3);
    expect(matcapLum(defaultHairMats.main.shadeColorFactor)).toBeGreaterThanOrEqual(0.45);
    expect(defaultHairMats.outline.outlineWidthFactor).toBeLessThanOrEqual(profile.outlineWidthFactor);
    expect(defaultHairMats.outline.outlineLightingMixFactor).toBeGreaterThanOrEqual(0.6);
    defaultHairMats.main.dispose();
    defaultHairMats.outline.dispose();
    defaultHairMats.ownedTextures.forEach((tex) => tex.dispose());
    glossyHairMats.main.dispose();
    glossyHairMats.outline.dispose();
    glossyHairMats.ownedTextures.forEach((tex) => tex.dispose());

    // 얼굴 악센트 페더링 알파 맵 검증
    const blushAlpha = createStudioVrmFeatheredDiscAlphaTexture(0.78);
    expect(blushAlpha.colorSpace).toBe(THREE.NoColorSpace);
    const data = blushAlpha.image.data as Uint8Array;
    const centerByte = data[(32 * 64 + 32) * 4]!;
    const cornerByte = data[0]!;
    expect(centerByte).toBeGreaterThan(220);
    expect(cornerByte).toBe(0);
    blushAlpha.dispose();
  });

  it("워드로브 의상·XPBD 스커트가 MToon 셀 셰이딩·직조 노멀·금속 매트캡·외곽선을 동기화하고 교체/해제 시 누수 0건이다", async () => {
    const { vrm } = createBodyMToonVrm();
    const profile = sampleStudioVrmBodyMtoonProfile(vrm);

    // 1) 금속 갑옷 원단도 IBL 없이 검게 무너지지 않고 스튜디오 매트캡으로 광택을 유지한다.
    const armorParts = buildGarmentParts("armor", FALLBACK_WARDROBE_METRICS, 1);
    const steelWeave = createStudioVrmGarmentWeaveNormalTexture("steel");
    const armorMat = createStudioVrmGarmentMToonMaterial(armorParts[0]!, "#9aa3b2", "steel", steelWeave, profile);
    expect(isStudioVrmMtoonMaterial(armorMat)).toBe(true);
    expect(armorMat.matcapTexture).toBeInstanceOf(THREE.DataTexture);
    expect(armorMat.matcapFactor.r + armorMat.matcapFactor.g + armorMat.matcapFactor.b).toBeGreaterThan(0.5);

    // 2) 의상 원단/색상 전환 시 이전 매트캡 폐기 및 외곽선 색 동기화 검증
    const hostMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.3, 24), armorMat);
    const outlineMesh = attachStudioVrmGarmentOutlineMesh(hostMesh, armorMat, profile)!;
    expect(outlineMesh).not.toBeNull();
    const oldMatcap = armorMat.matcapTexture!;
    const oldMatcapDispose = vi.spyOn(oldMatcap, "dispose");
    const cottonWeave = createStudioVrmGarmentWeaveNormalTexture("cotton")!;
    expect(cottonWeave.colorSpace).toBe(THREE.NoColorSpace);
    applyStudioVrmGarmentMToonStyle(armorMat, { ...armorParts[0]!, metalness: 0 }, "#3b5998", "cotton", cottonWeave, profile);
    syncStudioVrmGarmentOutlineColor(hostMesh, armorMat);
    expect(oldMatcapDispose).toHaveBeenCalledTimes(1);
    expect(armorMat.normalMap).toBe(cottonWeave);
    expect((outlineMesh.material as MToonMaterial).outlineColorFactor.equals(armorMat.outlineColorFactor)).toBe(true);

    disposeStudioVrmGarmentOwnedMatcap(armorMat);
    cottonWeave.dispose();
    steelWeave?.dispose();
    outlineMesh.geometry.dispose();
    (outlineMesh.material as THREE.Material).dispose();
    hostMesh.geometry.dispose();
    armorMat.dispose();

    // 3) XPBD 스커트도 MToon 재질 + 동기화된 스킨 외곽선을 쓰며 해제 시 단 1회씩 폐기된다.
    const built = createStudioVrmXpbdSkirtAttachmentRuntime({
      vrm,
      kind: "pleated",
      metrics: FALLBACK_WARDROBE_METRICS,
      effectiveFit: 1,
      topologyGeneration: 0,
      devicePlan: planStudioVrmXpbdSkirtDeviceTier({ hardwareConcurrency: 8, deviceMemoryGb: 8 }),
      color: "#2b3a5e",
      fabricId: "satin",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error(built.detail);
    const { runtime } = built;
    expect(isStudioVrmMtoonMaterial(runtime.surface.material)).toBe(true);
    const skirtOutline = runtime.surface.mesh.children.find(
      (child) => child.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true,
    ) as THREE.SkinnedMesh | undefined;
    expect(skirtOutline?.isSkinnedMesh).toBe(true);
    expect(skirtOutline?.skeleton).toBe(runtime.surface.skeleton);
    const outlineMatDispose = vi.spyOn(skirtOutline!.material as THREE.Material, "dispose");
    const matDispose = vi.spyOn(runtime.surface.material, "dispose");
    const geoDispose = vi.spyOn(runtime.surface.geometry, "dispose");
    const skelDispose = vi.spyOn(runtime.surface.skeleton, "dispose");

    runtime.surface.updateMaterial("#8b2942", "wool");
    expect((skirtOutline!.material as MToonMaterial).outlineColorFactor.equals(runtime.surface.material.outlineColorFactor)).toBe(true);
    runtime.retain();
    runtime.release();
    await Promise.resolve();
    expect(outlineMatDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(skelDispose).toHaveBeenCalledTimes(1);
  });

  it("GLB·절차 소품 장착/틴트/교체/해제 시 MToon 통합, 원본 캐시 재질 100% 원복, 0 GPU 누수 및 VRM0 얼굴 소켓 정합을 보장한다", () => {
    const { bones: bones0 } = createBodyMToonVrm({ metaVersion: "0" });
    const { vrm: vrm1 } = createBodyMToonVrm({ metaVersion: "1" });

    // VRM0 얼굴 소켓 폴백은 뒤통수(+Z)가 아니라 얼굴 정면(-Z, 180°)을 향해야 한다.
    const face0 = measureFaceSocket(
      { head: bones0.get("head")!, neck: bones0.get("neck")! },
      { head: [0, 1.56, 0], neck: [0, 1.46, 0] },
      0.2,
      "0",
    );
    expect(face0.position[2]).toBeLessThan(0);
    expect(face0.rotationDeg[1]).toBe(180);

    // 커스텀 장착 파츠가 head-surface 측정을 오염시키지 않는지 확인
    const fakeCustomSkinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial());
    fakeCustomSkinned.name = "wardrobe:hat:giant";
    vrm1.scene.add(fakeCustomSkinned);
    expect(measureStudioVrmHeadSurface(vrm1)).toBeNull();
    fakeCustomSkinned.removeFromParent();
    fakeCustomSkinned.geometry.dispose();
    (fakeCustomSkinned.material as THREE.Material).dispose();

    // 캐시 소유 GLB 모사 오브젝트 (금속성 0.92 + 틴트 가능 바디)
    const sourceTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const sourceBodyMat = new THREE.MeshStandardMaterial({
      color: "#22242a",
      metalness: 0.92,
      roughness: 0.22,
      map: sourceTex,
    });
    sourceBodyMat.name = "PhoneV2_AnodizedBody";
    const sourceGeo = new THREE.BoxGeometry(0.07, 0.14, 0.008);
    const propMesh = new THREE.Mesh(sourceGeo, sourceBodyMat);
    propMesh.name = "PhoneMesh";
    const glbClone = new THREE.Group();
    glbClone.name = "prop:smartphone";
    glbClone.add(propMesh);

    const sourceMatDispose = vi.spyOn(sourceBodyMat, "dispose");
    const sourceTexDispose = vi.spyOn(sourceTex, "dispose");

    // 3회 연속 장착/색상변경/해제 사이클 (LIFO: tint -> harmonize -> restoreHarmonize -> restoreTint)
    for (const tint of ["#2563eb", "#e11d48", "#10b981"]) {
      const restoreTint = applyStudioVrmPropTint(glbClone, "smartphone", tint);
      const restoreHarmonize = harmonizeStudioVrmPropObject(glbClone, vrm1, { propId: "smartphone" });

      const activeMat = propMesh.material as unknown as MToonMaterial;
      expect(isStudioVrmMtoonMaterial(activeMat)).toBe(true);
      expect(activeMat.map).toBe(sourceTex);
      expect(activeMat.matcapTexture).toBeInstanceOf(THREE.DataTexture);
      expect(propMesh.castShadow).toBe(true);
      expect(propMesh.receiveShadow).toBe(true);
      const outlineChild = propMesh.children.find((c) => c.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true) as THREE.Mesh | undefined;
      expect(outlineChild).toBeDefined();
      assertValidSmoothNormals(outlineChild!.geometry, "prop-outline");

      const createdMatDispose = vi.spyOn(activeMat, "dispose");
      const createdMatcapDispose = vi.spyOn(activeMat.matcapTexture!, "dispose");
      const outlineGeoDispose = vi.spyOn(outlineChild!.geometry, "dispose");
      const outlineMatDispose = vi.spyOn(outlineChild!.material as THREE.Material, "dispose");

      restoreHarmonize();
      restoreTint();

      expect(createdMatDispose).toHaveBeenCalledTimes(1);
      expect(createdMatcapDispose).toHaveBeenCalledTimes(1);
      expect(outlineGeoDispose).toHaveBeenCalledTimes(1);
      expect(outlineMatDispose).toHaveBeenCalledTimes(1);
      expect(propMesh.material).toBe(sourceBodyMat);
      expect(propMesh.children).toHaveLength(0);
    }

    // 캐시 소유 원본 재질·텍스처는 단 한 번도 변형·폐기되지 않았어야 한다.
    expect(sourceBodyMat.color.getHexString()).toBe("22242a");
    expect(sourceMatDispose).not.toHaveBeenCalled();
    expect(sourceTexDispose).not.toHaveBeenCalled();

    // 절차 소품도 MToon 통합 + 스무스 외곽선 + MToonControls 일괄 동기화 확인
    const proceduralDef = VRM_PROPS.find((item) => item.geometrySource.kind === "procedural")!;
    const procedural = buildPropObject(
      THREE as unknown as Parameters<typeof buildPropObject>[0],
      proceduralDef,
      "#e8e2d6",
    ) as unknown as THREE.Object3D;
    vrm1.scene.add(procedural);
    const cleanupProc = harmonizeStudioVrmPropObject(procedural, vrm1, { propId: proceduralDef.id });
    applyStudioVrmMtoonControlsToVrm(vrm1, {
      ...DEFAULT_STUDIO_VRM_MTOON_CONTROLS,
      outline: { ...DEFAULT_STUDIO_VRM_MTOON_CONTROLS.outline, enabled: true, color: "#0b0d14" },
    });
    let mtoonCount = 0;
    procedural.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh && isStudioVrmMtoonMaterial(m.material as MToonMaterial)) {
        mtoonCount += 1;
        expect((m.material as MToonMaterial).outlineColorFactor.getHexString()).toBe("0b0d14");
      }
    });
    expect(mtoonCount).toBeGreaterThan(0);
    cleanupProc();
    procedural.removeFromParent();
    sourceGeo.dispose();
    sourceBodyMat.dispose();
    sourceTex.dispose();
  });

  it("Groom 헤어와 3D 입체선이 MToon 재질·그림자/외곽선 override를 직접 지원하고 DPR/렌더 정책 하향 0건을 유지한다", async () => {
    const head = new THREE.Group();
    const execute: CharacterGroomTaskExecutor = async (task) => executeCharacterAuthoringTask(task);
    const groomRuntime = new CharacterGroomThreeRuntime(head, () => undefined, execute);
    const doc = addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:quality"), "앞머리");
    const materialId = doc.groups[0]!.materialId;

    const result = await groomRuntime.update(doc, "topology:quality", "#2a2024", {
      materialOverrides: [{
        materialId,
        baseColor: "#443355",
        shadowColor: "#1d1428",
        outlineColor: "#0c0812",
        outlineWidth: 0.0022,
      }],
    });
    expect(result.status).toBe("ready");
    expect(result.notices ?? []).toEqual([]);
    const groomMesh = head.children[0]!.children[0] as THREE.Mesh;
    const groomMat = groomMesh.material as MToonMaterial;
    expect(isStudioVrmMtoonMaterial(groomMat)).toBe(true);
    expect(groomMat.shadeColorFactor.getHexString()).toBe("1d1428");
    expect(groomMat.outlineColorFactor.getHexString()).toBe("0c0812");
    expect(groomMat.outlineWidthFactor).toBeCloseTo(0.0022, 6);
    assertValidSmoothNormals(groomMesh.geometry, "groom-ribbon");
    const groomOutline = groomMesh.children.find(
      (child) => child.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true,
    ) as THREE.Mesh | undefined;
    expect(groomOutline).toBeDefined();
    expect((groomOutline!.material as MToonMaterial).isOutline).toBe(true);
    groomRuntime.dispose();
    expect(head.children).toHaveLength(0);

    // 3D 입체선도 MToonMaterial로 통합 렌더
    const strokeRoot = new THREE.Group();
    const strokeRuntime = new CharacterGeometryStrokeThreeRuntime(strokeRoot, () => undefined, execute);
    await strokeRuntime.update({
      version: 1,
      strokes: [{
        strokeId: "stroke:mtoon",
        name: "MToon 입체선",
        visible: true,
        locked: false,
        status: "valid",
        style: {
          color: "#334466", baseWidth: 0.02, opacity: 1, taperStart: 0, taperEnd: 0,
          pressureWidth: 0.4, profile: "ribbon", fill: true, lineOnly: false,
        },
        points: [
          { anchor: { kind: "free", position: [0, 0, 0] }, pressure: 0.5, width: 1, twist: 0 },
          { anchor: { kind: "free", position: [0, 0.5, 0] }, pressure: 0.5, width: 1, twist: 0 },
        ],
      }],
    });
    const strokeMesh = strokeRoot.children[0]!.children[0] as THREE.Mesh;
    expect(isStudioVrmMtoonMaterial(strokeMesh.material as MToonMaterial)).toBe(true);
    strokeRuntime.dispose();

    // 스무스 아웃라인 지오메트리 용접 검증 (박스 모서리 3개 분할 법선 -> 100% 동일 용접 법선)
    const box = new THREE.BoxGeometry(1, 1, 1);
    const weldedOutline = createStudioVrmSmoothOutlineGeometry(box);
    const pos = weldedOutline.getAttribute("position");
    const norm = weldedOutline.getAttribute("normal");
    const cornerNormals: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getX(i) > 0.4 && pos.getY(i) > 0.4 && pos.getZ(i) > 0.4) {
        cornerNormals.push(new THREE.Vector3().fromBufferAttribute(norm, i));
      }
    }
    expect(cornerNormals.length).toBe(3);
    expect(cornerNormals[0]!.dot(cornerNormals[1]!)).toBeGreaterThan(0.9999);
    expect(cornerNormals[0]!.dot(cornerNormals[2]!)).toBeGreaterThan(0.9999);
    // 일반 smoothStudioVrmCoincidentNormals는 90° 각진 박스 모서리를 훼손하지 않는다.
    const sharpBox = new THREE.BoxGeometry(1, 1, 1);
    smoothStudioVrmCoincidentNormals(sharpBox, { creaseAngleDeg: 60 });
    assertValidSmoothNormals(sharpBox, "sharp-box");
    box.dispose();
    weldedOutline.dispose();
    sharpBox.dispose();

    // 커스터마이징 상태 변화와 무관하게 렌더 프레임 루프/품질 정책 강제 하향 0건 검증
    const idleActivity: StudioVrmRenderActivity = {
      webcamActive: false,
      idleAnimation: false,
      physicsPreview: false,
      turntable: false,
      viewportHandIkDragging: false,
      jointHandleInteracting: false,
      persistentIkReconciling: false,
      capturing: false,
      sharingPose: false,
      thumbnailCapturing: false,
    };
    expect(resolveStudioVrmFrameLoop(idleActivity)).toBe("demand");
    expect(resolveStudioVrmFrameLoop({ ...idleActivity, capturing: true })).toBe("always");
  });
});
