/**
 * BabylonCharacterEngine용 툰 셰이더 파라미터·안구 하이라이트·실측 렌더 텔레메트리 계산 헬퍼.
 * 엔진 본체(`character-engine.ts`) 크기를 억제하고 순수 계산과 Babylon 상태 수집을 분리한다.
 */
import { Material } from "@babylonjs/core/Materials/material.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

import { clamp, v3Cross, v3Length, v3Normalize, v3Sub } from "../../shared/math";
import { isLookV2Identity, resolveKWebtoonFeatureParams, resolveLookRimColor, resolveLookShadeTint } from "../kwebtoon-shading";
import { computeEyeballHighlightTransform } from "../toon-reference";

import { isKitPart, rigBoneWorld } from "./character-rig";
import { fromVector3, toQuaternion, toVector3 } from "./convert";
import { srgb } from "./engine-io";
import { createPassMaterial, setAlphaCutoff, setToonTextures, setToonUniforms, shaderLanguageFor } from "./materials/toon-shader";

import type { CharacterRig, RigPart } from "./character-rig";
import type { NodeToonTextures } from "./materials/node-toon-material";
import type { ToonUniformValues } from "./materials/toon-shader";
import type { PressureOutlineTelemetry } from "./pressure-outline";
import type { JointDragHandle, ShadingProfile, Vec3 } from "../../contracts";
import type { EyeballHighlightConfig, EyeballHighlightState } from "../render-telemetry";
import type { CharacterLabRenderTelemetry } from "../style/character-verify-ai-fresh-ideas";
import type { ToonParams } from "../toon-reference";
import type { ViewportCameraInfo } from "../viewport-camera";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** 방향 벡터를 오일러 각도(pitch X, yaw Y, roll 0, deg)로 변환한다. */
export function directionToEulerDeg(direction: Vec3): Vec3 {
  const len = v3Length(direction);
  if (!(len > 1e-6)) return [0, 0, 0];
  const n = v3Normalize(direction);
  const pitch = Math.asin(clamp(-n[1], -1, 1)) * RAD_TO_DEG;
  const yaw = Math.atan2(n[0], n[2]) * RAD_TO_DEG;
  return [pitch, yaw, 0];
}

function eulerDegToQuat(eulerDeg: Vec3): readonly [number, number, number, number] {
  const hx = (eulerDeg[0] * DEG_TO_RAD) * 0.5;
  const hy = (eulerDeg[1] * DEG_TO_RAD) * 0.5;
  const hz = (eulerDeg[2] * DEG_TO_RAD) * 0.5;
  const cx = Math.cos(hx);
  const sx = Math.sin(hx);
  const cy = Math.cos(hy);
  const sy = Math.sin(hy);
  const cz = Math.cos(hz);
  const sz = Math.sin(hz);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

/**
 * 4모드 안구 하이라이트 변환을 계산하고, 리그에 `eye-highlight` 파츠 메시가 있으면 실제 회전을 반영한다.
 */
export function evaluateAndApplyEyeballHighlight(input: {
  readonly config: EyeballHighlightConfig;
  readonly rig: CharacterRig | null;
  readonly eyeballEulerDeg: Vec3;
  readonly cameraForward: Vec3;
  readonly sunDirection: Vec3;
}): EyeballHighlightState {
  const cameraLookEulerDeg = directionToEulerDeg(input.cameraForward);
  const lightEulerDeg = directionToEulerDeg(input.sunDirection);
  const computed = computeEyeballHighlightTransform({
    mode: input.config.mode,
    eyeballEulerDeg: input.eyeballEulerDeg,
    cameraLookEulerDeg,
    lightEulerDeg,
    offsetPos: input.config.offsetPos,
    fixEyeballCam: input.config.fixEyeballCam,
  });

  if (input.rig) {
    const highlightQuat = toQuaternion(eulerDegToQuat(computed.highlightEulerDeg));
    for (const part of input.rig.parts) {
      if (part.role !== "eye-highlight") continue;
      for (const mesh of part.meshes) {
        if (mesh.skeleton !== null) continue;
        mesh.rotationQuaternion = highlightQuat.clone();
      }
    }
  }

  return {
    mode: input.config.mode,
    offsetPos: input.config.offsetPos,
    fixEyeballCam: input.config.fixEyeballCam,
    resolvedEyeballEulerDeg: computed.resolvedEyeballEulerDeg,
    highlightEulerDeg: computed.highlightEulerDeg,
  };
}

/** 툰 셰이더 확장 유니폼(3차 MatCap · 방향성 역광 림 · Kajiya-Kay 헤어 엔젤링 · K-웹툰 2단 셀/블러셔/홍채) 값을 산출한다. */
export function resolveEnhancedToonParams(
  part: Pick<RigPart, "role" | "hairFlowUv"> & { readonly colorHex?: string },
  shading: ShadingProfile,
): Pick<
  ToonParams,
  | "cubicMatCapWeight"
  | "cubicMatCapPos"
  | "cubicMatCapWidth"
  | "directionalBacklightRimGate"
  | "hairAngelRingIntensity"
  | "hairAngelRingCenter"
  | "hairAngelRingWidth"
  | "hairAngelRingSecondaryWeight"
  | "smoothFaceSdf"
  | "kwebtoonFaceMakeup"
  | "kwebtoonIrisGradient"
  | "kwebtoonLipTint"
  | "kwebtoonCheekBlush"
> &
  Partial<Pick<ToonParams, "shadeTint" | "rimColor">> {
  const softness = clamp(shading.look.ramp.softness, 0, 1);
  const isHair = part.role === "hair";
  const v2Identity = isLookV2Identity(shading.look);
  const specStrength = shading.look.specular.hairBand !== "none" ? shading.look.specular.strength : 0;
  const hairBoost = !v2Identity && specStrength > 0 ? clamp(0.42 + specStrength * 0.34, 0.36, 0.78) : part.hairFlowUv ? 0.48 : 0.36;
  const kw = resolveKWebtoonFeatureParams(part.role, shading);
  return {
    ...(v2Identity
      ? {}
      : {
          shadeTint: resolveLookShadeTint(part.role, part.colorHex ?? "#f3d3bd", shading.look),
          rimColor: resolveLookRimColor(shading.look),
        }),
    cubicMatCapWeight: 0.25 + softness * 0.25,
    cubicMatCapPos: 0.5,
    cubicMatCapWidth: clamp(0.62 + softness * 0.28, 0.2, 0.95),
    directionalBacklightRimGate: shading.toon.rim ? 1 : 0,
    hairAngelRingIntensity: isHair ? hairBoost : 0,
    hairAngelRingCenter: !v2Identity && shading.look.specular.hairBand !== "none" ? shading.look.specular.center : 0.58,
    hairAngelRingWidth: !v2Identity && shading.look.specular.width > 0.02 ? shading.look.specular.width : 0.11,
    hairAngelRingSecondaryWeight: 0.38,
    smoothFaceSdf: true,
    kwebtoonFaceMakeup: kw.faceMakeupIntensity,
    kwebtoonIrisGradient: kw.irisGradientIntensity,
    kwebtoonLipTint: kw.lipTintIntensity,
    kwebtoonCheekBlush: kw.cheekBlushIntensity,
  };
}

/**
 * 실제 Babylon 리그·셰이더 재질·필압 외곽선 컨트롤러 상태에서 Verify AI 실측 텔레메트리를 수집한다.
 * 어떤 패스도 강제로 true로 채우지 않으며, 해당 패스가 현재 씬/리그에 실제로 활성화된 경우에만 true를 보고한다.
 */
export function collectEngineRenderTelemetry(
  rig: CharacterRig | null,
  shading: ShadingProfile,
  outlineTelemetry: PressureOutlineTelemetry | null,
): CharacterLabRenderTelemetry {
  const isToon = shading.mode === "toon";
  const hasAnyToon = isToon && (rig?.parts.some((part) => part.toon !== null && part.visible && !part.forceHidden) ?? false);
  const headPart = rig?.parts.find((part) => part.role === "head") ?? null;
  const hairPart = rig?.parts.find((part) => part.role === "hair") ?? null;
  const hasToonHead = isToon && headPart !== null && headPart.toon !== null && headPart.visible && !headPart.forceHidden;
  const hasToonHair = isToon && hairPart !== null && hairPart.toon !== null && hairPart.visible && !hairPart.forceHidden;
  const kitFaceShadowUvPresent = headPart !== null && (!isKitPart(rig, headPart) || headPart.faceShadowUv === true);

  return {
    headContourPassActive: Boolean(outlineTelemetry?.headContourPassActive),
    faceSdfAntiAliased: hasToonHead && shading.toon.faceSdfShadow,
    kitFaceShadowUvPresent,
    cubicMatCapActive: hasAnyToon,
    directionalBacklightRimActive: hasAnyToon && shading.toon.rim,
    hairAngelRingActive: hasToonHair,
    screenSpaceOutlineCompensation: Boolean(outlineTelemetry?.screenSpaceOutlineCompensation),
    coloredLineartActive: Boolean(outlineTelemetry?.coloredLineartActive),
    vertexTaperMaskActive: Boolean(outlineTelemetry?.vertexTaperMaskActive),
    hairInlineStencilActive: Boolean(outlineTelemetry?.hairInlineStencilActive),
  };
}

/** 뷰포트 ArcRotateCamera의 평문 카메라 정보(위치·축·FOV·해상도)를 계산한다. */
export function readViewportCameraInfo(camera: ArcRotateCamera, engine: AbstractEngine): ViewportCameraInfo {
  const target = fromVector3(camera.target);
  const sinBeta = Math.sin(camera.beta);
  const position: Vec3 = [
    target[0] + camera.radius * Math.cos(camera.alpha) * sinBeta,
    target[1] + camera.radius * Math.cos(camera.beta),
    target[2] + camera.radius * Math.sin(camera.alpha) * sinBeta,
  ];
  const direction = v3Sub(target, position);
  const forward: Vec3 = v3Length(direction) < 1e-9 ? [0, 0, -1] : v3Normalize(direction);
  const crossUp = v3Cross(forward, [0, 1, 0]);
  const right: Vec3 = v3Length(crossUp) < 1e-6 ? [1, 0, 0] : v3Normalize(crossUp);
  const up: Vec3 = v3Cross(right, forward);
  return { position, forward, right, up, fovY: camera.fov, width: engine.getRenderWidth(), height: engine.getRenderHeight() };
}

/** 휴머노이드 본의 화면 투영 핸들 목록을 계산한다. */
export function projectRigJointHandles(rig: CharacterRig, camera: ArcRotateCamera, engine: AbstractEngine): readonly JointDragHandle[] {
  const viewProjection = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
  const viewport = new Viewport(0, 0, engine.getRenderWidth(), engine.getRenderHeight());
  const handles: JointDragHandle[] = [];
  for (const [bone, rb] of rig.humanoid) {
    const world = rigBoneWorld(rb).position;
    const projected = Vector3.Project(toVector3(world), Matrix.IdentityReadOnly, viewProjection, viewport);
    handles.push({ bone, screen: [projected.x, projected.y], world });
  }
  return handles;
}

function submeshToonValues(baseValues: ToonUniformValues, meshPbr: PBRMaterial): ToonUniformValues {
  const hasTex = meshPbr.albedoTexture !== null;
  const hex = hasTex
    ? "#ffffff"
    : meshPbr.albedoColor
      ? meshPbr.albedoColor.toHexString().slice(0, 7).toLowerCase()
      : "#cccccc";
  return { ...baseValues, baseColor: srgb(hex), hasAlbedo: hasTex };
}

/**
 * 멀티 재질 GLB 파츠(소품·패키지)의 서브메시별 툰 재질을 보장한다.
 * 1차 `part.pbr`과 같은 서브메시는 `primaryToon`을 공유하고, 서로 다른 PBR 재질을 가진 서브메시만
 * `part.meshToons`에 별도 ShaderMaterial을 만들어 텍스처·알베도 색 덮어쓰기(품질 급락)를 막는다.
 */
export function resolveMeshToonMaterial(input: {
  readonly part: RigPart;
  readonly meshIndex: number;
  readonly primaryToon: ShaderMaterial;
  readonly baseValues: ToonUniformValues;
  readonly baseTextures: NodeToonTextures;
  readonly whiteTexture: BaseTexture;
  readonly scene: Scene;
  readonly engine: AbstractEngine;
  readonly vertexColor: boolean;
}): ShaderMaterial {
  const { part, meshIndex, primaryToon, baseValues, baseTextures, whiteTexture, scene, engine, vertexColor } = input;
  const meshPbr = part.meshPbrs?.[meshIndex];
  if (!meshPbr || meshPbr === part.pbr) return primaryToon;
  const map = (part.meshToons ??= new Map<PBRMaterial, ShaderMaterial>());
  let toonMat = map.get(meshPbr);
  if (!toonMat) {
    toonMat = createPassMaterial({ scene, language: shaderLanguageFor(engine) }, "toon", `toon:${part.id}:${meshPbr.name || meshIndex}`, {
      vertexColor,
      faceShadowUv: part.faceShadowUv === true,
      hairFlowUv: part.hairFlowUv === true,
    });
    toonMat.backFaceCulling = meshPbr.backFaceCulling;
    map.set(meshPbr, toonMat);
  }
  const values = submeshToonValues(baseValues, meshPbr);
  setToonUniforms(toonMat, values);
  const cutoff = meshPbr.albedoTexture !== null && meshPbr.transparencyMode === Material.MATERIAL_ALPHATEST ? meshPbr.alphaCutOff : 0;
  setAlphaCutoff(toonMat, cutoff);
  setToonTextures(toonMat, { ...baseTextures, albedo: meshPbr.albedoTexture ?? whiteTexture });
  return toonMat;
}

/** 파츠에 연결된 모든 서브메시 보조 툰 재질의 유니폼을 동기화한다. */
export function syncPartSubmeshToonUniforms(part: RigPart, baseValues: ToonUniformValues): void {
  if (!part.meshToons || part.meshToons.size === 0) return;
  for (const [meshPbr, toonMat] of part.meshToons) {
    toonMat.backFaceCulling = meshPbr.backFaceCulling;
    setToonUniforms(toonMat, submeshToonValues(baseValues, meshPbr));
  }
}
