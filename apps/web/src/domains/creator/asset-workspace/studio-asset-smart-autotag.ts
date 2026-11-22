/**
 * 클라이언트 ₩0 스마트 에셋 자동 태깅 · 메타데이터 추출 엔진.
 *
 * 외부 유료 API 없이 100% 브라우저 로컬에서 파일명·확장자·해상도·종횡비·RGBA 지배 색상·
 * 투명 채널 유무를 결정적으로 분석해 한국어+영문 검색 태그와 재사용 블록 메타데이터를 생성한다.
 * 대표 색상 CIELAB 팔레트 추출은 `studio-asset-color-smart-folder-index`를 그대로 재사용한다.
 */

import type { StudioAsset } from "../studio-asset-library";
import type { StudioInsertPlacementMode } from "../studio-insert-hub-model";
import {
  extractDominantLabPaletteFromRgba,
  type AssetDominantColorSwatch,
} from "./studio-asset-color-smart-folder-index";

export type StudioAssetOrientation =
  | "vertical-strip"
  | "portrait"
  | "square"
  | "landscape"
  | "wide-panoramic";

export type StudioAssetResolutionTier = "ultra-high" | "high" | "standard" | "lightweight";
export type StudioAssetColorTemperature = "warm" | "cool" | "neutral";
export type StudioAssetColorBrightness = "dark" | "midtone" | "bright";
export type StudioAssetColorSaturation = "vivid" | "balanced" | "muted" | "achromatic";
export type StudioAssetAlphaConfidence = "pixel-verified" | "metadata-hint" | "format-capable" | "opaque";

export type StudioReusableBlockRole =
  | "background-plate"
  | "vertical-panel-template"
  | "3d-stage-prop"
  | "character-cutout"
  | "effect-overlay"
  | "texture-swatch"
  | "prop-stamp";

export interface StudioAssetAutotagInput {
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly dataUrl?: string;
  readonly width: number;
  readonly height: number;
  readonly kind?: string;
  readonly sourceKind?: "local-upload" | "ai-generated" | "3d-generated" | "imported" | "unknown";
  readonly rgba?: Uint8ClampedArray | Uint8Array;
  readonly rgbaWidth?: number;
  readonly rgbaHeight?: number;
  readonly hasAlphaHint?: boolean;
  readonly paletteSize?: number;
}

export interface StudioAssetDominantHexSwatch extends AssetDominantColorSwatch {
  readonly hex: string;
}

export interface StudioAssetColorProfile {
  readonly analyzedFromPixels: boolean;
  readonly swatches: readonly StudioAssetDominantHexSwatch[];
  readonly dominantHex: string | null;
  readonly temperature: StudioAssetColorTemperature | null;
  readonly brightness: StudioAssetColorBrightness | null;
  readonly saturation: StudioAssetColorSaturation | null;
  readonly meanLightness: number | null;
  readonly meanChroma: number | null;
}

export interface StudioAssetAlphaProfile {
  readonly hasTransparency: boolean;
  readonly hasSemiTransparency: boolean;
  readonly transparentPixelRatio: number;
  readonly fullyTransparentRatio: number;
  readonly confidence: StudioAssetAlphaConfidence;
}

export interface StudioAssetGeometryProfile {
  readonly width: number;
  readonly height: number;
  readonly megapixels: number;
  readonly aspectRatio: number;
  readonly aspectLabel: string;
  readonly orientation: StudioAssetOrientation;
  readonly resolutionTier: StudioAssetResolutionTier;
}

export interface StudioReusableBlockMetadata {
  readonly blockId: string;
  readonly role: StudioReusableBlockRole;
  readonly roleLabelKo: string;
  readonly recommendedPlacement: StudioInsertPlacementMode;
  readonly suggestedWidthRatio: number;
  readonly suggestedHeightRatio: number;
  readonly preserveAspectRatio: boolean;
  readonly supportsTiling: boolean;
  readonly recommendedBlendMode: "normal" | "multiply" | "screen";
  readonly summaryKo: string;
}

export interface StudioAssetAutotagResult {
  readonly normalizedFileName: string;
  readonly extension: string | null;
  readonly mimeType: string | null;
  readonly tagsKo: readonly string[];
  readonly tagsEn: readonly string[];
  readonly allTags: readonly string[];
  readonly hierarchicalTags: readonly string[];
  readonly geometry: StudioAssetGeometryProfile;
  readonly alpha: StudioAssetAlphaProfile;
  readonly color: StudioAssetColorProfile;
  readonly reusableBlock: StudioReusableBlockMetadata;
}

interface SemanticLexiconEntry {
  readonly pattern: RegExp;
  readonly ko: readonly string[];
  readonly en: readonly string[];
  readonly hierarchical?: string;
}

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "image/avif": "avif",
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
  "application/octet-stream": "",
});

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
  avif: "image/avif",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  vrm: "model/gltf-binary",
  skp: "application/vnd.sketchup.skp",
  psd: "image/vnd.adobe.photoshop",
  ora: "image/openraster",
});

const THREE_D_EXTENSIONS = new Set(["glb", "gltf", "vrm", "skp", "obj", "fbx"]);
const ALPHA_CAPABLE_EXTENSIONS = new Set(["png", "webp", "svg", "gif", "avif"]);

const SEMANTIC_LEXICON: readonly SemanticLexiconEntry[] = Object.freeze([
  {
    pattern: /(?:bg|background|backdrop|배경|교실|학교|카페|거리|도시|복도|방|실내|야외|하늘|숲|street|room|classroom|school|cafe|city|sky|forest|corridor|hallway)/u,
    ko: ["배경", "장면"], en: ["background", "scene"], hierarchical: "유형/배경",
  },
  {
    pattern: /(?:실내|교실|방|카페|복도|사무실|interior|indoor|room|classroom|office|cafe|corridor)/u,
    ko: ["실내"], en: ["interior"], hierarchical: "배경/실내",
  },
  {
    pattern: /(?:야외|거리|하늘|숲|공원|도시|바다|exterior|outdoor|street|sky|forest|park|city|beach)/u,
    ko: ["야외"], en: ["exterior"], hierarchical: "배경/야외",
  },
  {
    pattern: /(?:밤|야간|야경|노을|석양|night|midnight|sunset|dusk|evening)/u,
    ko: ["야간무드"], en: ["night-mood"], hierarchical: "조명/야간",
  },
  {
    pattern: /(?:3d|bg3d|glb|gltf|vrm|skp|mesh|model|소품|가구|의자|책상|오브젝트|prop|chair|desk|table|furniture|object)/u,
    ko: ["소품"], en: ["prop"], hierarchical: "유형/소품",
  },
  {
    pattern: /(?:char|character|hero|heroine|pose|face|hand|hair|outfit|캐릭터|인물|포즈|표정|손|헤어|의상)/u,
    ko: ["캐릭터", "인물"], en: ["character", "pose"], hierarchical: "유형/캐릭터",
  },
  {
    pattern: /(?:bubble|balloon|speech|dialogue|말풍선|대사|지문)/u,
    ko: ["말풍선", "식자"], en: ["speech-bubble", "lettering"], hierarchical: "유형/말풍선",
  },
  {
    pattern: /(?:sfx|fx|effect|sparkle|glow|speedline|slash|rain|snow|smoke|효과|효과음|집중선|속도선|이펙트|빗줄기|눈|연기)/u,
    ko: ["연출효과"], en: ["effect"], hierarchical: "유형/효과",
  },
  {
    pattern: /(?:texture|pattern|tone|screentone|paper|grain|fabric|질감|패턴|스크린톤|종이|노이즈|브러시)/u,
    ko: ["질감", "패턴"], en: ["texture", "pattern"], hierarchical: "유형/질감",
  },
  {
    pattern: /(?:transparent|alpha|cutout|nukki|sticker|투명|누끼|스티커)/u,
    ko: ["누끼", "투명배경"], en: ["cutout", "transparent"], hierarchical: "속성/투명",
  },
]);

const ROLE_LABELS_KO: Readonly<Record<StudioReusableBlockRole, string>> = Object.freeze({
  "background-plate": "배경 플레이트",
  "vertical-panel-template": "세로 웹툰 컷 블록",
  "3d-stage-prop": "3D 소품 블록",
  "character-cutout": "캐릭터 컷아웃",
  "effect-overlay": "연출 효과 오버레이",
  "texture-swatch": "질감·패턴 스와치",
  "prop-stamp": "재사용 소품 스탬프",
});

const ASPECT_PRESETS: readonly { readonly ratio: number; readonly label: string }[] = Object.freeze([
  { ratio: 1, label: "1:1" },
  { ratio: 4 / 3, label: "4:3" },
  { ratio: 3 / 4, label: "3:4" },
  { ratio: 16 / 9, label: "16:9" },
  { ratio: 9 / 16, label: "9:16" },
  { ratio: 3 / 2, label: "3:2" },
  { ratio: 2 / 3, label: "2:3" },
  { ratio: 4 / 5, label: "4:5" },
  { ratio: 5 / 4, label: "5:4" },
]);

function clampPositiveDimension(value: number): number {
  return !Number.isFinite(value) || value <= 0 ? 1 : Math.max(1, Math.round(value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function parseDataUrlMime(dataUrl: string | undefined): string | null {
  if (!dataUrl || !/^data:/i.test(dataUrl)) return null;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 5) return null;
  const mime = dataUrl.slice(5, commaIndex).split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(mime) ? mime : null;
}

function extractExtensionFromName(fileName: string): string | null {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return null;
  const candidate = trimmed.slice(dotIndex + 1).toLowerCase();
  return /^[a-z0-9]{2,6}$/u.test(candidate) ? candidate : null;
}

function resolveFormatInfo(input: StudioAssetAutotagInput): {
  readonly normalizedFileName: string;
  readonly extension: string | null;
  readonly mimeType: string | null;
} {
  const rawName = (input.fileName ?? "").normalize("NFKC").trim();
  const dataUrlMime = parseDataUrlMime(input.dataUrl);
  const explicitMime = input.mimeType?.trim().toLowerCase() || null;
  const nameExt = extractExtensionFromName(rawName);
  const mimeType = explicitMime ?? dataUrlMime ?? (nameExt ? (EXTENSION_TO_MIME[nameExt] ?? null) : null);
  const extension = nameExt ?? (mimeType ? (MIME_TO_EXTENSION[mimeType] || null) : null);
  const normalizedFileName = rawName.replace(/\.[a-z0-9]{2,6}$/iu, "").trim() || rawName || "asset";
  return { normalizedFileName, extension, mimeType };
}

function formatAspectLabel(width: number, height: number): string {
  const ratio = width / height;
  if (height / width >= 2.2) return `세로 1:${roundTo(height / width, 1)}`;
  if (width / height >= 2.2) return `가로 ${roundTo(width / height, 1)}:1`;
  for (const preset of ASPECT_PRESETS) {
    if (Math.abs(ratio - preset.ratio) / preset.ratio <= 0.06) return preset.label;
  }
  return ratio >= 1 ? `${roundTo(ratio, 2)}:1` : `1:${roundTo(1 / ratio, 2)}`;
}

function analyzeGeometry(widthRaw: number, heightRaw: number): StudioAssetGeometryProfile {
  const width = clampPositiveDimension(widthRaw);
  const height = clampPositiveDimension(heightRaw);
  const megapixels = roundTo((width * height) / 1_000_000, 2);
  const aspectRatio = roundTo(width / height, 3);
  const inverseRatio = height / width;
  const maxEdge = Math.max(width, height);

  const orientation: StudioAssetOrientation =
    inverseRatio >= 2.2 ? "vertical-strip"
      : inverseRatio >= 1.25 ? "portrait"
        : aspectRatio >= 1.8 ? "wide-panoramic"
          : aspectRatio >= 1.25 ? "landscape"
            : "square";

  const resolutionTier: StudioAssetResolutionTier =
    maxEdge >= 3_200 || megapixels >= 8 ? "ultra-high"
      : maxEdge >= 2_000 || megapixels >= 3.5 ? "high"
        : maxEdge <= 512 && megapixels <= 0.27 ? "lightweight"
          : "standard";

  return Object.freeze({
    width,
    height,
    megapixels,
    aspectRatio,
    aspectLabel: formatAspectLabel(width, height),
    orientation,
    resolutionTier,
  });
}

function toClampedRgba(buffer: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  return buffer instanceof Uint8ClampedArray
    ? buffer
    : new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function alphaProfile(
  hasTransparency: boolean,
  confidence: StudioAssetAlphaConfidence,
  stats?: { readonly hasSemiTransparency: boolean; readonly transparentPixelRatio: number; readonly fullyTransparentRatio: number },
): StudioAssetAlphaProfile {
  return Object.freeze({
    hasTransparency,
    hasSemiTransparency: stats?.hasSemiTransparency ?? false,
    transparentPixelRatio: stats?.transparentPixelRatio ?? 0,
    fullyTransparentRatio: stats?.fullyTransparentRatio ?? 0,
    confidence,
  });
}

function analyzeAlpha(
  input: StudioAssetAutotagInput,
  extension: string | null,
  normalizedSearchText: string,
): StudioAssetAlphaProfile {
  const rgbaWidth = clampPositiveDimension(input.rgbaWidth ?? input.width);
  const rgbaHeight = clampPositiveDimension(input.rgbaHeight ?? input.height);
  const totalPixels = rgbaWidth * rgbaHeight;

  if (input.rgba && input.rgba.length >= totalPixels * 4 && totalPixels > 0) {
    const stride = Math.max(1, Math.floor(totalPixels / 16_384));
    let sampled = 0;
    let transparentCount = 0;
    let fullyTransparentCount = 0;
    let semiTransparentCount = 0;
    for (let pixel = 0; pixel < totalPixels; pixel += stride) {
      const alpha = input.rgba[pixel * 4 + 3] ?? 255;
      sampled += 1;
      if (alpha < 250) {
        transparentCount += 1;
        if (alpha === 0) fullyTransparentCount += 1;
        else semiTransparentCount += 1;
      }
    }
    return alphaProfile(transparentCount > 0, "pixel-verified", {
      hasSemiTransparency: semiTransparentCount > 0,
      transparentPixelRatio: sampled > 0 ? roundTo(transparentCount / sampled, 4) : 0,
      fullyTransparentRatio: sampled > 0 ? roundTo(fullyTransparentCount / sampled, 4) : 0,
    });
  }

  if (input.hasAlphaHint === true) return alphaProfile(true, "metadata-hint");
  if (input.hasAlphaHint === false) return alphaProfile(false, "opaque");

  const filenameHintsAlpha = /(?:transparent|alpha|cutout|nukki|sticker|투명|누끼|스티커)/u.test(normalizedSearchText);
  if (extension === "svg" || (extension !== null && ALPHA_CAPABLE_EXTENSIONS.has(extension) && filenameHintsAlpha)) {
    return alphaProfile(true, "metadata-hint");
  }
  if (extension !== null && ALPHA_CAPABLE_EXTENSIONS.has(extension)) {
    return alphaProfile(false, "format-capable");
  }
  return alphaProfile(false, "opaque");
}

function emptyColorResult(analyzedFromPixels: boolean): {
  readonly profile: StudioAssetColorProfile;
  readonly tagsKo: readonly string[];
  readonly tagsEn: readonly string[];
  readonly hierarchicalTags: readonly string[];
} {
  return {
    profile: Object.freeze({
      analyzedFromPixels,
      swatches: Object.freeze([]),
      dominantHex: null,
      temperature: null,
      brightness: null,
      saturation: null,
      meanLightness: null,
      meanChroma: null,
    }),
    tagsKo: [],
    tagsEn: [],
    hierarchicalTags: [],
  };
}

function analyzeColorProfile(input: StudioAssetAutotagInput): {
  readonly profile: StudioAssetColorProfile;
  readonly tagsKo: readonly string[];
  readonly tagsEn: readonly string[];
  readonly hierarchicalTags: readonly string[];
} {
  const rgbaWidth = clampPositiveDimension(input.rgbaWidth ?? input.width);
  const rgbaHeight = clampPositiveDimension(input.rgbaHeight ?? input.height);
  if (!input.rgba || input.rgba.length < rgbaWidth * rgbaHeight * 4) {
    return emptyColorResult(false);
  }

  const rawSwatches = extractDominantLabPaletteFromRgba(
    toClampedRgba(input.rgba),
    rgbaWidth,
    rgbaHeight,
    input.paletteSize ?? 5,
  );
  if (rawSwatches.length === 0) return emptyColorResult(true);

  const swatches: StudioAssetDominantHexSwatch[] = rawSwatches.map((swatch) =>
    Object.freeze({ ...swatch, hex: rgbToHex(swatch.rgb.r, swatch.rgb.g, swatch.rgb.b) }),
  );

  let weightSum = 0;
  let weightedL = 0;
  let weightedA = 0;
  let weightedB = 0;
  let weightedChroma = 0;
  for (const swatch of swatches) {
    const weight = swatch.ratio01 > 0 ? swatch.ratio01 : 1 / swatches.length;
    weightSum += weight;
    weightedL += swatch.lab.l * weight;
    weightedA += swatch.lab.a * weight;
    weightedB += swatch.lab.b * weight;
    weightedChroma += Math.hypot(swatch.lab.a, swatch.lab.b) * weight;
  }
  const denom = Math.max(weightSum, 1e-6);
  const meanL = roundTo(weightedL / denom, 1);
  const meanChroma = roundTo(weightedChroma / denom, 1);
  const dominantHue = (Math.atan2(weightedB / denom, weightedA / denom) * (180 / Math.PI) + 360) % 360;

  const temperature: StudioAssetColorTemperature =
    meanChroma < 10 ? "neutral" : dominantHue <= 95 || dominantHue >= 325 ? "warm" : "cool";
  const brightness: StudioAssetColorBrightness =
    meanL < 32 ? "dark" : meanL > 74 ? "bright" : "midtone";
  const saturation: StudioAssetColorSaturation =
    meanChroma < 10 ? "achromatic" : meanChroma >= 45 ? "vivid" : meanChroma < 24 ? "muted" : "balanced";

  const tagsKo: string[] = [];
  const tagsEn: string[] = [];
  const hierarchicalTags: string[] = [];

  if (temperature === "warm") {
    tagsKo.push("따뜻한톤", "웜톤");
    tagsEn.push("warm-tone");
    hierarchicalTags.push("색감/따뜻한톤");
    if (dominantHue >= 18 && dominantHue <= 68 && meanChroma >= 25) {
      tagsKo.push("노을톤");
      tagsEn.push("sunset-tone");
    }
  } else if (temperature === "cool") {
    tagsKo.push("차가운톤", "쿨톤");
    tagsEn.push("cool-tone");
    hierarchicalTags.push("색감/차가운톤");
    if (dominantHue >= 195 && dominantHue <= 285 && meanChroma >= 20) {
      tagsKo.push("블루톤");
      tagsEn.push("blue-tone");
    }
  } else {
    tagsKo.push("무채색", "모노톤");
    tagsEn.push("monochrome", "neutral-tone");
    hierarchicalTags.push("색감/무채색");
  }

  if (brightness === "dark") {
    tagsKo.push("다크톤");
    tagsEn.push("dark-mood");
    hierarchicalTags.push("명도/다크");
  } else if (brightness === "bright") {
    tagsKo.push("밝은톤");
    tagsEn.push("bright-tone");
    hierarchicalTags.push("명도/밝음");
  }

  if (saturation === "vivid") {
    tagsKo.push("고채도");
    tagsEn.push("vivid");
  } else if (saturation === "muted") {
    tagsKo.push("차분한톤");
    tagsEn.push("muted-tone");
  }

  return {
    profile: Object.freeze({
      analyzedFromPixels: true,
      swatches: Object.freeze(swatches),
      dominantHex: swatches[0]?.hex ?? null,
      temperature,
      brightness,
      saturation,
      meanLightness: meanL,
      meanChroma,
    }),
    tagsKo,
    tagsEn,
    hierarchicalTags,
  };
}

function buildReusableBlockSlug(name: string, role: StudioReusableBlockRole): string {
  const cleaned = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return `${role}:${cleaned || "asset"}`;
}

function classifyReusableBlock(input: {
  readonly normalizedFileName: string;
  readonly geometry: StudioAssetGeometryProfile;
  readonly alpha: StudioAssetAlphaProfile;
  readonly is3dProp: boolean;
  readonly tagsKo: ReadonlySet<string>;
  readonly kind?: string;
}): StudioReusableBlockMetadata {
  const { normalizedFileName, geometry, alpha, is3dProp, tagsKo, kind } = input;

  let role: StudioReusableBlockRole;
  let recommendedPlacement: StudioInsertPlacementMode;
  let suggestedWidthRatio: number;
  let suggestedHeightRatio: number;
  let supportsTiling = false;
  let recommendedBlendMode: "normal" | "multiply" | "screen" = "normal";

  if (is3dProp) {
    role = "3d-stage-prop";
    recommendedPlacement = "selection";
    suggestedWidthRatio = 0.5;
    suggestedHeightRatio = 0.5;
  } else if (kind === "texture" || tagsKo.has("질감") || tagsKo.has("패턴")) {
    role = "texture-swatch";
    recommendedPlacement = "page";
    suggestedWidthRatio = 1;
    suggestedHeightRatio = 1;
    supportsTiling = geometry.orientation === "square" && !alpha.hasTransparency;
    recommendedBlendMode = "multiply";
  } else if (kind === "effect-overlay" || tagsKo.has("연출효과") || tagsKo.has("말풍선")) {
    role = "effect-overlay";
    recommendedPlacement = "selection";
    suggestedWidthRatio = 0.65;
    suggestedHeightRatio = 0.45;
    recommendedBlendMode = alpha.hasTransparency ? "normal" : "screen";
  } else if (geometry.orientation === "vertical-strip") {
    role = "vertical-panel-template";
    recommendedPlacement = "page";
    suggestedWidthRatio = 1;
    suggestedHeightRatio = 1;
  } else if (tagsKo.has("캐릭터") && (alpha.hasTransparency || geometry.orientation === "portrait")) {
    role = "character-cutout";
    recommendedPlacement = "selection";
    suggestedWidthRatio = 0.55;
    suggestedHeightRatio = 0.75;
  } else if (
    tagsKo.has("배경")
    || (!alpha.hasTransparency && (geometry.orientation === "landscape" || geometry.orientation === "wide-panoramic"))
  ) {
    role = "background-plate";
    recommendedPlacement = "page";
    suggestedWidthRatio = 1;
    suggestedHeightRatio = 0.65;
  } else {
    role = "prop-stamp";
    recommendedPlacement = alpha.hasTransparency ? "selection" : "auto";
    suggestedWidthRatio = 0.4;
    suggestedHeightRatio = 0.4;
  }

  const roleLabelKo = ROLE_LABELS_KO[role];
  const placementKo =
    recommendedPlacement === "page" ? "페이지 맞춤"
      : recommendedPlacement === "selection" ? "선택 영역 맞춤"
        : "자동 배치";

  return Object.freeze({
    blockId: buildReusableBlockSlug(normalizedFileName, role),
    role,
    roleLabelKo,
    recommendedPlacement,
    suggestedWidthRatio,
    suggestedHeightRatio,
    preserveAspectRatio: true,
    supportsTiling,
    recommendedBlendMode,
    summaryKo: `${roleLabelKo} · ${geometry.aspectLabel} · ${placementKo} 권장`,
  });
}

/**
 * 파일명·확장자·해상도·종횡비·지배 색상(RGBA)·투명 채널 유무를 분석해
 * 한국어+영문 검색 태그와 재사용 블록 메타데이터를 결정적으로 추출한다.
 */
export function extractSmartAssetAutotagMetadata(
  input: StudioAssetAutotagInput,
): StudioAssetAutotagResult {
  const { normalizedFileName, extension, mimeType } = resolveFormatInfo(input);
  const geometry = analyzeGeometry(input.width, input.height);
  const searchSource = [
    input.fileName ?? "",
    normalizedFileName,
    extension ?? "",
    input.kind ?? "",
    input.sourceKind ?? "",
  ].join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR");

  const alpha = analyzeAlpha(input, extension, searchSource);
  const colorAnalysis = analyzeColorProfile(input);

  const koTags = new Set<string>();
  const enTags = new Set<string>();
  const hierarchical = new Set<string>();

  const addTags = (ko: readonly string[], en: readonly string[], path?: string) => {
    for (const tag of ko) if (tag.trim()) koTags.add(tag.trim());
    for (const tag of en) if (tag.trim()) enTags.add(tag.trim());
    if (path) hierarchical.add(path);
  };

  if (geometry.orientation === "vertical-strip") {
    addTags(["세로컷", "웹툰스크롤"], ["vertical-strip", "webtoon-scroll"], "구도/세로컷");
  } else if (geometry.orientation === "portrait") {
    addTags(["세로컷", "세로형"], ["portrait", "vertical-cut"], "구도/세로컷");
  } else if (geometry.orientation === "wide-panoramic") {
    addTags(["가로컷", "와이드배경"], ["wide-panoramic", "landscape"], "구도/가로컷");
  } else if (geometry.orientation === "landscape") {
    addTags(["가로컷", "가로형"], ["landscape", "horizontal-cut"], "구도/가로컷");
  } else {
    addTags(["정방형"], ["square"], "구도/정방형");
  }

  if (geometry.resolutionTier === "ultra-high") {
    addTags(["초고해상도", "고해상도", "인쇄대응"], ["ultra-high-res", "high-res", "print-ready"], "해상도/초고해상도");
  } else if (geometry.resolutionTier === "high") {
    addTags(["고해상도"], ["high-res"], "해상도/고해상도");
  } else if (geometry.resolutionTier === "lightweight") {
    addTags(["경량에셋"], ["lightweight"], "해상도/경량");
  }

  if (extension === "png") {
    addTags(["PNG"], ["png"]);
    if (alpha.hasTransparency) addTags(["투명PNG", "투명배경"], ["transparent-png", "transparent"], "속성/투명PNG");
  } else if (extension === "webp") {
    addTags(["WebP"], ["webp"]);
    if (alpha.hasTransparency) addTags(["투명WebP", "투명배경"], ["transparent-webp", "transparent"], "속성/투명WebP");
  } else if (extension === "jpg" || extension === "jpeg") {
    addTags(["JPG"], ["jpg"]);
  } else if (extension === "svg") {
    addTags(["벡터", "SVG"], ["vector", "svg"], "유형/벡터");
  } else if (extension === "psd" || extension === "ora") {
    addTags(["레이어원본"], ["layered-source", extension], "유형/레이어원본");
  }

  if (alpha.hasTransparency) {
    addTags(["투명배경"], ["transparent", "alpha"]);
    if (alpha.transparentPixelRatio >= 0.05) addTags(["누끼"], ["alpha-cutout"]);
  }

  const is3dProp =
    input.kind === "bg3d"
    || input.kind === "3d"
    || input.sourceKind === "3d-generated"
    || (extension !== null && THREE_D_EXTENSIONS.has(extension))
    || /(?:^|[\s_-])(?:3d|bg3d|glb|gltf|vrm|skp)(?:$|[\s_-])/u.test(searchSource);
  if (is3dProp) addTags(["3D소품", "3D", "소품"], ["3d-prop", "3d", "prop"], "유형/3D소품");
  if (input.kind === "ai" || input.sourceKind === "ai-generated") addTags(["AI생성"], ["ai-generated"], "출처/AI생성");

  for (const entry of SEMANTIC_LEXICON) {
    if (entry.pattern.test(searchSource)) addTags(entry.ko, entry.en, entry.hierarchical);
  }

  addTags(colorAnalysis.tagsKo, colorAnalysis.tagsEn);
  for (const path of colorAnalysis.hierarchicalTags) hierarchical.add(path);

  const reusableBlock = classifyReusableBlock({
    normalizedFileName,
    geometry,
    alpha,
    is3dProp,
    tagsKo: koTags,
    kind: input.kind,
  });
  hierarchical.add(`블록/${reusableBlock.roleLabelKo}`);

  const tagsKo = Object.freeze([...koTags]);
  const tagsEn = Object.freeze([...enTags]);
  const allTags = Object.freeze([...new Set([...tagsKo, ...tagsEn])]);

  return Object.freeze({
    normalizedFileName,
    extension,
    mimeType,
    tagsKo,
    tagsEn,
    allTags,
    hierarchicalTags: Object.freeze([...hierarchical]),
    geometry,
    alpha,
    color: colorAnalysis.profile,
    reusableBlock,
  });
}

/** `StudioAsset` 레코드에서 자동 검색 태그와 재사용 블록 메타데이터를 추출한다. */
export function extractStudioAssetAutotagMetadata(
  asset: Pick<StudioAsset, "name" | "dataUrl" | "width" | "height" | "kind" | "rights">,
  rgba?: Uint8ClampedArray | Uint8Array,
): StudioAssetAutotagResult {
  return extractSmartAssetAutotagMetadata({
    fileName: asset.name,
    dataUrl: asset.dataUrl,
    width: asset.width,
    height: asset.height,
    kind: asset.kind,
    sourceKind: asset.rights?.sourceKind,
    rgba,
  });
}
