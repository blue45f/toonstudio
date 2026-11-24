/**
 * 커스텀 브러시 제작 랩(Brush Custom Lab) 물리 렌더링·카탈로그 연동·`.tsbrush.json` SHA-256 직렬화 엔진.
 *
 * - 194종 통합 카탈로그(`brush-master-audit`), 8종 실물 128×128 팁 + 16파장 Kubelka-Munk 광학 혼색
 *   (`brush-baked-cache`), 5종 종이 물리 프로필(`vibrant-studio-fx`), 갈필 고갈 모델(`evaluateBrushPaintLoadDryout`)을
 *   조합해 실시간 RGBA 스트로크 프리뷰와 결정론적 `.tsbrush.json` 내보내기/검증을 제공한다.
 * - 브라우저 영속 키-값 저장소는 일절 사용하지 않는다.
 */

import {
  REAL_MEDIA_TIP_IDS, RealMediaTipAtlasCache, mixPigmentsKubelkaMunkDetailed, mixPigmentsKubelkaMunkFast,
  selectTipMipLevel, type KubelkaMunkMixResult, type RealMediaTipId, type RgbColor, type TipMaskStats,
} from "../brush-baked-cache/real-media-tip-atlas";
import {
  loadUnifiedBrushCatalog, type BrushCatalogSourceId, type UnifiedBrushAuditRecord,
} from "../brush-master-audit/brush-catalog-unified-loader";
import {
  BRUSH_CATEGORY_PHYSICAL_STRATEGIES, BRUSH_MEDIA_CATEGORY_IDS, evaluateBrushPaintLoadDryout,
  type BrushMediaCategoryId, type BrushPaintLoadDryoutResult,
} from "../brush-master-audit/brush-category-physical-strategies";
import {
  PAPER_TOOTH_PROFILES, STUDIO_PAPER_TEXTURE_IDS, getPaperToothProfile, isStudioPaperTextureId,
  samplePaperToothResistance, type StudioPaperTextureId, type StudioPaperToothProfile,
  type StudioPaperToothResistanceSample,
} from "../vibrant-studio-fx/studio-paper-and-pigment-physics";

export const TSBRUSH_FORMAT_ID = "toonstudio.custom-brush" as const;
export const TSBRUSH_SCHEMA_VERSION = 1 as const;
export const TSBRUSH_FINGERPRINT_ALGO = "sha256" as const;
export const DEFAULT_PREVIEW_WIDTH = 280 as const;
export const DEFAULT_PREVIEW_HEIGHT = 96 as const;
const MAX_TSBRUSH_JSON_BYTES = 131_072;
const VIRTUAL_PREVIEW_STROKE_PX = 1800;

export interface CustomLabTipMeta {
  readonly id: RealMediaTipId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly defaultMediaCategory: BrushMediaCategoryId; readonly defaultPaperId: StudioPaperTextureId;
  readonly defaultKmMix01: number; readonly defaultDryOut01: number;
}

export const CUSTOM_LAB_TIP_CATALOG: readonly CustomLabTipMeta[] = Object.freeze([
  { id: "graphite-pencil-6b", labelKo: "6B 흑연 연필심", labelEn: "6B Graphite Nib", summaryKo: "28° 비대칭 마모면과 종이 봉우리 흑연 포착", summaryEn: "28-deg beveled graphite core with peak capture", defaultMediaCategory: "pencil", defaultPaperId: "manga-kent", defaultKmMix01: 0.25, defaultDryOut01: 0.35 },
  { id: "wax-crayon-block", labelKo: "왁스 크레파스", labelEn: "Wax Crayon Block", summaryKo: "외곽 왁스 크럼과 거친 종이 골 공극 보존", summaryEn: "Waxy outer crumbs with paper valley cavities", defaultMediaCategory: "crayon", defaultPaperId: "rough-cotton", defaultKmMix01: 0.52, defaultDryOut01: 0.58 },
  { id: "square-charcoal", labelKo: "사각 각목탄", labelEn: "Square Charcoal", summaryKo: "파절 단면 모서리와 황목 코튼지 탄분 비산", summaryEn: "Chipped square edge with cotton tooth drag", defaultMediaCategory: "charcoal", defaultPaperId: "rough-cotton", defaultKmMix01: 0.34, defaultDryOut01: 0.72 },
  { id: "soft-pastel-chalk", labelKo: "소프트 파스텔", labelEn: "Soft Chalk Pastel", summaryKo: "다공성 분필 입자와 벨벳 외곽 확산", summaryEn: "Porous chalk clusters with velvety halo", defaultMediaCategory: "pastel", defaultPaperId: "cold-press-watercolor", defaultKmMix01: 0.64, defaultDryOut01: 0.62 },
  { id: "sable-watercolor", labelKo: "세이블 수채붓", labelEn: "Sable Watercolor", summaryKo: "모세관 웨트 엣지와 16파장 수채 광학 혼색", summaryEn: "Capillary wet edge with 16-band KM wash", defaultMediaCategory: "watercolor", defaultPaperId: "cold-press-watercolor", defaultKmMix01: 0.94, defaultDryOut01: 0.68 },
  { id: "hog-bristle-oil", labelKo: "48돈모 유화붓", labelEn: "48-Bristle Oil", summaryKo: "48개 돈모 고랑과 짙은 유화 갈필 분리", summaryEn: "48-hair bristle furrows with rich dry split", defaultMediaCategory: "oil-impasto", defaultPaperId: "linen-canvas", defaultKmMix01: 0.88, defaultDryOut01: 0.76 },
  { id: "gpen-nib-elastic", labelKo: "탄성 G펜 촉", labelEn: "Elastic G-Pen Nib", summaryKo: "필압 분할 펜촉과 예리한 웹툰 선화 끝빠짐", summaryEn: "Split elastic steel nib with crisp ink taper", defaultMediaCategory: "gpen-ink", defaultPaperId: "manga-kent", defaultKmMix01: 0.12, defaultDryOut01: 0.18 },
  { id: "marker-chisel-felt", labelKo: "치즐 알코올 마커", labelEn: "Chisel Felt Marker", summaryKo: "34° 사선 펠트 섬유결과 균일 알코올 발색", summaryEn: "34-deg oblique felt fiber striation", defaultMediaCategory: "marker", defaultPaperId: "smooth-bristol", defaultKmMix01: 0.48, defaultDryOut01: 0.36 },
]);

export interface CustomLabPigmentPairPreset {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly primary: RgbColor; readonly underlayer: RgbColor;
}

export const CUSTOM_LAB_PIGMENT_PAIRS: readonly CustomLabPigmentPairPreset[] = Object.freeze([
  { id: "ultramarine-cadmium", labelKo: "울트라마린 × 카드뮴 옐로", labelEn: "Ultramarine × Cadmium Yellow", primary: { r: 16, g: 69, b: 216 }, underlayer: { r: 248, g: 214, b: 18 } },
  { id: "alizarin-ultramarine", labelKo: "알리자린 × 울트라마린", labelEn: "Alizarin × Ultramarine", primary: { r: 212, g: 34, b: 56 }, underlayer: { r: 24, g: 76, b: 210 } },
  { id: "cadmium-alizarin", labelKo: "카드뮴 옐로 × 알리자린", labelEn: "Cadmium Yellow × Alizarin", primary: { r: 248, g: 214, b: 18 }, underlayer: { r: 215, g: 38, b: 52 } },
  { id: "sumi-ochre", labelKo: "먹물 × 황토 워시", labelEn: "Sumi Ink × Yellow Ochre", primary: { r: 26, g: 30, b: 38 }, underlayer: { r: 218, g: 172, b: 92 } },
  { id: "cobalt-emerald", labelKo: "코발트 × 레몬 옐로", labelEn: "Cobalt × Lemon Yellow", primary: { r: 20, g: 82, b: 205 }, underlayer: { r: 250, g: 240, b: 45 } },
]);

export interface CustomBrushRecipe {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly baseCatalogUid: string | null;
  readonly tipId: RealMediaTipId; readonly paperTextureId: StudioPaperTextureId;
  readonly mediaCategory: BrushMediaCategoryId;
  readonly radiusPx: number; readonly spacingRatio: number;
  readonly flow01: number; readonly opacity01: number;
  readonly paperGrainStrength01: number; readonly dryOutRate01: number;
  readonly initialPaintLoad01: number; readonly initialMoisture01: number;
  readonly kmMixStrength01: number; readonly wetEdgeBloom01: number; readonly taper01: number;
  readonly primaryColor: RgbColor; readonly underlayerColor: RgbColor; readonly seed: number;
}

export interface CustomBrushPreviewOptions {
  readonly width?: number; readonly height?: number; readonly atlasCache?: RealMediaTipAtlasCache;
}

export interface CustomBrushPreviewResult {
  readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray;
  readonly dabCount: number; readonly activePixels: number; readonly coverageRatio01: number;
  readonly dryoutStart: BrushPaintLoadDryoutResult; readonly dryoutEnd: BrushPaintLoadDryoutResult;
  readonly kmMixSummary: KubelkaMunkMixResult; readonly overlapSampleRgb: RgbColor;
  readonly tipStats: TipMaskStats; readonly paperProfile: StudioPaperToothProfile;
  readonly paperResistance: StudioPaperToothResistanceSample; readonly renderElapsedMs: number;
}

export interface TsBrushDocument {
  readonly format: typeof TSBRUSH_FORMAT_ID; readonly schemaVersion: typeof TSBRUSH_SCHEMA_VERSION;
  readonly fingerprintAlgorithm: typeof TSBRUSH_FINGERPRINT_ALGO; readonly fingerprintSha256: string;
  readonly recipe: CustomBrushRecipe;
}

export interface TsBrushExportResult {
  readonly document: TsBrushDocument; readonly json: string;
  readonly fileName: string; readonly fingerprintSha256: string;
}

export type TsBrushImportErrorCode =
  | "PAYLOAD_TOO_LARGE" | "INVALID_JSON" | "INVALID_SCHEMA" | "INVALID_RECIPE" | "FINGERPRINT_MISMATCH";

export type TsBrushImportResult =
  | { readonly ok: true; readonly document: TsBrushDocument; readonly recipe: CustomBrushRecipe; readonly fingerprintSha256: string }
  | { readonly ok: false; readonly errorCode: TsBrushImportErrorCode; readonly messageKo: string; readonly messageEn: string; readonly expectedFingerprint?: string; readonly actualFingerprint?: string };

export interface CustomLabCatalogSummary {
  readonly totalBrushes: number; readonly tipCount: number; readonly paperCount: number;
  readonly kmWavelengthBands: 16; readonly sourceCounts: Readonly<Record<BrushCatalogSourceId, number>>;
}

const TIP_ID_SET = new Set<string>(REAL_MEDIA_TIP_IDS);
const MEDIA_CATEGORY_SET = new Set<string>(BRUSH_MEDIA_CATEGORY_IDS);
const sharedTipAtlasCache = new RealMediaTipAtlasCache({ maxEntries: 32, maxBytes: 4 * 1024 * 1024 });
let cachedUnifiedCatalog: readonly UnifiedBrushAuditRecord[] | null = null;

const clamp = (v: number, min: number, max: number): number => (!Number.isFinite(v) ? min : v < min ? min : v > max ? max : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);
const clampByte = (v: number): number => Math.round(clamp(v, 0, 255));
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;
const isRealMediaTipId = (v: unknown): v is RealMediaTipId => typeof v === "string" && TIP_ID_SET.has(v);
const isBrushMediaCategoryId = (v: unknown): v is BrushMediaCategoryId => typeof v === "string" && MEDIA_CATEGORY_SET.has(v);

/** 194종 통합 브러시 카탈로그를 메모이제이션해 반환한다. */
export function getCustomLabCatalogBrushes(): readonly UnifiedBrushAuditRecord[] {
  if (!cachedUnifiedCatalog) cachedUnifiedCatalog = loadUnifiedBrushCatalog();
  return cachedUnifiedCatalog;
}

export function filterCustomLabCatalogBrushes(
  options: { readonly query?: string; readonly sourceCatalog?: BrushCatalogSourceId | "all" } = {},
): readonly UnifiedBrushAuditRecord[] {
  const all = getCustomLabCatalogBrushes();
  const source = options.sourceCatalog ?? "all";
  const tokens = (options.query ?? "").trim().toLowerCase().split(/\s+/u).filter(Boolean);
  return all.filter((item) => {
    if (source !== "all" && item.sourceCatalog !== source) return false;
    if (tokens.length === 0) return true;
    const hay = `${item.uid} ${item.nameKo} ${item.nameEn} ${item.rawCategory} ${item.sourceCatalog}`.toLowerCase();
    return tokens.every((tok) => hay.includes(tok));
  });
}

export function getCustomLabCatalogSummary(): CustomLabCatalogSummary {
  const all = getCustomLabCatalogBrushes();
  const counts: Record<BrushCatalogSourceId, number> = {
    "global-master": 0, "csp-atelier": 0, "csp-executable": 0, "procreate-silica": 0,
    "magma-studio": 0, "universal-p5": 0, "universal-ibis-medibang": 0,
  };
  for (const item of all) counts[item.sourceCatalog] = (counts[item.sourceCatalog] ?? 0) + 1;
  return Object.freeze({
    totalBrushes: all.length, tipCount: REAL_MEDIA_TIP_IDS.length, paperCount: STUDIO_PAPER_TEXTURE_IDS.length,
    kmWavelengthBands: 16, sourceCounts: Object.freeze(counts),
  });
}

function inferTipAndCategoryFromRecord(
  record: UnifiedBrushAuditRecord,
): { readonly tipId: RealMediaTipId; readonly mediaCategory: BrushMediaCategoryId; readonly paperTextureId: StudioPaperTextureId } {
  const text = `${record.id} ${record.nameKo} ${record.nameEn} ${record.rawCategory}`.toLowerCase();
  if (/(?:crayon|oil-?pastel|크레파스|크레용)/u.test(text)) return { tipId: "wax-crayon-block", mediaCategory: "crayon", paperTextureId: "rough-cotton" };
  if (/(?:charcoal|목탄|콘테)/u.test(text)) return { tipId: "square-charcoal", mediaCategory: "charcoal", paperTextureId: "rough-cotton" };
  if (/(?:pastel|chalk|파스텔|분필)/u.test(text)) return { tipId: "soft-pastel-chalk", mediaCategory: "pastel", paperTextureId: "cold-press-watercolor" };
  if (/(?:watercolor|wash|sumi|ink-?wash|수채|수묵|먹|번짐)/u.test(text) || record.features.wetBleed >= 0.48) return { tipId: "sable-watercolor", mediaCategory: "watercolor", paperTextureId: "cold-press-watercolor" };
  if (/(?:oil|impasto|bristle|acrylic|gouache|유화|아크릴|과슈|돈모|나이프)/u.test(text) || record.features.impastoHeight >= 0.38) return { tipId: "hog-bristle-oil", mediaCategory: "oil-impasto", paperTextureId: "linen-canvas" };
  if (/(?:marker|highlighter|copic|felt|마커|형광펜|코픽)/u.test(text) || record.features.multiplyStacking >= 0.72) return { tipId: "marker-chisel-felt", mediaCategory: "marker", paperTextureId: "smooth-bristol" };
  if (/(?:pencil|graphite|연필|흑연|스케치)/u.test(text) || record.features.toothContrast >= 0.5) return { tipId: "graphite-pencil-6b", mediaCategory: "pencil", paperTextureId: "manga-kent" };
  return { tipId: "gpen-nib-elastic", mediaCategory: "gpen-ink", paperTextureId: "manga-kent" };
}

/** 194종 카탈로그 항목 하나를 커스텀 브러시 랩 편집 레시피로 변환한다. */
export function createRecipeFromCatalogBrush(record: UnifiedBrushAuditRecord): CustomBrushRecipe {
  const inferred = inferTipAndCategoryFromRecord(record);
  const strategy = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[inferred.mediaCategory];
  const f = record.features;
  const pair = CUSTOM_LAB_PIGMENT_PAIRS[0]!;
  return normalizeCustomBrushRecipe({
    id: `custom-${record.id}`,
    nameKo: `${record.nameKo} 커스텀`,
    nameEn: `${record.nameEn} Custom`,
    baseCatalogUid: record.uid,
    tipId: inferred.tipId,
    paperTextureId: inferred.paperTextureId,
    mediaCategory: inferred.mediaCategory,
    radiusPx: Math.round(clamp(8 + (1 - f.edgeSharpness) * 8 + f.bristleSpread * 6, 5, 22)),
    spacingRatio: clamp(record.spacingRatio > 0.04 ? record.spacingRatio : 0.14, 0.06, 0.42),
    flow01: clamp(0.32 + f.opacityCoverage * 0.62, 0.15, 1),
    opacity01: clamp(Math.max(0.45, f.opacityCoverage), 0.25, 1),
    paperGrainStrength01: clamp(Math.max(f.toothContrast, PAPER_TOOTH_PROFILES[inferred.paperTextureId].toothDepth01 * 0.65), 0, 1),
    dryOutRate01: round4(clamp01(strategy.dryout.paintDepletionPer1000Px * 0.75 + f.toothContrast * 0.2)),
    initialPaintLoad01: strategy.dryout.initialPaintLoad01,
    initialMoisture01: strategy.dryout.initialMoistureLoad01,
    kmMixStrength01: round4(clamp01(Math.max(strategy.kmOpticalMix01 * 0.75, f.wetBleed * 0.8 + f.smudgePickup * 0.5))),
    wetEdgeBloom01: clamp(Math.max(f.wetBleed, strategy.wetEdgeBackrunRing01 * 0.6), 0, 1),
    taper01: clamp(Math.max(0.25, record.taper01), 0, 1),
    primaryColor: pair.primary,
    underlayerColor: pair.underlayer,
    seed: 20261124,
  });
}

export function createDefaultCustomBrushRecipe(): CustomBrushRecipe {
  const catalog = getCustomLabCatalogBrushes();
  const preferred = catalog.find((item) => item.id.includes("watercolor") || item.nameKo.includes("수채")) ?? catalog[0];
  if (preferred) return createRecipeFromCatalogBrush(preferred);
  const pair = CUSTOM_LAB_PIGMENT_PAIRS[0]!;
  return normalizeCustomBrushRecipe({
    id: "custom-sable-watercolor", nameKo: "세이블 수채 커스텀", nameEn: "Sable Watercolor Custom", baseCatalogUid: null,
    tipId: "sable-watercolor", paperTextureId: "cold-press-watercolor", mediaCategory: "watercolor",
    radiusPx: 14, spacingRatio: 0.14, flow01: 0.66, opacity01: 0.9, paperGrainStrength01: 0.48,
    dryOutRate01: 0.62, initialPaintLoad01: 0.95, initialMoisture01: 0.92, kmMixStrength01: 0.92,
    wetEdgeBloom01: 0.56, taper01: 0.65, primaryColor: pair.primary, underlayerColor: pair.underlayer, seed: 20261124,
  });
}

export function normalizeCustomBrushRecipe(recipe: CustomBrushRecipe): CustomBrushRecipe {
  return Object.freeze({
    id: (recipe.id || "custom-brush").trim().slice(0, 80) || "custom-brush",
    nameKo: (recipe.nameKo || "커스텀 브러시").trim().slice(0, 80) || "커스텀 브러시",
    nameEn: (recipe.nameEn || "Custom Brush").trim().slice(0, 80) || "Custom Brush",
    baseCatalogUid: typeof recipe.baseCatalogUid === "string" && recipe.baseCatalogUid.trim() ? recipe.baseCatalogUid.trim().slice(0, 120) : null,
    tipId: isRealMediaTipId(recipe.tipId) ? recipe.tipId : "sable-watercolor",
    paperTextureId: isStudioPaperTextureId(recipe.paperTextureId) ? recipe.paperTextureId : "cold-press-watercolor",
    mediaCategory: isBrushMediaCategoryId(recipe.mediaCategory) ? recipe.mediaCategory : "watercolor",
    radiusPx: round4(clamp(recipe.radiusPx, 4, 28)),
    spacingRatio: round4(clamp(recipe.spacingRatio, 0.06, 0.45)),
    flow01: round4(clamp(recipe.flow01, 0.1, 1)),
    opacity01: round4(clamp(recipe.opacity01, 0.15, 1)),
    paperGrainStrength01: round4(clamp01(recipe.paperGrainStrength01)),
    dryOutRate01: round4(clamp01(recipe.dryOutRate01)),
    initialPaintLoad01: round4(clamp(recipe.initialPaintLoad01, 0.1, 1)),
    initialMoisture01: round4(clamp01(recipe.initialMoisture01)),
    kmMixStrength01: round4(clamp01(recipe.kmMixStrength01)),
    wetEdgeBloom01: round4(clamp01(recipe.wetEdgeBloom01)),
    taper01: round4(clamp01(recipe.taper01)),
    primaryColor: Object.freeze({ r: clampByte(recipe.primaryColor.r), g: clampByte(recipe.primaryColor.g), b: clampByte(recipe.primaryColor.b) }),
    underlayerColor: Object.freeze({ r: clampByte(recipe.underlayerColor.r), g: clampByte(recipe.underlayerColor.g), b: clampByte(recipe.underlayerColor.b) }),
    seed: Math.trunc(clamp(recipe.seed, 1, 2_147_483_647)),
  });
}

/** UI 크롬용 원시 hex/rgb 없는 OKLCH 색상 문자열로 변환한다. */
export function rgbToCssOklch(color: RgbColor): string {
  const toLin = (byte: number): number => {
    const s = clamp(byte, 0, 255) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin(color.r); const g = toLin(color.g); const b = toLin(color.b);
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  const okL = clamp01(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s);
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const okC = Math.sqrt(okA * okA + okB * okB);
  const rawH = (Math.atan2(okB, okA) * 180) / Math.PI;
  return `oklch(${okL.toFixed(3)} ${okC.toFixed(3)} ${(rawH < 0 ? rawH + 360 : rawH).toFixed(1)})`;
}

// ============================================================================
// 결정론적 FIPS 180-4 SHA-256 및 `.tsbrush.json` 직렬화/무결성 검증
// ============================================================================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** 순수 동기식 FIPS 180-4 SHA-256 16진수 다이제스트(64자 소문자). */
export function computeSha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x1_0000_0000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0; const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, "0")).join("");
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (val !== undefined) sorted[key] = canonicalizeJsonValue(val);
    }
    return sorted;
  }
  return typeof value === "number" ? (Number.isFinite(value) ? round4(value) : 0) : value;
}

export function buildCanonicalTsBrushPayloadJson(recipe: CustomBrushRecipe): string {
  return JSON.stringify(canonicalizeJsonValue({
    format: TSBRUSH_FORMAT_ID, schemaVersion: TSBRUSH_SCHEMA_VERSION, recipe: normalizeCustomBrushRecipe(recipe),
  }));
}

export function computeCustomBrushFingerprintSha256(recipe: CustomBrushRecipe): string {
  return computeSha256Hex(buildCanonicalTsBrushPayloadJson(recipe));
}

function buildSafeTsBrushFileName(id: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48);
  return `${slug || "custom-brush"}.tsbrush.json`;
}

/** 레시피를 결정론적 `.tsbrush.json` + SHA-256 핑거프린트로 직렬화한다. */
export function exportCustomBrushToTsBrushJson(recipe: CustomBrushRecipe): TsBrushExportResult {
  const normalized = normalizeCustomBrushRecipe(recipe);
  const fingerprintSha256 = computeCustomBrushFingerprintSha256(normalized);
  const document: TsBrushDocument = Object.freeze({
    format: TSBRUSH_FORMAT_ID, schemaVersion: TSBRUSH_SCHEMA_VERSION,
    fingerprintAlgorithm: TSBRUSH_FINGERPRINT_ALGO, fingerprintSha256, recipe: normalized,
  });
  return Object.freeze({
    document, json: `${JSON.stringify(document, null, 2)}\n`, fileName: buildSafeTsBrushFileName(normalized.id), fingerprintSha256,
  });
}

const isPlainRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function parseStrictRgb(value: unknown): RgbColor | null {
  if (!isPlainRecord(value)) return null;
  const { r, g, b } = value;
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return null;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
  return Object.freeze({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
}

function readFiniteInRange(rec: Record<string, unknown>, key: string, min: number, max: number): number | null {
  const v = rec[key];
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

/** `.tsbrush.json` 문자열을 스키마·범위·SHA-256 핑거프린트까지 엄격 검증해 복원한다. */
export function importCustomBrushFromTsBrushJson(rawJson: string): TsBrushImportResult {
  if (typeof rawJson !== "string" || rawJson.length === 0) {
    return { ok: false, errorCode: "INVALID_JSON", messageKo: "비어 있는 .tsbrush.json 입력입니다.", messageEn: "Empty .tsbrush.json input." };
  }
  if (rawJson.length > MAX_TSBRUSH_JSON_BYTES) {
    return { ok: false, errorCode: "PAYLOAD_TOO_LARGE", messageKo: ".tsbrush.json 파일 크기가 128 KiB 제한을 초과했습니다.", messageEn: ".tsbrush.json exceeds the 128 KiB size limit." };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(rawJson); } catch {
    return { ok: false, errorCode: "INVALID_JSON", messageKo: "JSON 형식이 올바르지 않아 .tsbrush.json을 해석할 수 없습니다.", messageEn: "Malformed JSON in .tsbrush.json payload." };
  }
  if (
    !isPlainRecord(parsed) || parsed.format !== TSBRUSH_FORMAT_ID || parsed.schemaVersion !== TSBRUSH_SCHEMA_VERSION ||
    parsed.fingerprintAlgorithm !== TSBRUSH_FINGERPRINT_ALGO || typeof parsed.fingerprintSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(parsed.fingerprintSha256) || !isPlainRecord(parsed.recipe)
  ) {
    return { ok: false, errorCode: "INVALID_SCHEMA", messageKo: "지원하지 않는 .tsbrush.json 스키마 또는 SHA-256 서명 형식입니다.", messageEn: "Unsupported .tsbrush.json schema or SHA-256 fingerprint format." };
  }

  const r = parsed.recipe;
  const primaryColor = parseStrictRgb(r.primaryColor);
  const underlayerColor = parseStrictRgb(r.underlayerColor);
  const radiusPx = readFiniteInRange(r, "radiusPx", 4, 28);
  const spacingRatio = readFiniteInRange(r, "spacingRatio", 0.06, 0.45);
  const flow01 = readFiniteInRange(r, "flow01", 0.1, 1);
  const opacity01 = readFiniteInRange(r, "opacity01", 0.15, 1);
  const paperGrainStrength01 = readFiniteInRange(r, "paperGrainStrength01", 0, 1);
  const dryOutRate01 = readFiniteInRange(r, "dryOutRate01", 0, 1);
  const initialPaintLoad01 = readFiniteInRange(r, "initialPaintLoad01", 0.1, 1);
  const initialMoisture01 = readFiniteInRange(r, "initialMoisture01", 0, 1);
  const kmMixStrength01 = readFiniteInRange(r, "kmMixStrength01", 0, 1);
  const wetEdgeBloom01 = readFiniteInRange(r, "wetEdgeBloom01", 0, 1);
  const taper01 = readFiniteInRange(r, "taper01", 0, 1);
  const seed = readFiniteInRange(r, "seed", 1, 2_147_483_647);

  if (
    typeof r.id !== "string" || !r.id.trim() || typeof r.nameKo !== "string" || !r.nameKo.trim() ||
    typeof r.nameEn !== "string" || !r.nameEn.trim() || (r.baseCatalogUid !== null && typeof r.baseCatalogUid !== "string") ||
    !isRealMediaTipId(r.tipId) || !isStudioPaperTextureId(r.paperTextureId) || !isBrushMediaCategoryId(r.mediaCategory) ||
    !primaryColor || !underlayerColor || radiusPx === null || spacingRatio === null || flow01 === null || opacity01 === null ||
    paperGrainStrength01 === null || dryOutRate01 === null || initialPaintLoad01 === null ||
    initialMoisture01 === null || kmMixStrength01 === null || wetEdgeBloom01 === null || taper01 === null || seed === null
  ) {
    return { ok: false, errorCode: "INVALID_RECIPE", messageKo: "브러시 팁·용지·물리 파라미터 범위가 유효하지 않습니다.", messageEn: "Invalid brush tip, paper texture, or physical parameter range." };
  }

  const candidateRecipe = normalizeCustomBrushRecipe({
    id: r.id, nameKo: r.nameKo, nameEn: r.nameEn, baseCatalogUid: r.baseCatalogUid, tipId: r.tipId,
    paperTextureId: r.paperTextureId, mediaCategory: r.mediaCategory, radiusPx, spacingRatio, flow01, opacity01,
    paperGrainStrength01, dryOutRate01, initialPaintLoad01, initialMoisture01, kmMixStrength01, wetEdgeBloom01,
    taper01, primaryColor, underlayerColor, seed,
  });
  const actualFingerprint = computeCustomBrushFingerprintSha256(candidateRecipe);
  if (actualFingerprint !== parsed.fingerprintSha256) {
    return {
      ok: false, errorCode: "FINGERPRINT_MISMATCH",
      messageKo: "SHA-256 핑거프린트가 일치하지 않습니다(파일이 변조되었거나 파라미터가 임의 수정됨).",
      messageEn: "SHA-256 fingerprint mismatch (file was tampered with or modified).",
      expectedFingerprint: parsed.fingerprintSha256, actualFingerprint,
    };
  }
  const document: TsBrushDocument = Object.freeze({
    format: TSBRUSH_FORMAT_ID, schemaVersion: TSBRUSH_SCHEMA_VERSION,
    fingerprintAlgorithm: TSBRUSH_FINGERPRINT_ALGO, fingerprintSha256: actualFingerprint, recipe: candidateRecipe,
  });
  return Object.freeze({ ok: true, document, recipe: candidateRecipe, fingerprintSha256: actualFingerprint });
}

// ============================================================================
// 실시간 RGBA 스트로크 프리뷰 렌더러 (128×128 팁 · 5종 용지 · 갈필 · 16파장 KM)
// ============================================================================

function hash2d(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function samplePaperHeight01(px: number, py: number, paperId: StudioPaperTextureId, seed: number): number {
  if (paperId === "linen-canvas") {
    const weave = 0.5 + 0.25 * Math.sin(px * 0.95) + 0.25 * Math.sin(py * 0.95);
    return clamp01(weave * 0.72 + hash2d(px, py, seed + 17) * 0.28);
  }
  const f = paperId === "rough-cotton" ? 0.16 : paperId === "cold-press-watercolor" ? 0.22 : paperId === "manga-kent" ? 0.36 : 0.44;
  const rx = px * f + py * f * 0.43; const ry = -px * f * 0.43 + py * f;
  const ix = Math.floor(rx); const iy = Math.floor(ry);
  const fx = rx - ix; const fy = ry - iy;
  const ux = fx * fx * (3 - 2 * fx); const uy = fy * fy * (3 - 2 * fy);
  const coarse = (hash2d(ix, iy, seed) + (hash2d(ix + 1, iy, seed) - hash2d(ix, iy, seed)) * ux) * (1 - uy) +
    (hash2d(ix, iy + 1, seed) + (hash2d(ix + 1, iy + 1, seed) - hash2d(ix, iy + 1, seed)) * ux) * uy;
  return clamp01(coarse * 0.68 + hash2d(px, py, seed + 131) * 0.32);
}

function paperBaseTint(paperId: StudioPaperTextureId): readonly [number, number, number] {
  if (paperId === "rough-cotton") return [248, 244, 235];
  if (paperId === "cold-press-watercolor") return [250, 248, 242];
  if (paperId === "linen-canvas") return [242, 236, 224];
  return paperId === "smooth-bristol" ? [252, 252, 250] : [251, 250, 247];
}

/** 8종 128×128 팁 + 5종 용지 + 갈필 + 16파장 Kubelka-Munk 혼색으로 실시간 RGBA 프리뷰 버퍼를 렌더한다. */
export function renderCustomBrushStrokePreview(
  rawRecipe: CustomBrushRecipe,
  options: CustomBrushPreviewOptions = {},
): CustomBrushPreviewResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const recipe = normalizeCustomBrushRecipe(rawRecipe);
  const width = Math.trunc(clamp(options.width ?? DEFAULT_PREVIEW_WIDTH, 64, 512));
  const height = Math.trunc(clamp(options.height ?? DEFAULT_PREVIEW_HEIGHT, 32, 256));
  const atlas = options.atlasCache ?? sharedTipAtlasCache;
  const paperProfile = getPaperToothProfile(recipe.paperTextureId);
  const paperResistance = samplePaperToothResistance(recipe.paperTextureId, 0.72, 0.45);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const strokeAlphaMap = new Float32Array(width * height);
  const toothField = new Float32Array(width * height);

  const [paperR, paperG, paperB] = paperBaseTint(recipe.paperTextureId);
  const grainSeed = (recipe.seed ^ 0x51f23) | 0;
  const bandX0 = Math.floor(width * 0.48); const bandX1 = Math.floor(width * 0.86);
  const bandY0 = Math.floor(height * 0.14); const bandY1 = Math.floor(height * 0.86);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const tooth = samplePaperHeight01(x, y, recipe.paperTextureId, grainSeed);
      toothField[idx] = tooth;
      const shade = 1 - paperProfile.toothDepth01 * 0.085 * (1 - tooth);
      let r = paperR * shade; let g = paperG * shade; let b = paperB * shade;
      if (x >= bandX0 && x <= bandX1 && y >= bandY0 && y <= bandY1) {
        const fade = Math.min(1, Math.min(x - bandX0, bandX1 - x) / 6) * Math.min(1, Math.min(y - bandY0, bandY1 - y) / 6);
        const underA = 0.78 * fade * (0.86 + 0.14 * tooth);
        r = r * (1 - underA) + recipe.underlayerColor.r * underA;
        g = g * (1 - underA) + recipe.underlayerColor.g * underA;
        b = b * (1 - underA) + recipe.underlayerColor.b * underA;
      }
      const off = idx * 4;
      rgba[off] = clampByte(r); rgba[off + 1] = clampByte(g); rgba[off + 2] = clampByte(b); rgba[off + 3] = 255;
    }
  }

  const xStart = width * 0.08; const xEnd = width * 0.92;
  const yMid = height * 0.5; const ampY = height * 0.24;
  const approxStrokeLenPx = Math.max(1, Math.hypot(xEnd - xStart, ampY * 2.4));
  const steps = Math.max(12, Math.min(140, Math.round(approxStrokeLenPx / Math.max(1.5, recipe.radiusPx * 2 * recipe.spacingRatio))));

  const dryoutStart = evaluateBrushPaintLoadDryout({
    category: recipe.mediaCategory, strokeLengthPx: 0, pressure01: 0.72, paperRoughness01: paperProfile.toothDepth01,
    initialPaintLoad01: recipe.initialPaintLoad01, initialMoistureLoad01: recipe.initialMoisture01,
  });
  let dryoutEnd = dryoutStart;
  let lastTipMask = atlas.get(recipe.tipId, { pressure: 0.78, seed: recipe.seed });
  const kmScratch: [number, number, number] = [0, 0, 0];
  let cumulativeArcPx = 0; let prevX = xStart; let prevY = yMid; let dabCount = 0;

  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = xStart + (xEnd - xStart) * t;
    const cy = yMid + Math.sin(t * Math.PI * 2) * ampY;
    if (s > 0) cumulativeArcPx += Math.hypot(cx - prevX, cy - prevY);
    const tangentRad = Math.atan2(Math.cos(t * Math.PI * 2) * ampY * Math.PI * 2, xEnd - xStart);
    prevX = cx; prevY = cy;

    const envelope = Math.sin(Math.PI * t);
    const pressure = clamp01(0.24 + 0.76 * Math.pow(envelope, 0.72));
    const dabRadius = Math.max(2, recipe.radiusPx * (0.42 + 0.58 * pressure) * Math.max(0.24, 1 - recipe.taper01 * 0.62 * (1 - envelope)));
    // 프리뷰 미니 스트립은 실제 1,800px 원고 획 길이에 정규화해 갈필 전이를 정확히 가시화한다.
    const virtualLenPx = (cumulativeArcPx / approxStrokeLenPx) * VIRTUAL_PREVIEW_STROKE_PX * recipe.dryOutRate01;
    const dryout = evaluateBrushPaintLoadDryout({
      category: recipe.mediaCategory, strokeLengthPx: virtualLenPx, pressure01: Math.max(0.55, pressure),
      paperRoughness01: paperProfile.toothDepth01, initialPaintLoad01: recipe.initialPaintLoad01,
      initialMoistureLoad01: recipe.initialMoisture01,
    });
    if (s === steps) dryoutEnd = dryout;

    const tipMask = atlas.get(recipe.tipId, { pressure, seed: recipe.seed });
    lastTipMask = tipMask;
    const mip = selectTipMipLevel(tipMask.mipmaps, dabRadius * 2);
    const mipSize = mip.size; const mipData = mip.data; const mipMax = mipSize - 1;
    const cosR = Math.cos(-tangentRad); const sinR = Math.sin(-tangentRad); const invRadius = 1 / dabRadius;
    const minX = Math.max(0, Math.floor(cx - dabRadius - 1)); const maxX = Math.min(width - 1, Math.ceil(cx + dabRadius + 1));
    const minY = Math.max(0, Math.floor(cy - dabRadius - 1)); const maxY = Math.min(height - 1, Math.ceil(cy + dabRadius + 1));
    const effGrain = clamp01(recipe.paperGrainStrength01 * (0.45 + 0.55 * paperProfile.toothDepth01) + dryout.toothBreakupBoost01 * 0.55);

    for (let py = minY; py <= maxY; py += 1) {
      const dy = (py + 0.5 - cy) * invRadius; const row = py * width;
      for (let px = minX; px <= maxX; px += 1) {
        const dx = (px + 0.5 - cx) * invRadius;
        const u = (dx * cosR - dy * sinR) * 0.5 + 0.5;
        const v = (dx * sinR + dy * cosR) * 0.5 + 0.5;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;

        const fx = u * mipMax; const fy = v * mipMax;
        const ix0 = fx | 0; const iy0 = fy | 0;
        const ix1 = ix0 < mipMax ? ix0 + 1 : ix0; const iy1 = iy0 < mipMax ? iy0 + 1 : iy0;
        const r0 = iy0 * mipSize; const r1 = iy1 * mipSize;
        const top = (mipData[r0 + ix0] ?? 0) + ((mipData[r0 + ix1] ?? 0) - (mipData[r0 + ix0] ?? 0)) * (fx - ix0);
        const bot = (mipData[r1 + ix0] ?? 0) + ((mipData[r1 + ix1] ?? 0) - (mipData[r1 + ix0] ?? 0)) * (fx - ix0);
        let maskVal = top + (bot - top) * (fy - iy0);
        if (maskVal <= 0.008) continue;

        const idx = row + px; const tooth = toothField[idx] ?? 0.5;
        if (effGrain > 0.01) maskVal *= clamp01(1 - effGrain * (1 - tooth) * (1.12 - 0.52 * pressure));
        if (dryout.drySplitFactor01 > 0.02) {
          const wave = 0.5 + 0.5 * Math.sin((v * 2 - 1) * (8 + dryout.activeBristleStrands * 0.35));
          maskVal *= clamp01(1 - dryout.drySplitFactor01 * (0.72 - 0.52 * wave * tooth));
        }
        if (recipe.wetEdgeBloom01 > 0.05) {
          const radial = Math.hypot(dx, dy);
          if (radial > 0.58 && radial < 1.02) {
            maskVal = clamp01(maskVal * (1 + recipe.wetEdgeBloom01 * paperProfile.capillarySpread01 * 0.55 * Math.sin(((radial - 0.58) / 0.44) * Math.PI)));
          }
        }
        const dabAlpha = clamp01(maskVal * recipe.flow01 * dryout.effectiveOpacityScale);
        if (dabAlpha <= 0.004) continue;
        strokeAlphaMap[idx] = clamp01(1 - (1 - (strokeAlphaMap[idx] ?? 0)) * (1 - dabAlpha));
      }
    }
    dabCount += 1;
  }

  // 3) 단일 패스 광학 합성(16파장 Kubelka-Munk vs sRGB 보간) 및 교차 혼색 영역 실측
  let activePixels = 0; let oR = 0; let oG = 0; let oB = 0; let oCount = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const effAlpha = clamp01((strokeAlphaMap[idx] ?? 0) * recipe.opacity01);
      if (effAlpha <= 0.004) continue;
      const off = idx * 4;
      const dstR = rgba[off] ?? 255; const dstG = rgba[off + 1] ?? 255; const dstB = rgba[off + 2] ?? 255;
      const srgbR = dstR + (recipe.primaryColor.r - dstR) * effAlpha;
      const srgbG = dstG + (recipe.primaryColor.g - dstG) * effAlpha;
      const srgbB = dstB + (recipe.primaryColor.b - dstB) * effAlpha;
      if (recipe.kmMixStrength01 > 0.01) {
        mixPigmentsKubelkaMunkFast(dstR, dstG, dstB, recipe.primaryColor.r, recipe.primaryColor.g, recipe.primaryColor.b, effAlpha, kmScratch);
        const k = recipe.kmMixStrength01;
        rgba[off] = clampByte(srgbR + (kmScratch[0] - srgbR) * k);
        rgba[off + 1] = clampByte(srgbG + (kmScratch[1] - srgbG) * k);
        rgba[off + 2] = clampByte(srgbB + (kmScratch[2] - srgbB) * k);
      } else {
        rgba[off] = clampByte(srgbR); rgba[off + 1] = clampByte(srgbG); rgba[off + 2] = clampByte(srgbB);
      }
      if (effAlpha > 0.05) {
        activePixels += 1;
        if (x >= bandX0 + 6 && x <= bandX1 - 6 && y >= bandY0 + 6 && y <= bandY1 - 6 && effAlpha >= 0.2) {
          oR += rgba[off] ?? 0; oG += rgba[off + 1] ?? 0; oB += rgba[off + 2] ?? 0; oCount += 1;
        }
      }
    }
  }

  const kmMixSummary = mixPigmentsKubelkaMunkDetailed(recipe.primaryColor, recipe.underlayerColor, 0.5);
  const overlapSampleRgb: RgbColor = oCount > 0
    ? Object.freeze({ r: Math.round(oR / oCount), g: Math.round(oG / oCount), b: Math.round(oB / oCount) })
    : kmMixSummary.color;

  return Object.freeze({
    width, height, rgba, dabCount, activePixels,
    coverageRatio01: round4(activePixels / Math.max(1, width * height)),
    dryoutStart, dryoutEnd, kmMixSummary, overlapSampleRgb,
    tipStats: lastTipMask.stats, paperProfile, paperResistance,
    renderElapsedMs: round4(Math.max(0, (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0)),
  });
}

export {
  PAPER_TOOTH_PROFILES, REAL_MEDIA_TIP_IDS, STUDIO_PAPER_TEXTURE_IDS,
  type BrushCatalogSourceId, type BrushMediaCategoryId, type KubelkaMunkMixResult,
  type RealMediaTipId, type RgbColor, type StudioPaperTextureId, type UnifiedBrushAuditRecord,
};
