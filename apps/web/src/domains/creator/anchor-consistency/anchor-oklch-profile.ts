/**
 * 캐릭터 정본 OKLCH 팔레트 범위(피부/머리/눈/복장) + 좌우 비대칭 소품 앵커(흉터/귀걸이/안대/점)
 * 순수 색공간 변환·거리 계산·프로파일 등록 계약.
 */

import { labToSrgb, type LabColor } from "./anchor-color-lab";

export const CANONICAL_PALETTE_SLOTS = ["skin", "hair", "eyes", "outfit"] as const;
export type CanonicalPaletteSlot = (typeof CANONICAL_PALETTE_SLOTS)[number];

export const CANONICAL_PALETTE_SLOT_LABELS_KO: Readonly<Record<CanonicalPaletteSlot, string>> =
  Object.freeze({
    skin: "피부",
    hair: "머리",
    eyes: "눈",
    outfit: "복장",
  });

export const ASYMMETRIC_PROP_KINDS = ["scar", "earring", "eyepatch", "mole"] as const;
export type AsymmetricPropKind = (typeof ASYMMETRIC_PROP_KINDS)[number];

export const ASYMMETRIC_PROP_KIND_LABELS_KO: Readonly<Record<AsymmetricPropKind, string>> =
  Object.freeze({
    scar: "흉터",
    earring: "귀걸이",
    eyepatch: "안대",
    mole: "점",
  });

export type AsymmetricAnchorSide = "left" | "right";
export type ObservedAsymmetricSide = AsymmetricAnchorSide | "missing" | "occluded";

export type CutSceneMoodTag =
  | "normal"
  | "flashback-sepia"
  | "monochrome"
  | "backlit-silhouette";

export interface OklchColor {
  /** OKLab 밝기 (0..1). */
  readonly l: number;
  /** OKLab 채도 (0..0.45). */
  readonly c: number;
  /** OKLab 색상각 (0..360°). */
  readonly h: number;
}

export type ColorSampleInput =
  | OklchColor
  | string
  | readonly [red: number, green: number, blue: number];

export interface CanonicalOklchSlotRange {
  readonly slot: CanonicalPaletteSlot;
  readonly target: OklchColor;
  readonly minL: number;
  readonly maxL: number;
  readonly minC: number;
  readonly maxC: number;
  readonly hueToleranceDeg: number;
  readonly maxDeltaE: number;
}

export interface CanonicalOklchSlotInput {
  readonly slot: CanonicalPaletteSlot;
  readonly target: ColorSampleInput;
  readonly minL?: number;
  readonly maxL?: number;
  readonly minC?: number;
  readonly maxC?: number;
  readonly hueToleranceDeg?: number;
  readonly maxDeltaE?: number;
}

export interface AsymmetricPropAnchor {
  readonly id: string;
  readonly kind: AsymmetricPropKind;
  readonly labelKo: string;
  readonly expectedSide: AsymmetricAnchorSide;
}

export interface CanonicalCharacterAuditProfile {
  readonly profileId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly paletteRanges: Readonly<Record<CanonicalPaletteSlot, CanonicalOklchSlotRange>>;
  readonly asymmetricAnchors: readonly AsymmetricPropAnchor[];
}

export interface CutSceneMoodRelaxationProfile {
  readonly moodTag: CutSceneMoodTag;
  readonly labelKo: string;
  readonly deltaEMultiplier: number;
  readonly lightnessBonus: number;
  readonly chromaBonus: number;
  readonly hueBonusDeg: number;
  readonly skipHueCheck: boolean;
  readonly skipChromaCheck: boolean;
  readonly featureColorWeightScale: number;
  readonly preserveAsymmetryAudit: true;
}

export const CUT_SCENE_MOOD_RELAXATIONS: Readonly<
  Record<CutSceneMoodTag, CutSceneMoodRelaxationProfile>
> = Object.freeze({
  normal: Object.freeze({
    moodTag: "normal",
    labelKo: "일반 장면",
    deltaEMultiplier: 1.0,
    lightnessBonus: 0,
    chromaBonus: 0,
    hueBonusDeg: 0,
    skipHueCheck: false,
    skipChromaCheck: false,
    featureColorWeightScale: 1.0,
    preserveAsymmetryAudit: true,
  }),
  "flashback-sepia": Object.freeze({
    moodTag: "flashback-sepia",
    labelKo: "회상 세피아",
    deltaEMultiplier: 2.8,
    lightnessBonus: 0.18,
    chromaBonus: 0.14,
    hueBonusDeg: 105,
    skipHueCheck: false,
    skipChromaCheck: false,
    featureColorWeightScale: 0.35,
    preserveAsymmetryAudit: true,
  }),
  monochrome: Object.freeze({
    moodTag: "monochrome",
    labelKo: "흑백 모노크롬",
    deltaEMultiplier: 3.4,
    lightnessBonus: 0.24,
    chromaBonus: 0.35,
    hueBonusDeg: 180,
    skipHueCheck: true,
    skipChromaCheck: true,
    featureColorWeightScale: 0.2,
    preserveAsymmetryAudit: true,
  }),
  "backlit-silhouette": Object.freeze({
    moodTag: "backlit-silhouette",
    labelKo: "역광 실루엣",
    deltaEMultiplier: 4.2,
    lightnessBonus: 0.58,
    chromaBonus: 0.28,
    hueBonusDeg: 180,
    skipHueCheck: true,
    skipChromaCheck: true,
    featureColorWeightScale: 0.15,
    preserveAsymmetryAudit: true,
  }),
});

const DEFAULT_SLOT_MAX_DELTA_E = 0.085;
const DEFAULT_SLOT_HUE_TOLERANCE_DEG = 24;

export function clampUnit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function normalizeHueDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function oklchHueDifferenceDeg(leftDeg: number, rightDeg: number): number {
  const diff = Math.abs(normalizeHueDeg(leftDeg) - normalizeHueDeg(rightDeg)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function srgbChannelToLinear(byteValue: number): number {
  const unit = clampUnit(byteValue, 0, 255) / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** 0..255 sRGB 색상을 Björn Ottosson OKLCH로 순수 결정 변환한다. */
export function srgbToOklch(red: number, green: number, blue: number): OklchColor {
  const r = srgbChannelToLinear(red);
  const g = srgbChannelToLinear(green);
  const b = srgbChannelToLinear(blue);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(Math.max(0, l));
  const m_ = Math.cbrt(Math.max(0, m));
  const s_ = Math.cbrt(Math.max(0, s));

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bAxis = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const chroma = Math.hypot(a, bAxis);
  const hue = chroma < 1e-6 ? 0 : normalizeHueDeg((Math.atan2(bAxis, a) * 180) / Math.PI);

  return Object.freeze({
    l: round4(clampUnit(L, 0, 1)),
    c: round4(clampUnit(chroma, 0, 0.45)),
    h: round4(hue),
  });
}

/** #rrggbb 문자열을 OKLCH로 변환한다. */
export function hexToOklch(hex: string): OklchColor {
  const normalized = hex.trim().replace(/^#/u, "");
  if (!/^[0-9a-fA-F]{6}$/u.test(normalized)) {
    return Object.freeze({ l: 0.5, c: 0, h: 0 });
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return srgbToOklch(r, g, b);
}

/** CIE L*a*b* 색상을 OKLCH로 변환한다. */
export function labToOklch(lab: LabColor): OklchColor {
  const [r, g, b] = labToSrgb(lab[0], lab[1], lab[2]);
  return srgbToOklch(r, g, b);
}

/** OKLCH → OKLab 유클리드 색 거리 ΔE. */
export function oklchDeltaE(left: OklchColor, right: OklchColor): number {
  const radL = (normalizeHueDeg(left.h) * Math.PI) / 180;
  const radR = (normalizeHueDeg(right.h) * Math.PI) / 180;
  const dl = left.l - right.l;
  const da = left.c * Math.cos(radL) - right.c * Math.cos(radR);
  const db = left.c * Math.sin(radL) - right.c * Math.sin(radR);
  return round4(Math.sqrt(dl * dl + da * da + db * db));
}

export function normalizeColorSampleToOklch(input: ColorSampleInput): OklchColor {
  if (typeof input === "string") return hexToOklch(input);
  if (Array.isArray(input)) {
    return srgbToOklch(input[0] ?? 0, input[1] ?? 0, input[2] ?? 0);
  }
  const oklch = input as OklchColor;
  return Object.freeze({
    l: round4(clampUnit(oklch.l, 0, 1)),
    c: round4(clampUnit(oklch.c, 0, 0.45)),
    h: round4(normalizeHueDeg(oklch.h)),
  });
}

/**
 * 캐릭터 정본 팔레트(피부/머리/눈/복장 OKLCH 범위) + 좌우 비대칭 소품 앵커(흉터/귀걸이/안대/점)를 등록한다.
 */
export function registerCanonicalCharacterProfile(input: {
  readonly profileId?: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly palette: readonly CanonicalOklchSlotInput[];
  readonly asymmetricAnchors?: readonly AsymmetricPropAnchor[];
}): CanonicalCharacterAuditProfile {
  const nameKo = input.characterNameKo.trim();
  if (!nameKo) {
    throw new Error("캐릭터 이름을 입력해야 정본 팔레트를 등록할 수 있습니다.");
  }

  const slotMap = new Map<CanonicalPaletteSlot, CanonicalOklchSlotRange>();
  for (const entry of input.palette) {
    const target = normalizeColorSampleToOklch(entry.target);
    const minL = round4(clampUnit(entry.minL ?? target.l - 0.08, 0, 1));
    const maxL = round4(clampUnit(entry.maxL ?? target.l + 0.08, minL, 1));
    const minC = round4(clampUnit(entry.minC ?? target.c - 0.05, 0, 0.45));
    const maxC = round4(clampUnit(entry.maxC ?? target.c + 0.05, minC, 0.45));
    const hueToleranceDeg = round4(clampUnit(entry.hueToleranceDeg ?? DEFAULT_SLOT_HUE_TOLERANCE_DEG, 4, 180));
    const maxDeltaE = round4(clampUnit(entry.maxDeltaE ?? DEFAULT_SLOT_MAX_DELTA_E, 0.015, 0.35));

    slotMap.set(
      entry.slot,
      Object.freeze({
        slot: entry.slot,
        target,
        minL,
        maxL,
        minC,
        maxC,
        hueToleranceDeg,
        maxDeltaE,
      }),
    );
  }

  for (const slot of CANONICAL_PALETTE_SLOTS) {
    if (!slotMap.has(slot)) {
      throw new Error(
        `캐릭터 정본 팔레트에 '${CANONICAL_PALETTE_SLOT_LABELS_KO[slot]}(${slot})' 슬롯이 누락되었습니다.`,
      );
    }
  }

  const paletteRanges = Object.freeze({
    skin: slotMap.get("skin")!,
    hair: slotMap.get("hair")!,
    eyes: slotMap.get("eyes")!,
    outfit: slotMap.get("outfit")!,
  });

  const anchors = (input.asymmetricAnchors ?? []).map((anchor, index) =>
    Object.freeze({
      id: anchor.id.trim() || `anchor-${anchor.kind}-${index + 1}`,
      kind: anchor.kind,
      labelKo: anchor.labelKo.trim() || ASYMMETRIC_PROP_KIND_LABELS_KO[anchor.kind],
      expectedSide: anchor.expectedSide,
    }),
  );

  return Object.freeze({
    profileId: input.profileId?.trim() || `profile-${input.characterId.trim()}`,
    characterId: input.characterId.trim(),
    characterNameKo: nameKo,
    paletteRanges,
    asymmetricAnchors: Object.freeze(anchors),
  });
}
