/**
 * 27채널 OKLab 색 상속 계약 — `@toonstudio/studio-project-model` 정식 승격 단위.
 *
 * `apps/character-lab/src/contracts/color-channels.ts`(레시피 v3, 2026-10-23 CORE-1)의
 * 렌더러 중립 색 채널 규칙을 공용 프로젝트 모델로 승격했다.
 * 기본 8채널(피부·눈동자·헤어·눈썹·상의·하의·신발·액세서리)에서 나머지 19개 파생 채널을
 * OKLab 명도·채도 시프트(Björn Ottosson 2020 공개 식)로 결정적으로 계산한다.
 */
import { z } from "zod";

// ---------------------------------------------------------------- 키

/** 기본 8채널 */
export const BASE_CHANNEL_KEYS = [
  "skin",
  "iris",
  "hair",
  "brow",
  "top",
  "bottom",
  "shoes",
  "accessory",
] as const;

/** 상속 채널 19개 */
export const DERIVED_CHANNEL_KEYS = [
  "lip",
  "blush",
  "sclera",
  "hair-tip",
  "hair-accent",
  "hair-accessory",
  "inner",
  "inner-trim",
  "top-trim",
  "top-accent",
  "outer",
  "outer-trim",
  "outer-accent",
  "bottom-trim",
  "legwear",
  "shoes-sole",
  "shoes-lace",
  "accessory-accent",
  "hair-accessory-accent",
] as const;

/** 전체 27채널(기본 8 다음 상속 19) */
export const CHANNEL_KEYS = [...BASE_CHANNEL_KEYS, ...DERIVED_CHANNEL_KEYS] as const;

export type BaseChannelKey = (typeof BASE_CHANNEL_KEYS)[number];
export type DerivedChannelKey = (typeof DERIVED_CHANNEL_KEYS)[number];
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

/** 머리 UV 마스크로 칠하는 영역 채널 */
export const REGION_CHANNEL_KEYS = ["lip", "blush"] as const;
export type RegionChannelKey = (typeof REGION_CHANNEL_KEYS)[number];

const CHANNEL_KEY_SET: ReadonlySet<string> = new Set(CHANNEL_KEYS);
const BASE_CHANNEL_KEY_SET: ReadonlySet<string> = new Set(BASE_CHANNEL_KEYS);

export function isChannelKey(value: unknown): value is ChannelKey {
  return typeof value === "string" && CHANNEL_KEY_SET.has(value);
}

export function isBaseChannelKey(value: unknown): value is BaseChannelKey {
  return typeof value === "string" && BASE_CHANNEL_KEY_SET.has(value);
}

export const CHANNEL_LABELS_KO: Readonly<Record<ChannelKey, string>> = Object.freeze({
  skin: "피부",
  iris: "눈동자",
  hair: "헤어",
  brow: "눈썹",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  accessory: "액세서리",
  lip: "입술",
  blush: "볼 홍조",
  sclera: "흰자위",
  "hair-tip": "헤어 끝",
  "hair-accent": "헤어 포인트",
  "hair-accessory": "헤어 액세서리",
  inner: "이너",
  "inner-trim": "이너 단",
  "top-trim": "상의 단",
  "top-accent": "상의 포인트",
  outer: "아우터",
  "outer-trim": "아우터 단",
  "outer-accent": "아우터 포인트",
  "bottom-trim": "하의 단",
  legwear: "레그웨어",
  "shoes-sole": "신발 밑창",
  "shoes-lace": "신발 끈",
  "accessory-accent": "액세서리 포인트",
  "hair-accessory-accent": "헤어 액세서리 포인트",
});

// ---------------------------------------------------------------- 상속 표

export type ChannelRule =
  | { readonly kind: "base" }
  | { readonly kind: "fixed"; readonly hex: string }
  | { readonly kind: "derive"; readonly parent: ChannelKey; readonly dL: number; readonly chroma: number };

const BASE_RULE: ChannelRule = Object.freeze({ kind: "base" });

function derive(parent: ChannelKey, dL: number, chroma: number): ChannelRule {
  return Object.freeze({ kind: "derive", parent, dL, chroma });
}

/** 채널별 유효색 규칙. 부모 사슬은 항상 기본 채널이나 고정색에서 끝난다. */
export const CHANNEL_RULES: Readonly<Record<ChannelKey, ChannelRule>> = Object.freeze({
  skin: BASE_RULE,
  iris: BASE_RULE,
  hair: BASE_RULE,
  brow: BASE_RULE,
  top: BASE_RULE,
  bottom: BASE_RULE,
  shoes: BASE_RULE,
  accessory: BASE_RULE,
  lip: derive("skin", -0.08, 1.8),
  blush: derive("skin", -0.03, 1.4),
  sclera: Object.freeze({ kind: "fixed", hex: "#f8f8fa" }),
  "hair-tip": derive("hair", 0.08, 1),
  "hair-accent": derive("hair", -0.12, 1.2),
  "hair-accessory": derive("accessory", 0, 1),
  inner: derive("top", 0.1, 1),
  "inner-trim": derive("inner", -0.15, 0.85),
  "top-trim": derive("top", -0.15, 0.85),
  "top-accent": derive("accessory", 0, 1),
  outer: derive("top", -0.1, 1),
  "outer-trim": derive("outer", -0.15, 0.85),
  "outer-accent": derive("accessory", 0, 1),
  "bottom-trim": derive("bottom", -0.15, 0.85),
  legwear: derive("bottom", -0.2, 1),
  "shoes-sole": Object.freeze({ kind: "fixed", hex: "#f2f2f2" }),
  "shoes-lace": derive("shoes", 0.25, 1),
  "accessory-accent": derive("accessory", 0, 1),
  "hair-accessory-accent": derive("accessory-accent", 0, 1),
});

/** 채널의 계열 기본 키(공막은 null). */
export const CHANNEL_FAMILY: Readonly<Record<ChannelKey, BaseChannelKey | null>> = Object.freeze({
  skin: "skin",
  iris: "iris",
  hair: "hair",
  brow: "brow",
  top: "top",
  bottom: "bottom",
  shoes: "shoes",
  accessory: "accessory",
  lip: "skin",
  blush: "skin",
  sclera: null,
  "hair-tip": "hair",
  "hair-accent": "hair",
  "hair-accessory": "accessory",
  inner: "top",
  "inner-trim": "top",
  "top-trim": "top",
  "top-accent": "top",
  outer: "top",
  "outer-trim": "top",
  "outer-accent": "top",
  "bottom-trim": "bottom",
  legwear: "bottom",
  "shoes-sole": "shoes",
  "shoes-lace": "shoes",
  "accessory-accent": "accessory",
  "hair-accessory-accent": "accessory",
});

/** 상속 부모(기본·고정 채널은 null) */
export function channelParent(key: ChannelKey): ChannelKey | null {
  const rule = CHANNEL_RULES[key];
  return rule.kind === "derive" ? rule.parent : null;
}

// ---------------------------------------------------------------- 스키마

const HEX_PATTERN = /^#[0-9a-f]{6}$/u;
const hexSchema = z.string().regex(HEX_PATTERN, "색은 소문자 #rrggbb 형식이어야 합니다.");

/** 레시피 v3 `colors`: 기본 8키 필수 + 상속 채널 선택. */
export const channelColorsSchema = z
  .object({
    skin: hexSchema,
    iris: hexSchema,
    hair: hexSchema,
    brow: hexSchema,
    top: hexSchema,
    bottom: hexSchema,
    shoes: hexSchema,
    accessory: hexSchema,
    lip: hexSchema.optional(),
    blush: hexSchema.optional(),
    sclera: hexSchema.optional(),
    "hair-tip": hexSchema.optional(),
    "hair-accent": hexSchema.optional(),
    "hair-accessory": hexSchema.optional(),
    inner: hexSchema.optional(),
    "inner-trim": hexSchema.optional(),
    "top-trim": hexSchema.optional(),
    "top-accent": hexSchema.optional(),
    outer: hexSchema.optional(),
    "outer-trim": hexSchema.optional(),
    "outer-accent": hexSchema.optional(),
    "bottom-trim": hexSchema.optional(),
    legwear: hexSchema.optional(),
    "shoes-sole": hexSchema.optional(),
    "shoes-lace": hexSchema.optional(),
    "accessory-accent": hexSchema.optional(),
    "hair-accessory-accent": hexSchema.optional(),
  })
  .strict();

export type ChannelColors = z.infer<typeof channelColorsSchema>;
export type BaseChannelColors = Readonly<Record<BaseChannelKey, string>>;
export type ChannelColorInput = BaseChannelColors & Readonly<Partial<Record<DerivedChannelKey, string>>>;

// ---------------------------------------------------------------- OKLab (Björn Ottosson 2020 공개 식)

type Triple = readonly [number, number, number];

function parseHexStrict(hex: string, key: string): Triple {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`색 채널 ${key}의 값이 소문자 #rrggbb 형식이 아닙니다: ${hex}`);
  }
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function linearRgbToOklab(rgb: Triple): Triple {
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function srgbBytesToOklab([r, g, b]: Triple): Triple {
  return linearRgbToOklab([srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)]);
}

/** 원고에 적힌 CSS HEX를 색·불투명도 기준으로 중복 제거하고 최초 표기와 순서를 보존한다. */
export function collectManuscriptHexColors(text: string): { hex: string; oklch: string }[] {
  const colors: { hex: string; oklch: string }[] = [];
  const seen = new Set<string>();
  for (const [hex] of text.matchAll(/#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})(?![a-z\d_])/giu)) {
    const digits = hex.slice(1).toLowerCase();
    const expanded = digits.length <= 4 ? Array.from(digits, (digit) => digit + digit).join("") : digits;
    const rgba = expanded.padEnd(8, "f");
    if (seen.has(rgba)) continue;
    seen.add(rgba);

    const rgb = parseHexStrict(`#${rgba.slice(0, 6)}`, "원고 지정색");
    const [lightness, a, b] = srgbBytesToOklab(rgb);
    const gray = rgb[0] === rgb[1] && rgb[1] === rgb[2];
    const chroma = gray ? 0 : Math.hypot(a, b);
    const hue = gray ? 0 : (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    const alphaByte = Number.parseInt(rgba.slice(6), 16);
    const alpha = alphaByte === 255 ? "" : ` / ${Number((alphaByte / 255).toFixed(6))}`;
    const coords = [lightness, chroma, hue].map((n) => Number(n.toFixed(6))).join(" ");
    colors.push({ hex, oklch: `oklch(${coords}${alpha})` });
  }
  return colors;
}

function oklabToLinearRgb(lab: Triple): Triple {
  const [L, a, b] = lab;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function to255(c: number): number {
  return Math.min(255, Math.max(0, Math.round(c)));
}

function formatHex(rgb255: Triple): string {
  return `#${rgb255.map((c) => to255(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 부모 hex에서 OKLab 시프트(명도·채도·선택적 색상각 회전)로 자식 hex를 만든다.
 * 항등(dL=0, chroma=1, dHueDeg=0)이면 반올림 드리프트 없이 부모 hex를 그대로 반환한다.
 */
export function deriveChannelHex(
  parentHex: string,
  dL: number,
  chroma: number,
  dHueDeg = 0,
): string {
  const rgb = parseHexStrict(parentHex, "(부모)");
  if (dL === 0 && chroma === 1 && dHueDeg === 0) return parentHex;
  const lab = srgbBytesToOklab(rgb);
  const rad = (dHueDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotA = lab[1] * cos - lab[2] * sin;
  const rotB = lab[1] * sin + lab[2] * cos;
  const shifted: Triple = [
    Math.min(1, Math.max(0, lab[0] + dL)),
    rotA * chroma,
    rotB * chroma,
  ];
  const linear = oklabToLinearRgb(shifted);
  return formatHex([
    linearToSrgb(linear[0]) * 255,
    linearToSrgb(linear[1]) * 255,
    linearToSrgb(linear[2]) * 255,
  ]);
}

// ---------------------------------------------------------------- 해석

function explicitColor(colors: ChannelColorInput, key: ChannelKey): string | undefined {
  const value: unknown = (colors as Readonly<Partial<Record<ChannelKey, string>>>)[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`색 채널 ${key}의 값이 문자열이 아닙니다.`);
  parseHexStrict(value, key);
  return value;
}

function resolveWith(colors: ChannelColorInput, key: ChannelKey, memo: Map<ChannelKey, string>): string {
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const explicit = explicitColor(colors, key);
  let resolved: string;
  if (explicit !== undefined) {
    resolved = explicit;
  } else {
    const rule = CHANNEL_RULES[key];
    if (rule.kind === "base") {
      throw new Error(`기본 색 채널 ${key}의 값이 없습니다(기본 8키가 필수입니다).`);
    }
    resolved =
      rule.kind === "fixed"
        ? rule.hex
        : deriveChannelHex(resolveWith(colors, rule.parent, memo), rule.dL, rule.chroma);
  }
  memo.set(key, resolved);
  return resolved;
}

/** 채널 하나의 유효색(소문자 hex). 지정값이 있으면 그 값, 없으면 상속 표로 만든다. */
export function resolveChannelColor(colors: ChannelColorInput, key: ChannelKey): string {
  if (!isChannelKey(key)) throw new Error(`색 채널 키가 아닙니다: ${String(key)}`);
  return resolveWith(colors, key, new Map());
}

/** 27채널 전부의 유효색(키 순서 = CHANNEL_KEYS) */
export function resolveChannelColors(colors: ChannelColorInput): Readonly<Record<ChannelKey, string>> {
  const memo = new Map<ChannelKey, string>();
  const result: Partial<Record<ChannelKey, string>> = {};
  for (const key of CHANNEL_KEYS) result[key] = resolveWith(colors, key, memo);
  return result as Record<ChannelKey, string>;
}

export type ChannelColorOrigin =
  | { readonly kind: "explicit" }
  | { readonly kind: "inherited"; readonly parent: ChannelKey }
  | { readonly kind: "fixed" };

/** UI 표시용 출처: 직접 지정 / "<부모>에서 파생" / 고정색 */
export function channelColorOrigin(colors: ChannelColorInput, key: ChannelKey): ChannelColorOrigin {
  if (explicitColor(colors, key) !== undefined) return { kind: "explicit" };
  const rule = CHANNEL_RULES[key];
  if (rule.kind === "derive") return { kind: "inherited", parent: rule.parent };
  if (rule.kind === "fixed") return { kind: "fixed" };
  throw new Error(`기본 색 채널 ${key}의 값이 없습니다(기본 8키가 필수입니다).`);
}

/** 기본 8키만 골라 낸다. */
export function pickBaseChannelColors(colors: ChannelColorInput): BaseChannelColors {
  const result: Partial<Record<BaseChannelKey, string>> = {};
  for (const key of BASE_CHANNEL_KEYS) {
    const value = explicitColor(colors, key);
    if (value === undefined) {
      throw new Error(`기본 색 채널 ${key}의 값이 없습니다(기본 8키가 필수입니다).`);
    }
    result[key] = value;
  }
  return result as BaseChannelColors;
}
