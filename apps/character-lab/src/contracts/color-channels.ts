/**
 * 색 채널 계약(레시피 v3, 2026-10-23 CORE-1). 렌더러 중립 승격 단위라 `zod` 외에는 아무것도 import하지 않는다
 * (architecture.test.ts 규칙 1-a — 상대 import도 금지). 그래서 OKLab 변환은 `shared/color.ts`와 같은 식을 이 파일 안에 다시 둔다.
 * 두 구현이 어긋나지 않는지는 `color-channels.test.ts`가 같은 입력에서 문자열까지 같은지 비교한다.
 *
 * 채널 키 = `<역할>` 또는 `<역할>-<하위>`. 레시피 `colors`에는 사용자·화풍이 정한 키만 저장하고(기본 8키는 필수),
 * 나머지 채널의 유효색은 `resolveChannelColor`가 아래 상속 표로 만든다. 그래서 v2 레시피(8키)를 v3로 올려도 그림이 같다.
 *
 * 상속 연산(OKLab): L' = clamp(L + dL, 0, 1), a' = a·chroma, b' = b·chroma(색상각 유지), 다시 sRGB로 바꿀 때 채널을 0..1로 자른다.
 * dL = 0·chroma = 1인 규칙("그대로")은 변환 없이 부모 hex를 그대로 쓴다(왕복 반올림 오차로 1 LSB가 바뀌는 것을 막는다).
 * 연쇄 상속(예: inner-trim ← inner ← top)은 단계마다 hex(8bit)로 양자화한 부모 색을 입력으로 쓴다 — 화면에 보이는 부모 견본이 곧 입력이다.
 * 수치는 설계 `design-P1-art-style-system.md` §2.3의 [제안]값이다.
 */
import { z } from "zod";

// ---------------------------------------------------------------- 키

/** 기본 8채널 = 레시피 v2 색 키(`RECIPE_COLOR_KEYS`와 같은 순서·집합, 시험이 대조) */
export const BASE_CHANNEL_KEYS = ["skin", "iris", "hair", "brow", "top", "bottom", "shoes", "accessory"] as const;

/** 상속 채널 19개(설계 26채널의 18개 + 2026-10-23 B-1 포지 요청 `hair-accessory-accent`) */
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
  // 27번째 채널(설계 26 + 1): 헤어 부속(머리끈·핀)의 포인트 색. 부모는 accessory-accent.
  "hair-accessory-accent",
] as const;

/** 전체 27채널(기본 8 다음 상속 19) */
export const CHANNEL_KEYS = [...BASE_CHANNEL_KEYS, ...DERIVED_CHANNEL_KEYS] as const;

export type BaseChannelKey = (typeof BASE_CHANNEL_KEYS)[number];
export type DerivedChannelKey = (typeof DERIVED_CHANNEL_KEYS)[number];
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

/** 머리 UV 마스크로 칠하는 영역 채널(메시 `regionChannels`) */
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

export const CHANNEL_LABELS_KO: Readonly<Record<ChannelKey, string>> = {
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
};

// ---------------------------------------------------------------- 상속 표

export type ChannelRule =
  | { readonly kind: "base" }
  | { readonly kind: "fixed"; readonly hex: string }
  | { readonly kind: "derive"; readonly parent: ChannelKey; readonly dL: number; readonly chroma: number };

const BASE_RULE: ChannelRule = Object.freeze({ kind: "base" });

function derive(parent: ChannelKey, dL: number, chroma: number): ChannelRule {
  return Object.freeze({ kind: "derive", parent, dL, chroma });
}

/** 채널별 유효색 규칙. 부모 사슬은 항상 기본 채널이나 고정색에서 끝난다(순환 없음, 시험이 확인). */
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
  // eye-wet 재질 기본색과 같다(render/material-presets.ts) — v2에서 공막은 레시피 색이 없었다.
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

/**
 * 채널의 계열 기본 키 — 채널을 모르는 v2 엔진·메시(`MeshPartData.colorKey`)가 그 채널 파츠를 칠할 때 쓰는 기본 8키다.
 * 상속 부모와 다를 수 있다(예: `top-accent`의 색은 accessory에서 상속하지만 계열은 상의라 v2 엔진에서는 상의 색으로 그려진다 — 채널 분리 전과 같은 그림).
 * 고정색 채널 중 공막(`sclera`)은 v2에서도 색 키가 없었으므로 null이다.
 */
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

/** 레시피 v3 `colors`: 기본 8키 필수 + 상속 채널 선택(있으면 상속 대신 이 값을 쓴다). 모르는 키는 strict로 거부한다. */
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

/** 레시피 v3 색 맵(기본 8키 필수, 상속 채널은 지정한 것만) */
export type ChannelColors = z.infer<typeof channelColorsSchema>;
/** 기본 8키만 있는 색(레시피 v2 `colors`와 같은 모양) */
export type BaseChannelColors = Readonly<Record<BaseChannelKey, string>>;
/** 해석 입력: 기본 8키는 필수, 상속 채널은 선택 */
export type ChannelColorInput = BaseChannelColors & Readonly<Partial<Record<DerivedChannelKey, string>>>;

// ---------------------------------------------------------------- OKLab(`shared/color.ts`와 같은 식, Björn Ottosson 2020 공개 식)

type Triple = readonly [number, number, number];

function parseHexStrict(hex: string, key: string): Triple {
  if (!HEX_PATTERN.test(hex)) throw new Error(`색 채널 ${key}의 값이 소문자 #rrggbb 형식이 아닙니다: ${hex}`);
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
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
 * 부모 hex에서 OKLab 시프트로 자식 hex를 만든다. dL·chroma가 항등(0, 1)이면 부모를 그대로 돌려준다.
 * 입력이 소문자 #rrggbb가 아니면 throw한다(무음으로 검은색을 만들지 않는다).
 */
export function deriveChannelHex(parentHex: string, dL: number, chroma: number): string {
  const rgb = parseHexStrict(parentHex, "(부모)");
  if (dL === 0 && chroma === 1) return parentHex;
  const lab = linearRgbToOklab([srgbToLinear(rgb[0] / 255), srgbToLinear(rgb[1] / 255), srgbToLinear(rgb[2] / 255)]);
  const shifted: Triple = [Math.min(1, Math.max(0, lab[0] + dL)), lab[1] * chroma, lab[2] * chroma];
  const linear = oklabToLinearRgb(shifted);
  return formatHex([linearToSrgb(linear[0]) * 255, linearToSrgb(linear[1]) * 255, linearToSrgb(linear[2]) * 255]);
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
    if (rule.kind === "base") throw new Error(`기본 색 채널 ${key}의 값이 없습니다(레시피 v3 colors는 기본 8키가 필수입니다).`);
    resolved = rule.kind === "fixed" ? rule.hex : deriveChannelHex(resolveWith(colors, rule.parent, memo), rule.dL, rule.chroma);
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
  throw new Error(`기본 색 채널 ${key}의 값이 없습니다(레시피 v3 colors는 기본 8키가 필수입니다).`);
}

/** 기본 8키만 골라 낸다(플랜 `colors`는 v2와 같은 8키다). */
export function pickBaseChannelColors(colors: ChannelColorInput): BaseChannelColors {
  const result: Partial<Record<BaseChannelKey, string>> = {};
  for (const key of BASE_CHANNEL_KEYS) {
    const value = explicitColor(colors, key);
    if (value === undefined) throw new Error(`기본 색 채널 ${key}의 값이 없습니다(레시피 v3 colors는 기본 8키가 필수입니다).`);
    result[key] = value;
  }
  return result as BaseChannelColors;
}
