/**
 * 다국어 SFX 비파괴 변형 번들 컴파일러 및 레이어드 SVG 오버레이 익스포터 (Wave 77).
 *
 * - 7개 로케일(`ko`, `ja`, `en`, `fr`, `es`, `zh-Hant`, `th`) 비파괴 번들 컴파일
 * - 갈필·스파이크·속도선 벡터 지오메트리와 Clean-Plate 좌표를 포함한 레이어드 SVG 렌더링(NaN 0건)
 * - ToonStudio 내보내기 전 Rights BOM(폰트·브러시 상업 라이선스 감사 메타데이터) 생성
 */

import type {
  CleanPlatePatch,
  CleanPlateQualityMetrics,
  Rect2D,
} from "./sfx-mask-and-cleanplate-inpainter";
import {
  SUPPORTED_SFX_LOCALES,
  synthesizeLocalizedSfxVectorLayer,
  type BrushVectorStrokePath,
  type LocalizedSfxVectorLayer,
  type OriginalSfxVisualEnergySpec,
  type SfxBrushTextureStyle,
  type SfxLocale,
  type SfxWritingMode,
} from "./multilingual-sfx-lexicon-and-brush-vectorizer";

export type RightsBomClearanceStatus = "cleared" | "review-required";

export interface LocaleFontRightsSpec {
  readonly locale: SfxLocale;
  readonly fontFamily: string;
  readonly spdxLicenseId: string;
  readonly commercialUseCleared: boolean;
  readonly attributionNotice: string;
}

export interface BrushAssetRightsSpec {
  readonly brushStyle: SfxBrushTextureStyle;
  readonly assetId: string;
  readonly spdxLicenseId: string;
  readonly commercialUseCleared: boolean;
}

export interface RightsBomAuditManifest {
  readonly schemaVersion: "toonstudio-rights-bom/v1";
  readonly generatedAtIso: string;
  readonly exportClearanceStatus: RightsBomClearanceStatus;
  readonly fontEntries: readonly LocaleFontRightsSpec[];
  readonly brushAsset: BrushAssetRightsSpec;
  readonly blockingReasons: readonly string[];
}

export interface SvgOverlayRenderOptions {
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly cleanPlateBounds?: Rect2D;
  readonly fontOverride?: LocaleFontRightsSpec;
  readonly includeCleanPlateMetadataRect?: boolean;
}

export interface RenderedLocalizedSfxSvgOverlay {
  readonly locale: SfxLocale;
  readonly writingMode: SfxWritingMode;
  readonly viewBox: string;
  readonly svgMarkup: string;
  readonly glyphCount: number;
  readonly vectorPathCount: number;
  readonly hasInvalidCoordinates: boolean;
  readonly byteLength: number;
}

export interface CompiledLocalizedSfxVariant {
  readonly locale: SfxLocale;
  readonly localizedText: string;
  readonly categoryId: string;
  readonly resolvedWritingMode: SfxWritingMode;
  readonly writingModeNormalized: boolean;
  readonly vectorLayer: LocalizedSfxVectorLayer;
  readonly svgOverlay: RenderedLocalizedSfxSvgOverlay;
  readonly balloonOverlapAreaPx: number;
  readonly fitsSafeEnvelope: boolean;
}

export interface CompileMultilingualSfxPackInput {
  readonly packId: string;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly cleanPlatePatch: CleanPlatePatch;
  readonly visualSpec: OriginalSfxVisualEnergySpec;
  readonly targetLocales?: readonly SfxLocale[];
  readonly fontRightsOverrides?: Partial<Record<SfxLocale, LocaleFontRightsSpec>>;
  readonly generatedAtIso?: string;
}

export interface MultilingualSfxVariantPack {
  readonly packId: string;
  readonly sourceKoText: string;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly cleanPlatePatchId: string;
  readonly cleanPlateBounds: Rect2D;
  readonly cleanPlateMetrics: CleanPlateQualityMetrics;
  readonly cleanPlateDigestHex: string;
  readonly variants: readonly CompiledLocalizedSfxVariant[];
  readonly rightsBom: RightsBomAuditManifest;
  readonly summary: {
    readonly totalLocales: number;
    readonly allClearForExport: boolean;
    readonly zeroBalloonOverlapVerified: boolean;
    readonly zeroInvalidCoordinatesVerified: boolean;
    readonly cleanPlateBitExactOutsideMask: boolean;
  };
}

const fontRight = (locale: SfxLocale, fontFamily: string, notice: string): LocaleFontRightsSpec => ({
  locale,
  fontFamily,
  spdxLicenseId: "OFL-1.1",
  commercialUseCleared: true,
  attributionNotice: `SIL Open Font License 1.1 (${notice})`,
});

const DEFAULT_LOCALE_FONT_RIGHTS: Readonly<Record<SfxLocale, LocaleFontRightsSpec>> = {
  ko: fontRight("ko", "Black Han Sans, Pretendard, sans-serif", "Korean Comic Display"),
  ja: fontRight("ja", "Dela Gothic One, Noto Sans JP, sans-serif", "Japanese Manga SFX Display"),
  en: fontRight("en", "Bangers, Comic Neue, sans-serif", "Latin Comic Display"),
  fr: fontRight("fr", "Bangers, Noto Sans, sans-serif", "French Bande Dessinee Display"),
  es: fontRight("es", "Bangers, Noto Sans, sans-serif", "Spanish Comic Display"),
  "zh-Hant": fontRight("zh-Hant", "Noto Sans TC, Taipei Sans TC Beta, sans-serif", "Traditional Chinese Display"),
  th: fontRight("th", "Kanit, Noto Sans Thai, sans-serif", "Thai Webtoon Display"),
};

const brushRight = (brushStyle: SfxBrushTextureStyle, assetId: string): BrushAssetRightsSpec => ({
  brushStyle,
  assetId,
  spdxLicenseId: "Apache-2.0",
  commercialUseCleared: true,
});

const BRUSH_RIGHTS_CATALOG: Readonly<Record<SfxBrushTextureStyle, BrushAssetRightsSpec>> = {
  "dry-brush-impact": brushRight("dry-brush-impact", "toonstudio-sfx-brush-dry-impact-v1"),
  "tremble-horror": brushRight("tremble-horror", "toonstudio-sfx-brush-tremble-horror-v1"),
  "soft-romance-glow": brushRight("soft-romance-glow", "toonstudio-sfx-brush-romance-glow-v1"),
  "speed-slash-ink": brushRight("speed-slash-ink", "toonstudio-sfx-brush-speed-slash-v1"),
  "metallic-clang": brushRight("metallic-clang", "toonstudio-sfx-brush-metallic-clang-v1"),
};

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

const formatFinite = (v: number): string => (Number.isFinite(v) ? Number(v.toFixed(2)).toString() : "0");

function buildSvgPathD(stroke: BrushVectorStrokePath): string {
  if (stroke.points.length === 0) return "";
  const cmds: string[] = [];
  for (let i = 0; i < stroke.points.length; i += 1) {
    const pt = stroke.points[i];
    if (pt) cmds.push(`${i === 0 ? "M" : "L"}${formatFinite(pt.x)} ${formatFinite(pt.y)}`);
  }
  if (stroke.closed && stroke.points.length >= 3) cmds.push("Z");
  return cmds.join(" ");
}

function computeFnv1a64DigestHex(bytes: ArrayLike<number>): string {
  // ES2017 호환 2x32비트 결정론적 다이제스트(Uint8Array/Uint8ClampedArray 공용, BigInt 미사용)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0;
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((b + (i & 0xff)) & 0xff), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function hasAnyInvalidLayerNumber(layer: LocalizedSfxVectorLayer): boolean {
  const nums = [
    layer.tiltAngleDeg, layer.slantShearDeg, layer.outlineHaloThicknessPx,
    layer.placedBounds.x, layer.placedBounds.y, layer.placedBounds.width, layer.placedBounds.height,
    layer.arcPath.start.x, layer.arcPath.start.y, layer.arcPath.control.x, layer.arcPath.control.y,
    layer.arcPath.end.x, layer.arcPath.end.y,
  ];
  for (let i = 0; i < nums.length; i += 1) {
    if (!Number.isFinite(nums[i])) return true;
  }
  for (let i = 0; i < layer.glyphs.length; i += 1) {
    const g = layer.glyphs[i];
    if (g && (!Number.isFinite(g.centerX) || !Number.isFinite(g.centerY) || !Number.isFinite(g.fontSizePx) || !Number.isFinite(g.rotationDeg) || !Number.isFinite(g.slantShearDeg))) {
      return true;
    }
  }
  for (let i = 0; i < layer.brushStrokePaths.length; i += 1) {
    const p = layer.brushStrokePaths[i];
    if (!p) continue;
    for (let j = 0; j < p.points.length; j += 1) {
      const pt = p.points[j];
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return true;
    }
  }
  return false;
}

/**
 * 합성된 다국어 SFX 벡터 레이어를 갈필·아크·할로 구조의 레이어드 SVG 오버레이로 렌더링한다.
 */
export function renderLocalizedSfxSvgOverlay(
  layer: LocalizedSfxVectorLayer,
  options: SvgOverlayRenderOptions,
): RenderedLocalizedSfxSvgOverlay {
  const safeW = Math.max(1, Math.round(options.panelWidth));
  const safeH = Math.max(1, Math.round(options.panelHeight));
  const viewBox = `0 0 ${String(safeW)} ${String(safeH)}`;
  const fontSpec = options.fontOverride ?? DEFAULT_LOCALE_FONT_RIGHTS[layer.locale];
  const gradientId = `sfx-grad-${layer.locale.replace(/[^a-zA-Z0-9_-]/gu, "_")}`;
  const hasInvalidLayerCoords = hasAnyInvalidLayerNumber(layer);

  const angleRad = (layer.colorGradient.angleDeg * Math.PI) / 180;
  const gx2 = Number((0.5 + 0.5 * Math.cos(angleRad)).toFixed(3));
  const gy2 = Number((0.5 + 0.5 * Math.sin(angleRad)).toFixed(3));
  const gx1 = Number((1 - gx2).toFixed(3));
  const gy1 = Number((1 - gy2).toFixed(3));

  const accentElements: string[] = [];
  for (let i = 0; i < layer.brushStrokePaths.length; i += 1) {
    const stroke = layer.brushStrokePaths[i];
    if (!stroke) continue;
    const d = buildSvgPathD(stroke);
    if (d.length === 0) continue;
    const fill = stroke.closed ? `url(#${gradientId})` : "none";
    accentElements.push(
      `    <path id="${escapeXml(stroke.pathId)}" data-role="${escapeXml(stroke.role)}" d="${d}" fill="${fill}" fill-opacity="${formatFinite(stroke.opacity * 0.45)}" stroke="${escapeXml(layer.colorGradient.haloColor)}" stroke-width="${formatFinite(stroke.strokeWidthPx)}" stroke-linecap="round" stroke-linejoin="round" opacity="${formatFinite(stroke.opacity)}" />`,
    );
  }

  const writingAttr = layer.resolvedWritingMode === "vertical-rl" ? ` writing-mode="vertical-rl"` : "";
  const haloEls: string[] = [];
  const fillEls: string[] = [];
  for (let i = 0; i < layer.glyphs.length; i += 1) {
    const g = layer.glyphs[i];
    if (!g) continue;
    const transform = `translate(${formatFinite(g.centerX)} ${formatFinite(g.centerY)}) rotate(${formatFinite(g.rotationDeg)}) skewX(${formatFinite(g.slantShearDeg)})`;
    const escapedChar = escapeXml(g.character);
    const common = `x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(fontSpec.fontFamily)}" font-size="${formatFinite(g.fontSizePx)}" font-weight="900"${writingAttr} transform="${transform}"`;
    haloEls.push(
      `    <text ${common} fill="none" stroke="${escapeXml(layer.colorGradient.haloColor)}" stroke-width="${formatFinite(layer.outlineHaloThicknessPx * 2)}" stroke-linejoin="round">${escapedChar}</text>`,
    );
    fillEls.push(`    <text ${common} fill="url(#${gradientId})">${escapedChar}</text>`);
  }

  const cleanPlateMeta =
    options.includeCleanPlateMetadataRect !== false && options.cleanPlateBounds
      ? [
          `  <g data-layer="clean-plate-patch">`,
          `    <rect data-role="clean-plate-bounds" x="${formatFinite(options.cleanPlateBounds.x)}" y="${formatFinite(options.cleanPlateBounds.y)}" width="${formatFinite(options.cleanPlateBounds.width)}" height="${formatFinite(options.cleanPlateBounds.height)}" fill="none" stroke="none" />`,
          `  </g>`,
        ].join("\n")
      : "";

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${String(safeW)}" height="${String(safeH)}" data-locale="${escapeXml(layer.locale)}" data-writing-mode="${escapeXml(layer.resolvedWritingMode)}" data-brush-style="${escapeXml(layer.brushStyle)}" data-category="${escapeXml(layer.categoryId)}">`,
    `  <defs>`,
    `    <linearGradient id="${gradientId}" x1="${formatFinite(gx1)}" y1="${formatFinite(gy1)}" x2="${formatFinite(gx2)}" y2="${formatFinite(gy2)}">`,
    `      <stop offset="0%" stop-color="${escapeXml(layer.colorGradient.startColor)}" />`,
    `      <stop offset="100%" stop-color="${escapeXml(layer.colorGradient.endColor)}" />`,
    `    </linearGradient>`,
    `  </defs>`,
    cleanPlateMeta,
    `  <g data-layer="sfx-brush-accents">`,
    ...accentElements,
    `  </g>`,
    `  <g data-layer="sfx-halo-outline">`,
    ...haloEls,
    `  </g>`,
    `  <g data-layer="sfx-glyphs" aria-label="${escapeXml(layer.localizedText)}">`,
    ...fillEls,
    `  </g>`,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const hasInvalidToken = /\bNaN\b|\bInfinity\b/u.test(svgMarkup);
  return {
    locale: layer.locale,
    writingMode: layer.resolvedWritingMode,
    viewBox,
    svgMarkup,
    glyphCount: layer.glyphs.length,
    vectorPathCount: layer.brushStrokePaths.length,
    hasInvalidCoordinates: hasInvalidLayerCoords || hasInvalidToken,
    byteLength: new TextEncoder().encode(svgMarkup).byteLength,
  };
}

/**
 * Clean-Plate 패치와 다국어 벡터 SFX 변형(기본 7개 로케일)을 Rights BOM 감사 메타데이터와 함께 컴파일한다.
 */
export function compileMultilingualSfxVariantPack(
  input: CompileMultilingualSfxPackInput,
): MultilingualSfxVariantPack {
  const locales = input.targetLocales && input.targetLocales.length > 0 ? input.targetLocales : SUPPORTED_SFX_LOCALES;
  const generatedAtIso = input.generatedAtIso ?? "2026-11-28T00:00:00.000Z";
  const variants: CompiledLocalizedSfxVariant[] = [];
  const fontEntries: LocaleFontRightsSpec[] = [];
  const blockingReasons: string[] = [];

  let resolvedBrushStyle: SfxBrushTextureStyle = input.visualSpec.brushStyle ?? "dry-brush-impact";
  let zeroBalloonOverlapVerified = true;
  let zeroInvalidCoordinatesVerified = true;

  for (let i = 0; i < locales.length; i += 1) {
    const locale = locales[i];
    if (!locale) continue;
    const vectorLayer = synthesizeLocalizedSfxVectorLayer(input.visualSpec, locale);
    if (i === 0) resolvedBrushStyle = vectorLayer.brushStyle;

    const fontRights = input.fontRightsOverrides?.[locale] ?? DEFAULT_LOCALE_FONT_RIGHTS[locale];
    fontEntries.push(fontRights);
    if (!fontRights.commercialUseCleared) {
      blockingReasons.push(`로케일 ${locale} 폰트(${fontRights.fontFamily})의 상업적 배포 라이선스가 미승인 상태입니다.`);
    }

    const svgOverlay = renderLocalizedSfxSvgOverlay(vectorLayer, {
      panelWidth: input.panelWidth,
      panelHeight: input.panelHeight,
      cleanPlateBounds: input.cleanPlatePatch.bounds,
      fontOverride: fontRights,
    });

    if (vectorLayer.balloonOverlapAreaPx > 0) {
      zeroBalloonOverlapVerified = false;
      blockingReasons.push(`로케일 ${locale} 효과음이 보호 말풍선과 ${String(vectorLayer.balloonOverlapAreaPx)}px^2 겹쳤습니다.`);
    }
    if (svgOverlay.hasInvalidCoordinates) {
      zeroInvalidCoordinatesVerified = false;
      blockingReasons.push(`로케일 ${locale} SVG 오버레이에 비정상 좌표(NaN/Infinity)가 포함되었습니다.`);
    }

    variants.push({
      locale,
      localizedText: vectorLayer.localizedText,
      categoryId: vectorLayer.categoryId,
      resolvedWritingMode: vectorLayer.resolvedWritingMode,
      writingModeNormalized: vectorLayer.writingModeNormalized,
      vectorLayer,
      svgOverlay,
      balloonOverlapAreaPx: vectorLayer.balloonOverlapAreaPx,
      fitsSafeEnvelope: vectorLayer.fitsSafeEnvelope,
    });
  }

  const brushAsset = BRUSH_RIGHTS_CATALOG[resolvedBrushStyle];
  if (!brushAsset.commercialUseCleared) {
    blockingReasons.push(`브러시 자산(${brushAsset.assetId})의 상업 라이선스가 확인되지 않았습니다.`);
  }
  const cleanPlateBitExactOutsideMask = input.cleanPlatePatch.metrics.mutatedOutsideMaskPixels === 0;
  if (!cleanPlateBitExactOutsideMask) {
    blockingReasons.push(
      `Clean-Plate 패치가 마스크 바깥 픽셀 ${String(input.cleanPlatePatch.metrics.mutatedOutsideMaskPixels)}개를 변경했습니다.`,
    );
  }

  const exportClearanceStatus: RightsBomClearanceStatus = blockingReasons.length === 0 ? "cleared" : "review-required";
  const rightsBom: RightsBomAuditManifest = {
    schemaVersion: "toonstudio-rights-bom/v1",
    generatedAtIso,
    exportClearanceStatus,
    fontEntries,
    brushAsset,
    blockingReasons,
  };

  return {
    packId: input.packId,
    sourceKoText: input.visualSpec.sourceKoText,
    panelWidth: input.panelWidth,
    panelHeight: input.panelHeight,
    cleanPlatePatchId: input.cleanPlatePatch.patchId,
    cleanPlateBounds: input.cleanPlatePatch.bounds,
    cleanPlateMetrics: input.cleanPlatePatch.metrics,
    cleanPlateDigestHex: computeFnv1a64DigestHex(input.cleanPlatePatch.restoredRgba),
    variants,
    rightsBom,
    summary: {
      totalLocales: variants.length,
      allClearForExport: exportClearanceStatus === "cleared",
      zeroBalloonOverlapVerified,
      zeroInvalidCoordinatesVerified,
      cleanPlateBitExactOutsideMask,
    },
  };
}
