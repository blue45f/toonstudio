import type { AvatarForgeState } from "./studio-vrm-avatar-forge";
import { hexToRgb, hslToRgb, rgbToHsl } from "./studio-vrm-costume";
import type { StudioVrmExportMaterial } from "./studio-vrm-export-plan";
import { meshClamp } from "./studio-vrm-humanoid-mesh-geometry";

/* -------------------------------------------------------------------------- */
/* 머티리얼                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 머티리얼 인덱스. 이름은 studio-vrm-costume 의 분류 휴리스틱에 걸리도록 지었다
 * (Skin·Face_EyeWhite·Face_Iris·Face_Brow·Face_Mouth·Hair 는 보호,
 * Tops/Bottoms/Shoes 는 의상 슬롯).
 */
export const STUDIO_VRM_HUMANOID_MATERIALS = Object.freeze({
  skin: 0,
  eyeWhite: 1,
  iris: 2,
  brow: 3,
  mouth: 4,
  hair: 5,
  tops: 6,
  bottoms: 7,
  shoes: 8,
});

/** 피부 톤은 조형 상태에 파라미터가 없다. 중립적인 한 가지 톤으로 고정한다. */
const SKIN_BASE = "#f4d5c4";
const SKIN_SHADE = "#dcae9b";
const EYE_WHITE = "#fbfbfd";
const EYE_WHITE_SHADE = "#d8dce8";
const MOUTH_COLOR = "#b4525a";

type Rgb = readonly [number, number, number];

function rgb(hex: string): Rgb {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b];
}

/** 색조를 돌려 결정론적인 보조 색을 만든다(의상 팔레트용). */
function shiftHue(hex: string, degrees: number, saturation: number, lightness: number): Rgb {
  const hsl = rgbToHsl(hexToRgb(hex));
  const shifted = hslToRgb({
    h: hsl.h + degrees,
    s: meshClamp(saturation, 0, 1),
    l: meshClamp(lightness, 0, 1),
  });
  return [shifted.r, shifted.g, shifted.b];
}

function darken(color: Rgb, amount: number): Rgb {
  return [color[0] * amount, color[1] * amount, color[2] * amount];
}

function toonMaterial(
  name: string,
  base: Rgb,
  shade: Rgb,
  options: {
    readonly outline?: number;
    readonly doubleSided?: boolean;
    readonly toony?: number;
    readonly roughness?: number;
  } = {},
): StudioVrmExportMaterial {
  return {
    name,
    baseColorFactor: [base[0], base[1], base[2], 1],
    metallicFactor: 0,
    roughnessFactor: options.roughness ?? 0.85,
    doubleSided: options.doubleSided,
    mtoon: {
      shadeColorFactor: [shade[0], shade[1], shade[2]],
      shadingToonyFactor: options.toony ?? 0.9,
      outlineWidthMode: "worldCoordinates",
      outlineWidthFactor: options.outline ?? 0.0016,
    },
  };
}

export function buildStudioVrmHumanoidMaterials(state: AvatarForgeState): StudioVrmExportMaterial[] {
  const hairBase = rgb(state.hair.baseColor);
  const hairShade = darken(rgb(state.hair.tipColor), 0.72);
  // 의상 색은 헤어 색조에서 결정론적으로 파생한다 — 프리셋마다 다른 옷을 입되 조화롭게.
  const tops = shiftHue(state.hair.baseColor, 168, 0.34, 0.62);
  const bottoms = shiftHue(state.hair.baseColor, 196, 0.28, 0.34);
  const shoes = shiftHue(state.hair.tipColor, 12, 0.22, 0.26);

  return [
    toonMaterial("Skin", rgb(SKIN_BASE), rgb(SKIN_SHADE), { outline: 0.0012, toony: 0.85 }),
    toonMaterial("Face_EyeWhite", rgb(EYE_WHITE), rgb(EYE_WHITE_SHADE), { outline: 0, toony: 1 }),
    toonMaterial("Face_Iris", rgb(state.hair.tipColor), darken(rgb(state.hair.baseColor), 0.6), {
      outline: 0,
      toony: 1,
    }),
    toonMaterial("Face_Brow", hairBase, hairShade, { outline: 0, toony: 1 }),
    toonMaterial("Face_Mouth", rgb(MOUTH_COLOR), darken(rgb(MOUTH_COLOR), 0.7), {
      outline: 0,
      toony: 1,
    }),
    toonMaterial("Hair", hairBase, hairShade, {
      outline: 0.0022,
      doubleSided: true,
      toony: 0.94,
      // 조형 패널의 광택 슬라이더가 내보낸 VRM 에 실제로 반영되게 한다.
      roughness: meshClamp(1 - state.hair.shine, 0.2, 1),
    }),
    toonMaterial("Tops", tops, darken(tops, 0.68), { outline: 0.002 }),
    toonMaterial("Bottoms", bottoms, darken(bottoms, 0.68), { outline: 0.002 }),
    toonMaterial("Shoes", shoes, darken(shoes, 0.66), { outline: 0.002 }),
  ];
}

/** 같은 파츠 색은 하나의 드로우로 묶고, 원본 9개 머티리얼 인덱스는 보존한다. */
export function materialForStudioVrmHairColor(
  color: string, originalColor: string, materials: StudioVrmExportMaterial[],
): number {
  if (color.toLowerCase() === originalColor.toLowerCase()) return STUDIO_VRM_HUMANOID_MATERIALS.hair;
  const name = `Hair_${color.slice(1)}`;
  const existing = materials.findIndex((material) => material.name === name);
  if (existing >= 0) return existing;
  // 색상 선택기는 sRGB를 반환하지만 glTF의 baseColorFactor와 MToon 색 계수는 선형 RGB다.
  const linear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const { r, g, b } = hexToRgb(color);
  const tint: Rgb = [linear(r), linear(g), linear(b)];
  const base = materials[STUDIO_VRM_HUMANOID_MATERIALS.hair];
  if (!base?.mtoon) throw new Error("기본 헤어 MToon 머티리얼을 찾을 수 없습니다.");
  materials.push({
    ...base, name, baseColorFactor: [...tint, 1],
    mtoon: { ...base.mtoon, shadeColorFactor: darken(tint, 0.72) },
  });
  return materials.length - 1;
}
