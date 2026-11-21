/**
 * Photoshop Smart Object(원본 보존 스마트 오브젝트) + 비파괴 Smart Filter 스택(T-024) 엔진.
 *
 * - 기존 `studio-smart-filter-stack-contract.ts` (`StudioWorkAssetSmartFiltersSchema`)와 100% 호환.
 * - 필터 재편집, 순서 변경, 필터별 불투명도·블렌드 모드, 전체 Smart Filter Mask(페인팅·반전·페더),
 *   원본 콘텐츠 교체(`replaceSmartObjectContents`)를 지원한다.
 */

import { StudioWorkAssetSmartFiltersSchema } from "../contracts/studio-smart-filter-stack-contract";
import { blurByteMaskSeparable, blurRgbaSeparable, clamp01, clampByte, luminance255 } from "./photoshop-pixel-math";

import type { StudioAdjustmentEngineId, StudioAdjustmentStack } from "../studio-adjustment-stack";
import type { RgbaImageBuffer } from "./photoshop-pixel-math";

export type SmartFilterBlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "soft-light"
  | "darken" | "lighten" | "luminosity" | "color";

export type SmartFilterParamValue = number | string | boolean;
export type SmartFilterParams = Readonly<Record<string, SmartFilterParamValue>>;

export interface SmartFilterStackEntry {
  readonly id: string;
  readonly engine: StudioAdjustmentEngineId;
  readonly label: string;
  readonly enabled: boolean;
  readonly opacity: number;
  readonly blendMode: SmartFilterBlendMode;
  readonly params: SmartFilterParams;
}

export interface SmartFilterMaskLayer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly enabled: boolean;
  readonly inverted: boolean;
  readonly featherPx: number;
}

export interface SmartObjectTransform {
  readonly scaleX: number; readonly scaleY: number;
  readonly rotationDeg: number; readonly offsetX: number; readonly offsetY: number;
}

export interface PhotoshopSmartObjectDocument {
  readonly id: string;
  readonly label: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly sourcePixels: Uint8ClampedArray;
  readonly transform: SmartObjectTransform;
  readonly filters: readonly SmartFilterStackEntry[];
  readonly filterMask: SmartFilterMaskLayer;
  readonly revision: number;
}

export interface SmartFilterRecipePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly entries: readonly {
    readonly engine: StudioAdjustmentEngineId;
    readonly label: string;
    readonly opacity: number;
    readonly blendMode: SmartFilterBlendMode;
    readonly params: SmartFilterParams;
  }[];
}

export const SMART_FILTER_MAX_ENTRIES = 24;

export const SMART_FILTER_CATALOG_LABELS: Readonly<Partial<Record<StudioAdjustmentEngineId, string>>> = Object.freeze({
  "gaussian-blur": "부드러운 흐림",
  "unsharp-mask": "선명하게 다듬기",
  "high-pass": "질감·윤곽 강조",
  "brightness-contrast": "밝기·대비 보정",
  "hue-saturation": "색조·채도 조절",
  exposure: "빛 노출 보정",
  "shadow-highlight": "어두운 곳·밝은 곳 살리기",
  "surface-blur": "경계 유지 매끈하게",
  "dust-scratches": "점·먼지 정리",
  grayscale: "흑백 전환",
  sepia: "따뜻한 회상 톤",
  invert: "색상 반전",
  posterize: "포스터 단계 줄이기",
  noise: "필름 입자 더하기",
  emboss: "부조 입체 효과",
  "edge-detect": "윤곽선 추출",
});

export const PHOTOSHOP_SMART_FILTER_RECIPES: readonly SmartFilterRecipePreset[] = Object.freeze<readonly SmartFilterRecipePreset[]>([
  {
    id: "webtoon-crisp-finish", label: "웹툰 인물 선명 마무리",
    description: "윤곽을 또렷하게 살리고 어두운 음영만 자연스럽게 밝혀 줍니다.",
    entries: [
      { engine: "high-pass", label: "질감·윤곽 강조", opacity: 0.45, blendMode: "overlay", params: { radius: 2 } },
      { engine: "shadow-highlight", label: "어두운 곳·밝은 곳 살리기", opacity: 0.7, blendMode: "normal", params: { shadows: 24, highlights: 12 } },
    ],
  },
  {
    id: "dreamy-orton-glow", label: "몽환적 소프트 빛 번짐",
    description: "부드러운 흐림을 밝게 겹쳐 로맨스 컷의 포근한 빛을 만듭니다.",
    entries: [
      { engine: "gaussian-blur", label: "부드러운 흐림", opacity: 0.42, blendMode: "screen", params: { radius: 4 } },
      { engine: "brightness-contrast", label: "밝기·대비 보정", opacity: 0.65, blendMode: "soft-light", params: { brightness: 0.08, contrast: 14 } },
    ],
  },
  {
    id: "vintage-film-mood", label: "회상 장면 필름 스냅",
    description: "따뜻한 색감에 미세한 필름 입자를 원본 손상 없이 얹습니다.",
    entries: [
      { engine: "sepia", label: "따뜻한 회상 톤", opacity: 0.5, blendMode: "color", params: {} },
      { engine: "noise", label: "필름 입자 더하기", opacity: 0.35, blendMode: "soft-light", params: { amount: 18, seed: 2026 } },
    ],
  },
]);

const VALID_BLEND_MODES = new Set<SmartFilterBlendMode>([
  "normal", "multiply", "screen", "overlay", "soft-light", "darken", "lighten", "luminosity", "color",
]);

function numParam(params: SmartFilterParams, key: string, fallback: number): number {
  const raw = params[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function sanitizeParams(params: SmartFilterParams): Record<string, SmartFilterParamValue> {
  const out: Record<string, SmartFilterParamValue> = {};
  for (const key of Object.keys(params).sort().slice(0, 16)) {
    if (!key || key.length > 48) continue;
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, 128);
  }
  return out;
}

export function createFullMask(width: number, height: number, fillByte = 255): SmartFilterMaskLayer {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const data = new Uint8Array(safeW * safeH);
  data.fill(clampByte(fillByte));
  return { width: safeW, height: safeH, data, enabled: true, inverted: false, featherPx: 0 };
}

export function createSmartObjectDocument(input: {
  readonly id?: string; readonly label?: string;
  readonly source: RgbaImageBuffer; readonly initialStack?: StudioAdjustmentStack;
}): PhotoshopSmartObjectDocument {
  const base: PhotoshopSmartObjectDocument = {
    id: input.id ?? "smart-obj-1",
    label: input.label ?? "스마트 오브젝트",
    sourceWidth: input.source.width,
    sourceHeight: input.source.height,
    sourcePixels: new Uint8ClampedArray(input.source.data),
    transform: { scaleX: 1, scaleY: 1, rotationDeg: 0, offsetX: 0, offsetY: 0 },
    filters: [],
    filterMask: createFullMask(input.source.width, input.source.height, 255),
    revision: 1,
  };
  return input.initialStack ? fromStudioSmartFilterStack(input.initialStack, base) : base;
}

export function replaceSmartObjectContents(
  doc: PhotoshopSmartObjectDocument, nextSource: RgbaImageBuffer,
): PhotoshopSmartObjectDocument {
  const nextMask = nextSource.width === doc.filterMask.width && nextSource.height === doc.filterMask.height
    ? doc.filterMask : createFullMask(nextSource.width, nextSource.height, 255);
  return {
    ...doc, sourceWidth: nextSource.width, sourceHeight: nextSource.height,
    sourcePixels: new Uint8ClampedArray(nextSource.data), filterMask: nextMask, revision: doc.revision + 1,
  };
}

export function addSmartFilter(
  doc: PhotoshopSmartObjectDocument,
  entry: {
    readonly id?: string; readonly engine: StudioAdjustmentEngineId; readonly label?: string;
    readonly params?: SmartFilterParams; readonly opacity?: number;
    readonly blendMode?: SmartFilterBlendMode; readonly enabled?: boolean;
  },
): PhotoshopSmartObjectDocument {
  if (doc.filters.length >= SMART_FILTER_MAX_ENTRIES) return doc;
  const id = (entry.id?.trim() || `sf-${entry.engine}-${doc.revision}-${doc.filters.length + 1}`).slice(0, 80);
  return {
    ...doc,
    filters: [...doc.filters, {
      id, engine: entry.engine,
      label: entry.label ?? SMART_FILTER_CATALOG_LABELS[entry.engine] ?? entry.engine,
      enabled: entry.enabled ?? true,
      opacity: clamp01(entry.opacity ?? 1),
      blendMode: entry.blendMode ?? "normal",
      params: sanitizeParams(entry.params ?? {}),
    }],
    revision: doc.revision + 1,
  };
}

export function updateSmartFilterParams(
  doc: PhotoshopSmartObjectDocument, filterId: string, nextParams: SmartFilterParams,
): PhotoshopSmartObjectDocument {
  return {
    ...doc,
    filters: doc.filters.map((item) => item.id === filterId
      ? { ...item, params: sanitizeParams({ ...item.params, ...nextParams }) } : item),
    revision: doc.revision + 1,
  };
}

export function updateSmartFilterBlending(
  doc: PhotoshopSmartObjectDocument, filterId: string,
  patch: { readonly enabled?: boolean; readonly opacity?: number; readonly blendMode?: SmartFilterBlendMode },
): PhotoshopSmartObjectDocument {
  return {
    ...doc,
    filters: doc.filters.map((item) => item.id === filterId ? {
      ...item,
      enabled: patch.enabled ?? item.enabled,
      opacity: patch.opacity !== undefined ? clamp01(patch.opacity) : item.opacity,
      blendMode: patch.blendMode ?? item.blendMode,
    } : item),
    revision: doc.revision + 1,
  };
}

export function reorderSmartFilter(
  doc: PhotoshopSmartObjectDocument, fromIndex: number, toIndex: number,
): PhotoshopSmartObjectDocument {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= doc.filters.length || toIndex >= doc.filters.length || fromIndex === toIndex) {
    return doc;
  }
  const next = [...doc.filters];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return doc;
  next.splice(toIndex, 0, moved);
  return { ...doc, filters: next, revision: doc.revision + 1 };
}

export function duplicateSmartFilter(doc: PhotoshopSmartObjectDocument, filterId: string): PhotoshopSmartObjectDocument {
  if (doc.filters.length >= SMART_FILTER_MAX_ENTRIES) return doc;
  const idx = doc.filters.findIndex((item) => item.id === filterId);
  if (idx < 0) return doc;
  const origin = doc.filters[idx]!;
  const next = [...doc.filters];
  next.splice(idx + 1, 0, { ...origin, id: `${origin.id}-copy-${doc.revision}`.slice(0, 80), params: { ...origin.params } });
  return { ...doc, filters: next, revision: doc.revision + 1 };
}

export function removeSmartFilter(doc: PhotoshopSmartObjectDocument, filterId: string): PhotoshopSmartObjectDocument {
  return { ...doc, filters: doc.filters.filter((item) => item.id !== filterId), revision: doc.revision + 1 };
}

export function paintSmartFilterMaskCircle(
  doc: PhotoshopSmartObjectDocument, cx: number, cy: number, radiusPx: number, valueByte: number, hardness01 = 0.7,
): PhotoshopSmartObjectDocument {
  const { width, height, data } = doc.filterMask;
  const nextData = new Uint8Array(data);
  const r = Math.max(0.5, radiusPx), hard = clamp01(hardness01), target = clampByte(valueByte);
  const minX = Math.max(0, Math.floor(cx - r)), maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r)), maxY = Math.min(height - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > r) continue;
      const norm = dist / r;
      const falloff = norm <= hard ? 1 : clamp01(1 - (norm - hard) / Math.max(0.01, 1 - hard));
      const idx = y * width + x;
      nextData[idx] = clampByte((nextData[idx] ?? 255) + (target - (nextData[idx] ?? 255)) * falloff);
    }
  }
  return { ...doc, filterMask: { ...doc.filterMask, data: nextData }, revision: doc.revision + 1 };
}

export function updateSmartFilterMaskOptions(
  doc: PhotoshopSmartObjectDocument,
  patch: { readonly enabled?: boolean; readonly inverted?: boolean; readonly featherPx?: number; readonly fillByte?: number },
): PhotoshopSmartObjectDocument {
  let nextData = doc.filterMask.data;
  if (patch.fillByte !== undefined) {
    nextData = new Uint8Array(doc.filterMask.width * doc.filterMask.height);
    nextData.fill(clampByte(patch.fillByte));
  }
  return {
    ...doc,
    filterMask: {
      ...doc.filterMask, data: nextData,
      enabled: patch.enabled ?? doc.filterMask.enabled,
      inverted: patch.inverted ?? doc.filterMask.inverted,
      featherPx: patch.featherPx !== undefined ? Math.max(0, Math.min(32, patch.featherPx)) : doc.filterMask.featherPx,
    },
    revision: doc.revision + 1,
  };
}

/** Smart Object 필터 스택을 저장소 정본 계약(`StudioWorkAssetSmartFiltersSchema`)으로 직렬화한다. */
export function toStudioSmartFilterStack(doc: PhotoshopSmartObjectDocument): StudioAdjustmentStack {
  const raw = {
    version: 1 as const,
    entries: doc.filters.slice(0, SMART_FILTER_MAX_ENTRIES).map((entry) => {
      const params = sanitizeParams(entry.params);
      if (entry.blendMode !== "normal" && Object.keys(params).length < 16) params.blendMode = entry.blendMode;
      return {
        id: entry.id.slice(0, 80), engine: entry.engine, enabled: entry.enabled,
        ...(entry.opacity < 1 ? { opacity: clamp01(entry.opacity) } : {}), params,
      };
    }),
  };
  const parsed = StudioWorkAssetSmartFiltersSchema.parse(raw);
  return {
    version: parsed.version,
    entries: parsed.entries.map((e) => ({
      id: e.id, engine: e.engine, enabled: e.enabled,
      ...(e.opacity !== undefined ? { opacity: e.opacity } : {}), params: { ...e.params },
    })),
  };
}

/** `StudioWorkAssetSmartFiltersSchema` 정본 스택에서 `PhotoshopSmartObjectDocument` 필터 목록을 복원한다. */
export function fromStudioSmartFilterStack(
  stack: StudioAdjustmentStack, baseDoc: PhotoshopSmartObjectDocument,
): PhotoshopSmartObjectDocument {
  const parsed = StudioWorkAssetSmartFiltersSchema.safeParse(stack);
  const sourceEntries = parsed.success ? parsed.data.entries : stack.entries;
  const filters: SmartFilterStackEntry[] = sourceEntries.slice(0, SMART_FILTER_MAX_ENTRIES).map((entry) => {
    const { blendMode: rawBlend, ...restParams } = entry.params;
    const blendMode: SmartFilterBlendMode =
      typeof rawBlend === "string" && VALID_BLEND_MODES.has(rawBlend as SmartFilterBlendMode)
        ? (rawBlend as SmartFilterBlendMode) : "normal";
    return {
      id: entry.id, engine: entry.engine,
      label: SMART_FILTER_CATALOG_LABELS[entry.engine] ?? entry.engine,
      enabled: entry.enabled, opacity: clamp01(entry.opacity ?? 1), blendMode,
      params: sanitizeParams(restParams),
    };
  });
  return { ...baseDoc, filters, revision: baseDoc.revision + 1 };
}

function blendSmartFilterRgb(
  br: number, bg: number, bb: number, sr: number, sg: number, sb: number, mode: SmartFilterBlendMode,
): [number, number, number] {
  if (mode === "luminosity") {
    const delta = (luminance255(sr, sg, sb) - luminance255(br, bg, bb));
    return [clamp01(br + delta), clamp01(bg + delta), clamp01(bb + delta)];
  }
  if (mode === "color") {
    const delta = (luminance255(br, bg, bb) - luminance255(sr, sg, sb));
    return [clamp01(sr + delta), clamp01(sg + delta), clamp01(sb + delta)];
  }
  const ch = (b: number, s: number): number => {
    switch (mode) {
      case "multiply": return b * s;
      case "screen": return 1 - (1 - b) * (1 - s);
      case "overlay": return b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
      case "soft-light": return s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (Math.sqrt(b) - b);
      case "darken": return Math.min(b, s);
      case "lighten": return Math.max(b, s);
      default: return s;
    }
  };
  return [ch(br, sr), ch(bg, sg), ch(bb, sb)];
}

function runSingleSmartFilter(
  src: Uint8ClampedArray, width: number, height: number, entry: SmartFilterStackEntry,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const p = entry.params;
  const total = width * height;
  switch (entry.engine) {
    case "blur":
    case "gaussian-blur":
      return blurRgbaSeparable(src, width, height, numParam(p, "radius", 3));
    case "high-pass": {
      const blur = blurRgbaSeparable(src, width, height, numParam(p, "radius", 2));
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        for (let c = 0; c < 3; c += 1) out[off + c] = clampByte(128 + ((src[off + c] ?? 0) - (blur[off + c] ?? 0)));
        out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "unsharp-mask":
    case "sharpen":
    case "smart-sharpen": {
      const amount = entry.engine === "smart-sharpen" ? numParam(p, "amount", 65) / 50 : numParam(p, "amount", 0.8);
      const threshold = numParam(p, "threshold", 4);
      const blur = blurRgbaSeparable(src, width, height, numParam(p, "radius", 2));
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        for (let c = 0; c < 3; c += 1) {
          const orig = src[off + c] ?? 0, diff = orig - (blur[off + c] ?? 0);
          out[off + c] = Math.abs(diff) >= threshold ? clampByte(orig + diff * amount) : orig;
        }
        out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "brightness-contrast": {
      const brightness = numParam(p, "brightness", 0) * 255, contrast = numParam(p, "contrast", 0);
      const factor = (259 * (contrast + 255)) / (255 * Math.max(1, 259 - contrast));
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        for (let c = 0; c < 3; c += 1) out[off + c] = clampByte(factor * ((src[off + c] ?? 0) - 128) + 128 + brightness);
        out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "exposure": {
      const gain = Math.pow(2, numParam(p, "exposure", 0.4));
      const offset = numParam(p, "offset", 0), invGamma = 1 / Math.max(0.1, numParam(p, "gamma", 1));
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        for (let c = 0; c < 3; c += 1) out[off + c] = clampByte(Math.pow(clamp01(((src[off + c] ?? 0) / 255) * gain + offset), invGamma) * 255);
        out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "shadow-highlight": {
      const shadows = clamp01(numParam(p, "shadows", 30) / 100), highlights = clamp01(numParam(p, "highlights", 15) / 100);
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        const r = (src[off] ?? 0) / 255, g = (src[off + 1] ?? 0) / 255, b = (src[off + 2] ?? 0) / 255;
        const luma = luminance255(r, g, b);
        const shift = shadows * (1 - luma) ** 2 * 0.45 - highlights * luma ** 2 * 0.4;
        out[off] = clampByte((r + shift) * 255); out[off + 1] = clampByte((g + shift) * 255);
        out[off + 2] = clampByte((b + shift) * 255); out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "grayscale": {
      for (let i = 0; i < total; i += 1) {
        const off = i * 4, y = clampByte(luminance255(src[off] ?? 0, src[off + 1] ?? 0, src[off + 2] ?? 0));
        out[off] = y; out[off + 1] = y; out[off + 2] = y; out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "sepia": {
      for (let i = 0; i < total; i += 1) {
        const off = i * 4, r = src[off] ?? 0, g = src[off + 1] ?? 0, b = src[off + 2] ?? 0;
        out[off] = clampByte(r * 0.393 + g * 0.769 + b * 0.189);
        out[off + 1] = clampByte(r * 0.349 + g * 0.686 + b * 0.168);
        out[off + 2] = clampByte(r * 0.272 + g * 0.534 + b * 0.131);
        out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "invert": {
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        out[off] = 255 - (src[off] ?? 0); out[off + 1] = 255 - (src[off + 1] ?? 0);
        out[off + 2] = 255 - (src[off + 2] ?? 0); out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "posterize": {
      const step = 255 / (Math.max(2, Math.min(32, Math.round(numParam(p, "levels", 5)))) - 1);
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        for (let c = 0; c < 3; c += 1) out[off + c] = clampByte(Math.round((src[off + c] ?? 0) / step) * step);
        out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "noise": {
      const amount = Math.max(0, Math.min(100, numParam(p, "amount", 15))) * 1.4;
      const seed = Math.round(numParam(p, "seed", 1337));
      for (let i = 0; i < total; i += 1) {
        const off = i * 4;
        let h = Math.imul((i + 1) ^ seed, 0x27d4eb2d);
        h = (h ^ (h >>> 15)) * 0x85ebca6b;
        const n = (((h >>> 0) / 0xffffffff) * 2 - 1) * amount;
        for (let c = 0; c < 3; c += 1) out[off + c] = clampByte((src[off + c] ?? 0) + n);
        out[off + 3] = src[off + 3] ?? 255;
      }
      return out;
    }
    case "surface-blur": {
      const radius = Math.max(1, Math.min(4, Math.round(numParam(p, "radius", 2))));
      const threshold = Math.max(4, numParam(p, "strength", 35)), inv2t2 = 1 / (2 * threshold * threshold);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const cOff = (y * width + x) * 4, cr = src[cOff] ?? 0, cg = src[cOff + 1] ?? 0, cb = src[cOff + 2] ?? 0;
          let sumR = 0, sumG = 0, sumB = 0, wSum = 0;
          for (let dy = -radius; dy <= radius; dy += 1) {
            const sy = Math.max(0, Math.min(height - 1, y + dy));
            for (let dx = -radius; dx <= radius; dx += 1) {
              const sOff = (sy * width + Math.max(0, Math.min(width - 1, x + dx))) * 4;
              const sr = src[sOff] ?? 0, sg = src[sOff + 1] ?? 0, sb = src[sOff + 2] ?? 0;
              const w = Math.exp(-((sr - cr) ** 2 + (sg - cg) ** 2 + (sb - cb) ** 2) * inv2t2);
              sumR += sr * w; sumG += sg * w; sumB += sb * w; wSum += w;
            }
          }
          out[cOff] = clampByte(sumR / wSum); out[cOff + 1] = clampByte(sumG / wSum);
          out[cOff + 2] = clampByte(sumB / wSum); out[cOff + 3] = src[cOff + 3] ?? 255;
        }
      }
      return out;
    }
    default:
      out.set(src);
      return out;
  }
}

/** 불변 원본에서 활성 Smart Filter 스택과 필터별 블렌드 모드·불투명도 + Smart Filter Mask를 합성한다. */
export function evaluateSmartObjectStack(doc: PhotoshopSmartObjectDocument): RgbaImageBuffer {
  const { sourceWidth: width, sourceHeight: height, sourcePixels } = doc;
  let current = new Uint8ClampedArray(sourcePixels);
  const total = width * height;

  for (const entry of doc.filters) {
    if (!entry.enabled || entry.opacity <= 0) continue;
    const filtered = runSingleSmartFilter(current, width, height, entry);
    const next = new Uint8ClampedArray(current.length);
    const op = clamp01(entry.opacity);
    for (let i = 0; i < total; i += 1) {
      const off = i * 4;
      const br = (current[off] ?? 0) / 255, bg = (current[off + 1] ?? 0) / 255, bb = (current[off + 2] ?? 0) / 255;
      const [mr, mg, mb] = blendSmartFilterRgb(
        br, bg, bb, (filtered[off] ?? 0) / 255, (filtered[off + 1] ?? 0) / 255, (filtered[off + 2] ?? 0) / 255, entry.blendMode,
      );
      next[off] = clampByte((br * (1 - op) + mr * op) * 255);
      next[off + 1] = clampByte((bg * (1 - op) + mg * op) * 255);
      next[off + 2] = clampByte((bb * (1 - op) + mb * op) * 255);
      next[off + 3] = current[off + 3] ?? 255;
    }
    current = next;
  }

  if (doc.filterMask.enabled) {
    const blurredMask = doc.filterMask.featherPx > 0.25
      ? blurByteMaskSeparable(doc.filterMask.data, width, height, doc.filterMask.featherPx)
      : doc.filterMask.data;
    const finalOut = new Uint8ClampedArray(current.length);
    for (let i = 0; i < total; i += 1) {
      const off = i * 4;
      const rawM = (blurredMask[i] ?? 255) / 255;
      const m = doc.filterMask.inverted ? 1 - rawM : rawM;
      finalOut[off] = clampByte((sourcePixels[off] ?? 0) * (1 - m) + (current[off] ?? 0) * m);
      finalOut[off + 1] = clampByte((sourcePixels[off + 1] ?? 0) * (1 - m) + (current[off + 1] ?? 0) * m);
      finalOut[off + 2] = clampByte((sourcePixels[off + 2] ?? 0) * (1 - m) + (current[off + 2] ?? 0) * m);
      finalOut[off + 3] = sourcePixels[off + 3] ?? 255;
    }
    return { width, height, data: finalOut };
  }
  return { width, height, data: current };
}
