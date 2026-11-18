/** 리그의 툰·밑색·OpenPBR 재질 입력을 같은 원래 수식으로 계산한다. */
import { Material } from "@babylonjs/core/Materials/material.js";

import { qConjugate, qMultiply, qRotateVec3 } from "../../shared/math";
import { faceSdfUniforms } from "../face-sdf";
import { MATERIAL_PRESETS, hexToLinear, toonShadeTint } from "../material-presets";
import { mapPresetToOpenPbr } from "../openpbr-mapping";
import { normalizeToonLighting } from "../toon-reference";

import { isKitPart, partHasVertexColors, rigBoneWorld } from "./character-rig";
import { srgb } from "./engine-io";

import type { ShadingProfile, Vec3 } from "../../contracts";
import type { OpenPbrParams } from "../openpbr-mapping";
import type { CharacterRig, RigPart } from "./character-rig";
import type { ToonUniformValues } from "./materials/toon-shader";
import type { CharacterScene } from "./scene-builder";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";

interface ToonValueSource {
  readonly shading: ShadingProfile;
  readonly character: Pick<CharacterScene, "keyLight" | "fillLight" | "sunDirection">;
  readonly averageColor: readonly [number, number, number];
  readonly hasPaint: boolean;
  readonly hasAlbedo: boolean;
}

/**
 * 툰·밑색 패스가 메시의 정점 색(`COLOR_0`)을 알베도에 곱할지. 키트 파츠만이다: 키트의 `COLOR_0`은 계약상 회색 AO(R=G=B)다.
 * 제작 패키지(Orion: 채널마다 다른 v0 의미)와 절차 소스는 툰이 정점 색을 읽지 않던 기존 거동을 그대로 둔다(PBR은 이미 곱한다).
 */
export function usesRigVertexColor(part: RigPart, rig: CharacterRig | null): boolean {
  return isKitPart(rig, part) && partHasVertexColors(part);
}

/**
 * 알베도 텍스처 알파 컷오프. glTF `alphaMode: MASK`(키트의 눈썹·속눈썹)로 올라온 재질은 로더가 PBR을 알파 테스트(`alphaCutOff`)로 둔다 —
 * 툰·밑색 ShaderMaterial은 알파를 쓰지 않아 컷아웃 카드가 불투명하게 그려지므로 같은 컷오프로 버린다. 알베도 텍스처가 없거나 알파 테스트가 아니면 0(끔)이다.
 */
export function rigPartAlphaCutoff(part: RigPart): number {
  return part.hasAlbedoTexture && part.pbr.transparencyMode === Material.MATERIAL_ALPHATEST ? part.pbr.alphaCutOff : 0;
}

/** 패키지 알베도가 있거나 입 안 마스크를 쓰는 파츠(툰·flat 패스가 알베도 샘플을 곱한다) */
export function rigPartHasAlbedoTexture(part: RigPart, masked: boolean): boolean {
  return part.hasAlbedoTexture || masked;
}

export function rigPartAlbedoTexture(part: RigPart, masked: boolean, mouthMask: BaseTexture, whiteTexture: BaseTexture): BaseTexture {
  if (part.hasAlbedoTexture && part.pbr.albedoTexture) return part.pbr.albedoTexture;
  return masked ? mouthMask : whiteTexture;
}

export function rigPartOpenPbrParams(part: RigPart, sssAvailable: boolean): OpenPbrParams {
  // 키트 틴트 파츠는 텍스처가 있어도 색(= 틴트)을 곱한다.
  const albedo: readonly [number, number, number] = part.hasAlbedoTexture && part.tint === undefined ? [1, 1, 1] : hexToLinear(part.colorHex);
  return mapPresetToOpenPbr(MATERIAL_PRESETS[part.materialPreset], albedo, { sssAvailable });
}

/** 머리 본의 rest 대비 회전으로 얼굴 forward(+Z)·right(+X)를 구한다(패키지의 비항등 rest도 동일). */
function headAxes(rig: CharacterRig | null): { readonly forward: Vec3; readonly right: Vec3 } {
  const head = rig?.humanoid.get("head");
  if (!head) return { forward: [0, 0, 1], right: [1, 0, 0] };
  const delta = qMultiply(rigBoneWorld(head).rotation, qConjugate(head.restWorld));
  return { forward: qRotateVec3(delta, [0, 0, 1]), right: qRotateVec3(delta, [1, 0, 0]) };
}

export function rigToonValues(part: RigPart, rig: CharacterRig | null, source: ToonValueSource): ToonUniformValues {
  const toon = source.shading.toon;
  const ibl = source.shading.ibl;
  const key = source.character.keyLight;
  const lightScale = Math.min(1, key.intensity / 2.4);
  const ambientScale = (ibl.enabled ? ibl.intensity : 0) * 0.5 + source.character.fillLight.intensity * 0.5;
  const average = source.averageColor;
  const axes = headAxes(rig);
  const face = faceSdfUniforms(axes.forward, axes.right, source.character.sunDirection);
  // 얼굴 SDF 그림자는 절차 머리의 정면 대칭 UV를 전제로 한 해석 맵이다. 키트 머리 UV(HBM 재전개)에는 맞지 않아 키트(v1)는 N·L 램프로 음영한다.
  const useFaceSdf = toon.faceSdfShadow && part.role === "head" && !isKitPart(rig, part);
  // 광원 + 환경의 합이 1을 넘으면 밝은 알베도가 흰색으로 날아가므로 같은 비율로 정규화한다(툰 색에는 톤맵이 없다).
  const lighting = normalizeToonLighting(
    [key.diffuse.r * lightScale, key.diffuse.g * lightScale, key.diffuse.b * lightScale],
    [Math.min(1, average[0] * ambientScale), Math.min(1, average[1] * ambientScale), Math.min(1, average[2] * ambientScale)],
  );
  const look = source.shading.look;
  return {
    baseColor: srgb(part.colorHex),
    shadeTint: toonShadeTint(part.role),
    lightColor: lighting.light,
    ambientColor: lighting.ambient,
    toLight: source.character.sunDirection,
    rimColor: [0.35, 0.35, 0.4],
    rampSteps: toon.rampSteps,
    rim: toon.rim,
    faceSdf: useFaceSdf,
    hasPaint: source.hasPaint,
    faceThreshold: face.threshold,
    flipU: face.flipU,
    sdfOffset: 0,
    hasAlbedo: source.hasAlbedo,
    mangaToneKind: look.tone.kind,
    mangaToneStrength: look.tone.strength,
    mangaCellPerHead: look.tone.cellPerHead,
    mangaAngleDeg: look.tone.angleDeg,
    mangaInk: look.tone.ink,
    gradeSaturation: look.grade.saturation,
    gradeLightness: look.grade.lightness,
    rampSoftness: look.ramp.softness,
  };
}
