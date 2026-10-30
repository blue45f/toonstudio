/**
 * 필터 갤러리 등록부 — 계열 파일의 효과 정의를 한 목록으로 모으고, 문서에 저장된 스택을 정규화한다.
 *
 * 문서에는 효과 id·매개변수·불투명도만 저장되므로 읽을 때마다 여기서 다시 검증한다. 모르는 id(더 새 버전에서 저장한 효과),
 * 범위를 벗어난 숫자, 목록에 없는 선택값은 실행 전에 버리거나 기본값·경계값으로 고친다. 이 모듈은 커널 전부를 가져오므로
 * 지연 로드되는 필터 엔진·대화상자 청크에서만 가져와야 한다(즉시 로드 경로는 studio-filter-gallery-types 만 쓴다).
 */
import { STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS } from "./studio-filter-gallery-artistic";
import { STUDIO_FILTER_GALLERY_ARTISTIC_EXTRA_EFFECTS } from "./studio-filter-gallery-artistic-extra";
import { STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS } from "./studio-filter-gallery-brush-strokes";
import { STUDIO_FILTER_GALLERY_COLOR_EFFECTS } from "./studio-filter-gallery-color";
import { STUDIO_FILTER_GALLERY_DISTORT_EFFECTS } from "./studio-filter-gallery-distort";
import { STUDIO_FILTER_GALLERY_DECOR_EFFECTS, STUDIO_FILTER_GALLERY_LIGHT_EFFECTS } from "./studio-filter-gallery-light-decor";
import { STUDIO_FILTER_GALLERY_EDGE_EFFECTS, STUDIO_FILTER_GALLERY_MAP_EFFECTS } from "./studio-filter-gallery-map-edge";
import { STUDIO_FILTER_GALLERY_BLUR_EFFECTS, STUDIO_FILTER_GALLERY_NOISE_EFFECTS } from "./studio-filter-gallery-noise";
import { STUDIO_FILTER_GALLERY_PIXELATE_EFFECTS } from "./studio-filter-gallery-pixelate";
import { STUDIO_FILTER_GALLERY_RENDER_EFFECTS } from "./studio-filter-gallery-render";
import { STUDIO_FILTER_GALLERY_SKETCH_EFFECTS } from "./studio-filter-gallery-sketch";
import { STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS } from "./studio-filter-gallery-stylize";
import { STUDIO_FILTER_GALLERY_TEXTURE_EFFECTS } from "./studio-filter-gallery-texture-stylize";
import {
  STUDIO_FILTER_GALLERY_CATEGORIES,
  STUDIO_FILTER_GALLERY_MAX_ENTRIES,
  isStudioFilterGalleryEffectId,
} from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryEntry,
  StudioFilterGalleryParamSpec,
  StudioFilterGalleryParamValue,
  StudioFilterGalleryParams,
  StudioFilterGalleryStack,
} from "./studio-filter-gallery-types";

const FAMILIES: readonly (readonly StudioFilterGalleryEffectDef[])[] = [
  STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS,
  STUDIO_FILTER_GALLERY_ARTISTIC_EXTRA_EFFECTS,
  STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS,
  STUDIO_FILTER_GALLERY_SKETCH_EFFECTS,
  STUDIO_FILTER_GALLERY_TEXTURE_EFFECTS,
  STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS,
  STUDIO_FILTER_GALLERY_DISTORT_EFFECTS,
  STUDIO_FILTER_GALLERY_PIXELATE_EFFECTS,
  STUDIO_FILTER_GALLERY_RENDER_EFFECTS,
  STUDIO_FILTER_GALLERY_NOISE_EFFECTS,
  STUDIO_FILTER_GALLERY_BLUR_EFFECTS,
  STUDIO_FILTER_GALLERY_COLOR_EFFECTS,
  STUDIO_FILTER_GALLERY_EDGE_EFFECTS,
  STUDIO_FILTER_GALLERY_LIGHT_EFFECTS,
  STUDIO_FILTER_GALLERY_DECOR_EFFECTS,
  STUDIO_FILTER_GALLERY_MAP_EFFECTS,
];

const CATEGORY_ORDER = new Map<string, number>(STUDIO_FILTER_GALLERY_CATEGORIES.map((category, index) => [category, index]));

/** 분류 순서(STUDIO_FILTER_GALLERY_CATEGORIES)대로, 같은 분류 안에서는 계열 파일에 적힌 순서대로 정렬한 전체 목록. */
export const STUDIO_FILTER_GALLERY_EFFECTS: readonly StudioFilterGalleryEffectDef[] = Object.freeze(
  FAMILIES.flat()
    .map((effect, index) => ({ effect, index }))
    .sort((left, right) =>
      (CATEGORY_ORDER.get(left.effect.category) ?? 99) - (CATEGORY_ORDER.get(right.effect.category) ?? 99)
      || left.index - right.index)
    .map(({ effect }) => effect),
);

const EFFECTS_BY_ID: ReadonlyMap<string, StudioFilterGalleryEffectDef> = new Map(
  STUDIO_FILTER_GALLERY_EFFECTS.map((effect) => [effect.id, effect]),
);

export function findStudioFilterGalleryEffect(id: string): StudioFilterGalleryEffectDef | undefined {
  return EFFECTS_BY_ID.get(id);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function snapToStep(value: number, spec: Extract<StudioFilterGalleryParamSpec, { control: "slider" }>): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  if (!(spec.step > 0)) return clamped;
  const steps = Math.round((clamped - spec.min) / spec.step);
  // 부동소수 오차(0.1+0.2) 를 문서에 남기지 않도록 step 의 소수 자릿수로 반올림한다.
  const decimals = Math.min(6, (String(spec.step).split(".")[1] ?? "").length);
  return Math.min(spec.max, Number((spec.min + steps * spec.step).toFixed(decimals)));
}

function normalizeParamValue(spec: StudioFilterGalleryParamSpec, raw: unknown): StudioFilterGalleryParamValue {
  switch (spec.control) {
    case "slider":
      return typeof raw === "number" && Number.isFinite(raw) ? snapToStep(raw, spec) : spec.default;
    case "select":
      return typeof raw === "string" && spec.options.some((option) => option.value === raw) ? raw : spec.default;
    case "color":
      return typeof raw === "string" && HEX_COLOR.test(raw) ? raw.toLowerCase() : spec.default;
    case "toggle":
      return typeof raw === "boolean" ? raw : spec.default;
  }
}

export function defaultStudioFilterGalleryParams(effect: StudioFilterGalleryEffectDef): StudioFilterGalleryParams {
  return Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));
}

/** 스펙에 있는 키만 남기고 값마다 범위·선택지·형식을 맞춘다. 빠진 키는 기본값으로 채운다. */
export function normalizeStudioFilterGalleryParams(effect: StudioFilterGalleryEffectDef, raw: unknown): StudioFilterGalleryParams {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const out: Record<string, StudioFilterGalleryParamValue> = {};
  for (const spec of effect.params) {
    if (DANGEROUS_KEYS.has(spec.key)) continue;
    out[spec.key] = normalizeParamValue(spec, Object.hasOwn(source, spec.key) ? source[spec.key] : undefined);
  }
  return out;
}

function normalizeEntry(raw: unknown): StudioFilterGalleryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { id?: unknown; params?: unknown; opacity?: unknown; enabled?: unknown };
  if (!isStudioFilterGalleryEffectId(candidate.id)) return null;
  const effect = findStudioFilterGalleryEffect(candidate.id);
  if (!effect) return null;
  const opacity = typeof candidate.opacity === "number" && Number.isFinite(candidate.opacity)
    ? Math.min(1, Math.max(0, candidate.opacity))
    : 1;
  return {
    id: effect.id,
    params: normalizeStudioFilterGalleryParams(effect, candidate.params),
    ...(opacity < 1 ? { opacity: Math.round(opacity * 1000) / 1000 } : {}),
    ...(candidate.enabled === false ? { enabled: false } : {}),
  };
}

/**
 * 저장본을 실행 가능한 스택으로 정규화한다. 형식이 틀리거나 이 버전이 모르는 스택 버전이면 null 이다.
 * 모르는 효과 id 는 버리고, 효과는 최대 STUDIO_FILTER_GALLERY_MAX_ENTRIES 개까지만 남긴다.
 */
export function normalizeStudioFilterGalleryStack(value: unknown): StudioFilterGalleryStack | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { version?: unknown; seed?: unknown; entries?: unknown };
  if (candidate.version !== undefined && candidate.version !== 1) return null;
  if (!Array.isArray(candidate.entries)) return null;
  const seed = typeof candidate.seed === "number" && Number.isFinite(candidate.seed) ? Math.trunc(candidate.seed) >>> 0 : 1;
  const entries: StudioFilterGalleryEntry[] = [];
  for (const raw of candidate.entries) {
    if (entries.length >= STUDIO_FILTER_GALLERY_MAX_ENTRIES) break;
    const entry = normalizeEntry(raw);
    if (entry) entries.push(entry);
  }
  return { version: 1, seed, entries };
}

export function isStudioFilterGalleryEntryActive(entry: StudioFilterGalleryEntry): boolean {
  return entry.enabled !== false && (entry.opacity ?? 1) > 0;
}

/** 켜진 효과의 픽셀당 작업량 합. 예산 비교와 Worker 경로 판단에 쓴다. */
export function studioFilterGalleryStackCost(stack: StudioFilterGalleryStack): number {
  let total = 0;
  for (const entry of stack.entries) {
    if (!isStudioFilterGalleryEntryActive(entry)) continue;
    const effect = findStudioFilterGalleryEffect(entry.id);
    if (effect) total += effect.costFor?.(entry.params) ?? effect.cost;
  }
  return total;
}
