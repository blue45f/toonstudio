/**
 * studio-bg3d-character-composite-avatar.ts
 *
 * 3D 배경↔캐릭터 합성 스테이지용 계약 타입, 기본 3인 캐스트, 웹툰 5종 연출 카메라 카탈로그,
 * 그리고 관절 계층·매니폴드 지오메트리를 갖춘 프로시저럴 3D 휴머노이드 캐릭터 아바타 생성기.
 */

import * as THREE from "three";

import {
  createOklchThreeColor,
  groundObject3DToFloorY,
  type DisposedGpuResourceCounts,
  type OklchColorSpec,
  type SceneManifoldReport,
} from "./studio-bg3d-geometry-manifold-utils";
import type { StudioBg3dWebtoonAtmospherePresetId } from "./studio-bg3d-lighting-studio";
import type { BakedManuscriptCutLayer, Scene3DCaptureSnapshot } from "./studio-bg3d-live-ink-bake-bridge";
import type {
  RichWebtoonSceneBuildResult,
  StageFurnitureAnchorKind,
} from "./studio-bg3d-rich-scene-presets";

export const MIN_COMPOSITE_STAGE_CHARACTERS = 1;
export const MAX_COMPOSITE_STAGE_CHARACTERS = 3;

export type CompositeCharacterSourceKind = "procedural-humanoid" | "vrm-bridge";

export interface CompositeCharacterPalette {
  readonly skin: OklchColorSpec;
  readonly hair: OklchColorSpec;
  readonly topOutfit: OklchColorSpec;
  readonly bottomOutfit: OklchColorSpec;
  readonly shoes: OklchColorSpec;
}

export interface CompositeCharacterProfile {
  readonly id: string;
  readonly displayNameKo: string;
  readonly roleLabelKo: string;
  readonly heightM: number;
  readonly sourceKind: CompositeCharacterSourceKind;
  readonly vrmAssetId?: string;
  readonly vrmUrl?: string;
  readonly stance: StageFurnitureAnchorKind;
  readonly anchorId?: string | null;
  readonly positionM: readonly [number, number, number];
  readonly facingYawRad: number;
  readonly palette: CompositeCharacterPalette;
}

export interface VrmSceneLike {
  readonly scene: THREE.Object3D;
  readonly humanoid?: {
    readonly getRawBoneNode?: (boneName: string) => THREE.Object3D | null;
  };
  readonly materials?: readonly THREE.Material[];
}

export interface VrmModelLoaderBridge {
  readonly loadVrmModel: (vrmUrl: string) => Promise<VrmSceneLike>;
}

export interface CompositeCharacterRuntimeSlot {
  readonly profile: CompositeCharacterProfile;
  readonly root: THREE.Group;
  readonly vrmAsset: VrmSceneLike | null;
  readonly groundedMinY: number;
  readonly manifold: SceneManifoldReport;
}

export interface CharacterMToonSyncParameters {
  readonly atmosphereId: StudioBg3dWebtoonAtmospherePresetId;
  readonly labelKo: string;
  readonly colorTemperatureKelvin: number;
  readonly keyLightColorCss: string;
  readonly keyLightDirection: readonly [number, number, number];
  readonly keyLightIntensity: number;
  readonly shadeColorCss: string;
  readonly shadeShiftFactor: number;
  readonly shadeToonyFactor: number;
  readonly rimColorCss: string;
  readonly rimFresnelPower: number;
  readonly rimLiftFactor: number;
  readonly fogEnabled: boolean;
  readonly fogColorCss: string;
  readonly fogDensity: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly outlineWidthPx: number;
  readonly outlineWidthFactor: number;
  readonly contactShadowOpacity: number;
}

export interface CharacterAtmosphereSyncReceipt {
  readonly isSynced: true;
  readonly syncedMaterialCount: number;
  readonly syncedCharacterCount: number;
  readonly parameters: CharacterMToonSyncParameters;
}

export type WebtoonStageCameraPresetId =
  | "dialogue-ots"
  | "confrontation-low-angle"
  | "high-angle-full-body"
  | "two-shot-closeup"
  | "corridor-perspective";

export interface WebtoonStageCameraPresetMeta {
  readonly id: WebtoonStageCameraPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly focalLengthMm: number;
  readonly dutchRollDeg: number;
  readonly recommendedActorCount: string;
}

export interface ResolvedWebtoonStageCamera {
  readonly preset: WebtoonStageCameraPresetMeta;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDegrees: number;
  readonly focalLengthMm: number;
  readonly dutchRollDeg: number;
}

export interface CompositeStageCaptureBundle {
  readonly snapshot: Scene3DCaptureSnapshot;
  readonly bakedLayer: BakedManuscriptCutLayer;
  readonly characterCount: number;
  readonly atmosphereId: StudioBg3dWebtoonAtmospherePresetId;
  readonly cameraPresetId: WebtoonStageCameraPresetId;
}

export interface CharacterCompositeStageSession {
  readonly stageRoot: THREE.Group;
  readonly backgroundBuild: RichWebtoonSceneBuildResult;
  readonly slots: readonly CompositeCharacterRuntimeSlot[];
  readonly activeAtmosphereId: StudioBg3dWebtoonAtmospherePresetId;
  readonly lastSyncReceipt: CharacterAtmosphereSyncReceipt;
  readonly activeCamera: ResolvedWebtoonStageCamera;
  readonly dispose: () => DisposedGpuResourceCounts;
}

export const DEFAULT_COMPOSITE_CHARACTER_CAST: readonly CompositeCharacterProfile[] = Object.freeze([
  Object.freeze({
    id: "char-seoyeon",
    displayNameKo: "주인공 서연",
    roleLabelKo: "주연 · 166cm",
    heightM: 1.66,
    sourceKind: "procedural-humanoid",
    vrmAssetId: "vrm:toonstudio-hero-seoyeon",
    vrmUrl: "/vrm/toonstudio-hero-v1/hero-female-romance.vrm",
    stance: "standing",
    anchorId: null,
    positionM: Object.freeze([-0.75, 0, 0.8] as const),
    facingYawRad: 0.32,
    palette: Object.freeze({
      skin: Object.freeze({ l: 0.86, c: 0.045, h: 58 }),
      hair: Object.freeze({ l: 0.24, c: 0.055, h: 295 }),
      topOutfit: Object.freeze({ l: 0.94, c: 0.015, h: 80 }),
      bottomOutfit: Object.freeze({ l: 0.32, c: 0.06, h: 255 }),
      shoes: Object.freeze({ l: 0.22, c: 0.03, h: 45 }),
    }),
  }),
  Object.freeze({
    id: "char-doyun",
    displayNameKo: "상대역 도윤",
    roleLabelKo: "상대역 · 180cm",
    heightM: 1.8,
    sourceKind: "procedural-humanoid",
    vrmAssetId: "vrm:toonstudio-hero-doyun",
    vrmUrl: "/vrm/toonstudio-hero-v1/hero-male-modern.vrm",
    stance: "standing",
    anchorId: null,
    positionM: Object.freeze([0.78, 0, 0.55] as const),
    facingYawRad: -0.45,
    palette: Object.freeze({
      skin: Object.freeze({ l: 0.83, c: 0.048, h: 56 }),
      hair: Object.freeze({ l: 0.2, c: 0.025, h: 250 }),
      topOutfit: Object.freeze({ l: 0.28, c: 0.035, h: 248 }),
      bottomOutfit: Object.freeze({ l: 0.24, c: 0.025, h: 250 }),
      shoes: Object.freeze({ l: 0.18, c: 0.015, h: 250 }),
    }),
  }),
  Object.freeze({
    id: "char-harin",
    displayNameKo: "조연 하린",
    roleLabelKo: "조연 · 162cm",
    heightM: 1.62,
    sourceKind: "procedural-humanoid",
    vrmAssetId: "vrm:toonstudio-support-harin",
    vrmUrl: "/vrm/toonstudio-hero-v1/support-female-casual.vrm",
    stance: "seated",
    anchorId: null,
    positionM: Object.freeze([-1.9, 0, -0.5] as const),
    facingYawRad: 0.85,
    palette: Object.freeze({
      skin: Object.freeze({ l: 0.87, c: 0.042, h: 60 }),
      hair: Object.freeze({ l: 0.42, c: 0.11, h: 42 }),
      topOutfit: Object.freeze({ l: 0.68, c: 0.11, h: 195 }),
      bottomOutfit: Object.freeze({ l: 0.36, c: 0.04, h: 245 }),
      shoes: Object.freeze({ l: 0.3, c: 0.04, h: 35 }),
    }),
  }),
]);

export const WEBTOON_STAGE_CAMERA_PRESETS: readonly WebtoonStageCameraPresetMeta[] = Object.freeze([
  Object.freeze({
    id: "dialogue-ots",
    labelKo: "대화 OTS",
    descriptionKo: "앞 인물의 어깨 너머로 상대 인물 표정과 배경 깊이감을 동시에 담는 대화 컷",
    focalLengthMm: 50,
    dutchRollDeg: 0,
    recommendedActorCount: "2~3인",
  }),
  Object.freeze({
    id: "confrontation-low-angle",
    labelKo: "대치 로우앵글",
    descriptionKo: "지면 가까이서 올려다보며 긴장감과 인물의 위압감을 극대화하는 대치 구도",
    focalLengthMm: 28,
    dutchRollDeg: -4.5,
    recommendedActorCount: "2인 대치",
  }),
  Object.freeze({
    id: "high-angle-full-body",
    labelKo: "하이앵글 전신",
    descriptionKo: "공간 전체 배치와 1~3명 인물의 전신·동선을 한눈에 보여 주는 상황 설명 컷",
    focalLengthMm: 35,
    dutchRollDeg: 0,
    recommendedActorCount: "1~3인",
  }),
  Object.freeze({
    id: "two-shot-closeup",
    labelKo: "투샷 클로즈업",
    descriptionKo: "85mm 망원 압축으로 두 인물의 감정선과 시선 교차를 밀착 포착하는 컷",
    focalLengthMm: 85,
    dutchRollDeg: 0,
    recommendedActorCount: "2인 감성",
  }),
  Object.freeze({
    id: "corridor-perspective",
    labelKo: "복도 원근",
    descriptionKo: "24mm 광각 1점 소실점으로 골목·복도·승강장의 강한 깊이감을 살리는 컷",
    focalLengthMm: 24,
    dutchRollDeg: 0,
    recommendedActorCount: "1~3인",
  }),
]);

function addPartCylinder(
  parent: THREE.Object3D,
  name: string,
  rTop: number,
  rBot: number,
  length: number,
  offsetY: number,
  material: THREE.Material,
  segments = 10,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(Math.max(0.008, rTop), Math.max(0.008, rBot), Math.max(0.02, length), segments, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(0, offsetY, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addPartBox(
  parent: THREE.Object3D,
  name: string,
  size: readonly [number, number, number],
  offset: readonly [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(offset[0], offset[1], offset[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * 실제 관절 계층(`bone:hips`, `bone:spine`, `bone:head`, 사지 피벗)과
 * 매니폴드 지오메트리를 갖춘 고품질 프로시저럴 3D 휴머노이드 캐릭터 아바타를 생성한다.
 */
export function buildProceduralHumanoidCharacterGroup(profile: CompositeCharacterProfile): THREE.Group {
  const s = Math.max(1.35, Math.min(2.1, profile.heightM)) / 1.7;
  const root = new THREE.Group();
  root.name = `character-slot:${profile.id}`;
  root.userData.characterId = profile.id;
  root.userData.sourceKind = profile.sourceKind;
  root.userData.heightM = profile.heightM;

  const skinMat = new THREE.MeshStandardMaterial({ color: createOklchThreeColor(profile.palette.skin), roughness: 0.64, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: createOklchThreeColor(profile.palette.hair), roughness: 0.5, metalness: 0.08 });
  const topMat = new THREE.MeshStandardMaterial({ color: createOklchThreeColor(profile.palette.topOutfit), roughness: 0.72, metalness: 0.04 });
  const bottomMat = new THREE.MeshStandardMaterial({ color: createOklchThreeColor(profile.palette.bottomOutfit), roughness: 0.76, metalness: 0.04 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: createOklchThreeColor(profile.palette.shoes), roughness: 0.45, metalness: 0.14 });
  skinMat.name = `${profile.id}:skin`;
  hairMat.name = `${profile.id}:hair`;
  topMat.name = `${profile.id}:top`;
  bottomMat.name = `${profile.id}:bottom`;
  shoeMat.name = `${profile.id}:shoes`;

  const hips = new THREE.Group();
  hips.name = "bone:hips";
  hips.position.set(0, 0.88 * s, 0);
  root.add(hips);
  addPartBox(hips, "mesh:pelvis", [0.28 * s, 0.14 * s, 0.18 * s], [0, 0, 0], bottomMat);

  const spine = new THREE.Group();
  spine.name = "bone:spine";
  spine.position.set(0, 0.07 * s, 0);
  hips.add(spine);
  addPartCylinder(spine, "mesh:torso", 0.15 * s, 0.125 * s, 0.44 * s, 0.22 * s, topMat, 12);
  addPartBox(spine, "mesh:shoulders", [0.36 * s, 0.08 * s, 0.16 * s], [0, 0.41 * s, 0], topMat);

  const head = new THREE.Group();
  head.name = "bone:head";
  head.position.set(0, 0.47 * s, 0);
  spine.add(head);
  addPartCylinder(head, "mesh:neck", 0.048 * s, 0.055 * s, 0.08 * s, 0.03 * s, skinMat, 10);

  const headMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.112 * s, 2), skinMat);
  headMesh.name = "mesh:head";
  headMesh.position.set(0, 0.165 * s, 0);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  head.add(headMesh);

  const hairCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 * s, 1), hairMat);
  hairCrown.name = "mesh:hair-crown";
  hairCrown.position.set(0, 0.195 * s, -0.015 * s);
  hairCrown.castShadow = true;
  head.add(hairCrown);
  addPartBox(head, "mesh:hair-back", [0.2 * s, 0.18 * s, 0.08 * s], [0, 0.12 * s, -0.085 * s], hairMat);

  for (const side of [-1, 1] as const) {
    const label = side < 0 ? "left" : "right";
    const upperArm = new THREE.Group();
    upperArm.name = `bone:${label}UpperArm`;
    upperArm.position.set(side * 0.21 * s, 0.41 * s, 0);
    upperArm.rotation.z = side * 0.12;
    spine.add(upperArm);
    addPartCylinder(upperArm, `mesh:${label}-upper-arm`, 0.046 * s, 0.038 * s, 0.28 * s, -0.14 * s, topMat, 10);

    const lowerArm = new THREE.Group();
    lowerArm.name = `bone:${label}LowerArm`;
    lowerArm.position.set(0, -0.28 * s, 0);
    upperArm.add(lowerArm);
    addPartCylinder(lowerArm, `mesh:${label}-lower-arm`, 0.036 * s, 0.03 * s, 0.25 * s, -0.125 * s, skinMat, 10);
    addPartBox(lowerArm, `mesh:${label}-hand`, [0.055 * s, 0.075 * s, 0.03 * s], [0, -0.28 * s, 0], skinMat);

    const upperLeg = new THREE.Group();
    upperLeg.name = `bone:${label}UpperLeg`;
    upperLeg.position.set(side * 0.095 * s, -0.06 * s, 0);
    hips.add(upperLeg);
    addPartCylinder(upperLeg, `mesh:${label}-upper-leg`, 0.068 * s, 0.054 * s, 0.41 * s, -0.205 * s, bottomMat, 10);

    const lowerLeg = new THREE.Group();
    lowerLeg.name = `bone:${label}LowerLeg`;
    lowerLeg.position.set(0, -0.41 * s, 0);
    upperLeg.add(lowerLeg);
    addPartCylinder(lowerLeg, `mesh:${label}-lower-leg`, 0.05 * s, 0.038 * s, 0.39 * s, -0.195 * s, bottomMat, 10);
    addPartBox(lowerLeg, `mesh:${label}-shoe`, [0.095 * s, 0.07 * s, 0.22 * s], [0, -0.42 * s, 0.04 * s], shoeMat);
  }

  root.position.set(profile.positionM[0], 0, profile.positionM[2]);
  root.rotation.y = profile.facingYawRad;
  groundObject3DToFloorY(root, 0);
  return root;
}
