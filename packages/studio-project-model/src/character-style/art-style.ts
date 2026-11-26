/**
 * 화풍(art style) 계약 — `@toonstudio/studio-project-model` 정식 승격 단위.
 *
 * `apps/character-lab/src/contracts/art-style.ts`(레시피 v3, 2026-10-23 CORE-1)의 렌더러 중립 승격 계약을
 * 공용 프로젝트 모델 패키지로 올려 `apps/web` 3D 캐릭터 셰이퍼와 캐릭터 파이프라인이 앱 경계 침범 없이
 * 동일한 8종 화풍 팩·비례·룩 스키마를 공유하도록 한다.
 */
import { z } from "zod";

// ---------------------------------------------------------------- 어휘

/** 1차(T1) 화풍 8종. 라벨은 장르명만 쓴다(작품·작가·경쟁 제품명 금지). */
export const ART_STYLE_IDS = [
  "jp-anime-cel",
  "jp-shounen-ink",
  "jp-shoujo-soft",
  "jp-seinen-real",
  "kr-webtoon-romance",
  "kr-webtoon-action",
  "sd-chibi",
  "ink-wash",
] as const;
export type ArtStyleId = (typeof ART_STYLE_IDS)[number];

/** 2차(T2) 예약 id. */
export const ART_STYLE_RESERVED_IDS = [
  "watercolor-tale",
  "us-comic-halftone",
  "retro-90s-cel",
  "lowpoly-flat",
] as const;
export type ReservedArtStyleId = (typeof ART_STYLE_RESERVED_IDS)[number];

export const ART_STYLE_LABELS_KO: Readonly<Record<ArtStyleId, string>> = Object.freeze({
  "jp-anime-cel": "일본 애니 셀",
  "jp-shounen-ink": "소년 잉크",
  "jp-shoujo-soft": "소녀 반짝",
  "jp-seinen-real": "청년·극화",
  "kr-webtoon-romance": "웹툰 로맨스",
  "kr-webtoon-action": "웹툰 액션",
  "sd-chibi": "SD",
  "ink-wash": "수묵",
});

const ART_STYLE_ID_SET: ReadonlySet<string> = new Set(ART_STYLE_IDS);

export function isArtStyleId(value: unknown): value is ArtStyleId {
  return typeof value === "string" && ART_STYLE_ID_SET.has(value);
}

export const EYE_FAMILIES = [
  "anime-round",
  "webtoon-almond",
  "shounen-sharp",
  "shoujo-sparkle",
  "realistic",
  "sd-dot",
  "ink-narrow",
] as const;
export type EyeFamily = (typeof EYE_FAMILIES)[number];

/** 비례 묶음을 고르는 체형 계열 */
export const STYLE_FIGURES = ["feminine", "masculine"] as const;
export type StyleFigure = (typeof STYLE_FIGURES)[number];

/** 툰 식의 그림자 틴트 그룹. */
export const LOOK_SHADE_GROUPS = ["skin", "hair", "other"] as const;
export type LookShadeGroup = (typeof LOOK_SHADE_GROUPS)[number];

// ---------------------------------------------------------------- 공용 조각

const unit = z.number().min(0).max(1);
const rgbSchema = z.tuple([unit, unit, unit]);
const hexSchema = z.string().regex(/^#[0-9a-f]{6}$/u, "색은 소문자 #rrggbb 형식이어야 합니다.");
const channelKeyLikeSchema = z
  .string()
  .regex(/^[a-z]+(?:-[a-z]+)*$/u, "채널 키는 소문자 kebab-case여야 합니다.");

// ---------------------------------------------------------------- 비례

/** 비례 축과 범위. 스키마·슬라이더·클램프가 이 표 하나를 쓴다. */
export const PROPORTION_RANGES = Object.freeze({
  /** 두신(키 ÷ 머리 높이) */
  headsTall: Object.freeze({ min: 2.5, max: 10 }),
  /** 다리 길이 ÷ 키(가랑이 높이) */
  legRatio: Object.freeze({ min: 0.28, max: 0.58 }),
  /** 팔 길이 ÷ 키 */
  armRatio: Object.freeze({ min: 0.3, max: 0.48 }),
  /** 어깨 너비 ÷ 머리 높이 */
  shoulderHeads: Object.freeze({ min: 1, max: 2.6 }),
  /** 머리 너비 ÷ 머리 높이 */
  headWidthRatio: Object.freeze({ min: 0.6, max: 1.15 }),
  /** 손 크기 배율 */
  handScale: Object.freeze({ min: 0.6, max: 1.4 }),
});
export type ProportionKey = keyof typeof PROPORTION_RANGES;
export const PROPORTION_KEYS = Object.freeze(
  Object.keys(PROPORTION_RANGES),
) as readonly ProportionKey[];

function ranged(key: ProportionKey) {
  const range = PROPORTION_RANGES[key];
  return z.number().min(range.min).max(range.max);
}

export const proportionSchema = z
  .object({
    headsTall: ranged("headsTall"),
    legRatio: ranged("legRatio"),
    armRatio: ranged("armRatio"),
    shoulderHeads: ranged("shoulderHeads"),
    headWidthRatio: ranged("headWidthRatio"),
    handScale: ranged("handScale"),
  })
  .strict();
export type Proportion = z.infer<typeof proportionSchema>;

/** 값을 축 범위로 자른다(NaN은 범위 중앙 — 무음 전파 금지) */
export function clampProportion(key: ProportionKey, value: number): number {
  const range = PROPORTION_RANGES[key];
  if (Number.isNaN(value)) return (range.min + range.max) / 2;
  return Math.min(range.max, Math.max(range.min, value));
}

// ---------------------------------------------------------------- look

/** 그림자 틴트: multiply(v2 항등 표현, 알베도 × rgb) 또는 OKLab 시프트 */
export const shadeTintSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("multiply"), rgb: rgbSchema }).strict(),
  z
    .object({
      kind: z.literal("oklab"),
      dL: z.number().min(-0.6).max(0.1),
      dHueDeg: z.number().min(-60).max(60),
      chroma: z.number().min(0).max(2),
    })
    .strict(),
]);
export type ShadeTint = z.infer<typeof shadeTintSchema>;

export const LINE_METHODS = ["engine-hull", "style-hull"] as const;
export const TONE_KINDS = ["none", "halftone", "hatch", "crosshatch", "dots"] as const;
export const PAPER_KINDS = ["none", "watercolor", "ink-wash", "print"] as const;
export const HAIR_SPECULAR_BANDS = ["none", "band", "ring"] as const;
export type ToneKind = (typeof TONE_KINDS)[number];
export type PaperKind = (typeof PAPER_KINDS)[number];

export const lookSchema = z
  .object({
    ramp: z.object({ softness: unit, secondShade: shadeTintSchema.nullable() }).strict(),
    shade: z.object({ skin: shadeTintSchema, hair: shadeTintSchema, other: shadeTintSchema }).strict(),
    rim: z
      .object({ edge0: unit, edge1: unit, strength: z.number().min(0).max(2), color: rgbSchema })
      .strict()
      .refine((rim) => rim.edge0 < rim.edge1, {
        message: "림 경계는 edge0 < edge1이어야 합니다.",
        path: ["edge1"],
      }),
    specular: z
      .object({
        size: unit,
        strength: unit,
        hairBand: z.enum(HAIR_SPECULAR_BANDS),
        center: unit,
        width: unit,
      })
      .strict(),
    line: z
      .object({
        method: z.enum(LINE_METHODS),
        widthMm: z.number().min(0).max(20),
        depthGain: unit,
        curvatureGain: z.number().min(-1).max(1),
        color: z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("fixed"), rgb: rgbSchema }).strict(),
          z.object({ mode: z.literal("darken-albedo"), dL: unit, chroma: unit }).strict(),
        ]),
        inner: z
          .object({
            enabled: z.boolean(),
            creaseDeg: z.number().min(5).max(90),
            partBoundary: z.boolean(),
            widthPx: z.number().int().min(1).max(6),
          })
          .strict(),
      })
      .strict(),
    tone: z
      .object({
        kind: z.enum(TONE_KINDS),
        cellPerHead: z.number().min(8).max(120),
        angleDeg: z.number().min(-90).max(90),
        bands: z.tuple([unit, unit, unit]),
        strength: unit,
        ink: z.enum(["shade", "line"]),
      })
      .strict(),
    paper: z
      .object({
        kind: z.enum(PAPER_KINDS),
        strength: unit,
        grainPx1080: z.number().min(0.5).max(8),
        bleedPx1080: z.number().min(0).max(12),
        seed: z.number().int().min(0).max(0xffffffff),
      })
      .strict(),
    grade: z
      .object({
        saturation: z.number().min(0).max(1.5),
        lightness: z.number().min(-0.2).max(0.2),
        accentChannels: z.array(channelKeyLikeSchema).max(4),
      })
      .strict()
      .refine((grade) => new Set(grade.accentChannels).size === grade.accentChannels.length, {
        message: "accentChannels에 같은 채널이 두 번 있습니다.",
        path: ["accentChannels"],
      }),
  })
  .strict();
export type Look = z.infer<typeof lookSchema>;
export type LookGroup = keyof Look;
export const LOOK_GROUPS: readonly LookGroup[] = [
  "ramp",
  "shade",
  "rim",
  "specular",
  "line",
  "tone",
  "paper",
  "grade",
];

/** look 부분 변경: 그룹별 부분 병합(`line.inner`는 한 단계 더). */
export type LookPatch = {
  readonly [G in LookGroup]?: G extends "line"
    ? Partial<Omit<Look["line"], "inner">> & { readonly inner?: Partial<Look["line"]["inner"]> }
    : Partial<Look[G]>;
};

// ---------------------------------------------------------------- v2 항등

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** v2 기본 툰 셰이더와 동일한 그림을 내는 항등 look(깊이 동결). */
export const LOOK_V2_IDENTITY: Look = deepFreeze({
  ramp: { softness: 0, secondShade: null },
  shade: {
    skin: { kind: "multiply", rgb: [0.86, 0.6, 0.58] },
    hair: { kind: "multiply", rgb: [0.62, 0.58, 0.72] },
    other: { kind: "multiply", rgb: [0.68, 0.68, 0.78] },
  },
  rim: { edge0: 0.55, edge1: 0.65, strength: 1, color: [0.35, 0.35, 0.4] },
  specular: { size: 0, strength: 0, hairBand: "none", center: 0.5, width: 0 },
  line: {
    method: "engine-hull",
    widthMm: 4,
    depthGain: 0,
    curvatureGain: 0,
    color: { mode: "fixed", rgb: [0.05, 0.04, 0.06] },
    inner: { enabled: false, creaseDeg: 30, partBoundary: false, widthPx: 1 },
  },
  tone: { kind: "none", cellPerHead: 40, angleDeg: 45, bands: [0, 0.5, 0.8], strength: 0, ink: "shade" },
  paper: { kind: "none", strength: 0, grainPx1080: 1, bleedPx1080: 0, seed: 0 },
  grade: { saturation: 1, lightness: 0, accentChannels: [] },
} satisfies Look);

/** 새 look 사본(동결되지 않은 깊은 복사) */
export function cloneLook(look: Look): Look {
  return structuredClone(look) as Look;
}

/** 그룹별 부분 병합. 입력은 바꾸지 않고 새 객체를 돌려준다. */
export function mergeLook(base: Look, patch: LookPatch): Look {
  const next = cloneLook(base) as { -readonly [G in LookGroup]: Look[G] };
  for (const group of LOOK_GROUPS) {
    const part = patch[group];
    if (part === undefined) continue;
    if (group === "line") {
      const linePatch = part as LookPatch["line"] & object;
      const { inner, ...rest } = linePatch;
      next.line = {
        ...next.line,
        ...structuredClone(rest),
        inner: { ...next.line.inner, ...inner },
      } as Look["line"];
    } else {
      (next as Record<LookGroup, unknown>)[group] = {
        ...(next[group] as object),
        ...structuredClone(part as object),
      };
    }
  }
  return next as Look;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || typeof a !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((key) => (a as Record<string, unknown>)[key] !== undefined);
  const kb = Object.keys(b as object).filter((key) => (b as Record<string, unknown>)[key] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** look이 v2 항등과 값이 같은지 확인한다. */
export function isLookV2Identity(look: Look): boolean {
  return jsonEqual(look, LOOK_V2_IDENTITY);
}

// ---------------------------------------------------------------- 화풍 팩

export const artStylePackSchema = z
  .object({
    id: z.enum(ART_STYLE_IDS),
    revision: z.number().int().positive(),
    labelKo: z.string().min(1),
    labelEn: z.string().min(1),
    proportion: z.object({ feminine: proportionSchema, masculine: proportionSchema }).strict(),
    face: z
      .object({
        eyeFamily: z.enum(EYE_FAMILIES),
        eyeWidthToFace: z.number().min(0.14).max(0.36),
        eyeOpenRatio: z.number().min(0.25).max(0.9),
        irisToEye: z.number().min(0.35).max(0.75),
        eyeLine: z.number().min(0.42).max(0.62),
        lash: z.enum(["liner", "strands", "none"]),
      })
      .strict(),
    toon: z
      .object({
        rampSteps: z.union([z.literal(2), z.literal(3), z.literal(4)]),
        rim: z.boolean(),
        outline: z.enum(["none", "hull", "edge"]),
      })
      .strict(),
    look: lookSchema,
    palette: z
      .object({
        skin: z.array(hexSchema).min(1).max(6),
        hair: z.array(hexSchema).max(6),
        saturation: z.number().min(0).max(1.5),
      })
      .strict(),
  })
  .strict();
export type ArtStylePack = z.infer<typeof artStylePackSchema>;

/** 화풍 적용 범위(팔레트는 사용자 색을 덮어쓰므로 기본값을 끔으로 둔다). */
export interface StyleApplyScope {
  readonly look: boolean;
  readonly proportion: boolean;
  readonly face: boolean;
  readonly palette: boolean;
}

export const STYLE_APPLY_SCOPE_LABELS_KO: Readonly<Record<keyof StyleApplyScope, string>> = Object.freeze({
  look: "룩",
  proportion: "비례",
  face: "얼굴",
  palette: "팔레트",
});
