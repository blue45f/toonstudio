/**
 * 클라이언트 측 EPUB 3.3 고정 레이아웃(`pre-paginated`) 및 가이드 뷰(Guided-View) 패널 확대 매니페스트 생성기.
 *
 * - W3C EPUB 3.3 규격에 부합하는 `content.opf` 패키지 메타데이터(`rendition:layout="pre-paginated"`,
 *   `page-progression-direction="ltr" | "rtl"`, 결정론적 `urn:uuid:` 식별자)를 생성한다.
 * - 페이지별 고정 뷰포트 메타태그와 `<svg viewBox>` 래퍼를 포함한 XHTML 스파인 문서를 조립한다.
 * - 컷(패널) 경계를 페이지 뷰포트 안으로 엄격히 클램프하고, 컷 면적 대비 최적 스마트 줌 배율
 *   (`targetMagnification: 1.25..2.2`)과 전역 순번(`ordinal`)을 갖춘 가이드 뷰 시퀀스를 산출한다.
 */

export const EPUB_PROGRESSION_DIRECTIONS = Object.freeze(["ltr", "rtl"] as const);
export type EpubProgressionDirection = (typeof EPUB_PROGRESSION_DIRECTIONS)[number];

export const EPUB_IMAGE_MEDIA_TYPES = Object.freeze([
  "image/webp",
  "image/png",
  "image/jpeg",
] as const);
export type EpubImageMediaType = (typeof EPUB_IMAGE_MEDIA_TYPES)[number];

/** 가이드 뷰 스마트 줌 최소·최대 확대 배율 상수. */
export const MIN_GUIDED_VIEW_MAGNIFICATION = 1.25 as const;
export const MAX_GUIDED_VIEW_MAGNIFICATION = 2.2 as const;

export interface EpubRawPanelRegionInput {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 페이지 내부 읽기 순번(생략 시 `progressionDirection` 기준 Z/역-Z 정렬). */
  readonly readingOrder?: number;
  /** 스크린리더·대체 텍스트용 장면/대사 요약. */
  readonly altSummaryKo?: string;
  /** 패널 주위 여백 확장 비율(`0..0.15`, 기본 `0.03`). */
  readonly breathingPadRatio?: number;
}

export interface EpubPageSourceInput {
  readonly pageId: string;
  readonly imageHref: string;
  readonly imageMediaType?: EpubImageMediaType;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly pageTitleKo?: string;
  readonly isCoverPage?: boolean;
  readonly panels: readonly EpubRawPanelRegionInput[];
}

export interface EpubGuidedViewPackageInput {
  /** 결정론적 `urn:uuid:` 산출에 쓰이는 작품 고유 키. */
  readonly workSlug: string;
  readonly title: string;
  readonly creatorName: string;
  /** BCP-47 언어 태그(예: `"ko"`, `"en"`, `"ja"`). */
  readonly language: string;
  readonly progressionDirection: EpubProgressionDirection;
  /** `YYYY-MM-DDThh:mm:ssZ` 형식의 수정 시각(기본 `"2026-11-26T00:00:00Z"`). */
  readonly modifiedIsoUtc?: string;
  readonly pages: readonly EpubPageSourceInput[];
}

export interface ClampedViewportBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GuidedViewRegionDescriptor {
  /** 작품 전체 스파인 순서 기준 1부터 시작하는 전역 순번. */
  readonly ordinal: number;
  /** 해당 페이지 내부 1부터 시작하는 컷 순번. */
  readonly pageRegionOrdinal: number;
  readonly pageItemId: string;
  readonly pageXhtmlHref: string;
  readonly panelId: string;
  /** 페이지 뷰포트 경계(`[0..W] × [0..H]`) 안으로 클램프된 영역. */
  readonly viewportBox: ClampedViewportBox;
  /** EPUB Region-Based Navigation 백분율 미디어 프래그먼트(`#xywh=percent:...`). */
  readonly mediaFragmentHref: string;
  /** 패널 크기에 반비례해 산출된 스마트 줌 목표 배율(`1.25..2.2`). */
  readonly targetMagnification: number;
  readonly altSummaryKo: string;
}

export interface EpubSpinePageDescriptor {
  readonly pageIndex: number;
  readonly pageNumber: number;
  readonly itemId: string;
  readonly xhtmlHref: string;
  readonly imageItemId: string;
  readonly imageHref: string;
  readonly imageMediaType: EpubImageMediaType;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly spreadSlot: "left" | "right";
  readonly spineProperty: "rendition:page-spread-left" | "rendition:page-spread-right";
  readonly xhtmlContent: string;
  readonly guidedRegions: readonly GuidedViewRegionDescriptor[];
}

export interface Epub3GuidedViewManifestBundle {
  readonly packageUuidUrn: string;
  readonly language: string;
  readonly progressionDirection: EpubProgressionDirection;
  readonly modifiedIsoUtc: string;
  readonly contentOpfXml: string;
  readonly navXhtml: string;
  readonly regionNavXhtml: string;
  readonly spinePages: readonly EpubSpinePageDescriptor[];
  readonly guidedViewSequence: readonly GuidedViewRegionDescriptor[];
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function zeroPad3(n: number): string {
  if (n >= 100) return String(n);
  if (n >= 10) return `0${n}`;
  return `00${n}`;
}

/** 정규식 없이 단일 문자 스캔으로 안전한 XML 텍스트/속성 이스케이프를 수행한다. */
export function escapeXmlEntities(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      continue;
    }
    const ch = raw[i] ?? "";
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (ch === "'") out += "&apos;";
    else out += ch;
  }
  return out;
}

function hashLane32(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function hex8(word32: number): string {
  return (word32 >>> 0).toString(16).padStart(8, "0");
}

/**
 * 작품 식별 시드 문자열로부터 RFC 4122 형식의 결정론적 `urn:uuid:` 패키지 ID를 생성한다.
 */
export function deriveDeterministicEpubUuidUrn(canonicalSeed: string): string {
  const bytes = new TextEncoder().encode(`toonstudio:epub33:${canonicalSeed}`);
  const w0 = hashLane32(bytes, 0x811c9dc5);
  const w1 = hashLane32(bytes, 0x9e3779b9);
  const w2 = hashLane32(bytes, 0x517cc1b7);
  const w3 = hashLane32(bytes, 0x27d4eb2f);

  // 버전 5 비트(0101) 및 RFC 4122 변형 비트(10xx) 마스킹
  const w1Versioned = ((w1 & 0xffff0fff) | 0x00005000) >>> 0;
  const w2Variant = ((w2 & 0x3fffffff) | 0x80000000) >>> 0;

  const h0 = hex8(w0);
  const h1 = hex8(w1Versioned);
  const h2 = hex8(w2Variant);
  const h3 = hex8(w3);

  return `urn:uuid:${h0}-${h1.slice(0, 4)}-${h1.slice(4, 8)}-${h2.slice(0, 4)}-${h2.slice(4, 8)}${h3}`;
}

/**
 * 원본 컷 사각형을 페이지 뷰포트 `[0..viewportWidthPx] × [0..viewportHeightPx]` 안으로 클램프하고
 * 면적 비율 기반 스마트 줌 목표 배율(`1.25..2.2`)을 계산한다.
 */
export function clampPanelAndComputeMagnification(
  panel: EpubRawPanelRegionInput,
  viewportWidthPx: number,
  viewportHeightPx: number,
): {
  readonly viewportBox: ClampedViewportBox;
  readonly targetMagnification: number;
} {
  const safeW = Math.max(16, Math.round(viewportWidthPx));
  const safeH = Math.max(16, Math.round(viewportHeightPx));
  const rawW = Math.max(1, Number.isFinite(panel.width) ? panel.width : safeW);
  const rawH = Math.max(1, Number.isFinite(panel.height) ? panel.height : safeH);
  const padRatio = clamp(panel.breathingPadRatio ?? 0.03, 0, 0.15);
  const padPx = Math.min(rawW, rawH) * padRatio;

  const left = clamp(panel.x - padPx, 0, safeW - 1);
  const top = clamp(panel.y - padPx, 0, safeH - 1);
  const right = clamp(panel.x + rawW + padPx, left + 1, safeW);
  const bottom = clamp(panel.y + rawH + padPx, top + 1, safeH);

  const clampedWidth = roundTo(right - left, 2);
  const clampedHeight = roundTo(bottom - top, 2);

  const fitScale = Math.min(safeW / clampedWidth, safeH / clampedHeight);
  const rawMag = 0.72 + 0.54 * Math.sqrt(Math.max(1, fitScale));
  const targetMagnification = roundTo(
    clamp(rawMag, MIN_GUIDED_VIEW_MAGNIFICATION, MAX_GUIDED_VIEW_MAGNIFICATION),
    3,
  );

  return {
    viewportBox: {
      x: roundTo(left, 2),
      y: roundTo(top, 2),
      width: clampedWidth,
      height: clampedHeight,
    },
    targetMagnification,
  };
}

function sortPanelsForDirection(
  panels: readonly EpubRawPanelRegionInput[],
  direction: EpubProgressionDirection,
): EpubRawPanelRegionInput[] {
  return [...panels].sort((a, b) => {
    if (a.readingOrder !== undefined && b.readingOrder !== undefined && a.readingOrder !== b.readingOrder) {
      return a.readingOrder - b.readingOrder;
    }
    const cyA = a.y + a.height * 0.5;
    const cyB = b.y + b.height * 0.5;
    if (Math.abs(cyA - cyB) > 28) {
      return cyA - cyB;
    }
    const cxA = a.x + a.width * 0.5;
    const cxB = b.x + b.width * 0.5;
    return direction === "rtl" ? cxB - cxA : cxA - cxB;
  });
}

function buildPageSvgXhtml(params: {
  readonly language: string;
  readonly pageTitle: string;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly relativeImageHref: string;
  readonly regions: readonly GuidedViewRegionDescriptor[];
}): string {
  const langEsc = escapeXmlEntities(params.language);
  const titleEsc = escapeXmlEntities(params.pageTitle);
  const imgEsc = escapeXmlEntities(params.relativeImageHref);
  const w = params.viewportWidthPx;
  const h = params.viewportHeightPx;

  const regionSvgElements = params.regions
    .map((r) => {
      const desc = escapeXmlEntities(r.altSummaryKo);
      const idEsc = escapeXmlEntities(`panel-${r.pageRegionOrdinal}-${r.panelId}`);
      return `      <g id="${idEsc}" data-guided-ordinal="${r.ordinal}" data-target-magnification="${r.targetMagnification}">
        <desc>${desc}</desc>
        <rect x="${r.viewportBox.x}" y="${r.viewportBox.y}" width="${r.viewportBox.width}" height="${r.viewportBox.height}" fill="none" stroke="none" />
      </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${langEsc}">
  <head>
    <meta charset="UTF-8" />
    <title>${titleEsc}</title>
    <meta name="viewport" content="width=${w}, height=${h}" />
    <style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;}</style>
  </head>
  <body>
    <svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      <image href="${imgEsc}" x="0" y="0" width="${w}" height="${h}" />
      <g id="guided-view-panels">
${regionSvgElements}
      </g>
    </svg>
  </body>
</html>`;
}

function buildNavXhtml(
  language: string,
  title: string,
  pages: readonly EpubSpinePageDescriptor[],
): string {
  const langEsc = escapeXmlEntities(language);
  const titleEsc = escapeXmlEntities(title);
  const items = pages
    .map((p) => `        <li><a href="${escapeXmlEntities(p.xhtmlHref)}">${p.pageNumber}쪽</a></li>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${langEsc}">
  <head>
    <meta charset="UTF-8" />
    <title>${titleEsc} 목차</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${titleEsc}</h1>
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>`;
}

function buildRegionNavXhtml(
  language: string,
  regions: readonly GuidedViewRegionDescriptor[],
): string {
  const langEsc = escapeXmlEntities(language);
  const items = regions
    .map(
      (r) =>
        `        <li epub:type="panel" data-ordinal="${r.ordinal}" data-magnification="${r.targetMagnification}"><a href="${escapeXmlEntities(r.mediaFragmentHref)}">${escapeXmlEntities(r.altSummaryKo)}</a></li>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${langEsc}">
  <head>
    <meta charset="UTF-8" />
    <title>가이드 뷰 패널 순서</title>
  </head>
  <body>
    <nav epub:type="region-based" id="guided-view-nav">
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>`;
}

/**
 * EPUB 3.3 고정 레이아웃(`pre-paginated`) `content.opf`, 페이지별 SVG-XHTML 스파인 디스크립터,
 * 가이드 뷰 스마트 줌 패널 시퀀스를 일괄 생성한다.
 */
export function buildEpub3GuidedViewPackage(
  input: EpubGuidedViewPackageInput,
): Epub3GuidedViewManifestBundle {
  const language = input.language.trim() || "ko";
  const modifiedIsoUtc = input.modifiedIsoUtc ?? "2026-11-26T00:00:00Z";
  const packageUuidUrn = deriveDeterministicEpubUuidUrn(
    `${input.workSlug}|${input.language}|${input.progressionDirection}`,
  );

  const spinePages: EpubSpinePageDescriptor[] = [];
  const guidedViewSequence: GuidedViewRegionDescriptor[] = [];
  let globalOrdinal = 0;

  for (let idx = 0; idx < input.pages.length; idx += 1) {
    const pageSrc = input.pages[idx];
    if (!pageSrc) continue;

    const pageNumber = idx + 1;
    const itemId = `page-${zeroPad3(pageNumber)}`;
    const xhtmlHref = `pages/${itemId}.xhtml`;
    const imageItemId = `img-${zeroPad3(pageNumber)}`;
    const imageMediaType: EpubImageMediaType = pageSrc.imageMediaType ?? "image/webp";
    const viewportWidthPx = Math.max(16, Math.round(pageSrc.viewportWidthPx));
    const viewportHeightPx = Math.max(16, Math.round(pageSrc.viewportHeightPx));

    const isEvenIndex = idx % 2 === 0;
    const spreadSlot: "left" | "right" =
      input.progressionDirection === "rtl"
        ? isEvenIndex
          ? "right"
          : "left"
        : isEvenIndex
          ? "left"
          : "right";
    const spineProperty =
      spreadSlot === "left" ? "rendition:page-spread-left" : "rendition:page-spread-right";

    const orderedPanels = sortPanelsForDirection(pageSrc.panels, input.progressionDirection);
    const pageRegions: GuidedViewRegionDescriptor[] = [];

    for (let pIdx = 0; pIdx < orderedPanels.length; pIdx += 1) {
      const rawPanel = orderedPanels[pIdx];
      if (!rawPanel) continue;

      globalOrdinal += 1;
      const pageRegionOrdinal = pIdx + 1;
      const { viewportBox, targetMagnification } = clampPanelAndComputeMagnification(
        rawPanel,
        viewportWidthPx,
        viewportHeightPx,
      );

      const pctX = roundTo((viewportBox.x / viewportWidthPx) * 100, 3);
      const pctY = roundTo((viewportBox.y / viewportHeightPx) * 100, 3);
      const pctW = roundTo((viewportBox.width / viewportWidthPx) * 100, 3);
      const pctH = roundTo((viewportBox.height / viewportHeightPx) * 100, 3);
      const mediaFragmentHref = `${xhtmlHref}#xywh=percent:${pctX},${pctY},${pctW},${pctH}`;

      const region: GuidedViewRegionDescriptor = {
        ordinal: globalOrdinal,
        pageRegionOrdinal,
        pageItemId: itemId,
        pageXhtmlHref: xhtmlHref,
        panelId: rawPanel.id,
        viewportBox,
        mediaFragmentHref,
        targetMagnification,
        altSummaryKo:
          rawPanel.altSummaryKo ?? `${pageNumber}쪽 ${pageRegionOrdinal}번 컷`,
      };
      pageRegions.push(region);
      guidedViewSequence.push(region);
    }

    const relativeImageHref = pageSrc.imageHref.startsWith("../")
      ? pageSrc.imageHref
      : `../${pageSrc.imageHref}`;
    const pageTitle = pageSrc.pageTitleKo ?? `${input.title} — ${pageNumber}쪽`;
    const xhtmlContent = buildPageSvgXhtml({
      language,
      pageTitle,
      viewportWidthPx,
      viewportHeightPx,
      relativeImageHref,
      regions: pageRegions,
    });

    spinePages.push({
      pageIndex: idx,
      pageNumber,
      itemId,
      xhtmlHref,
      imageItemId,
      imageHref: pageSrc.imageHref,
      imageMediaType,
      viewportWidthPx,
      viewportHeightPx,
      spreadSlot,
      spineProperty,
      xhtmlContent,
      guidedRegions: pageRegions,
    });
  }

  const manifestEntries: string[] = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '    <item id="region-nav" href="region-nav.xhtml" media-type="application/xhtml+xml" properties="data-nav" />',
  ];

  let coverAssigned = false;
  for (let i = 0; i < spinePages.length; i += 1) {
    const sp = spinePages[i];
    const src = input.pages[i];
    if (!sp) continue;
    const isCover = Boolean(src?.isCoverPage) || (!coverAssigned && i === 0);
    if (isCover) coverAssigned = true;
    const coverProp = isCover ? ' properties="cover-image"' : "";

    manifestEntries.push(
      `    <item id="${escapeXmlEntities(sp.imageItemId)}" href="${escapeXmlEntities(sp.imageHref)}" media-type="${sp.imageMediaType}"${coverProp} />`,
    );
    manifestEntries.push(
      `    <item id="${escapeXmlEntities(sp.itemId)}" href="${escapeXmlEntities(sp.xhtmlHref)}" media-type="application/xhtml+xml" properties="svg" />`,
    );
  }

  const spineEntries = spinePages.map(
    (sp) =>
      `    <itemref idref="${escapeXmlEntities(sp.itemId)}" linear="yes" properties="${sp.spineProperty}" />`,
  );

  const firstPage = spinePages[0];
  const defaultViewportMeta = firstPage
    ? `\n    <meta property="rendition:viewport">width=${firstPage.viewportWidthPx}, height=${firstPage.viewportHeightPx}</meta>`
    : "";

  const contentOpfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:rendition="http://www.idpf.org/vocab/rendition/#" version="3.0" unique-identifier="pub-id" xml:lang="${escapeXmlEntities(language)}" rendition:layout="pre-paginated">
  <metadata>
    <dc:identifier id="pub-id">${escapeXmlEntities(packageUuidUrn)}</dc:identifier>
    <dc:title>${escapeXmlEntities(input.title)}</dc:title>
    <dc:creator>${escapeXmlEntities(input.creatorName)}</dc:creator>
    <dc:language>${escapeXmlEntities(language)}</dc:language>
    <meta property="dcterms:modified">${escapeXmlEntities(modifiedIsoUtc)}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">auto</meta>${defaultViewportMeta}
    <meta name="RegionMagnification" content="true" />
  </metadata>
  <manifest>
${manifestEntries.join("\n")}
  </manifest>
  <spine page-progression-direction="${input.progressionDirection}">
${spineEntries.join("\n")}
  </spine>
</package>`;

  const navXhtml = buildNavXhtml(language, input.title, spinePages);
  const regionNavXhtml = buildRegionNavXhtml(language, guidedViewSequence);

  return {
    packageUuidUrn,
    language,
    progressionDirection: input.progressionDirection,
    modifiedIsoUtc,
    contentOpfXml,
    navXhtml,
    regionNavXhtml,
    spinePages,
    guidedViewSequence,
  };
}
