/**
 * studio-bg3d-character-composite-engine.ts
 *
 * 3D 배경 ↔ 3D 캐릭터(VRM/휴머노이드) 실시간 합성 스테이지 엔진.
 * - 1~3명 캐릭터(VRM 모델 로더 브리지 + 고품질 프로시저럴 3D 휴머노이드 아바타) 배치 및 합성
 * - 자동 바닥 접지(Y=0) & 가구 스냅(서기 / 의자 착석 / 난간 기대기)
 * - 배경 7종 분위기(아침·낮·노을·밤·비·눈·역광) 조명·그림자·안개·툰 아웃라인 ↔ 캐릭터 MToon 셰이딩 자동 동기화
 * - 웹툰 2인·3인 연출 카메라 프리셋 5종(대화 OTS · 대치 로우앵글 · 하이앵글 전신 · 투샷 클로즈업 · 복도 원근)
 * - 원클릭 통합 합성 3패스 캡처(선화·음영·깊이) 및 비파괴 원고 컷 굽기 페이로드 생성
 */

import * as THREE from "three";

import {
  disposeObject3DResources,
  groundObject3DToFloorY,
  oklchToCssString,
  threeColorToOklchCss,
  validateObject3DManifoldAndGrounding,
  type DisposedGpuResourceCounts,
} from "./studio-bg3d-geometry-manifold-utils";
import {
  getStudioBg3dWebtoonAtmospherePreset,
  STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS,
  type StudioBg3dWebtoonAtmospherePreset,
  type StudioBg3dWebtoonAtmospherePresetId,
} from "./studio-bg3d-lighting-studio";
import {
  buildBakedManuscriptCutLayer,
  type LiveInkPreviewMode,
  type Scene3DCaptureSnapshot,
} from "./studio-bg3d-live-ink-bake-bridge";
import {
  buildRichWebtoonScenePreset,
  type RichSceneDensityTier,
  type RichWebtoonScenePresetId,
  type StageFurnitureAnchor,
  type StageFurnitureAnchorKind,
} from "./studio-bg3d-rich-scene-presets";
import {
  buildProceduralHumanoidCharacterGroup,
  DEFAULT_COMPOSITE_CHARACTER_CAST,
  MAX_COMPOSITE_STAGE_CHARACTERS,
  MIN_COMPOSITE_STAGE_CHARACTERS,
  WEBTOON_STAGE_CAMERA_PRESETS,
  type CharacterAtmosphereSyncReceipt,
  type CharacterCompositeStageSession,
  type CharacterMToonSyncParameters,
  type CompositeCharacterPalette,
  type CompositeCharacterProfile,
  type CompositeCharacterRuntimeSlot,
  type CompositeCharacterSourceKind,
  type CompositeStageCaptureBundle,
  type ResolvedWebtoonStageCamera,
  type VrmModelLoaderBridge,
  type VrmSceneLike,
  type WebtoonStageCameraPresetId,
  type WebtoonStageCameraPresetMeta,
} from "./studio-bg3d-character-composite-avatar";

export {
  buildProceduralHumanoidCharacterGroup,
  DEFAULT_COMPOSITE_CHARACTER_CAST,
  MAX_COMPOSITE_STAGE_CHARACTERS,
  MIN_COMPOSITE_STAGE_CHARACTERS,
  WEBTOON_STAGE_CAMERA_PRESETS,
  type CharacterAtmosphereSyncReceipt,
  type CharacterCompositeStageSession,
  type CharacterMToonSyncParameters,
  type CompositeCharacterPalette,
  type CompositeCharacterProfile,
  type CompositeCharacterRuntimeSlot,
  type CompositeCharacterSourceKind,
  type CompositeStageCaptureBundle,
  type ResolvedWebtoonStageCamera,
  type VrmModelLoaderBridge,
  type VrmSceneLike,
  type WebtoonStageCameraPresetId,
  type WebtoonStageCameraPresetMeta,
};

interface MToonLikeMaterial extends THREE.Material {
  color?: THREE.Color;
  shadeColorFactor?: THREE.Color;
  shadeShiftFactor?: number;
  shadeToonyFactor?: number;
  parametricRimColorFactor?: THREE.Color;
  parametricRimFresnelPowerFactor?: number;
  parametricRimLiftFactor?: number;
  outlineWidthFactor?: number;
  fog?: boolean;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
}

const ATMOSPHERE_KELVIN_MAP: Readonly<Record<StudioBg3dWebtoonAtmospherePresetId, number>> = Object.freeze({
  morning: 4800,
  day: 5800,
  sunset: 3100,
  night: 7800,
  rain: 6500,
  snow: 6900,
  backlight: 3400,
});

const ATMOSPHERE_RIM_CONFIG: Readonly<
  Record<
    StudioBg3dWebtoonAtmospherePresetId,
    { readonly rimPower: number; readonly rimLift: number; readonly shadeShift: number; readonly shadeToony: number; readonly shadowOpacity: number }
  >
> = Object.freeze({
  morning: { rimPower: 3.4, rimLift: 0.22, shadeShift: -0.08, shadeToony: 0.78, shadowOpacity: 0.34 },
  day: { rimPower: 4.0, rimLift: 0.14, shadeShift: -0.05, shadeToony: 0.72, shadowOpacity: 0.42 },
  sunset: { rimPower: 2.2, rimLift: 0.48, shadeShift: -0.14, shadeToony: 0.86, shadowOpacity: 0.5 },
  night: { rimPower: 2.4, rimLift: 0.42, shadeShift: -0.22, shadeToony: 0.9, shadowOpacity: 0.56 },
  rain: { rimPower: 3.1, rimLift: 0.26, shadeShift: -0.15, shadeToony: 0.82, shadowOpacity: 0.32 },
  snow: { rimPower: 3.6, rimLift: 0.24, shadeShift: -0.04, shadeToony: 0.68, shadowOpacity: 0.26 },
  backlight: { rimPower: 1.6, rimLift: 0.78, shadeShift: -0.26, shadeToony: 0.94, shadowOpacity: 0.62 },
});

function round4(value: number): number {
  const r = Math.round(value * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

function focalLengthMmToFovDeg(focalMm: number): number {
  const safeFocal = Math.max(14, Math.min(200, focalMm));
  return round4((2 * Math.atan(24 / (2 * safeFocal)) * 180) / Math.PI);
}

function findCharacterBone(
  root: THREE.Object3D,
  vrmAsset: VrmSceneLike | null,
  boneName: string,
): THREE.Object3D | null {
  const fromVrm = vrmAsset?.humanoid?.getRawBoneNode?.(boneName) ?? null;
  if (fromVrm) return fromVrm;
  return root.getObjectByName(`bone:${boneName}`) ?? null;
}

/**
 * 캐릭터를 자동 바닥 접지(Y=0) 또는 가구 앵커(서기 / 의자 착석 / 난간 기대기)에 정밀 스냅한다.
 */
export function snapCharacterToStageAnchor(
  slot: CompositeCharacterRuntimeSlot,
  anchor: StageFurnitureAnchor | null,
  stanceOverride?: StageFurnitureAnchorKind,
): CompositeCharacterRuntimeSlot {
  const stance: StageFurnitureAnchorKind = stanceOverride ?? anchor?.kind ?? slot.profile.stance;
  const floorY = anchor?.surfaceY ?? 0;
  const root = slot.root;
  const vrm = slot.vrmAsset;

  const hips = findCharacterBone(root, vrm, "hips");
  const spine = findCharacterBone(root, vrm, "spine");
  const leftUpperLeg = findCharacterBone(root, vrm, "leftUpperLeg");
  const rightUpperLeg = findCharacterBone(root, vrm, "rightUpperLeg");
  const leftLowerLeg = findCharacterBone(root, vrm, "leftLowerLeg");
  const rightLowerLeg = findCharacterBone(root, vrm, "rightLowerLeg");
  const leftUpperArm = findCharacterBone(root, vrm, "leftUpperArm");
  const rightUpperArm = findCharacterBone(root, vrm, "rightUpperArm");
  const rightLowerArm = findCharacterBone(root, vrm, "rightLowerArm");

  // 포즈 초기화
  if (spine) spine.rotation.set(0, 0, 0);
  if (leftUpperLeg) leftUpperLeg.rotation.set(0, 0, 0);
  if (rightUpperLeg) rightUpperLeg.rotation.set(0, 0, 0);
  if (leftLowerLeg) leftLowerLeg.rotation.set(0, 0, 0);
  if (rightLowerLeg) rightLowerLeg.rotation.set(0, 0, 0);
  if (leftUpperArm) leftUpperArm.rotation.set(0, 0, -0.12);
  if (rightUpperArm) rightUpperArm.rotation.set(0, 0, 0.12);
  if (rightLowerArm) rightLowerArm.rotation.set(0, 0, 0);

  const basePos = anchor ? anchor.positionM : slot.profile.positionM;
  const yaw = anchor ? anchor.facingYawRad : slot.profile.facingYawRad;
  let posX = basePos[0];
  let posZ = basePos[2];

  if (stance === "seated") {
    const seatH = anchor?.seatHeightM ?? 0.45;
    if (leftUpperLeg) leftUpperLeg.rotation.x = -Math.PI * 0.48;
    if (rightUpperLeg) rightUpperLeg.rotation.x = -Math.PI * 0.48;
    if (leftLowerLeg) leftLowerLeg.rotation.x = Math.PI * 0.46;
    if (rightLowerLeg) rightLowerLeg.rotation.x = Math.PI * 0.46;
    if (spine) spine.rotation.x = -0.05;
    if (hips) hips.position.y = Math.max(0.32, seatH + 0.04);
  } else if (stance === "leaning") {
    const normal = anchor?.railNormal ?? [0, 0, 1];
    posX += normal[0] * 0.24;
    posZ += normal[2] * 0.24;
    if (hips) hips.position.y = 0.88 * (slot.profile.heightM / 1.7);
    if (spine) spine.rotation.x = 0.2;
    if (rightUpperArm) rightUpperArm.rotation.set(-0.68, 0, 0.2);
    if (rightLowerArm) rightLowerArm.rotation.set(-0.55, 0, 0);
  } else if (hips) {
    hips.position.y = 0.88 * (slot.profile.heightM / 1.7);
  }

  root.position.set(posX, floorY, posZ);
  root.rotation.y = yaw;
  groundObject3DToFloorY(root, floorY);

  const manifold = validateObject3DManifoldAndGrounding(root);
  const nextProfile: CompositeCharacterProfile = Object.freeze({
    ...slot.profile,
    stance,
    anchorId: anchor?.id ?? null,
    positionM: Object.freeze([round4(root.position.x), round4(floorY), round4(root.position.z)] as const),
    facingYawRad: round4(yaw),
  });

  return Object.freeze({
    ...slot,
    profile: nextProfile,
    groundedMinY: manifold.boundsMin[1],
    manifold,
  });
}

/**
 * 배경 분위기 프리셋(7종: 아침·낮·노을·밤·비·눈·역광)으로부터
 * 캐릭터 MToon 셰이딩·림라이트·안개·아웃라인 동기화 파라미터를 계산한다.
 */
export function computeCharacterMToonAtmosphereSync(
  atmosphereOrId: StudioBg3dWebtoonAtmospherePreset | StudioBg3dWebtoonAtmospherePresetId,
): CharacterMToonSyncParameters {
  const preset =
    typeof atmosphereOrId === "string"
      ? (getStudioBg3dWebtoonAtmospherePreset(atmosphereOrId) ?? STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS[1]!)
      : atmosphereOrId;
  const rimCfg = ATMOSPHERE_RIM_CONFIG[preset.id];
  const keyColor = new THREE.Color(preset.lighting.key.color);
  const ambientColor = new THREE.Color(preset.lighting.ambientColor);
  const fillColor = new THREE.Color(preset.lighting.fill.color);
  const fogColor = new THREE.Color(preset.fog.color);

  // 섀도우 톤은 환경광과 필라이트를 65:35로 블렌딩해 배경 명암색과 완벽히 맞춘다.
  const shadeColor = ambientColor.clone().lerp(fillColor, 0.35);
  // 림라이트는 역광·노을에서는 주광색, 밤·비에서는 필/키 혼합광으로 분리한다.
  const rimColor =
    preset.id === "backlight" || preset.id === "sunset"
      ? keyColor.clone()
      : keyColor.clone().lerp(fillColor, 0.45);

  const outlineWidthFactor = round4(preset.inkLineWeightPx * 0.0014);

  return Object.freeze({
    atmosphereId: preset.id,
    labelKo: preset.labelKo,
    colorTemperatureKelvin: ATMOSPHERE_KELVIN_MAP[preset.id],
    keyLightColorCss: threeColorToOklchCss(keyColor),
    keyLightDirection: Object.freeze([...preset.lighting.key.direction] as [number, number, number]),
    keyLightIntensity: preset.lighting.key.intensity,
    shadeColorCss: threeColorToOklchCss(shadeColor),
    shadeShiftFactor: rimCfg.shadeShift,
    shadeToonyFactor: rimCfg.shadeToony,
    rimColorCss: threeColorToOklchCss(rimColor),
    rimFresnelPower: rimCfg.rimPower,
    rimLiftFactor: rimCfg.rimLift,
    fogEnabled: preset.fog.active,
    fogColorCss: threeColorToOklchCss(fogColor),
    fogDensity: preset.fog.density,
    fogNear: preset.fog.near,
    fogFar: preset.fog.far,
    outlineWidthPx: preset.inkLineWeightPx,
    outlineWidthFactor,
    contactShadowOpacity: rimCfg.shadowOpacity,
  });
}

/**
 * 배경 조명·그림자·안개·툰 아웃라인을 스테이지 내 모든 3D 캐릭터(VRM MToon & 프로시저럴 PBR/Toon)에
 * 즉각 동기화해 배경↔캐릭터 이질감을 제거한다.
 */
export function syncCharacterLightingWithBg3dAtmosphere(
  characterRoots: readonly THREE.Object3D[],
  atmosphereOrId: StudioBg3dWebtoonAtmospherePreset | StudioBg3dWebtoonAtmospherePresetId,
): CharacterAtmosphereSyncReceipt {
  const preset =
    typeof atmosphereOrId === "string"
      ? (getStudioBg3dWebtoonAtmospherePreset(atmosphereOrId) ?? STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS[1]!)
      : atmosphereOrId;
  const parameters = computeCharacterMToonAtmosphereSync(preset);
  const keyColor = new THREE.Color(preset.lighting.key.color);
  const ambientColor = new THREE.Color(preset.lighting.ambientColor);
  const fillColor = new THREE.Color(preset.lighting.fill.color);
  const shadeColor = ambientColor.clone().lerp(fillColor, 0.35);
  const rimColor =
    preset.id === "backlight" || preset.id === "sunset"
      ? keyColor.clone()
      : keyColor.clone().lerp(fillColor, 0.45);

  const visitedMaterials = new Set<THREE.Material>();

  for (const root of characterRoots) {
    root.userData.syncedAtmosphereId = preset.id;
    root.userData.syncedOutlineWidthPx = parameters.outlineWidthPx;
    root.userData.contactShadowOpacity = parameters.contactShadowOpacity;

    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const rawMat of mats) {
        if (!(rawMat instanceof THREE.Material) || visitedMaterials.has(rawMat)) continue;
        visitedMaterials.add(rawMat);
        const mat = rawMat as MToonLikeMaterial;
        if ("fog" in mat) mat.fog = parameters.fogEnabled;

        // VRM MToonMaterial 전용 속성 직접 동기화
        if (mat.shadeColorFactor instanceof THREE.Color) {
          mat.shadeColorFactor.copy(shadeColor);
        }
        if (typeof mat.shadeShiftFactor === "number") {
          mat.shadeShiftFactor = parameters.shadeShiftFactor;
        }
        if (typeof mat.shadeToonyFactor === "number") {
          mat.shadeToonyFactor = parameters.shadeToonyFactor;
        }
        if (mat.parametricRimColorFactor instanceof THREE.Color) {
          mat.parametricRimColorFactor.copy(rimColor);
        }
        if (typeof mat.parametricRimFresnelPowerFactor === "number") {
          mat.parametricRimFresnelPowerFactor = parameters.rimFresnelPower;
        }
        if (typeof mat.parametricRimLiftFactor === "number") {
          mat.parametricRimLiftFactor = parameters.rimLiftFactor;
        }
        if (typeof mat.outlineWidthFactor === "number") {
          mat.outlineWidthFactor = parameters.outlineWidthFactor;
        }
        // 일반 Three.js Standard/Toon 머티리얼에도 대기 반사광·림 틴트를 은은하게 반영
        if (mat.emissive instanceof THREE.Color) {
          mat.emissive.copy(rimColor);
          mat.emissiveIntensity = round4(0.06 + parameters.rimLiftFactor * 0.24);
        }
        mat.userData.mtoonAtmosphereSync = parameters;
        mat.needsUpdate = true;
      }
    });
  }

  return Object.freeze({
    isSynced: true,
    syncedMaterialCount: visitedMaterials.size,
    syncedCharacterCount: characterRoots.length,
    parameters,
  });
}

/**
 * 배치된 1~3명 캐릭터의 좌표·눈높이를 기준으로 웹툰 5종 연출 카메라 구도를 실계산한다.
 */
export function resolveWebtoonStageCameraPreset(
  presetId: WebtoonStageCameraPresetId,
  characters: readonly CompositeCharacterProfile[],
): ResolvedWebtoonStageCamera {
  const meta =
    WEBTOON_STAGE_CAMERA_PRESETS.find((item) => item.id === presetId) ?? WEBTOON_STAGE_CAMERA_PRESETS[0]!;
  const actorA = characters[0] ?? DEFAULT_COMPOSITE_CHARACTER_CAST[0]!;
  const actorB = characters[1] ?? actorA;

  const avgX = characters.length > 0
    ? characters.reduce((acc, c) => acc + c.positionM[0], 0) / characters.length
    : 0;
  const avgZ = characters.length > 0
    ? characters.reduce((acc, c) => acc + c.positionM[2], 0) / characters.length
    : 0;
  const eyeY = characters.length > 0
    ? characters.reduce((acc, c) => acc + c.heightM * 0.86, 0) / characters.length
    : 1.46;

  let position: readonly [number, number, number];
  let target: readonly [number, number, number];

  switch (meta.id) {
    case "dialogue-ots": {
      const dx = actorB.positionM[0] - actorA.positionM[0];
      const dz = actorB.positionM[2] - actorA.positionM[2];
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      position = [
        round4(actorA.positionM[0] - nx * 1.15 - nz * 0.42),
        round4(actorA.heightM * 0.84),
        round4(actorA.positionM[2] - nz * 1.15 + nx * 0.42),
      ];
      target = [round4(actorB.positionM[0]), round4(actorB.heightM * 0.84), round4(actorB.positionM[2])];
      break;
    }
    case "confrontation-low-angle": {
      position = [round4(avgX + 0.35), 0.58, round4(avgZ + 2.85)];
      target = [round4(avgX), round4(eyeY + 0.08), round4(avgZ)];
      break;
    }
    case "high-angle-full-body": {
      position = [round4(avgX + 1.8), 3.75, round4(avgZ + 4.4)];
      target = [round4(avgX), 0.92, round4(avgZ - 0.3)];
      break;
    }
    case "two-shot-closeup": {
      position = [round4(avgX), round4(eyeY - 0.02), round4(avgZ + 2.15)];
      target = [round4(avgX), round4(eyeY - 0.04), round4(avgZ)];
      break;
    }
    case "corridor-perspective": {
      position = [round4(avgX * 0.4), 1.48, round4(avgZ + 4.9)];
      target = [round4(avgX * 0.3), 1.38, round4(avgZ - 4.2)];
      break;
    }
  }

  return Object.freeze({
    preset: meta,
    position: Object.freeze(position),
    target: Object.freeze(target),
    fovDegrees: focalLengthMmToFovDeg(meta.focalLengthMm),
    focalLengthMm: meta.focalLengthMm,
    dutchRollDeg: meta.dutchRollDeg,
  });
}

function projectBoxToViewportSvgRect(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly depth01: number } | null {
  if (box.isEmpty()) return null;
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let avgDist = 0;

  for (const pt of corners) {
    avgDist += pt.distanceTo(camera.position);
    pt.project(camera);
    const sx = (pt.x * 0.5 + 0.5) * width;
    const sy = (-pt.y * 0.5 + 0.5) * height;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }

  const clampedMinX = Math.max(0, Math.min(width, minX));
  const clampedMaxX = Math.max(0, Math.min(width, maxX));
  const clampedMinY = Math.max(0, Math.min(height, minY));
  const clampedMaxY = Math.max(0, Math.min(height, maxY));
  const w = clampedMaxX - clampedMinX;
  const h = clampedMaxY - clampedMinY;
  if (w < 2 || h < 2) return null;

  const meanDist = avgDist / 8;
  const depth01 = Math.max(0.05, Math.min(1, meanDist / 18));
  return { x: round4(clampedMinX), y: round4(clampedMinY), w: round4(w), h: round4(h), depth01: round4(depth01) };
}

function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 3D 배경 + 1~3명 캐릭터 합성 씬을 선화·음영·깊이 3패스로 동시 촬영하고
 * Rights BOM과 재촬영 메타데이터가 봉인된 비파괴 원고 컷 레이어(`BakedManuscriptCutLayer`)를 생성한다.
 */
export function captureCompositeStagePasses(input: {
  readonly session: CharacterCompositeStageSession;
  readonly targetDocumentId: string;
  readonly targetCutIndex: number;
  readonly previewMode?: LiveInkPreviewMode;
  readonly splitWipeRatio?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
}): CompositeStageCaptureBundle {
  const widthPx = Math.max(320, input.widthPx ?? 960);
  const heightPx = Math.max(240, input.heightPx ?? 640);
  const { session } = input;
  const syncParams = session.lastSyncReceipt.parameters;

  const camera = new THREE.PerspectiveCamera(session.activeCamera.fovDegrees, widthPx / heightPx, 0.1, 80);
  camera.position.set(
    session.activeCamera.position[0],
    session.activeCamera.position[1],
    session.activeCamera.position[2],
  );
  camera.lookAt(
    session.activeCamera.target[0],
    session.activeCamera.target[1],
    session.activeCamera.target[2],
  );
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const tempBox = new THREE.Box3();
  const bgShapes: string[] = [];
  const bgInk: string[] = [];
  const bgDepth: string[] = [];
  const charShapes: string[] = [];
  const charInk: string[] = [];
  const charDepth: string[] = [];

  try {
    session.backgroundBuild.group.updateMatrixWorld(true);
    let bgCount = 0;
    session.backgroundBuild.group.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || bgCount >= 28) return;
      bgCount += 1;
      tempBox.setFromObject(node);
      const rect = projectBoxToViewportSvgRect(tempBox, camera, widthPx, heightPx);
      if (!rect) return;
      const depthL = round4(0.92 - rect.depth01 * 0.72);
      bgShapes.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${syncParams.shadeColorCss}" fill-opacity="0.32" stroke="${syncParams.keyLightColorCss}" stroke-opacity="0.45" stroke-width="1"/>`);
      bgInk.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="none" stroke="${oklchToCssString({ l: 0.16, c: 0.01, h: 250 })}" stroke-width="${syncParams.outlineWidthPx}"/>`);
      bgDepth.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${oklchToCssString({ l: depthL, c: 0, h: 0 })}" fill-opacity="0.85"/>`);
    });

    for (const slot of session.slots) {
      slot.root.updateMatrixWorld(true);
      tempBox.setFromObject(slot.root);
      const rect = projectBoxToViewportSvgRect(tempBox, camera, widthPx, heightPx);
      if (!rect) continue;
      const depthL = round4(0.95 - rect.depth01 * 0.65);
      charShapes.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="12" fill="${syncParams.keyLightColorCss}" fill-opacity="0.72" stroke="${syncParams.rimColorCss}" stroke-width="${Math.max(1.5, syncParams.outlineWidthPx)}"/>`);
      charInk.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="12" fill="none" stroke="${oklchToCssString({ l: 0.12, c: 0.01, h: 250 })}" stroke-width="${round4(syncParams.outlineWidthPx * 1.15)}"/>`);
      charDepth.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="12" fill="${oklchToCssString({ l: depthL, c: 0, h: 0 })}"/>`);
    }
  } finally {
    tempBox.makeEmpty();
  }

  const inkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}"><rect width="100%" height="100%" fill="${oklchToCssString({ l: 0.99, c: 0, h: 0 })}"/>${bgInk.join("")}${charInk.join("")}</svg>`;
  const shadedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}"><rect width="100%" height="100%" fill="${syncParams.fogColorCss}"/>${bgShapes.join("")}${charShapes.join("")}</svg>`;
  const depthSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}"><rect width="100%" height="100%" fill="${oklchToCssString({ l: 0.12, c: 0, h: 0 })}"/>${bgDepth.join("")}${charDepth.join("")}</svg>`;

  const assetIds = [
    `bg3d:rich-scene:${session.backgroundBuild.preset.id}:${session.backgroundBuild.density}`,
    ...session.slots.map((slot) =>
      slot.profile.sourceKind === "vrm-bridge" && slot.profile.vrmAssetId
        ? slot.profile.vrmAssetId
        : `bg3d:avatar:${slot.profile.id}`,
    ),
  ];

  const snapshot: Scene3DCaptureSnapshot = Object.freeze({
    sceneId: `composite-${session.backgroundBuild.preset.id}`,
    cameraId: session.activeCamera.preset.id,
    stage: "live-ink",
    widthPx,
    heightPx,
    inkPassRef: encodeSvgDataUrl(inkSvg),
    shadedPassRef: encodeSvgDataUrl(shadedSvg),
    depthPassRef: encodeSvgDataUrl(depthSvg),
    inkLineWeightPx: syncParams.outlineWidthPx,
    assetIds: Object.freeze(assetIds),
    capturedAt: new Date().toISOString(),
    camera: Object.freeze({
      position: session.activeCamera.position,
      target: session.activeCamera.target,
      fovDegrees: session.activeCamera.fovDegrees,
    }),
    atmospherePresetId: session.activeAtmosphereId,
    lightingSummary: Object.freeze({
      ambientColor: syncParams.shadeColorCss,
      ambientIntensity: 0.65,
      keyColor: syncParams.keyLightColorCss,
      keyIntensity: syncParams.keyLightIntensity,
      exposure: 1.05,
      fogActive: syncParams.fogEnabled,
      fogDensity: syncParams.fogDensity,
    }),
  });

  const baked = buildBakedManuscriptCutLayer({
    capture: snapshot,
    targetDocumentId: input.targetDocumentId,
    targetCutIndex: input.targetCutIndex,
    previewMode: input.previewMode ?? "split-wipe",
    splitWipeRatio: input.splitWipeRatio ?? 0.5,
  });

  if (!baked.ok) {
    throw new Error(baked.messageKo);
  }

  return Object.freeze({
    snapshot,
    bakedLayer: baked.layer,
    characterCount: session.slots.length,
    atmosphereId: session.activeAtmosphereId,
    cameraPresetId: session.activeCamera.preset.id,
  });
}

/**
 * 6종 고밀도 3D 배경 + 1~3명 3D 캐릭터(VRM 브리지 또는 프로시저럴 휴머노이드) 실시간 합성 스테이지를 생성한다.
 */
export function createCharacterCompositeStage(input: {
  readonly presetId: RichWebtoonScenePresetId;
  readonly density?: RichSceneDensityTier;
  readonly characters?: readonly CompositeCharacterProfile[];
  readonly atmosphereId?: StudioBg3dWebtoonAtmospherePresetId;
  readonly cameraPresetId?: WebtoonStageCameraPresetId;
  readonly vrmAssetsByCharacterId?: Readonly<Record<string, VrmSceneLike | undefined>>;
}): CharacterCompositeStageSession {
  const backgroundBuild = buildRichWebtoonScenePreset(input.presetId, input.density ?? "rich");
  const rawCharacters = input.characters && input.characters.length > 0
    ? input.characters.slice(0, MAX_COMPOSITE_STAGE_CHARACTERS)
    : DEFAULT_COMPOSITE_CHARACTER_CAST.slice(0, 2);

  const stageRoot = new THREE.Group();
  stageRoot.name = `bg3d-character-composite-stage:${backgroundBuild.preset.id}`;
  stageRoot.add(backgroundBuild.group);

  const characterGroup = new THREE.Group();
  characterGroup.name = "layer:composite-characters";
  stageRoot.add(characterGroup);

  const anchors = backgroundBuild.furnitureAnchors;
  const slots: CompositeCharacterRuntimeSlot[] = [];

  for (let idx = 0; idx < rawCharacters.length; idx += 1) {
    const profile = rawCharacters[idx]!;
    const vrmAsset = input.vrmAssetsByCharacterId?.[profile.id] ?? null;

    let root: THREE.Group;
    let resolvedSourceKind: CompositeCharacterSourceKind;
    if (vrmAsset) {
      root = new THREE.Group();
      root.name = `character-slot:${profile.id}`;
      root.userData.characterId = profile.id;
      root.userData.sourceKind = "vrm-bridge";
      root.add(vrmAsset.scene);
      resolvedSourceKind = "vrm-bridge";
    } else {
      root = buildProceduralHumanoidCharacterGroup(profile);
      resolvedSourceKind = profile.sourceKind;
    }
    characterGroup.add(root);

    const anchor = profile.anchorId
      ? (anchors.find((a) => a.id === profile.anchorId) ?? null)
      : (anchors.find((a) => a.kind === profile.stance) ?? anchors[idx % anchors.length] ?? null);

    const baseSlot: CompositeCharacterRuntimeSlot = {
      profile: { ...profile, sourceKind: resolvedSourceKind },
      root,
      vrmAsset,
      groundedMinY: 0,
      manifold: validateObject3DManifoldAndGrounding(root),
    };
    const snapped = snapCharacterToStageAnchor(baseSlot, anchor, profile.stance);
    slots.push(snapped);
  }

  const activeAtmosphereId = input.atmosphereId ?? backgroundBuild.recommendedAtmosphereId;
  const lastSyncReceipt = syncCharacterLightingWithBg3dAtmosphere(
    slots.map((s) => s.root),
    activeAtmosphereId,
  );
  const activeCamera = resolveWebtoonStageCameraPreset(
    input.cameraPresetId ?? "dialogue-ots",
    slots.map((s) => s.profile),
  );

  let disposed = false;
  const dispose = (): DisposedGpuResourceCounts => {
    if (disposed) {
      return Object.freeze({ disposedGeometries: 0, disposedMaterials: 0, disposedTextures: 0 });
    }
    disposed = true;
    let bgCounts: DisposedGpuResourceCounts | undefined;
    let charCounts: DisposedGpuResourceCounts | undefined;
    try {
      bgCounts = backgroundBuild.dispose();
    } finally {
      try {
        charCounts = disposeObject3DResources(characterGroup);
      } finally {
        stageRoot.clear();
      }
    }
    return Object.freeze({
      disposedGeometries: (bgCounts?.disposedGeometries ?? 0) + (charCounts?.disposedGeometries ?? 0),
      disposedMaterials: (bgCounts?.disposedMaterials ?? 0) + (charCounts?.disposedMaterials ?? 0),
      disposedTextures: (bgCounts?.disposedTextures ?? 0) + (charCounts?.disposedTextures ?? 0),
    });
  };

  return Object.freeze({
    stageRoot,
    backgroundBuild,
    slots: Object.freeze(slots),
    activeAtmosphereId,
    lastSyncReceipt,
    activeCamera,
    dispose,
  });
}

/**
 * 비동기 VRM 로더 브리지를 통해 외부/저장소 VRM 모델을 지정 캐릭터 슬롯에 로드하고
 * 바닥 접지 및 현재 분위기 MToon 셰이딩을 자동 동기화한다.
 */
export async function loadVrmModelViaBridgeIntoSlot(input: {
  readonly bridge: VrmModelLoaderBridge;
  readonly profile: CompositeCharacterProfile;
  readonly anchor: StageFurnitureAnchor | null;
  readonly atmosphereId: StudioBg3dWebtoonAtmospherePresetId;
}): Promise<{
  readonly slot: CompositeCharacterRuntimeSlot;
  readonly syncReceipt: CharacterAtmosphereSyncReceipt;
  readonly dispose: () => DisposedGpuResourceCounts;
}> {
  const url = input.profile.vrmUrl;
  if (!url) {
    throw new Error("VRM 모델 URL이 지정되지 않았어요. 캐릭터 VRM 경로를 먼저 선택해 주세요.");
  }
  const vrmAsset = await input.bridge.loadVrmModel(url);
  const root = new THREE.Group();
  root.name = `character-slot:${input.profile.id}`;
  root.userData.characterId = input.profile.id;
  root.userData.sourceKind = "vrm-bridge";
  root.add(vrmAsset.scene);

  const initialSlot: CompositeCharacterRuntimeSlot = {
    profile: { ...input.profile, sourceKind: "vrm-bridge" },
    root,
    vrmAsset,
    groundedMinY: 0,
    manifold: validateObject3DManifoldAndGrounding(root),
  };
  const snapped = snapCharacterToStageAnchor(initialSlot, input.anchor, input.profile.stance);
  const syncReceipt = syncCharacterLightingWithBg3dAtmosphere([snapped.root], input.atmosphereId);

  const dispose = (): DisposedGpuResourceCounts => {
    try {
      return disposeObject3DResources(root);
    } finally {
      root.clear();
    }
  };

  return Object.freeze({ slot: snapped, syncReceipt, dispose });
}
