/**
 * studio-shaper-style-pack.ts
 *
 * 캐릭터 원클릭 스타일 팩 — 헤어·액세서리(소품)·상의·하의·신발 조합과 아이템별
 * 색상을 하나의 '스타일 팩'으로 묶어 셰이퍼 외형 코디 탭에서 한 번에
 * 적용(원클릭)·미리보기·저장·공유할 수 있게 하는 순수 계약 모듈.
 *
 * - 스키마: CharacterStylePack v1. 검증은 단일 지점
 *   `parseCharacterStylePack`에서 fail-closed로 수행한다 — 카탈로그
 *   (`SHAPER_PRESETS`)에 없는 프리셋 id, 범주가 어긋난 id, hex가 아닌 색상,
 *   길이·개수 상한 초과는 조용히 버리지 않고 사유 코드와 함께 거부한다.
 * - 적용: `applyCharacterStylePack`은 현재 외형 상태를 팩 상태로 통째로
 *   교체한 새 `ShaperAppearanceState`와 변경 영수증을 돌려준다. 패널은 이
 *   결과를 기존 `commitAppearance` 한 번으로 커밋하므로 적용은 원자적이다.
 * - 미리보기: `previewCharacterStylePack`이 범주별 전→후 차분을 만들고,
 *   `summarizeCharacterStylePack`이 카드용 한 줄 요약을 만든다.
 * - 저장소: 사용자 팩은 주입된 StorageLike(기본 localStorage 키
 *   `toonstudio.shaper.style-packs.v1`)에 JSON 배열로 저장된다. 깨진 항목은
 *   건너뛰고 개수를 보고한다 — 저장소 전체를 버리지 않는다.
 * - 공유: `TSP1.<base64url(canonical JSON)>.<fnv1a32 8hex>` 코드 하나로
 *   팩 전체를 주고받는다. 체크섬을 본문 해석 전에 대조한다.
 */

import {
  SHAPER_APPEARANCE_CATEGORIES,
  SHAPER_CATEGORIES,
  SHAPER_PRESETS,
  type ShaperAppearanceCategory,
  type ShaperAppearanceState,
} from "./studio-shaper-model";

// ── 상수·스키마 ──────────────────────────────────────────────────────────────

export const CHARACTER_STYLE_PACK_VERSION = 1 as const;
export const CHARACTER_STYLE_PACK_STORAGE_KEY = "toonstudio.shaper.style-packs.v1";
export const CHARACTER_STYLE_PACK_MAX_USER_PACKS = 50;
export const CHARACTER_STYLE_PACK_MAX_NAME_LENGTH = 40;
export const CHARACTER_STYLE_PACK_MAX_DESCRIPTION_LENGTH = 120;
export const CHARACTER_STYLE_PACK_MAX_TAGS = 6;
export const CHARACTER_STYLE_PACK_MAX_TAG_LENGTH = 16;
/** 공유 코드 본문 상한 — 초과분은 절단하지 않고 too-large로 거부한다. */
export const CHARACTER_STYLE_PACK_MAX_CODE_BYTES = 6144;

export type CharacterStylePackSource = "builtin" | "user";

export interface CharacterStylePack {
  readonly version: typeof CHARACTER_STYLE_PACK_VERSION;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly source: CharacterStylePackSource;
  /** 5개 외형 범주가 모두 채워진 정규화 상태. */
  readonly appearance: {
    readonly selection: Readonly<Record<ShaperAppearanceCategory, string>>;
    readonly colors: Readonly<Record<string, string>>;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CharacterStylePackErrorCode =
  | "not-an-object"
  | "unsupported-version"
  | "invalid-id"
  | "invalid-name"
  | "invalid-description"
  | "invalid-tags"
  | "invalid-appearance"
  | "unknown-preset"
  | "category-mismatch"
  | "invalid-color"
  | "invalid-timestamp"
  | "empty"
  | "not-a-style-pack-code"
  | "checksum-mismatch"
  | "invalid-payload"
  | "too-large"
  | "pack-limit"
  | "storage-unavailable";

export const CHARACTER_STYLE_PACK_ERROR_MESSAGES: Readonly<
  Record<CharacterStylePackErrorCode, string>
> = Object.freeze({
  "not-an-object": "스타일 팩 형식이 아닙니다.",
  "unsupported-version": "지원하지 않는 스타일 팩 버전입니다.",
  "invalid-id": "스타일 팩 id가 올바르지 않습니다.",
  "invalid-name": "팩 이름은 1~40자로 입력해 주세요.",
  "invalid-description": "팩 설명은 120자까지 입력할 수 있습니다.",
  "invalid-tags": "태그는 최대 6개, 각 16자까지 입력할 수 있습니다.",
  "invalid-appearance": "팩의 코디 구성이 올바르지 않습니다.",
  "unknown-preset": "카탈로그에 없는 아이템이 포함된 팩입니다.",
  "category-mismatch": "아이템이 속한 범주와 팩의 범주가 다릅니다.",
  "invalid-color": "아이템 색상은 #rrggbb 형식이어야 합니다.",
  "invalid-timestamp": "팩의 저장 시각이 올바르지 않습니다.",
  empty: "공유 코드가 비어 있습니다.",
  "not-a-style-pack-code": "스타일 팩 공유 코드가 아닙니다.",
  "checksum-mismatch": "공유 코드가 손상됐습니다. 코드 전체를 다시 복사해 주세요.",
  "invalid-payload": "공유 코드의 내용을 해석할 수 없습니다.",
  "too-large": "스타일 팩이 너무 커서 처리할 수 없습니다.",
  "pack-limit": `내 스타일 팩은 최대 ${CHARACTER_STYLE_PACK_MAX_USER_PACKS}개까지 저장할 수 있습니다.`,
  "storage-unavailable": "저장 공간에 접근할 수 없습니다.",
});

export type CharacterStylePackResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: CharacterStylePackErrorCode;
      readonly message: string;
      /** 문제가 된 필드 경로 (예: appearance.selection.hair). */
      readonly path?: string;
    };

function fail<T>(
  code: CharacterStylePackErrorCode,
  path?: string,
): CharacterStylePackResult<T> {
  return { ok: false, code, message: CHARACTER_STYLE_PACK_ERROR_MESSAGES[code], path };
}

// ── 카탈로그 대조 ────────────────────────────────────────────────────────────

const PRESET_CATEGORY_BY_ID: ReadonlyMap<string, string> = new Map(
  SHAPER_PRESETS.map((preset) => [preset.id, preset.category] as const),
);

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PACK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 외형 상태(부분 상태 허용)를 팩용 정규 상태로 만든다. */
export function normalizeStylePackAppearance(
  input: unknown,
): CharacterStylePackResult<CharacterStylePack["appearance"]> {
  if (!isRecord(input)) return fail("invalid-appearance", "appearance");
  const rawSelection = input.selection;
  const rawColors = input.colors ?? {};
  if (!isRecord(rawSelection)) return fail("invalid-appearance", "appearance.selection");
  if (!isRecord(rawColors)) return fail("invalid-appearance", "appearance.colors");

  const selection = {} as Record<ShaperAppearanceCategory, string>;
  for (const category of SHAPER_APPEARANCE_CATEGORIES) {
    const presetId = rawSelection[category];
    if (typeof presetId !== "string" || presetId.length === 0) {
      return fail("invalid-appearance", `appearance.selection.${category}`);
    }
    const owner = PRESET_CATEGORY_BY_ID.get(presetId);
    if (owner === undefined) return fail("unknown-preset", `appearance.selection.${category}`);
    if (owner !== category) return fail("category-mismatch", `appearance.selection.${category}`);
    selection[category] = presetId;
  }
  // 미지 범주 키는 조용히 버리지 않고 거부한다.
  for (const key of Object.keys(rawSelection)) {
    if (!(SHAPER_APPEARANCE_CATEGORIES as readonly string[]).includes(key)) {
      return fail("invalid-appearance", `appearance.selection.${key}`);
    }
  }

  const colors: Record<string, string> = {};
  for (const [presetId, hex] of Object.entries(rawColors)) {
    if (!PRESET_CATEGORY_BY_ID.has(presetId)) {
      return fail("unknown-preset", `appearance.colors.${presetId}`);
    }
    if (typeof hex !== "string" || !HEX_COLOR_PATTERN.test(hex)) {
      return fail("invalid-color", `appearance.colors.${presetId}`);
    }
    colors[presetId] = hex.toLowerCase();
  }
  return { ok: true, value: Object.freeze({ selection: Object.freeze(selection), colors: Object.freeze(colors) }) };
}

// ── 파싱 (단일 검증 지점) ────────────────────────────────────────────────────

export function parseCharacterStylePack(
  raw: unknown,
): CharacterStylePackResult<CharacterStylePack> {
  if (!isRecord(raw)) return fail("not-an-object");
  if (raw.version !== CHARACTER_STYLE_PACK_VERSION) return fail("unsupported-version", "version");

  const id = raw.id;
  if (typeof id !== "string" || id.length > 64 || !PACK_ID_PATTERN.test(id)) {
    return fail("invalid-id", "id");
  }
  const name = raw.name;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > CHARACTER_STYLE_PACK_MAX_NAME_LENGTH
  ) {
    return fail("invalid-name", "name");
  }
  const description = raw.description ?? "";
  if (
    typeof description !== "string" ||
    description.length > CHARACTER_STYLE_PACK_MAX_DESCRIPTION_LENGTH
  ) {
    return fail("invalid-description", "description");
  }
  const rawTags = raw.tags ?? [];
  if (
    !Array.isArray(rawTags) ||
    rawTags.length > CHARACTER_STYLE_PACK_MAX_TAGS ||
    rawTags.some(
      (tag) =>
        typeof tag !== "string" ||
        tag.trim().length === 0 ||
        tag.trim().length > CHARACTER_STYLE_PACK_MAX_TAG_LENGTH,
    )
  ) {
    return fail("invalid-tags", "tags");
  }
  const source = raw.source ?? "user";
  if (source !== "builtin" && source !== "user") return fail("not-an-object", "source");

  const appearance = normalizeStylePackAppearance(raw.appearance);
  if (!appearance.ok) return appearance;

  const createdAt = raw.createdAt;
  const updatedAt = raw.updatedAt ?? createdAt;
  if (
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt)) ||
    typeof updatedAt !== "string" ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    return fail("invalid-timestamp", "createdAt");
  }

  return {
    ok: true,
    value: Object.freeze({
      version: CHARACTER_STYLE_PACK_VERSION,
      id,
      name: name.trim(),
      description: (description as string).trim(),
      // 중복 태그는 순서 보존하며 한 번만 남긴다.
      tags: Object.freeze([...new Set((rawTags as string[]).map((tag) => tag.trim()))]),
      source: source as CharacterStylePackSource,
      appearance: appearance.value,
      createdAt,
      updatedAt: updatedAt as string,
    }),
  };
}

// ── 캡처 (현재 코디 → 팩) ────────────────────────────────────────────────────

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function slugifyPackName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "my-style";
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface CaptureCharacterStylePackOptions {
  readonly name: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  /** 테스트·결정성을 위한 시각 주입. 기본값은 현재 시각. */
  readonly now?: string;
  /** 기존 팩을 덮어쓸 때 그 id·생성 시각을 유지한다. */
  readonly existing?: CharacterStylePack;
}

export function captureCharacterStylePack(
  appearance: ShaperAppearanceState,
  options: CaptureCharacterStylePackOptions,
): CharacterStylePackResult<CharacterStylePack> {
  const normalized = normalizeStylePackAppearance(appearance);
  if (!normalized.ok) return normalized;
  const now = options.now ?? new Date().toISOString();
  // id는 이름 slug + 구성 해시 — 같은 이름 다른 구성은 다른 팩으로 공존하고,
  // 같은 이름+같은 구성의 재저장은 같은 id라 저장소에서 자연히 덮어쓴다.
  const fingerprint = fnv1a32(
    canonicalJson({ name: options.name.trim(), appearance: normalized.value }),
  );
  const id = options.existing?.id ?? `${slugifyPackName(options.name)}-${fingerprint}`;
  return parseCharacterStylePack({
    version: CHARACTER_STYLE_PACK_VERSION,
    id,
    name: options.name,
    description: options.description ?? "",
    tags: options.tags ?? [],
    source: "user",
    appearance: normalized.value,
    createdAt: options.existing?.createdAt ?? now,
    updatedAt: now,
  });
}

// ── 적용·미리보기 ────────────────────────────────────────────────────────────

export interface CharacterStylePackApplyReceipt {
  /** 값이 실제로 바뀐 범주. */
  readonly changedCategories: readonly ShaperAppearanceCategory[];
  /** 팩이 지정한 색상 수. */
  readonly colorCount: number;
  readonly summaryKo: string;
}

/** 팩을 현재 상태에 원클릭 적용한 결과 — 팩 상태로 통째 교체한다. */
export function applyCharacterStylePack(
  current: ShaperAppearanceState,
  pack: CharacterStylePack,
): { readonly appearance: ShaperAppearanceState; readonly receipt: CharacterStylePackApplyReceipt } {
  const changedCategories = SHAPER_APPEARANCE_CATEGORIES.filter(
    (category) => current.selection[category] !== pack.appearance.selection[category],
  );
  const appearance: ShaperAppearanceState = Object.freeze({
    selection: Object.freeze({ ...pack.appearance.selection }),
    colors: Object.freeze({ ...pack.appearance.colors }),
  });
  return {
    appearance,
    receipt: Object.freeze({
      changedCategories: Object.freeze(changedCategories),
      colorCount: Object.keys(pack.appearance.colors).length,
      summaryKo:
        changedCategories.length === 0
          ? `'${pack.name}' 팩이 이미 적용돼 있습니다.`
          : `'${pack.name}' 팩을 적용했습니다 — ${changedCategories
              .map((category) => categoryLabelKo(category))
              .join("·")} 교체.`,
    }),
  };
}

export interface CharacterStylePackPreviewRow {
  readonly category: ShaperAppearanceCategory;
  readonly categoryLabelKo: string;
  readonly fromPresetId: string | undefined;
  readonly toPresetId: string;
  readonly fromLabelKo: string;
  readonly toLabelKo: string;
  readonly changed: boolean;
}

function categoryLabelKo(category: ShaperAppearanceCategory): string {
  return SHAPER_CATEGORIES.find((meta) => meta.id === category)?.label ?? category;
}

function presetLabelKo(presetId: string | undefined): string {
  if (!presetId) return "선택 없음";
  return SHAPER_PRESETS.find((preset) => preset.id === presetId)?.label ?? presetId;
}

/** 적용 전에 보여주는 범주별 전→후 차분. */
export function previewCharacterStylePack(
  current: ShaperAppearanceState,
  pack: CharacterStylePack,
): readonly CharacterStylePackPreviewRow[] {
  return Object.freeze(
    SHAPER_APPEARANCE_CATEGORIES.map((category) => {
      const fromPresetId = current.selection[category];
      const toPresetId = pack.appearance.selection[category];
      return Object.freeze({
        category,
        categoryLabelKo: categoryLabelKo(category),
        fromPresetId,
        toPresetId,
        fromLabelKo: presetLabelKo(fromPresetId),
        toLabelKo: presetLabelKo(toPresetId),
        changed: fromPresetId !== toPresetId,
      });
    }),
  );
}

/** 카드·목록용 한 줄 요약: "헤어 시스루 뱅 단발 · 상의 교복 셔츠&넥타이 · …" */
export function summarizeCharacterStylePack(pack: CharacterStylePack): string {
  return SHAPER_APPEARANCE_CATEGORIES.map(
    (category) =>
      `${categoryLabelKo(category)} ${presetLabelKo(pack.appearance.selection[category])}`,
  ).join(" · ");
}

// ── 기본 제공 팩 ─────────────────────────────────────────────────────────────

const BUILTIN_EPOCH = "2026-10-14T00:00:00.000Z";

function builtinPack(
  id: string,
  name: string,
  description: string,
  tags: readonly string[],
  selection: Record<ShaperAppearanceCategory, string>,
  colors: Record<string, string>,
): CharacterStylePack {
  const parsed = parseCharacterStylePack({
    version: CHARACTER_STYLE_PACK_VERSION,
    id,
    name,
    description,
    tags,
    source: "builtin",
    appearance: { selection, colors },
    createdAt: BUILTIN_EPOCH,
    updatedAt: BUILTIN_EPOCH,
  });
  if (!parsed.ok) throw new Error(`builtin style pack ${id}: ${parsed.code}`);
  return parsed.value;
}

export const BUILTIN_CHARACTER_STYLE_PACKS: readonly CharacterStylePack[] = Object.freeze([
  builtinPack(
    "builtin-campus-romance",
    "학원 로맨스",
    "시스루 뱅 단발과 단정한 교복, 빨간 스니커즈 포인트",
    ["학원", "로맨스"],
    {
      hair: "hair-bob",
      accessories: "acc-none",
      top: "top-school",
      bottom: "bottom-skirt",
      shoes: "shoes-sneakers",
    },
    { "hair-bob": "#5b4636", "top-school": "#4f6fb3", "bottom-skirt": "#374151", "shoes-sneakers": "#ef4444" },
  ),
  builtinPack(
    "builtin-fantasy-adventurer",
    "판타지 모험가",
    "하이 포니테일과 수련 도복, 실버 링 귀걸이와 워커 부츠",
    ["판타지", "액션"],
    {
      hair: "hair-ponytail",
      accessories: "acc-earring",
      top: "top-martial",
      bottom: "bottom-martial",
      shoes: "shoes-boots",
    },
    { "hair-ponytail": "#7c2d12", "top-martial": "#b45309", "bottom-martial": "#1f2937", "shoes-boots": "#1f2937" },
  ),
  builtinPack(
    "builtin-noir-professional",
    "느와르 전문가",
    "투블럭 댄디컷과 슬림핏 정장, 뿔테 안경과 클래식 로퍼",
    ["현대", "느와르"],
    {
      hair: "hair-dandy",
      accessories: "acc-glasses",
      top: "top-suit",
      bottom: "bottom-slacks",
      shoes: "shoes-loafer",
    },
    { "hair-dandy": "#1f2937", "acc-glasses": "#1f2937", "top-suit": "#1f2937", "bottom-slacks": "#374151", "shoes-loafer": "#7c2d12" },
  ),
  builtinPack(
    "builtin-chibi-daily",
    "SD 일상 개그",
    "풍성한 웨이브와 오버핏 후드티, 헤드폰과 데님",
    ["일상", "개그", "SD"],
    {
      hair: "hair-wavy",
      accessories: "acc-headphones",
      top: "top-hoodie",
      bottom: "bottom-jeans",
      shoes: "shoes-sneakers",
    },
    { "hair-wavy": "#b45309", "acc-headphones": "#8b5cf6", "top-hoodie": "#f97316", "bottom-jeans": "#3b82f6", "shoes-sneakers": "#f3f4f6" },
  ),
  builtinPack(
    "builtin-sporty-campus",
    "스포티 캠퍼스",
    "내추럴 숏컷과 야구 모자, 후드티와 데님의 활동적인 조합",
    ["학원", "스포츠"],
    {
      hair: "hair-short",
      accessories: "acc-cap",
      top: "top-hoodie",
      bottom: "bottom-jeans",
      shoes: "shoes-sneakers",
    },
    { "hair-short": "#1f2937", "acc-cap": "#ef4444", "top-hoodie": "#22c55e", "bottom-jeans": "#374151", "shoes-sneakers": "#f3f4f6" },
  ),
  builtinPack(
    "builtin-elegant-date",
    "우아한 데이트",
    "긴 생머리와 실버 링 귀걸이, 파스텔 교복풍 코디와 로퍼",
    ["로맨스", "데이트"],
    {
      hair: "hair-long-straight",
      accessories: "acc-earring",
      top: "top-school",
      bottom: "bottom-skirt",
      shoes: "shoes-loafer",
    },
    { "hair-long-straight": "#1f2937", "acc-earring": "#eab308", "top-school": "#ec4899", "bottom-skirt": "#8b5cf6", "shoes-loafer": "#7c2d12" },
  ),
]);

// ── 공유 코드 ────────────────────────────────────────────────────────────────

const SHARE_CODE_PREFIX = "TSP1";

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 팩 → 공유 코드. 같은 팩은 항상 같은 코드가 된다(결정성). */
export function encodeCharacterStylePackShareCode(pack: CharacterStylePack): string {
  const body = canonicalJson({
    version: pack.version,
    id: pack.id,
    name: pack.name,
    description: pack.description,
    tags: pack.tags,
    appearance: pack.appearance,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  });
  return `${SHARE_CODE_PREFIX}.${base64UrlEncode(body)}.${fnv1a32(body)}`;
}

/** 임의 텍스트에서 공유 코드만 뽑아 팩으로 복원한다. 받은 팩은 사용자 팩이 된다. */
export function decodeCharacterStylePackShareCode(
  text: string,
): CharacterStylePackResult<CharacterStylePack> {
  if (typeof text !== "string" || text.trim().length === 0) return fail("empty");
  const match = text.match(/TSP\d+\.[A-Za-z0-9_-]+\.[0-9a-f]{8}/);
  if (!match) return fail("not-a-style-pack-code");
  const [prefix, encoded, checksum] = match[0].split(".");
  if (prefix !== SHARE_CODE_PREFIX) return fail("unsupported-version");
  let body: string;
  try {
    body = base64UrlDecode(encoded);
  } catch {
    return fail("invalid-payload");
  }
  if (new TextEncoder().encode(body).length > CHARACTER_STYLE_PACK_MAX_CODE_BYTES) {
    return fail("too-large");
  }
  if (fnv1a32(body) !== checksum) return fail("checksum-mismatch");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return fail("invalid-payload");
  }
  // 인코더가 만들 수 없는 변형 바이트열(키 순서·공백)은 canonical 대조로 거부.
  // source는 코드에 싣지 않으므로 본문은 source 없는 canonical JSON이다.
  if (!isRecord(raw) || canonicalJson(raw) !== body) return fail("invalid-payload");
  return parseCharacterStylePack({ ...(raw as Record<string, unknown>), source: "user" });
}

// ── 사용자 팩 저장소 ─────────────────────────────────────────────────────────

export interface StylePackStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serializeUserCharacterStylePacks(
  packs: readonly CharacterStylePack[],
): string {
  return JSON.stringify(packs);
}

export function loadUserCharacterStylePacks(storage: StylePackStorageLike | null): {
  readonly packs: readonly CharacterStylePack[];
  /** 깨져서 건너뛴 항목 수 — 저장소 전체를 버리지 않는다. */
  readonly dropped: number;
} {
  if (!storage) return { packs: Object.freeze([]), dropped: 0 };
  let text: string | null;
  try {
    text = storage.getItem(CHARACTER_STYLE_PACK_STORAGE_KEY);
  } catch {
    return { packs: Object.freeze([]), dropped: 0 };
  }
  if (!text) return { packs: Object.freeze([]), dropped: 0 };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { packs: Object.freeze([]), dropped: 1 };
  }
  if (!Array.isArray(raw)) return { packs: Object.freeze([]), dropped: 1 };
  const packs: CharacterStylePack[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const entry of raw) {
    const parsed = parseCharacterStylePack(
      isRecord(entry) ? { ...entry, source: "user" } : entry,
    );
    if (!parsed.ok || seen.has(parsed.value.id)) {
      dropped += 1;
      continue;
    }
    seen.add(parsed.value.id);
    packs.push(parsed.value);
  }
  return { packs: Object.freeze(packs), dropped };
}

function persistUserPacks(
  storage: StylePackStorageLike,
  packs: readonly CharacterStylePack[],
): CharacterStylePackResult<readonly CharacterStylePack[]> {
  try {
    storage.setItem(CHARACTER_STYLE_PACK_STORAGE_KEY, serializeUserCharacterStylePacks(packs));
  } catch {
    return fail("storage-unavailable");
  }
  return { ok: true, value: Object.freeze([...packs]) };
}

/** 사용자 팩 저장(같은 id는 덮어씀). 상한 초과 시 기존 팩을 밀어내지 않고 거부한다. */
export function saveUserCharacterStylePack(
  storage: StylePackStorageLike | null,
  pack: CharacterStylePack,
): CharacterStylePackResult<readonly CharacterStylePack[]> {
  if (!storage) return fail("storage-unavailable");
  const { packs } = loadUserCharacterStylePacks(storage);
  const exists = packs.some((entry) => entry.id === pack.id);
  if (!exists && packs.length >= CHARACTER_STYLE_PACK_MAX_USER_PACKS) {
    return fail("pack-limit");
  }
  const next = exists
    ? packs.map((entry) => (entry.id === pack.id ? pack : entry))
    : [...packs, pack];
  return persistUserPacks(storage, next);
}

export function removeUserCharacterStylePack(
  storage: StylePackStorageLike | null,
  packId: string,
): CharacterStylePackResult<readonly CharacterStylePack[]> {
  if (!storage) return fail("storage-unavailable");
  const { packs } = loadUserCharacterStylePacks(storage);
  return persistUserPacks(
    storage,
    packs.filter((entry) => entry.id !== packId),
  );
}
