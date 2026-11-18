/** 리그·조명·프로파일의 현재 값으로 툰 셰이더 uniform을 만든다. */
import { qConjugate, qMultiply, qRotateVec3 } from "../../shared/math";
import { faceSdfUniforms } from "../face-sdf";
import { toonShadeTint } from "../material-presets";
import { normalizeToonLighting } from "../toon-reference";

import { isKitPart, rigBoneWorld } from "./character-rig";
import { srgb } from "./engine-io";

import type { CharacterRig, RigPart } from "./character-rig";
import type { ToonUniformValues } from "./materials/toon-shader";
import type { CharacterScene } from "./scene-builder";
import type { ShadingProfile, Vec3 } from "../../contracts";

interface CharacterToonInput {
  readonly part: RigPart;
  readonly rig: CharacterRig | null;
  readonly shading: ShadingProfile;
  readonly character: Pick<CharacterScene, "keyLight" | "fillLight" | "sunDirection">;
  readonly averageColor: readonly [number, number, number];
  readonly hasPaint: boolean;
  readonly hasAlbedo: boolean;
}

/** 머리 본의 rest 대비 회전으로 얼굴 forward(+Z)·right(+X)를 구한다(패키지의 비항등 rest도 동일). */
function headAxes(rig: CharacterRig | null): { readonly forward: Vec3; readonly right: Vec3 } {
  const head = rig?.humanoid.get("head");
  if (!head) return { forward: [0, 0, 1], right: [1, 0, 0] };
  const delta = qMultiply(rigBoneWorld(head).rotation, qConjugate(head.restWorld));
  return { forward: qRotateVec3(delta, [0, 0, 1]), right: qRotateVec3(delta, [1, 0, 0]) };
}

export function buildCharacterToonValues({ part, rig, shading, character, averageColor: average, hasPaint, hasAlbedo }: CharacterToonInput): ToonUniformValues {
  const toon = shading.toon;
  const ibl = shading.ibl;
  const key = character.keyLight;
  const lightScale = Math.min(1, key.intensity / 2.4);
  const ambientScale = (ibl.enabled ? ibl.intensity : 0) * 0.5 + character.fillLight.intensity * 0.5;
  const axes = headAxes(rig);
  const face = faceSdfUniforms(axes.forward, axes.right, character.sunDirection);
  // 얼굴 SDF 그림자는 절차 머리의 정면 대칭 UV를 전제로 한 해석 맵이다. 키트 머리 UV(HBM 재전개)에는 맞지 않아 키트(v1)는 N·L 램프로 음영한다.
  const useFaceSdf = toon.faceSdfShadow && part.role === "head" && !isKitPart(rig, part);
  // 광원 + 환경의 합이 1을 넘으면 밝은 알베도가 흰색으로 날아가므로 같은 비율로 정규화한다(툰 색에는 톤맵이 없다).
  const lighting = normalizeToonLighting(
    [key.diffuse.r * lightScale, key.diffuse.g * lightScale, key.diffuse.b * lightScale],
    [Math.min(1, average[0] * ambientScale), Math.min(1, average[1] * ambientScale), Math.min(1, average[2] * ambientScale)],
  );
  const look = shading.look;
  return {
    baseColor: srgb(part.colorHex),
    shadeTint: toonShadeTint(part.role),
    lightColor: lighting.light,
    ambientColor: lighting.ambient,
    toLight: character.sunDirection,
    rimColor: [0.35, 0.35, 0.4],
    rampSteps: toon.rampSteps,
    rim: toon.rim,
    faceSdf: useFaceSdf,
    hasPaint,
    faceThreshold: face.threshold,
    flipU: face.flipU,
    sdfOffset: 0,
    hasAlbedo,
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
