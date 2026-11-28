/**
 * ePub3 고정 레이아웃(Fixed-Layout) OPF·Spine 매니페스트 생성기 및
 * 인쇄 대지(재단선·도련 가이드·제본 안전선·컷 크롭 변환·CMYK 컬러바) SVG 오버레이 렌더러.
 *
 * - `jp-b6-manga` 등 RTL 규격은 `page-progression-direction="rtl"` 및 좌/우 펼침 속성을 정확히 반영한다.
 * - 모든 SVG 수치 출력은 유한성 검증을 거쳐 `NaN`/`Infinity` 없는 결정론적 마크업을 보장한다.
 */

import type { PrintImpositionPageSpec } from "./cmyk-prepress-and-bleed-preflight";
import type {
  PublicationFormatId,
  ReadingDirection,
  RecomposedPrintPage,
  RecompositionResult,
} from "./vertical-to-print-page-solver";

export interface EpubMetadataInput {
  readonly identifier: string;
  readonly title: string;
  readonly creator: string;
  readonly language?: string;
  readonly publisher?: string;
  /** 결정론적 출고를 위한 수정 시각(ISO-8601 UTC, 기본 고정값). */
  readonly modifiedAtIso?: string;
  /** 페이지 래스터 자산 확장자(기본 `"png"`). */
  readonly pageImageFormat?: "png" | "jpeg" | "webp";
}

export interface EpubManifestItem {
  readonly id: string;
  readonly href: string;
  readonly mediaType: string;
  readonly properties?: string;
}

export interface EpubSpineItem {
  readonly idref: string;
  readonly pageNumber: number;
  readonly linear: "yes" | "no";
  readonly properties: string;
}

export interface EpubPageXhtmlDocument {
  readonly pageNumber: number;
  readonly href: string;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly xhtml: string;
}

export interface EpubFixedLayoutManifest {
  readonly identifier: string;
  readonly title: string;
  readonly language: string;
  readonly formatId: PublicationFormatId;
  readonly pageProgressionDirection: ReadingDirection;
  readonly renditionLayout: "pre-paginated";
  readonly renditionOrientation: "auto" | "portrait";
  readonly renditionSpread: "landscape" | "none";
  readonly manifestItems: readonly EpubManifestItem[];
  readonly spineItems: readonly EpubSpineItem[];
  readonly pageDocuments: readonly EpubPageXhtmlDocument[];
  readonly opfXml: string;
  /** 결정론적 64비트 이중 FNV-1a 16진수 다이제스트. */
  readonly manifestChecksum: string;
}

export interface PrepressSvgRenderOptions {
  readonly includeGazeFlowOverlay?: boolean;
  readonly includeBalloonBoxes?: boolean;
  readonly includeFocalSubjectBoxes?: boolean;
  readonly includeColorBar?: boolean;
  readonly includeSlugText?: boolean;
}

export interface PrepressSvgRenderResult {
  readonly pageNumber: number;
  readonly sheetWidthMm: number;
  readonly sheetHeightMm: number;
  readonly svgMarkup: string;
  readonly panelTransformCount: number;
  readonly cropMarkCount: number;
  readonly registrationMarkCount: number;
  readonly colorBarPatchCount: number;
  readonly hasInvalidNumber: boolean;
}

const DEFAULT_MODIFIED_ISO = "2026-11-28T00:00:00Z";

// 인쇄 프리플라이트 오버레이 시맨틱 토큰(원시 hex 미사용, 디자인 시스템·다크모드 호환)
const SVG_SHEET_BG = "var(--prepress-sheet-surface, oklch(0.985 0.004 95))";
const SVG_BLEED_STROKE = "var(--prepress-bleed-guide, oklch(0.62 0.19 25))";
const SVG_TRIM_STROKE = "var(--prepress-trim-guide, oklch(0.24 0.01 250))";
const SVG_SAFE_STROKE = "var(--prepress-safe-guide, oklch(0.56 0.14 235))";
const SVG_SPINE_FILL = "var(--prepress-spine-zone, oklch(0.72 0.14 35 / 0.18))";
const SVG_PANEL_FILL = "var(--prepress-panel-surface, oklch(0.94 0.008 95))";
const SVG_PANEL_STROKE = "var(--prepress-panel-border, oklch(0.22 0.01 250))";
const SVG_BALLOON_STROKE = "var(--prepress-balloon-safe, oklch(0.52 0.16 155))";
const SVG_FOCAL_STROKE = "var(--prepress-focal-box, oklch(0.60 0.17 55))";
const SVG_GAZE_STROKE = "var(--prepress-gaze-arrow, oklch(0.54 0.18 295))";
const SVG_REG_STROKE = "var(--prepress-registration-ink, oklch(0.14 0 0))";

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtMm(value: number): string {
  if (!Number.isFinite(value)) return "0.000";
  return (Math.round(value * 1000) / 1000).toFixed(3);
}

/** ES2017 호환 이중 레인 32비트 FNV-1a 해시(BigInt 리터럴 미사용). */
function computeChecksumHex(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    h1 ^= code & 0xff;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (code >>> 8) ^ (code & 0xff) ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

function padPageId(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
}

function resolveImageMediaType(fmt: "png" | "jpeg" | "webp"): { ext: string; mime: string } {
  if (fmt === "jpeg") return { ext: "jpg", mime: "image/jpeg" };
  if (fmt === "webp") return { ext: "webp", mime: "image/webp" };
  return { ext: "png", mime: "image/png" };
}

function resolveEpubSpreadProperty(page: RecomposedPrintPage): string {
  if (page.isDualPageSpread) {
    return "rendition:page-spread-center";
  }
  return page.pageSide === "recto" ? "page-spread-right" : "page-spread-left";
}

/**
 * 리컴포지션 결과를 결정론적 ePub3 Fixed-Layout OPF·Spine 매니페스트 및 페이지 XHTML 목록으로 변환한다.
 */
export function buildEpubFixedLayoutManifest(
  recomposition: RecompositionResult,
  metadata: EpubMetadataInput
): EpubFixedLayoutManifest {
  const language =
    metadata.language ?? (recomposition.format.formatId === "jp-b6-manga" ? "ja" : "ko");
  const publisher = metadata.publisher ?? "ToonStudio Press";
  const modifiedAtIso = metadata.modifiedAtIso ?? DEFAULT_MODIFIED_ISO;
  const imgSpec = resolveImageMediaType(metadata.pageImageFormat ?? "png");
  const direction = recomposition.readingDirection;
  const isShortform = recomposition.format.formatId === "shortform-9x16-storyboard";
  const renditionOrientation: "auto" | "portrait" = isShortform ? "portrait" : "auto";
  const renditionSpread: "landscape" | "none" = recomposition.format.supportsDualPageSpread
    ? "landscape"
    : "none";

  const manifestItems: EpubManifestItem[] = [
    {
      id: "nav",
      href: "nav.xhtml",
      mediaType: "application/xhtml+xml",
      properties: "nav",
    },
    {
      id: "css-fixed",
      href: "styles/fixed-layout.css",
      mediaType: "text/css",
    },
  ];
  const spineItems: EpubSpineItem[] = [];
  const pageDocuments: EpubPageXhtmlDocument[] = [];

  for (const page of recomposition.pages) {
    const padded = padPageId(page.pageNumber);
    const xhtmlId = `page-${padded}`;
    const imgId = `img-${padded}`;
    const xhtmlHref = `xhtml/page-${padded}.xhtml`;
    const imgHref = `images/page-${padded}.${imgSpec.ext}`;
    const viewportW = page.isDualPageSpread
      ? recomposition.format.trimWidthPx * 2
      : recomposition.format.trimWidthPx;
    const viewportH = recomposition.format.trimHeightPx;

    manifestItems.push({
      id: xhtmlId,
      href: xhtmlHref,
      mediaType: "application/xhtml+xml",
      properties: "svg",
    });
    manifestItems.push({
      id: imgId,
      href: imgHref,
      mediaType: imgSpec.mime,
      properties: page.pageNumber === 1 ? "cover-image" : undefined,
    });

    const spreadProp = resolveEpubSpreadProperty(page);
    spineItems.push({
      idref: xhtmlId,
      pageNumber: page.pageNumber,
      linear: "yes",
      properties: spreadProp,
    });

    const xhtml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" dir="${direction}">`,
      "<head>",
      `  <meta charset="UTF-8" />`,
      `  <meta name="viewport" content="width=${viewportW}, height=${viewportH}" />`,
      `  <title>${escapeXml(metadata.title)} - ${page.pageNumber}</title>`,
      '  <link rel="stylesheet" type="text/css" href="../styles/fixed-layout.css" />',
      "</head>",
      `<body data-page-number="${page.pageNumber}" data-page-side="${page.pageSide}" data-panel-count="${page.placedPanels.length}">`,
      `  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewportW} ${viewportH}" width="100%" height="100%">`,
      `    <image href="../${escapeXml(imgHref)}" width="${viewportW}" height="${viewportH}" />`,
      "  </svg>",
      "</body>",
      "</html>",
    ].join("\n");

    pageDocuments.push({
      pageNumber: page.pageNumber,
      href: xhtmlHref,
      viewportWidthPx: viewportW,
      viewportHeightPx: viewportH,
      xhtml,
    });
  }

  const manifestXmlLines = manifestItems.map((item) => {
    const propAttr = item.properties ? ` properties="${escapeXml(item.properties)}"` : "";
    return `    <item id="${escapeXml(item.id)}" href="${escapeXml(item.href)}" media-type="${escapeXml(item.mediaType)}"${propAttr} />`;
  });

  const spineXmlLines = spineItems.map(
    (s) =>
      `    <itemref idref="${escapeXml(s.idref)}" linear="${s.linear}" properties="${escapeXml(s.properties)}" />`
  );

  const opfXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" dir="${direction}">`,
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `    <dc:identifier id="pub-id">${escapeXml(metadata.identifier)}</dc:identifier>`,
    `    <dc:title>${escapeXml(metadata.title)}</dc:title>`,
    `    <dc:creator>${escapeXml(metadata.creator)}</dc:creator>`,
    `    <dc:language>${escapeXml(language)}</dc:language>`,
    `    <dc:publisher>${escapeXml(publisher)}</dc:publisher>`,
    `    <meta property="dcterms:modified">${escapeXml(modifiedAtIso)}</meta>`,
    '    <meta property="rendition:layout">pre-paginated</meta>',
    `    <meta property="rendition:orientation">${renditionOrientation}</meta>`,
    `    <meta property="rendition:spread">${renditionSpread}</meta>`,
    "  </metadata>",
    "  <manifest>",
    ...manifestXmlLines,
    "  </manifest>",
    `  <spine page-progression-direction="${direction}">`,
    ...spineXmlLines,
    "  </spine>",
    "</package>",
  ].join("\n");

  const manifestChecksum = computeChecksumHex(
    `${opfXml}\n${pageDocuments.map((d) => d.xhtml).join("\n")}`
  );

  return {
    identifier: metadata.identifier,
    title: metadata.title,
    language,
    formatId: recomposition.format.formatId,
    pageProgressionDirection: direction,
    renditionLayout: "pre-paginated",
    renditionOrientation,
    renditionSpread,
    manifestItems,
    spineItems,
    pageDocuments,
    opfXml,
    manifestChecksum,
  };
}

/**
 * 단일 인쇄 페이지의 재단선·도련선·제본 안전선·컷 크롭 변환·레지스트레이션 타깃·CMYK 컬러바를
 * 밀리미터 단위 결정론적 SVG 마크업으로 렌더링한다.
 */
export function renderPrintPagePrepressSvg(
  page: RecomposedPrintPage,
  impositionPage: PrintImpositionPageSpec,
  options: PrepressSvgRenderOptions = {}
): PrepressSvgRenderResult {
  const includeGazeFlow = options.includeGazeFlowOverlay ?? true;
  const includeBalloons = options.includeBalloonBoxes ?? true;
  const includeFocal = options.includeFocalSubjectBoxes ?? true;
  const includeColorBar = options.includeColorBar ?? true;
  const includeSlugText = options.includeSlugText ?? true;

  const ox = impositionPage.trimOriginOffsetXMm;
  const oy = impositionPage.trimOriginOffsetYMm;
  const sheetW = impositionPage.sheetWidthMm;
  const sheetH = impositionPage.sheetHeightMm;

  const bleedX = ox + page.bleedBoxMm.xMm;
  const bleedY = oy + page.bleedBoxMm.yMm;
  const safeX = ox + page.liveSafeBoxMm.xMm;
  const safeY = oy + page.liveSafeBoxMm.yMm;

  const spineRectSvg = page.spineZoneMm
    ? `<rect data-spine-edge="${page.spineEdge}" x="${fmtMm(ox + page.spineZoneMm.xMm)}" y="${fmtMm(oy + page.spineZoneMm.yMm)}" width="${fmtMm(page.spineZoneMm.widthMm)}" height="${fmtMm(page.spineZoneMm.heightMm)}" fill="${SVG_SPINE_FILL}" stroke="none" />`
    : "";

  // 컷 프레임 및 크롭/배율 변환 그룹
  const panelParts: string[] = [];
  for (const panel of page.placedPanels) {
    const slotX = ox + panel.slotFrameMm.xMm;
    const slotY = oy + panel.slotFrameMm.yMm;
    const contentX = ox + panel.contentFrameMm.xMm;
    const contentY = oy + panel.contentFrameMm.yMm;
    const tx = contentX - panel.sourceCropPx.x * panel.scaleMmPerPx;
    const ty = contentY - panel.sourceCropPx.y * panel.scaleMmPerPx;
    const scaleStr = fmtMm(panel.scaleMmPerPx);

    const balloonRects = includeBalloons
      ? panel.mappedSpeechBalloonsMm
          .map(
            (b, idx) =>
              `<rect data-balloon-index="${idx}" x="${fmtMm(ox + b.xMm)}" y="${fmtMm(oy + b.yMm)}" width="${fmtMm(b.widthMm)}" height="${fmtMm(b.heightMm)}" fill="none" stroke="${SVG_BALLOON_STROKE}" stroke-width="0.25" stroke-dasharray="1.2 0.8" />`
          )
          .join("")
      : "";

    const focalRect =
      includeFocal && panel.mappedFocalSubjectMm
        ? `<rect data-focal="true" x="${fmtMm(ox + panel.mappedFocalSubjectMm.xMm)}" y="${fmtMm(oy + panel.mappedFocalSubjectMm.yMm)}" width="${fmtMm(panel.mappedFocalSubjectMm.widthMm)}" height="${fmtMm(panel.mappedFocalSubjectMm.heightMm)}" fill="none" stroke="${SVG_FOCAL_STROKE}" stroke-width="0.25" />`
        : "";

    panelParts.push(
      [
        `<g data-panel-id="${escapeXml(panel.panelId)}" data-reading-order="${panel.readingOrderOnPage}" data-fit-mode="${panel.fitMode}" data-full-bleed="${panel.isFullBleed}" data-crop-x="${fmtMm(panel.sourceCropPx.x)}" data-crop-y="${fmtMm(panel.sourceCropPx.y)}" data-crop-w="${fmtMm(panel.sourceCropPx.width)}" data-crop-h="${fmtMm(panel.sourceCropPx.height)}" data-scale-mm-per-px="${scaleStr}">`,
        `  <rect x="${fmtMm(slotX)}" y="${fmtMm(slotY)}" width="${fmtMm(panel.slotFrameMm.widthMm)}" height="${fmtMm(panel.slotFrameMm.heightMm)}" fill="${SVG_PANEL_FILL}" stroke="${SVG_PANEL_STROKE}" stroke-width="0.3" />`,
        `  <g data-artwork-transform="true" transform="translate(${fmtMm(tx)} ${fmtMm(ty)}) scale(${scaleStr})">`,
        `    <rect x="${fmtMm(panel.sourceCropPx.x)}" y="${fmtMm(panel.sourceCropPx.y)}" width="${fmtMm(panel.sourceCropPx.width)}" height="${fmtMm(panel.sourceCropPx.height)}" fill="none" stroke="none" />`,
        "  </g>",
        `  ${focalRect}${balloonRects}`,
        "</g>",
      ].join("\n")
    );
  }

  // 시선 동선 폴리라인
  const gazeSvg =
    includeGazeFlow && page.gazeFlow.gazePathPointsMm.length >= 2
      ? `<g data-layer="gaze-flow"><polyline points="${page.gazeFlow.gazePathPointsMm
          .map((pt) => `${fmtMm(ox + pt.xMm)},${fmtMm(oy + pt.yMm)}`)
          .join(" ")}" fill="none" stroke="${SVG_GAZE_STROKE}" stroke-width="0.4" stroke-dasharray="2 1" /></g>`
      : "";

  // 재단선 및 도련 표식
  const markLinesSvg = [...impositionPage.cropMarks, ...impositionPage.bleedMarks]
    .map(
      (m) =>
        `<line data-mark-id="${escapeXml(m.id)}" data-mark-kind="${m.kind}" x1="${fmtMm(m.x1Mm)}" y1="${fmtMm(m.y1Mm)}" x2="${fmtMm(m.x2Mm)}" y2="${fmtMm(m.y2Mm)}" stroke="${m.kind === "crop" ? SVG_REG_STROKE : SVG_BLEED_STROKE}" stroke-width="0.15" />`
    )
    .join("\n    ");

  // 레지스트레이션 타깃
  const regMarksSvg = impositionPage.registrationMarks
    .map((r) => {
      const half = r.crosshairLengthMm * 0.5;
      return [
        `<g data-reg-id="${escapeXml(r.id)}" data-plate="registration-all-plates">`,
        `  <circle cx="${fmtMm(r.centerXMm)}" cy="${fmtMm(r.centerYMm)}" r="${fmtMm(r.radiusMm)}" fill="none" stroke="${SVG_REG_STROKE}" stroke-width="0.15" />`,
        `  <line x1="${fmtMm(r.centerXMm - half)}" y1="${fmtMm(r.centerYMm)}" x2="${fmtMm(r.centerXMm + half)}" y2="${fmtMm(r.centerYMm)}" stroke="${SVG_REG_STROKE}" stroke-width="0.15" />`,
        `  <line x1="${fmtMm(r.centerXMm)}" y1="${fmtMm(r.centerYMm - half)}" x2="${fmtMm(r.centerXMm)}" y2="${fmtMm(r.centerYMm + half)}" stroke="${SVG_REG_STROKE}" stroke-width="0.15" />`,
        "</g>",
      ].join("");
    })
    .join("\n    ");

  // CMYK 컬러 컨트롤바
  const colorBarSvg = includeColorBar
    ? [
        '  <g data-layer="cmyk-color-bar">',
        ...impositionPage.colorBarPatches.map(
          (p) =>
            `    <rect data-patch-id="${escapeXml(p.id)}" data-cmyk="${p.c},${p.m},${p.y},${p.k}" x="${fmtMm(p.xMm)}" y="${fmtMm(p.yMm)}" width="${fmtMm(p.widthMm)}" height="${fmtMm(p.heightMm)}" fill="${p.previewOklch}" stroke="${SVG_REG_STROKE}" stroke-width="0.1" />`
        ),
        "  </g>",
      ].join("\n")
    : "";

  const slugSvg = includeSlugText
    ? `  <text data-layer="slug-caption" x="${fmtMm(ox)}" y="${fmtMm(sheetH - 3.2)}" font-family="sans-serif" font-size="2.4" fill="${SVG_REG_STROKE}">${escapeXml(impositionPage.slugCaptionText)}</text>`
    : "";

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtMm(sheetW)}mm" height="${fmtMm(sheetH)}mm" viewBox="0 0 ${fmtMm(sheetW)} ${fmtMm(sheetH)}" data-page-number="${page.pageNumber}" data-page-side="${page.pageSide}" data-spine-edge="${page.spineEdge}">`,
    `  <rect data-layer="sheet-bounds" x="0.000" y="0.000" width="${fmtMm(sheetW)}" height="${fmtMm(sheetH)}" fill="${SVG_SHEET_BG}" />`,
    `  <rect data-layer="bleed-box" x="${fmtMm(bleedX)}" y="${fmtMm(bleedY)}" width="${fmtMm(page.bleedBoxMm.widthMm)}" height="${fmtMm(page.bleedBoxMm.heightMm)}" fill="none" stroke="${SVG_BLEED_STROKE}" stroke-width="0.25" stroke-dasharray="2 1" />`,
    `  <rect data-layer="trim-box" x="${fmtMm(ox)}" y="${fmtMm(oy)}" width="${fmtMm(page.trimBoxMm.widthMm)}" height="${fmtMm(page.trimBoxMm.heightMm)}" fill="none" stroke="${SVG_TRIM_STROKE}" stroke-width="0.3" />`,
    `  <g data-layer="live-safe-box">`,
    `    ${spineRectSvg}`,
    `    <rect x="${fmtMm(safeX)}" y="${fmtMm(safeY)}" width="${fmtMm(page.liveSafeBoxMm.widthMm)}" height="${fmtMm(page.liveSafeBoxMm.heightMm)}" fill="none" stroke="${SVG_SAFE_STROKE}" stroke-width="0.25" stroke-dasharray="1.5 1.5" />`,
    "  </g>",
    '  <g data-layer="panels">',
    ...panelParts.map((part) => `    ${part}`),
    "  </g>",
    `  ${gazeSvg}`,
    '  <g data-layer="crop-and-registration-marks">',
    `    ${markLinesSvg}`,
    `    ${regMarksSvg}`,
    "  </g>",
    colorBarSvg,
    slugSvg,
    "</svg>",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");

  const hasInvalidNumber = /\b(?:NaN|Infinity|-Infinity)\b/.test(svgMarkup);

  return {
    pageNumber: page.pageNumber,
    sheetWidthMm: sheetW,
    sheetHeightMm: sheetH,
    svgMarkup,
    panelTransformCount: page.placedPanels.length,
    cropMarkCount: impositionPage.cropMarks.length,
    registrationMarkCount: impositionPage.registrationMarks.length,
    colorBarPatchCount: includeColorBar ? impositionPage.colorBarPatches.length : 0,
    hasInvalidNumber,
  };
}
