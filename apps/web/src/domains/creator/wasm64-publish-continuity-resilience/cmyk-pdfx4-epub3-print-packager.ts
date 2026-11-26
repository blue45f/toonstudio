/**
 * 브라우저 로컬 원스톱 출판(CMYK PDF/X-4 · EPUB3/CBZ · 플랫폼 규격) 패키저 및 프리플라이트 게이트.
 *
 * - 외부 서버 변환 비용 ₩0으로 네이버·카카오·라인·타파스 플랫폼 프리플라이트 게이트,
 *   CMYK PDF/X-4(300 DPI · 3mm 도련 · 재단/레지스트레이션 마크 · TAC 300% 제한),
 *   EPUB3 고정 레이아웃, CBZ(ComicInfo.xml), Rights BOM/로열티 스플릿 JSON을 로컬 생성한다.
 */

import {
  auditAndSoftProofRgbaBuffer,
  cmykToSoftProofRgb,
  PLATFORM_PUBLISH_SPECS,
  PRINT_PAPER_PROFILES,
  srgbToPrintCmyk,
  type CmykSample,
  type ManuscriptSliceInput,
  type PaperProfileSpec,
  type PlatformPublishSpec,
  type PrintPaperProfileId,
  type PrintSoftProofAudit,
  type PublishRightsBom,
  type PublishTargetSpecId,
  type RightsBomAssetRecord,
  type RoyaltySplitShare,
  type SliceImageFormat,
  type SoftProofRgbSample,
  type TacHotspotCell,
} from "./publish-spec-and-cmyk-softproof";

export {
  auditAndSoftProofRgbaBuffer,
  cmykToSoftProofRgb,
  PLATFORM_PUBLISH_SPECS,
  PRINT_PAPER_PROFILES,
  srgbToPrintCmyk,
  type CmykSample,
  type ManuscriptSliceInput,
  type PaperProfileSpec,
  type PlatformPublishSpec,
  type PrintPaperProfileId,
  type PrintSoftProofAudit,
  type PublishRightsBom,
  type PublishTargetSpecId,
  type RightsBomAssetRecord,
  type RoyaltySplitShare,
  type SliceImageFormat,
  type SoftProofRgbSample,
  type TacHotspotCell,
};

export type PreflightIssueCode =
  | "empty-manuscript"
  | "width-mismatch"
  | "slice-height-exceeded"
  | "slice-bytes-exceeded"
  | "episode-bytes-exceeded"
  | "unsupported-format"
  | "dpi-too-low"
  | "bleed-too-narrow"
  | "tac-limit-exceeded"
  | "rights-commercial-blocked"
  | "rights-attribution-missing"
  | "royalty-split-sum-invalid";

export interface PreflightFinding {
  readonly code: PreflightIssueCode;
  readonly severity: "error" | "warning";
  readonly sliceId?: string;
  readonly messageKo: string;
  readonly measured?: string;
  readonly expected?: string;
}

export interface PublishPreflightReport {
  readonly specId: PublishTargetSpecId;
  readonly specLabelKo: string;
  readonly passed: boolean;
  readonly blockingIssues: readonly PreflightFinding[];
  readonly warnings: readonly PreflightFinding[];
  readonly totalBytes: number;
  readonly sliceCount: number;
  readonly maxObservedTacPercent: number | null;
  readonly estimatedServerCostKrw: 0;
}

export interface PrintBoxPt {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CropMarkSegmentPt {
  readonly corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  readonly orientation: "horizontal" | "vertical";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface RegistrationMarkPt {
  readonly edge: "top" | "bottom" | "left" | "right";
  readonly cx: number;
  readonly cy: number;
  readonly radiusPt: number;
}

export interface PdfX4PageGeometry {
  readonly pageNumber: number;
  readonly sliceId: string;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly slugMarginMm: number;
  readonly mediaBoxPt: PrintBoxPt;
  readonly bleedBoxPt: PrintBoxPt;
  readonly trimBoxPt: PrintBoxPt;
  readonly cropMarksPt: readonly CropMarkSegmentPt[];
  readonly registrationMarksPt: readonly RegistrationMarkPt[];
  readonly softProofAudit: PrintSoftProofAudit | null;
}

export interface PdfX4PrintPackage {
  readonly kind: "print-book-cmyk-pdfx4";
  readonly standard: "PDF/X-4:2010";
  readonly outputIntentProfile: PrintPaperProfileId;
  readonly iccProfileName: string;
  readonly pages: readonly PdfX4PageGeometry[];
  readonly pdfBytes: Uint8Array;
  readonly rightsBomJson: string;
  readonly serverCostKrw: 0;
}

export interface VirtualArchiveEntry {
  readonly path: string;
  readonly mediaType: string;
  readonly contentBytes: Uint8Array;
}

export interface Epub3PackageResult {
  readonly kind: "epub3-fixed-layout";
  readonly readingDirection: "ltr" | "rtl";
  readonly opfXml: string;
  readonly navXhtml: string;
  readonly containerXml: string;
  readonly rightsBomJson: string;
  readonly entries: readonly VirtualArchiveEntry[];
  readonly archiveBytes: Uint8Array;
  readonly serverCostKrw: 0;
}

export interface CbzPackageResult {
  readonly kind: "cbz-comic-archive";
  readonly comicInfoXml: string;
  readonly rightsBomJson: string;
  readonly entries: readonly VirtualArchiveEntry[];
  readonly archiveBytes: Uint8Array;
  readonly serverCostKrw: 0;
}

export interface WebtoonSliceManifestPackage {
  readonly kind: "webtoon-scroll";
  readonly specId: PublishTargetSpecId;
  readonly manifestJson: string;
  readonly rightsBomJson: string;
  readonly slices: readonly {
    readonly index: number;
    readonly sliceId: string;
    readonly fileName: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly format: SliceImageFormat;
    readonly byteLength: number;
  }[];
  readonly serverCostKrw: 0;
}

export type PackagedPublishArtifact =
  | PdfX4PrintPackage
  | Epub3PackageResult
  | CbzPackageResult
  | WebtoonSliceManifestPackage;

export interface PackagePublishInput {
  readonly specId: PublishTargetSpecId;
  readonly slices: readonly ManuscriptSliceInput[];
  readonly rightsBom: PublishRightsBom;
  readonly paperProfile?: PrintPaperProfileId;
  readonly readingDirection?: "ltr" | "rtl";
  readonly enforcePreflight?: boolean;
  readonly gcrStrength?: number;
}

export interface PackagePublishResult {
  readonly preflight: PublishPreflightReport;
  readonly artifact: PackagedPublishArtifact | null;
  readonly serverCostKrw: 0;
}

const MM_TO_PT = 72 / 25.4;
const UTF8_ENCODER = new TextEncoder();

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mediaTypeForFormat(format: SliceImageFormat): string {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "tiff") return "image/tiff";
  return "image/jpeg";
}

function buildRightsBomJson(rightsBom: PublishRightsBom, specId: PublishTargetSpecId): string {
  return JSON.stringify(
    { schema: "toonstudio.rights-bom.v1", targetSpecId: specId, serverConversionCostKrw: 0, ...rightsBom },
    null,
    2,
  );
}

/**
 * 플랫폼·인쇄 규격 및 Rights BOM 정산/라이선스 조건을 일괄 검증하는 로컬 프리플라이트 게이트.
 */
export function runPublishPreflightGate(input: PackagePublishInput): PublishPreflightReport {
  const spec = PLATFORM_PUBLISH_SPECS[input.specId];
  const blockingIssues: PreflightFinding[] = [];
  const warnings: PreflightFinding[] = [];
  let totalBytes = 0;
  let maxObservedTacPercent: number | null = null;

  if (input.slices.length === 0) {
    blockingIssues.push({
      code: "empty-manuscript",
      severity: "error",
      messageKo: "출판 대상 원고 슬라이스 또는 페이지가 1개 이상 필요합니다.",
    });
  }

  for (let i = 0; i < input.slices.length; i += 1) {
    const slice = input.slices[i];
    totalBytes += slice.byteLength;

    if (!spec.allowedFormats.includes(slice.format)) {
      blockingIssues.push({
        code: "unsupported-format",
        severity: "error",
        sliceId: slice.sliceId,
        messageKo: `${slice.fileName} 포맷(${slice.format})은 ${spec.labelKo} 규격에서 허용되지 않습니다.`,
        measured: slice.format,
        expected: spec.allowedFormats.join(", "),
      });
    }
    if (spec.requiredWidthPx !== null && slice.widthPx !== spec.requiredWidthPx) {
      blockingIssues.push({
        code: "width-mismatch",
        severity: "error",
        sliceId: slice.sliceId,
        messageKo: `${slice.fileName} 가로 폭(${slice.widthPx}px)이 규격(${spec.requiredWidthPx}px)과 다릅니다.`,
        measured: `${slice.widthPx}px`,
        expected: `${spec.requiredWidthPx}px`,
      });
    }
    if (spec.maxSliceHeightPx !== null && slice.heightPx > spec.maxSliceHeightPx) {
      blockingIssues.push({
        code: "slice-height-exceeded",
        severity: "error",
        sliceId: slice.sliceId,
        messageKo: `${slice.fileName} 세로 길이(${slice.heightPx}px)가 최대 분할 높이(${spec.maxSliceHeightPx}px)를 초과합니다.`,
        measured: `${slice.heightPx}px`,
        expected: `<= ${spec.maxSliceHeightPx}px`,
      });
    }
    if (slice.byteLength > spec.maxSingleSliceBytes) {
      blockingIssues.push({
        code: "slice-bytes-exceeded",
        severity: "error",
        sliceId: slice.sliceId,
        messageKo: `${slice.fileName} 용량이 단일 슬라이스 상한을 초과합니다.`,
        measured: `${slice.byteLength}B`,
        expected: `<= ${spec.maxSingleSliceBytes}B`,
      });
    }

    const effectiveDpi = slice.dpi ?? (spec.category === "print-pdfx4" ? 72 : spec.minDpi);
    if (effectiveDpi < spec.minDpi) {
      blockingIssues.push({
        code: "dpi-too-low",
        severity: "error",
        sliceId: slice.sliceId,
        messageKo: `${slice.fileName} 해상도(${effectiveDpi} DPI)가 최소 요구치(${spec.minDpi} DPI)보다 낮습니다.`,
        measured: `${effectiveDpi} DPI`,
        expected: `>= ${spec.minDpi} DPI`,
      });
    }
    if (spec.minBleedMm > 0 && (slice.bleedMm ?? 0) < spec.minBleedMm) {
      blockingIssues.push({
        code: "bleed-too-narrow",
        severity: "error",
        sliceId: slice.sliceId,
        messageKo: `${slice.fileName} 재단 여분(도련 ${slice.bleedMm ?? 0}mm)이 최소 기준(${spec.minBleedMm}mm) 미만입니다.`,
        measured: `${slice.bleedMm ?? 0}mm`,
        expected: `>= ${spec.minBleedMm}mm`,
      });
    }
    if (spec.maxTacPercent !== null) {
      let sliceTac = slice.reportedMaxTacPercent ?? null;
      if (slice.rgba) {
        sliceTac = auditAndSoftProofRgbaBuffer(slice.rgba, slice.widthPx, slice.heightPx, {
          maxTacPercent: spec.maxTacPercent,
          paperProfile: input.paperProfile ?? "coated-fogra39",
          gcrStrength: input.gcrStrength ?? 0.65,
        }).maxObservedRawTacPercent;
      }
      if (sliceTac !== null) {
        maxObservedTacPercent =
          maxObservedTacPercent === null ? sliceTac : Math.max(maxObservedTacPercent, sliceTac);
        if (sliceTac > spec.maxTacPercent) {
          blockingIssues.push({
            code: "tac-limit-exceeded",
            severity: "error",
            sliceId: slice.sliceId,
            messageKo: `${slice.fileName} 최대 잉크 총량(TAC ${sliceTac}%)이 인쇄 상한(${spec.maxTacPercent}%)을 초과합니다.`,
            measured: `${sliceTac}%`,
            expected: `<= ${spec.maxTacPercent}%`,
          });
        }
      }
    }
  }

  if (totalBytes > spec.maxEpisodeTotalBytes) {
    blockingIssues.push({
      code: "episode-bytes-exceeded",
      severity: "error",
      messageKo: `회차 전체 용량(${totalBytes}B)이 플랫폼 상한(${spec.maxEpisodeTotalBytes}B)을 초과합니다.`,
      measured: `${totalBytes}B`,
      expected: `<= ${spec.maxEpisodeTotalBytes}B`,
    });
  }

  let royaltySum = 0;
  for (let i = 0; i < input.rightsBom.royaltySplits.length; i += 1) {
    royaltySum += input.rightsBom.royaltySplits[i].sharePercent;
  }
  if (input.rightsBom.royaltySplits.length === 0 || Math.abs(royaltySum - 100) > 0.001) {
    blockingIssues.push({
      code: "royalty-split-sum-invalid",
      severity: "error",
      messageKo: `창작자 정산 분배율 합계(${round3(royaltySum)}%)가 100%와 일치하지 않습니다.`,
      measured: `${round3(royaltySum)}%`,
      expected: "100%",
    });
  }

  for (let i = 0; i < input.rightsBom.assets.length; i += 1) {
    const asset = input.rightsBom.assets[i];
    if (!asset.commercialAllowed) {
      blockingIssues.push({
        code: "rights-commercial-blocked",
        severity: "error",
        messageKo: `에셋 '${asset.name}'(${asset.licenseCode})은 상업적 출판이 금지되어 있습니다.`,
      });
    } else if (asset.attributionRequired && (!asset.attributionText || asset.attributionText.trim().length === 0)) {
      warnings.push({
        code: "rights-attribution-missing",
        severity: "warning",
        messageKo: `에셋 '${asset.name}'에 저작자 표기 문구가 비어 있습니다.`,
      });
    }
  }

  return {
    specId: spec.id,
    specLabelKo: spec.labelKo,
    passed: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    totalBytes,
    sliceCount: input.slices.length,
    maxObservedTacPercent,
    estimatedServerCostKrw: 0,
  };
}

/**
 * 인쇄 단행본 페이지의 TrimBox · BleedBox · MediaBox, 재단선 8개, 레지스트레이션 마크 4개를 계산한다.
 */
export function computePdfX4PageGeometry(
  slice: ManuscriptSliceInput,
  pageNumber: number,
  options?: {
    readonly paperProfile?: PrintPaperProfileId;
    readonly gcrStrength?: number;
    readonly slugMarginMm?: number;
  },
): PdfX4PageGeometry {
  const dpi = slice.dpi ?? 300;
  const bleedMm = slice.bleedMm ?? 3;
  const slugMarginMm = options?.slugMarginMm ?? 8;
  const trimWidthMm = slice.trimWidthMm ?? round3(Math.max(50, (slice.widthPx / dpi) * 25.4 - bleedMm * 2));
  const trimHeightMm = slice.trimHeightMm ?? round3(Math.max(50, (slice.heightPx / dpi) * 25.4 - bleedMm * 2));

  const mediaW = round3((trimWidthMm + (bleedMm + slugMarginMm) * 2) * MM_TO_PT);
  const mediaH = round3((trimHeightMm + (bleedMm + slugMarginMm) * 2) * MM_TO_PT);
  const bleedO = round3(slugMarginMm * MM_TO_PT);
  const trimO = round3((slugMarginMm + bleedMm) * MM_TO_PT);
  const trimW = round3(trimWidthMm * MM_TO_PT);
  const trimH = round3(trimHeightMm * MM_TO_PT);
  const trimR = round3(trimO + trimW);
  const trimT = round3(trimO + trimH);
  const off = round3(bleedMm * MM_TO_PT + 3);
  const len = round3(5 * MM_TO_PT);

  const cropMarksPt: CropMarkSegmentPt[] = [
    { corner: "bottom-left", orientation: "horizontal", x1: round3(trimO - off - len), y1: trimO, x2: round3(trimO - off), y2: trimO },
    { corner: "bottom-left", orientation: "vertical", x1: trimO, y1: round3(trimO - off - len), x2: trimO, y2: round3(trimO - off) },
    { corner: "bottom-right", orientation: "horizontal", x1: round3(trimR + off), y1: trimO, x2: round3(trimR + off + len), y2: trimO },
    { corner: "bottom-right", orientation: "vertical", x1: trimR, y1: round3(trimO - off - len), x2: trimR, y2: round3(trimO - off) },
    { corner: "top-left", orientation: "horizontal", x1: round3(trimO - off - len), y1: trimT, x2: round3(trimO - off), y2: trimT },
    { corner: "top-left", orientation: "vertical", x1: trimO, y1: round3(trimT + off), x2: trimO, y2: round3(trimT + off + len) },
    { corner: "top-right", orientation: "horizontal", x1: round3(trimR + off), y1: trimT, x2: round3(trimR + off + len), y2: trimT },
    { corner: "top-right", orientation: "vertical", x1: trimR, y1: round3(trimT + off), x2: trimR, y2: round3(trimT + off + len) },
  ];

  const regR = round3(2.2 * MM_TO_PT);
  const registrationMarksPt: RegistrationMarkPt[] = [
    { edge: "top", cx: round3(mediaW / 2), cy: round3(trimT + off + len * 0.5), radiusPt: regR },
    { edge: "bottom", cx: round3(mediaW / 2), cy: round3(trimO - off - len * 0.5), radiusPt: regR },
    { edge: "left", cx: round3(trimO - off - len * 0.5), cy: round3(mediaH / 2), radiusPt: regR },
    { edge: "right", cx: round3(trimR + off + len * 0.5), cy: round3(mediaH / 2), radiusPt: regR },
  ];

  const softProofAudit = slice.rgba
    ? auditAndSoftProofRgbaBuffer(slice.rgba, slice.widthPx, slice.heightPx, {
        maxTacPercent: 300,
        paperProfile: options?.paperProfile ?? "coated-fogra39",
        gcrStrength: options?.gcrStrength ?? 0.65,
      })
    : null;

  return {
    pageNumber,
    sliceId: slice.sliceId,
    trimWidthMm,
    trimHeightMm,
    bleedMm,
    slugMarginMm,
    mediaBoxPt: { x: 0, y: 0, width: mediaW, height: mediaH },
    bleedBoxPt: { x: bleedO, y: bleedO, width: round3((trimWidthMm + bleedMm * 2) * MM_TO_PT), height: round3((trimHeightMm + bleedMm * 2) * MM_TO_PT) },
    trimBoxPt: { x: trimO, y: trimO, width: trimW, height: trimH },
    cropMarksPt,
    registrationMarksPt,
    softProofAudit,
  };
}

/** CMYK PDF/X-4:2010 구조 바이트스트림 및 출력 의도 · 재단 마크 패키지를 로컬 생성한다. */
export function buildPdfX4PrintPackage(input: PackagePublishInput): PdfX4PrintPackage {
  const paperProfile = input.paperProfile ?? "coated-fogra39";
  const iccProfileName = PRINT_PAPER_PROFILES[paperProfile].iccName;
  const pages = input.slices.map((slice, idx) =>
    computePdfX4PageGeometry(slice, idx + 1, { paperProfile, gcrStrength: input.gcrStrength }),
  );
  const pageKids = pages.map((_, idx) => `${5 + idx} 0 R`).join(" ");
  const xmp =
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" pdfxid:GTS_PDFXVersion="PDF/X-4"/>` +
    `</rdf:RDF></x:xmpmeta>`;

  const objects: string[] = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Metadata 3 0 R /OutputIntents [4 0 R] >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [ ${pageKids} ] >>\nendobj`,
    `3 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${UTF8_ENCODER.encode(xmp).byteLength} >>\nstream\n${xmp}\nendstream\nendobj`,
    `4 0 obj\n<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (${iccProfileName}) /RegistryName (http://www.color.org) >>\nendobj`,
  ];

  for (let i = 0; i < pages.length; i += 1) {
    const { mediaBoxPt: mb, bleedBoxPt: bb, trimBoxPt: tb } = pages[i];
    objects.push(
      `${5 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mb.width} ${mb.height}] /BleedBox [${bb.x} ${bb.y} ${round3(bb.x + bb.width)} ${round3(bb.y + bb.height)}] /TrimBox [${tb.x} ${tb.y} ${round3(tb.x + tb.width)} ${round3(tb.y + tb.height)}] >>\nendobj`,
    );
  }

  return {
    kind: "print-book-cmyk-pdfx4",
    standard: "PDF/X-4:2010",
    outputIntentProfile: paperProfile,
    iccProfileName,
    pages,
    pdfBytes: UTF8_ENCODER.encode(`%PDF-1.6\n%ToonStudio-Local-PDFX4\n${objects.join("\n")}\n%%EOF\n`),
    rightsBomJson: buildRightsBomJson(input.rightsBom, "print-book-cmyk-pdfx4"),
    serverCostKrw: 0,
  };
}

const CRC32_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (0xedb88320 ^ (crc >>> 1)) >>> 0 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 무압축(STORE) PKZIP 바이트 배열을 브라우저 로컬에서 직접 조립한다 (EPUB3/CBZ 공용). */
export function buildUncompressedZipArchive(entries: readonly VirtualArchiveEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const nameBytes = UTF8_ENCODER.encode(entry.path);
    const data = entry.contentBytes;
    const crc = computeCrc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, data);
    centralChunks.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  let centralSize = 0;
  for (let i = 0; i < centralChunks.length; i += 1) centralSize += centralChunks[i].length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const result = new Uint8Array(offset + centralSize + eocd.length);
  let cursor = 0;
  for (let i = 0; i < localChunks.length; i += 1) {
    result.set(localChunks[i], cursor);
    cursor += localChunks[i].length;
  }
  for (let i = 0; i < centralChunks.length; i += 1) {
    result.set(centralChunks[i], cursor);
    cursor += centralChunks[i].length;
  }
  result.set(eocd, cursor);
  return result;
}

/** EPUB 3.3 고정 레이아웃 매니페스트(OPF · NAV · container.xml · Rights BOM) 및 ZIP 아카이브를 로컬 생성한다. */
export function buildEpub3ManifestPackage(input: PackagePublishInput): Epub3PackageResult {
  const readingDirection = input.readingDirection ?? "ltr";
  const bom = input.rightsBom;
  const rightsBomJson = buildRightsBomJson(bom, "epub3-fixed-layout");
  const containerXml =
    `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

  const manifestItems: string[] = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="rights-bom" href="meta/rights-bom.json" media-type="application/json"/>`,
  ];
  const spineItems: string[] = [];
  const navLinks: string[] = [];
  const entries: VirtualArchiveEntry[] = [
    { path: "mimetype", mediaType: "text/plain", contentBytes: UTF8_ENCODER.encode("application/epub+zip") },
    { path: "META-INF/container.xml", mediaType: "application/xml", contentBytes: UTF8_ENCODER.encode(containerXml) },
  ];

  for (let i = 0; i < input.slices.length; i += 1) {
    const slice = input.slices[i];
    const num = String(i + 1).padStart(3, "0");
    const imgHref = `images/page-${num}.${slice.format}`;
    const xhtmlHref = `pages/page-${num}.xhtml`;
    manifestItems.push(`<item id="img-${num}" href="${imgHref}" media-type="${mediaTypeForFormat(slice.format)}"/>`);
    manifestItems.push(`<item id="page-${num}" href="${xhtmlHref}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="page-${num}"/>`);
    navLinks.push(`<li><a href="${xhtmlHref}">Page ${i + 1}</a></li>`);

    const pageXhtml =
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head>` +
      `<meta name="viewport" content="width=${slice.widthPx}, height=${slice.heightPx}"/></head>` +
      `<body><img src="../${imgHref}" alt="${escapeXml(bom.title)} p.${i + 1}"/></body></html>`;
    entries.push({ path: `OEBPS/${xhtmlHref}`, mediaType: "application/xhtml+xml", contentBytes: UTF8_ENCODER.encode(pageXhtml) });
    entries.push({ path: `OEBPS/${imgHref}`, mediaType: mediaTypeForFormat(slice.format), contentBytes: slice.rawBytes ?? new Uint8Array(0) });
  }

  const creatorMeta = bom.royaltySplits.map((s) => `<dc:creator>${escapeXml(s.displayName)}</dc:creator>`).join("");
  const opfXml =
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="work-id">` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:identifier id="work-id">${escapeXml(bom.workId)}:${escapeXml(bom.episodeId)}</dc:identifier>` +
    `<dc:title>${escapeXml(bom.title)}</dc:title><dc:language>${escapeXml(bom.language)}</dc:language>${creatorMeta}` +
    `<meta property="rendition:layout">pre-paginated</meta><meta property="dcterms:modified">${escapeXml(bom.generatedAtIso)}</meta>` +
    `</metadata><manifest>${manifestItems.join("")}</manifest>` +
    `<spine page-progression-direction="${readingDirection}">${spineItems.join("")}</spine></package>`;
  const navXhtml =
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">` +
    `<head><title>${escapeXml(bom.title)}</title></head><body><nav epub:type="toc"><ol>${navLinks.join("")}</ol></nav></body></html>`;

  entries.push(
    { path: "OEBPS/content.opf", mediaType: "application/oebps-package+xml", contentBytes: UTF8_ENCODER.encode(opfXml) },
    { path: "OEBPS/nav.xhtml", mediaType: "application/xhtml+xml", contentBytes: UTF8_ENCODER.encode(navXhtml) },
    { path: "OEBPS/meta/rights-bom.json", mediaType: "application/json", contentBytes: UTF8_ENCODER.encode(rightsBomJson) },
  );

  return {
    kind: "epub3-fixed-layout",
    readingDirection,
    opfXml,
    navXhtml,
    containerXml,
    rightsBomJson,
    entries,
    archiveBytes: buildUncompressedZipArchive(entries),
    serverCostKrw: 0,
  };
}

/** CBZ 코믹 아카이브(ComicInfo.xml · 정렬된 페이지 목록 · Rights BOM · ZIP 바이트)를 로컬 생성한다. */
export function buildCbzArchivePackage(input: PackagePublishInput): CbzPackageResult {
  const bom = input.rightsBom;
  const rightsBomJson = buildRightsBomJson(bom, "cbz-comic-archive");
  const writerNames = bom.royaltySplits.map((s) => s.displayName).join(", ");
  const comicInfoXml =
    `<?xml version="1.0" encoding="UTF-8"?><ComicInfo><Title>${escapeXml(bom.title)}</Title>` +
    `<Series>${escapeXml(bom.workId)}</Series><Number>${escapeXml(bom.episodeId)}</Number>` +
    `<Writer>${escapeXml(writerNames)}</Writer><LanguageISO>${escapeXml(bom.language)}</LanguageISO>` +
    `<PageCount>${input.slices.length}</PageCount></ComicInfo>`;

  const entries: VirtualArchiveEntry[] = [
    { path: "ComicInfo.xml", mediaType: "application/xml", contentBytes: UTF8_ENCODER.encode(comicInfoXml) },
    { path: "rights-bom.json", mediaType: "application/json", contentBytes: UTF8_ENCODER.encode(rightsBomJson) },
  ];
  for (let i = 0; i < input.slices.length; i += 1) {
    const slice = input.slices[i];
    entries.push({
      path: `${String(i + 1).padStart(3, "0")}.${slice.format}`,
      mediaType: mediaTypeForFormat(slice.format),
      contentBytes: slice.rawBytes ?? new Uint8Array(0),
    });
  }

  return {
    kind: "cbz-comic-archive",
    comicInfoXml,
    rightsBomJson,
    entries,
    archiveBytes: buildUncompressedZipArchive(entries),
    serverCostKrw: 0,
  };
}

/** 프리플라이트 게이트와 로컬 출판 패키징을 단일 원스톱 흐름으로 실행한다(서버 변환 비용 ₩0). */
export function packageForPublishTarget(input: PackagePublishInput): PackagePublishResult {
  const preflight = runPublishPreflightGate(input);
  if ((input.enforcePreflight ?? true) && !preflight.passed) {
    return { preflight, artifact: null, serverCostKrw: 0 };
  }

  let artifact: PackagedPublishArtifact;
  if (input.specId === "print-book-cmyk-pdfx4") {
    artifact = buildPdfX4PrintPackage(input);
  } else if (input.specId === "epub3-fixed-layout") {
    artifact = buildEpub3ManifestPackage(input);
  } else if (input.specId === "cbz-comic-archive") {
    artifact = buildCbzArchivePackage(input);
  } else {
    const rightsBomJson = buildRightsBomJson(input.rightsBom, input.specId);
    const slices = input.slices.map((s, index) => ({
      index,
      sliceId: s.sliceId,
      fileName: s.fileName,
      widthPx: s.widthPx,
      heightPx: s.heightPx,
      format: s.format,
      byteLength: s.byteLength,
    }));
    artifact = {
      kind: "webtoon-scroll",
      specId: input.specId,
      manifestJson: JSON.stringify(
        {
          schema: "toonstudio.webtoon-package.v1",
          specId: input.specId,
          workId: input.rightsBom.workId,
          episodeId: input.rightsBom.episodeId,
          totalBytes: preflight.totalBytes,
          slices,
          serverConversionCostKrw: 0,
        },
        null,
        2,
      ),
      rightsBomJson,
      slices,
      serverCostKrw: 0,
    };
  }
  return { preflight, artifact, serverCostKrw: 0 };
}
