/**
 * 섞기(`look-mixer.ts`)의 색·표면 생성 부품(2026-10-23 S-1). 순수 함수이며 PRNG는 호출자가 그룹별로 넘긴다.
 * 추출 횟수는 입력과 무관하게 고정한다(쓰지 않을 값도 뽑는다) — 다른 그룹을 잠그거나 풀어도 이 그룹의 수열이 밀리지 않게 한다.
 */
import { PATTERN_KINDS } from "../contracts";
import { oklabToHex } from "../shared/color";

import type { ArtStylePack, ChannelKey, CharacterRecipe, MaterialPresetId, PatternKind, PresetId, Surface, WardrobeLayer } from "../contracts";
import type { Prng } from "../shared/prng";

/** 소수 `digits`자리 반올림(-0은 0으로) */
export function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return rounded === 0 ? 0 : rounded;
}

/** OKLCh(밝기·채도·색상각°) → 소문자 hex(sRGB 밖은 채널 클램프) */
export function oklchHex(lightness: number, chroma: number, hueDeg: number): string {
  const radians = (hueDeg * Math.PI) / 180;
  return oklabToHex([lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)]);
}

// ---------------------------------------------------------------- 배색

export const LOOK_MIXER_SCHEMES = ["analogous", "complementary", "split", "triadic", "mono"] as const;
export type LookMixerScheme = (typeof LOOK_MIXER_SCHEMES)[number];

export const LOOK_MIXER_SCHEME_LABELS_KO: Readonly<Record<LookMixerScheme, string>> = {
  analogous: "유사색",
  complementary: "보색",
  split: "분할 보색",
  triadic: "삼각",
  mono: "단색",
};

/** 배색별 상의·하의·포인트 색상각 오프셋(°) */
const SCHEME_HUE_OFFSETS: Readonly<Record<LookMixerScheme, readonly [number, number, number]>> = {
  analogous: [0, 30, -30],
  complementary: [0, 180, 180],
  split: [0, 150, 210],
  triadic: [0, 120, 240],
  mono: [0, 0, 0],
};

function uniqueHexes(lists: ReadonlyArray<readonly string[]>): string[] {
  return [...new Set(lists.flat())];
}

export interface MixColorsInput {
  readonly recipe: CharacterRecipe;
  readonly packs: readonly ArtStylePack[];
  /** 지금(섞은 뒤) 화풍 — 있으면 피부·헤어를 그 팔레트 견본에서 고른다 */
  readonly activePack: ArtStylePack | null;
  /** 소스가 따로 칠하는 상속 채널인지(아니면 상속 채널 색을 직접 정하지 않는다) */
  readonly paintable: (key: ChannelKey) => boolean;
}

export interface MixedColors {
  /** 기본 8채널 + (칠할 수 있으면) 아우터·상의 단. 나머지 상속 채널은 상속으로 둔다. */
  readonly colors: Record<string, string>;
  readonly scheme: LookMixerScheme;
  readonly schemeKo: string;
}

/** 색 그룹: OKLCh 배색으로 의상 4채널, 화풍 팔레트에서 피부·헤어(눈썹 = 헤어), 무작위 눈동자 */
export function mixColors(rng: Prng, input: MixColorsInput): MixedColors {
  const scheme = LOOK_MIXER_SCHEMES[rng.nextInt(LOOK_MIXER_SCHEMES.length)] ?? "analogous";
  const baseHue = rng.next() * 360;
  const [h0, h1, h2] = SCHEME_HUE_OFFSETS[scheme].map((offset) => baseHue + offset) as [number, number, number];
  const topL = rng.nextRange(0.6, 0.93);
  const top = oklchHex(topL, rng.nextRange(0.02, 0.12), h0);
  const bottom = oklchHex(rng.nextRange(0.3, 0.6), rng.nextRange(0.02, 0.1), h1);
  const shoesNeutral = rng.next() < 0.5;
  const shoesL = rng.nextRange(0.2, 0.92);
  const shoesC = rng.nextRange(0.03, 0.1);
  const shoes = oklchHex(shoesL, shoesNeutral ? 0.01 : shoesC, h1);
  const accessory = oklchHex(rng.nextRange(0.45, 0.75), rng.nextRange(0.1, 0.17), h2);
  const iris = oklchHex(rng.nextRange(0.35, 0.6), rng.nextRange(0.06, 0.14), rng.next() * 360);
  const skinPick = rng.next();
  const hairPick = rng.next();
  const outerRoll = rng.next();
  const outerDrop = rng.nextRange(0.15, 0.35);
  const outerChroma = rng.nextRange(0.03, 0.12);
  const trimRoll = rng.next();

  const { activePack, packs, recipe } = input;
  const skinPool = activePack ? [...activePack.palette.skin] : uniqueHexes(packs.map((pack) => pack.palette.skin));
  const hairPool = activePack && activePack.palette.hair.length > 0 ? [...activePack.palette.hair] : uniqueHexes(packs.map((pack) => pack.palette.hair));
  const skin = skinPool[Math.floor(skinPick * skinPool.length)] ?? recipe.colors.skin;
  const hair = hairPool[Math.floor(hairPick * hairPool.length)] ?? recipe.colors.hair;
  const colors: Record<string, string> = { skin, iris, hair, brow: hair, top, bottom, shoes, accessory };
  if (input.paintable("outer") && outerRoll < 0.5) colors.outer = oklchHex(Math.max(0.15, topL - outerDrop), outerChroma, h1);
  if (input.paintable("top-trim") && trimRoll < 0.4) colors["top-trim"] = oklchHex(topL > 0.6 ? topL - 0.45 : topL + 0.35, 0.08, h2);
  return { colors, scheme, schemeKo: LOOK_MIXER_SCHEME_LABELS_KO[scheme] };
}

// ---------------------------------------------------------------- 의상 표면

const CLOTH_MATERIALS: readonly MaterialPresetId[] = ["cloth-cotton", "cloth-silk", "cloth-knit", "cloth-denim", "leather"];
const SHOE_MATERIALS: readonly MaterialPresetId[] = ["leather", "cloth-cotton", "plastic"];
const LEGWEAR_MATERIALS: readonly MaterialPresetId[] = ["cloth-knit", "cloth-cotton", "cloth-silk"];
const PATTERN_ANGLES: readonly number[] = [0, 45, -45, 90];

interface SurfaceTarget {
  readonly channel: ChannelKey;
  readonly layer: WardrobeLayer | null;
  readonly materials: readonly MaterialPresetId[];
  /** 무늬 두 번째 색 채널(없으면 무늬를 두지 않는다) */
  readonly ink: ChannelKey | null;
}

const SURFACE_TARGETS: readonly SurfaceTarget[] = [
  { channel: "top", layer: null, materials: CLOTH_MATERIALS, ink: "top-trim" },
  { channel: "bottom", layer: null, materials: CLOTH_MATERIALS, ink: "bottom-trim" },
  { channel: "shoes", layer: null, materials: SHOE_MATERIALS, ink: null },
  { channel: "inner", layer: "inner", materials: CLOTH_MATERIALS, ink: "inner-trim" },
  { channel: "outer", layer: "outer", materials: CLOTH_MATERIALS, ink: "outer-trim" },
  { channel: "legwear", layer: "legwear", materials: LEGWEAR_MATERIALS, ink: null },
];

export interface MixSurfacesInput {
  /** 섞은 뒤의 층(입지 않은 층 채널에는 표면을 두지 않는다) */
  readonly layers: Readonly<Record<WardrobeLayer, PresetId | null>>;
  /** 무늬용 UV1이 있는 소스인지 */
  readonly patternUv: boolean;
}

/** 옷 그룹 표면: 채널마다 절반 확률로 재질, (UV1이 있으면) 30 % 확률로 무늬. 결과에 없는 의상 채널은 표면 지정 없음이다. */
export function mixSurfaces(rng: Prng, input: MixSurfacesInput): Partial<Record<ChannelKey, Surface>> {
  const surfaces: Partial<Record<ChannelKey, Surface>> = {};
  for (const target of SURFACE_TARGETS) {
    const materialRoll = rng.next();
    const materialPick = rng.next();
    const patternRoll = rng.next();
    const kindPick = rng.next();
    const scale = rng.nextRange(1, 8);
    const anglePick = rng.next();
    const ratio = rng.nextRange(0.15, 0.5);
    if (target.layer !== null && input.layers[target.layer] === null) continue;
    const kind: PatternKind = PATTERN_KINDS[Math.floor(kindPick * PATTERN_KINDS.length)] ?? "stripe";
    const pattern =
      input.patternUv && target.ink !== null && patternRoll < 0.3
        ? { kind, scaleCm: roundTo(scale, 1), angleDeg: PATTERN_ANGLES[Math.floor(anglePick * PATTERN_ANGLES.length)] ?? 0, ratio: roundTo(ratio, 2), inkChannel: target.ink }
        : null;
    if (materialRoll >= 0.5 && pattern === null) continue;
    const material = materialRoll < 0.5 ? (target.materials[Math.floor(materialPick * target.materials.length)] ?? "cloth-cotton") : "cloth-cotton";
    surfaces[target.channel] = { material, pattern };
  }
  return surfaces;
}
