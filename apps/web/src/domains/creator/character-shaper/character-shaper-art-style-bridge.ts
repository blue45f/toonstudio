/**
 * Character Shaper — 8종 화풍 팩(Art-Style Packs) · 27채널 OKLab 색 상속 브리지.
 *
 * `@toonstudio/studio-project-model/character-art-style`로 정식 승격된 렌더러 중립 화풍·색 계약을
 * `apps/web` 실시간 Three.js MToon(`ShaperMtoonMaterialSettings`) 및 `CharacterRecipeColors`에
 * 직접 매핑한다. 외부 실험 앱(`apps/character-lab`) 직접 import는 0건이다.
 */
import {
  ART_STYLE_PACKS,
  CHANNEL_LABELS_KO,
  artStylePack,
  channelColorOrigin,
  deriveChannelHex,
  resolveChannelColors,
  type ArtStyleId,
  type ArtStylePack,
  type BaseChannelColors,
  type ChannelColorOrigin,
  type ChannelKey,
  type ShadeTint,
} from "@toonstudio/studio-project-model/character-art-style";

import type { CharacterRecipeColors } from "./character-shaper-contract";
import type { ShaperMtoonMaterialSettings } from "./character-shaper-mtoon-uniforms";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/iu;

const DEFAULT_STUDIO_BASE_COLORS: BaseChannelColors = Object.freeze({
  skin: "#f3d3bd",
  iris: "#3a5a8c",
  hair: "#2b1d16",
  brow: "#2b1d16",
  top: "#4a637d",
  bottom: "#2b303a",
  shoes: "#222126",
  accessory: "#c99a4a",
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeHexOrFallback(value: string | null | undefined, fallback: string): string {
  if (typeof value === "string" && HEX_COLOR_RE.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return fallback;
}

function to255(unit: number): number {
  return Math.min(255, Math.max(0, Math.round(clamp(unit, 0, 1) * 255)));
}

/** 0..1 RGB 튜플을 소문자 `#rrggbb` 문자열로 바꾼다. */
export function rgbTupleToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((channel) => to255(channel).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 기준 알베도 `#rrggbb`에 화풍 팩의 `ShadeTint`(`multiply` 또는 `oklab` 명도·채도·색상각 이동)를 적용해
 * MToon `_ShadeColor`에 바로 넣을 수 있는 소문자 `#rrggbb`를 계산한다.
 */
export function applyShadeTintToHex(baseHex: string, tint: ShadeTint): string {
  const safeBase = normalizeHexOrFallback(baseHex, DEFAULT_STUDIO_BASE_COLORS.skin);
  if (tint.kind === "multiply") {
    const r = (Number.parseInt(safeBase.slice(1, 3), 16) / 255) * clamp(tint.rgb[0], 0, 1);
    const g = (Number.parseInt(safeBase.slice(3, 5), 16) / 255) * clamp(tint.rgb[1], 0, 1);
    const b = (Number.parseInt(safeBase.slice(5, 7), 16) / 255) * clamp(tint.rgb[2], 0, 1);
    return rgbTupleToHex([r, g, b]);
  }
  return deriveChannelHex(safeBase, tint.dL, tint.chroma, tint.dHueDeg);
}

export interface ArtStyleMtoonBridgeOptions {
  readonly skinHex?: string | null;
  readonly hairHex?: string | null;
}

/**
 * 화풍 팩 1종(`ArtStylePack`)을 본 서비스 3D 셰이퍼의 실시간 MToon 재질 설정(`ShaperMtoonMaterialSettings`)으로
 * 결정적으로 변환한다.
 */
export function buildShaperMtoonSettingsFromArtStylePack(
  pack: ArtStylePack,
  options?: ArtStyleMtoonBridgeOptions,
): ShaperMtoonMaterialSettings {
  const referenceSkin = normalizeHexOrFallback(
    options?.skinHex,
    pack.palette.skin[0] ?? DEFAULT_STUDIO_BASE_COLORS.skin,
  );
  const referenceOutlineBase = normalizeHexOrFallback(
    options?.hairHex,
    pack.palette.hair[0] ?? referenceSkin,
  );

  // rampSteps(2/3/4)와 softness(0..1)를 MToon 음영 경계·폭으로 매핑
  const shadeWidth = Number(clamp(0.04 + pack.look.ramp.softness * 0.86, 0.04, 0.92).toFixed(2));
  const stepShiftBias = pack.toon.rampSteps === 4 ? 0.56 : pack.toon.rampSteps === 3 ? 0.52 : 0.48;
  const shadePos = Number(clamp(stepShiftBias - pack.look.ramp.softness * 0.08, 0.2, 0.8).toFixed(2));

  // 림 라이트: pack.toon.rim=false이면 은은한 기본 림만 유지, true이면 edge0/edge1/strength 반영
  const rimEnabled = pack.toon.rim;
  const rLightPos = rimEnabled
    ? Number(clamp(1 - (pack.look.rim.edge0 + pack.look.rim.edge1) * 0.5 + 0.35, 0.45, 0.95).toFixed(2))
    : 0.85;
  const rLightWidth = rimEnabled
    ? Number(clamp(0.18 + pack.look.rim.strength * 0.35, 0.12, 0.85).toFixed(2))
    : 0.14;
  const rimColorHex = rimEnabled ? rgbTupleToHex(pack.look.rim.color) : null;

  // 음영 색조: 피부 알베도 기준 OKLab/곱셈 틴트 계산
  const shadeColorHex = applyShadeTintToHex(referenceSkin, pack.look.shade.skin);

  // 외곽선: 4.0mm(웹툰 로맨스 기준) = 1.0x 배율로 정규화
  const outlineScale =
    pack.toon.outline === "none"
      ? 0.4
      : Number(clamp(pack.look.line.widthMm / 4.0, 0.4, 2.2).toFixed(2));
  const outlineColorHex =
    pack.look.line.color.mode === "fixed"
      ? rgbTupleToHex(pack.look.line.color.rgb)
      : deriveChannelHex(referenceOutlineBase, -pack.look.line.color.dL, pack.look.line.color.chroma);
  const outlinePressure = pack.look.line.curvatureGain > 0 || pack.look.line.depthGain > 0;

  return Object.freeze({
    shadePos,
    shadeWidth,
    rLightPos,
    rLightWidth,
    outlinePressure,
    disableHairInline: true,
    shaderMode: "toon",
    shadeColorHex,
    rimColorHex,
    outlineScale,
    outlineColorHex,
  });
}

export interface ShaperDerivedColorSwatch {
  readonly key: ChannelKey;
  readonly labelKo: string;
  readonly hex: string;
  readonly originLabelKo: string;
  readonly origin: ChannelColorOrigin;
}

export interface ShaperDerivedColorGroup {
  readonly id: "face" | "hair" | "wardrobe";
  readonly titleKo: string;
  readonly swatches: readonly ShaperDerivedColorSwatch[];
}

export interface Shaper27ChannelHarmony {
  readonly baseColors: BaseChannelColors;
  readonly resolved: Readonly<Record<ChannelKey, string>>;
  readonly groups: readonly ShaperDerivedColorGroup[];
  readonly recommendedHairTipHex: string;
  readonly recommendedHairAccentHex: string;
}

const PREVIEW_GROUPS: readonly {
  readonly id: "face" | "hair" | "wardrobe";
  readonly titleKo: string;
  readonly keys: readonly ChannelKey[];
}[] = Object.freeze([
  { id: "face", titleKo: "얼굴 · 피부 파생", keys: ["skin", "lip", "blush", "iris", "sclera"] },
  { id: "hair", titleKo: "헤어 파생", keys: ["hair", "hair-tip", "hair-accent", "brow"] },
  {
    id: "wardrobe",
    titleKo: "의상 · 소품 파생",
    keys: ["top", "inner", "outer", "top-trim", "bottom", "legwear", "shoes", "shoes-lace"],
  },
]);

function describeOriginKo(origin: ChannelColorOrigin): string {
  if (origin.kind === "explicit") return "직접 지정";
  if (origin.kind === "fixed") return "기준 고정색";
  return `${CHANNEL_LABELS_KO[origin.parent]}에서 OKLab 파생`;
}

/**
 * 현재 3D 셰이퍼 레시피 색(`CharacterRecipeColors`)으로부터 27채널 OKLab 색 상속 팔레트를 계산한다.
 * 사용자가 아직 비워 둔 기본 채널은 선택된 화풍 팩(또는 기본 웹툰 로맨스 팩)의 기준색으로 보완한다.
 */
export function resolveShaper27ChannelPalette(
  recipeColors: CharacterRecipeColors,
  activeStyleId: ArtStyleId = "kr-webtoon-romance",
): Shaper27ChannelHarmony {
  const pack = artStylePack(activeStyleId);
  const packSkin = pack.palette.skin[0] ?? DEFAULT_STUDIO_BASE_COLORS.skin;
  const packHair = pack.palette.hair[0] ?? DEFAULT_STUDIO_BASE_COLORS.hair;

  const skin = normalizeHexOrFallback(recipeColors.skin, packSkin);
  const hair = normalizeHexOrFallback(recipeColors.hairBase, packHair);
  const iris = normalizeHexOrFallback(recipeColors.iris, DEFAULT_STUDIO_BASE_COLORS.iris);
  const top = normalizeHexOrFallback(recipeColors.top, DEFAULT_STUDIO_BASE_COLORS.top);
  const bottom = normalizeHexOrFallback(recipeColors.bottom, DEFAULT_STUDIO_BASE_COLORS.bottom);
  const shoes = normalizeHexOrFallback(recipeColors.shoes, DEFAULT_STUDIO_BASE_COLORS.shoes);
  const brow = deriveChannelHex(hair, -0.04, 0.9);

  const baseColors: BaseChannelColors = Object.freeze({
    skin,
    iris,
    hair,
    brow,
    top,
    bottom,
    shoes,
    accessory: DEFAULT_STUDIO_BASE_COLORS.accessory,
  });

  // 사용자가 직접 지정한 hairTip이 있으면 상속 결과에 반영하되, 추천값은 순수 OKLab 파생값도 별도 제공
  const pureResolved = resolveChannelColors(baseColors);
  const inputWithOptionalTip =
    typeof recipeColors.hairTip === "string" && HEX_COLOR_RE.test(recipeColors.hairTip.trim())
      ? { ...baseColors, "hair-tip": recipeColors.hairTip.trim().toLowerCase() }
      : baseColors;
  const resolved = resolveChannelColors(inputWithOptionalTip);

  const groups: ShaperDerivedColorGroup[] = PREVIEW_GROUPS.map((group) => ({
    id: group.id,
    titleKo: group.titleKo,
    swatches: group.keys.map((key) => {
      const origin = channelColorOrigin(inputWithOptionalTip, key);
      return {
        key,
        labelKo: CHANNEL_LABELS_KO[key],
        hex: resolved[key],
        originLabelKo: describeOriginKo(origin),
        origin,
      };
    }),
  }));

  return Object.freeze({
    baseColors,
    resolved,
    groups,
    recommendedHairTipHex: pureResolved["hair-tip"],
    recommendedHairAccentHex: pureResolved["hair-accent"],
  });
}

/** UI 버튼 한 줄 요약용 화풍 팩 특성 설명(한글). */
export function summarizeArtStylePackKo(pack: ArtStylePack): string {
  const rim = pack.toon.rim ? "림광" : "무림";
  return `${pack.proportion.feminine.headsTall.toFixed(1)}등신 · ${pack.toon.rampSteps}단 · 선 ${pack.look.line.widthMm}mm · ${rim}`;
}

export { ART_STYLE_PACKS, artStylePack, type ArtStyleId, type ArtStylePack };
