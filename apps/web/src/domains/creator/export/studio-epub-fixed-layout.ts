/**
 * CSP 고정 레이아웃 EPUB 3.0 및 Kindle KDP 코믹 아카이브 빌더 (pagebookbindingepubexport).
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * W3C EPUB 3.0 OCF / Fixed-Layout / Kindle KDP 규격 준수 사항:
 * 1. 아카이브 0번 엔트리는 반드시 무압축(method=0), extra field 길이 0인 `mimetype` 파일이며
 *    바이트 오프셋 38부터 정확히 `application/epub+zip` 20바이트가 기록된다.
 * 2. `META-INF/container.xml`이 `OEBPS/content.opf`를 가리킨다.
 * 3. `OEBPS/content.opf`는 `rendition:layout="pre-paginated"`, `page-progression-direction="ltr"|"rtl"`,
 *    `properties="cover-image"`, `properties="nav"` 및 Kindle KDP 고정 레이아웃 메타를 포함한다.
 * 4. `OEBPS/nav.xhtml` 및 각 `OEBPS/pages/page-XXX.xhtml`(viewport 메타 포함)을 생성한다.
 */

import { calculateStudioCrc32 } from "../studio-crc32";

export type EpubPageImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export type EpubProgressionDirection = "ltr" | "rtl";

export type EpubRenditionSpread = "auto" | "landscape" | "both" | "none";

export type EpubRenditionOrientation = "auto" | "portrait" | "landscape";

export interface EpubFixedLayoutPageInput {
  readonly id?: string;
  readonly title?: string;
  readonly imageBytes: Uint8Array;
  readonly mediaType: EpubPageImageMediaType;
  readonly width: number;
  readonly height: number;
  /** 양면 합본 이미지처럼 단독 중앙 배치가 필요할 때 지정한다. */
  readonly pageSpread?: "left" | "right" | "center";
}

export interface EpubFixedLayoutBuildOptions {
  readonly identifier?: string;
  readonly title: string;
  readonly creator?: string;
  readonly language?: string;
  /** ISO-8601 UTC 시각(YYYY-MM-DDTHH:MM:SSZ). 미지정 시 결정적 고정 시각을 사용한다. */
  readonly modifiedIsoUtc?: string;
  readonly pageProgressionDirection?: EpubProgressionDirection;
  readonly renditionSpread?: EpubRenditionSpread;
  readonly renditionOrientation?: EpubRenditionOrientation;
  /** true(기본)면 Kindle KDP 코믹 호환 메타데이터(fixed-layout, original-resolution, book-type)를 삽입한다. */
  readonly kdpComicCompatible?: boolean;
  /** 별도 표지 이미지. 미지정 시 1페이지 이미지를 cover-image로 지정한다. */
  readonly coverImage?: {
    readonly bytes: Uint8Array;
    readonly mediaType: EpubPageImageMediaType;
  };
  readonly pages: readonly EpubFixedLayoutPageInput[];
}

export interface EpubFixedLayoutArchiveResult {
  readonly epubBytes: Uint8Array;
  readonly mimeType: "application/epub+zip";
  readonly pageCount: number;
  readonly entryPaths: readonly string[];
}

const ZIP_LOCAL_SIG = 0x04034b50;
const ZIP_CENTRAL_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_DOS_DATE_DETERMINISTIC = 0x5521;
const EPUB_MIMETYPE_ASCII = "application/epub+zip";

const utf8Encoder = new TextEncoder();

interface ZipWriteEntry {
  readonly path: string;
  readonly data: Uint8Array;
  readonly utf8Flag: boolean;
}

export function escapeXmlText(raw: string): string {
  return raw
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function extensionForMediaType(mediaType: EpubPageImageMediaType): string {
  switch (mediaType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
  }
}

function formatThreeDigitIndex(oneBased: number): string {
  return String(oneBased).padStart(3, "0");
}

function normalizeModifiedUtc(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(raw.trim())) {
    return raw.trim();
  }
  return "2026-01-01T00:00:00Z";
}

function buildContainerXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
    "  <rootfiles>",
    '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
    "  </rootfiles>",
    "</container>",
    "",
  ].join("\n");
}

function buildPageXhtml(params: {
  readonly pageTitle: string;
  readonly language: string;
  readonly imageRelHref: string;
  readonly width: number;
  readonly height: number;
}): string {
  const safeTitle = escapeXmlText(params.pageTitle);
  const safeLang = escapeXmlText(params.language);
  const w = Math.max(1, Math.round(params.width));
  const h = Math.max(1, Math.round(params.height));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE html>",
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${safeLang}" lang="${safeLang}">`,
    "<head>",
    '  <meta charset="UTF-8"/>',
    `  <title>${safeTitle}</title>`,
    `  <meta name="viewport" content="width=${w}, height=${h}"/>`,
    "  <style>",
    "    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ffffff; overflow: hidden; }",
    "    .page-frame { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }",
    "    svg { display: block; width: 100%; height: 100%; }",
    "  </style>",
    "</head>",
    "<body>",
    '  <div class="page-frame">',
    `    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${safeTitle}">`,
    `      <image href="${escapeXmlText(params.imageRelHref)}" width="${w}" height="${h}"/>`,
    "    </svg>",
    "  </div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function buildNavXhtml(params: {
  readonly bookTitle: string;
  readonly language: string;
  readonly pages: readonly { readonly href: string; readonly label: string }[];
}): string {
  const safeTitle = escapeXmlText(params.bookTitle);
  const safeLang = escapeXmlText(params.language);
  const tocItems = params.pages
    .map((p) => `      <li><a href="${escapeXmlText(p.href)}">${escapeXmlText(p.label)}</a></li>`)
    .join("\n");
  const firstHref = escapeXmlText(params.pages[0]?.href ?? "pages/page-001.xhtml");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE html>",
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${safeLang}" lang="${safeLang}">`,
    "<head>",
    '  <meta charset="UTF-8"/>',
    `  <title>${safeTitle} 목차</title>`,
    "</head>",
    "<body>",
    '  <nav epub:type="toc" id="toc">',
    `    <h1>${safeTitle}</h1>`,
    "    <ol>",
    tocItems,
    "    </ol>",
    "  </nav>",
    '  <nav epub:type="landmarks" hidden="hidden">',
    "    <ol>",
    `      <li><a epub:type="bodymatter" href="${firstHref}">본문 시작</a></li>`,
    "    </ol>",
    "  </nav>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function resolveSpineSpreadProperty(
  pageIndex: number,
  explicitSpread: "left" | "right" | "center" | undefined,
  direction: EpubProgressionDirection,
): string {
  if (explicitSpread === "center") return "rendition:page-spread-center";
  if (explicitSpread === "left") return "page-spread-left";
  if (explicitSpread === "right") return "page-spread-right";
  const isFirstOrEven = pageIndex % 2 === 0;
  if (direction === "rtl") {
    return isFirstOrEven ? "page-spread-right" : "page-spread-left";
  }
  return isFirstOrEven ? "page-spread-left" : "page-spread-right";
}

/** 무압축(STORED) ZIP32 아카이브를 조립한다. 0번 엔트리(mimetype)는 extra field 0바이트를 엄격히 보장한다. */
function packStoredZipArchive(entries: readonly ZipWriteEntry[]): Uint8Array {
  const prepared = entries.map((entry) => {
    const pathBytes = utf8Encoder.encode(entry.path);
    const crc32 = calculateStudioCrc32(entry.data);
    return {
      ...entry,
      pathBytes,
      crc32,
    };
  });

  let localTotalBytes = 0;
  let centralTotalBytes = 0;
  for (const item of prepared) {
    localTotalBytes += 30 + item.pathBytes.byteLength + item.data.byteLength;
    centralTotalBytes += 46 + item.pathBytes.byteLength;
  }

  const out = new Uint8Array(localTotalBytes + centralTotalBytes + 22);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const localOffsets: number[] = [];
  let cursor = 0;

  for (const item of prepared) {
    localOffsets.push(cursor);
    const flags = 0x0800; // UTF-8 경로 인코딩 플래그(비트 11)
    view.setUint32(cursor, ZIP_LOCAL_SIG, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, flags, true);
    view.setUint16(cursor + 8, 0, true); // STORED (0)
    view.setUint16(cursor + 10, 0, true);
    view.setUint16(cursor + 12, ZIP_DOS_DATE_DETERMINISTIC, true);
    view.setUint32(cursor + 14, item.crc32, true);
    view.setUint32(cursor + 18, item.data.byteLength, true);
    view.setUint32(cursor + 22, item.data.byteLength, true);
    view.setUint16(cursor + 26, item.pathBytes.byteLength, true);
    view.setUint16(cursor + 28, 0, true); // extra field length = 0
    cursor += 30;
    out.set(item.pathBytes, cursor);
    cursor += item.pathBytes.byteLength;
    out.set(item.data, cursor);
    cursor += item.data.byteLength;
  }

  const centralDirStart = cursor;
  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i]!;
    const flags = 0x0800;
    view.setUint32(cursor, ZIP_CENTRAL_SIG, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 20, true);
    view.setUint16(cursor + 8, flags, true);
    view.setUint16(cursor + 10, 0, true);
    view.setUint16(cursor + 12, 0, true);
    view.setUint16(cursor + 14, ZIP_DOS_DATE_DETERMINISTIC, true);
    view.setUint32(cursor + 16, item.crc32, true);
    view.setUint32(cursor + 20, item.data.byteLength, true);
    view.setUint32(cursor + 24, item.data.byteLength, true);
    view.setUint16(cursor + 28, item.pathBytes.byteLength, true);
    view.setUint16(cursor + 30, 0, true);
    view.setUint16(cursor + 32, 0, true);
    view.setUint16(cursor + 34, 0, true);
    view.setUint16(cursor + 36, 0, true);
    view.setUint32(cursor + 38, 0, true);
    view.setUint32(cursor + 42, localOffsets[i]!, true);
    cursor += 46;
    out.set(item.pathBytes, cursor);
    cursor += item.pathBytes.byteLength;
  }

  const centralDirBytes = cursor - centralDirStart;
  view.setUint32(cursor, ZIP_EOCD_SIG, true);
  view.setUint16(cursor + 4, 0, true);
  view.setUint16(cursor + 6, 0, true);
  view.setUint16(cursor + 8, prepared.length, true);
  view.setUint16(cursor + 10, prepared.length, true);
  view.setUint32(cursor + 12, centralDirBytes, true);
  view.setUint32(cursor + 16, centralDirStart, true);
  view.setUint16(cursor + 20, 0, true);

  return out;
}

/**
 * 고정 레이아웃 EPUB 3.0(& Kindle KDP 호환) 전자책 아카이브 바이트를 조립한다.
 */
export function buildFixedLayoutEpubArchive(
  options: EpubFixedLayoutBuildOptions,
): EpubFixedLayoutArchiveResult {
  if (options.pages.length === 0) {
    throw new Error("EPUB으로 내보낼 페이지가 최소 1장 이상 필요합니다.");
  }
  const bookTitle = options.title.trim() || "무제 단행본";
  const language = options.language?.trim() || "ko";
  const identifier = options.identifier?.trim() || "urn:toonstudio:epub:fixed-layout-v1";
  const modifiedUtc = normalizeModifiedUtc(options.modifiedIsoUtc);
  const direction: EpubProgressionDirection = options.pageProgressionDirection ?? "ltr";
  const spread: EpubRenditionSpread = options.renditionSpread ?? "landscape";
  const orientation: EpubRenditionOrientation = options.renditionOrientation ?? "auto";
  const kdpCompatible = options.kdpComicCompatible ?? true;

  const firstPage = options.pages[0]!;
  const refW = Math.max(1, Math.round(firstPage.width));
  const refH = Math.max(1, Math.round(firstPage.height));

  const manifestLines: string[] = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  ];
  const spineLines: string[] = [];
  const navEntries: { readonly href: string; readonly label: string }[] = [];
  const contentFiles: ZipWriteEntry[] = [];

  if (options.coverImage) {
    if (options.coverImage.bytes.byteLength === 0) {
      throw new Error("표지 이미지 데이터가 비어 있습니다.");
    }
    const ext = extensionForMediaType(options.coverImage.mediaType);
    const relPath = `images/cover.${ext}`;
    manifestLines.push(
      `    <item id="cover-img" href="${relPath}" media-type="${options.coverImage.mediaType}" properties="cover-image"/>`,
    );
    contentFiles.push({
      path: `OEBPS/${relPath}`,
      data: options.coverImage.bytes,
      utf8Flag: false,
    });
  }

  options.pages.forEach((page, idx) => {
    const w = Math.round(page.width);
    const h = Math.round(page.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      throw new Error(`${idx + 1}번째 페이지의 가로·세로 크기가 유효하지 않습니다.`);
    }
    if (page.imageBytes.byteLength === 0) {
      throw new Error(`${idx + 1}번째 페이지의 이미지 바이트가 비어 있습니다.`);
    }

    const num = formatThreeDigitIndex(idx + 1);
    const ext = extensionForMediaType(page.mediaType);
    const imgHref = `images/page-${num}.${ext}`;
    const pageHref = `pages/page-${num}.xhtml`;
    const isFallbackCover = !options.coverImage && idx === 0;
    const imgPropsAttr = isFallbackCover ? ' properties="cover-image"' : "";

    manifestLines.push(
      `    <item id="img-${num}" href="${imgHref}" media-type="${page.mediaType}"${imgPropsAttr}/>`,
    );
    manifestLines.push(
      `    <item id="page-${num}" href="${pageHref}" media-type="application/xhtml+xml" properties="svg"/>`,
    );

    const spreadProp = resolveSpineSpreadProperty(idx, page.pageSpread, direction);
    spineLines.push(`    <itemref idref="page-${num}" properties="${spreadProp}"/>`);

    const pageTitle = page.title?.trim() || `${idx + 1}쪽`;
    navEntries.push({ href: pageHref, label: pageTitle });

    contentFiles.push({
      path: `OEBPS/${imgHref}`,
      data: page.imageBytes,
      utf8Flag: false,
    });
    contentFiles.push({
      path: `OEBPS/${pageHref}`,
      data: utf8Encoder.encode(
        buildPageXhtml({
          pageTitle,
          language,
          imageRelHref: `../${imgHref}`,
          width: w,
          height: h,
        }),
      ),
      utf8Flag: false,
    });
  });

  const kdpMetaLines = kdpCompatible
    ? [
        '    <meta name="fixed-layout" content="true"/>',
        `    <meta name="original-resolution" content="${refW}x${refH}"/>`,
        '    <meta name="book-type" content="comic"/>',
        `    <meta name="primary-writing-mode" content="${direction === "rtl" ? "horizontal-rl" : "horizontal-lr"}"/>`,
      ]
    : [];

  const creatorLine = options.creator?.trim()
    ? `    <dc:creator>${escapeXmlText(options.creator.trim())}</dc:creator>`
    : null;

  const opfXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">',
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `    <dc:identifier id="pub-id">${escapeXmlText(identifier)}</dc:identifier>`,
    `    <dc:title>${escapeXmlText(bookTitle)}</dc:title>`,
    `    <dc:language>${escapeXmlText(language)}</dc:language>`,
    ...(creatorLine ? [creatorLine] : []),
    `    <meta property="dcterms:modified">${modifiedUtc}</meta>`,
    '    <meta property="rendition:layout">pre-paginated</meta>',
    `    <meta property="rendition:orientation">${orientation}</meta>`,
    `    <meta property="rendition:spread">${spread}</meta>`,
    ...kdpMetaLines,
    "  </metadata>",
    "  <manifest>",
    ...manifestLines,
    "  </manifest>",
    `  <spine page-progression-direction="${direction}">`,
    ...spineLines,
    "  </spine>",
    "</package>",
    "",
  ].join("\n");

  const navXml = buildNavXhtml({
    bookTitle,
    language,
    pages: navEntries,
  });

  const allEntries: ZipWriteEntry[] = [
    {
      path: "mimetype",
      data: utf8Encoder.encode(EPUB_MIMETYPE_ASCII),
      utf8Flag: false,
    },
    {
      path: "META-INF/container.xml",
      data: utf8Encoder.encode(buildContainerXml()),
      utf8Flag: false,
    },
    {
      path: "OEBPS/content.opf",
      data: utf8Encoder.encode(opfXml),
      utf8Flag: false,
    },
    {
      path: "OEBPS/nav.xhtml",
      data: utf8Encoder.encode(navXml),
      utf8Flag: false,
    },
    ...contentFiles,
  ];

  const epubBytes = packStoredZipArchive(allEntries);
  return {
    epubBytes,
    mimeType: "application/epub+zip",
    pageCount: options.pages.length,
    entryPaths: allEntries.map((e) => e.path),
  };
}
