/**
 * 출판 플랫폼·인쇄 규격 상수, Rights BOM 계약 타입, CMYK TAC 300% 잉크 제한 및
 * 실시간 소프트프루핑 색변환 엔진(₩0 브라우저 로컬 연산).
 */

export type PublishTargetSpecId =
  | "naver-webtoon-690"
  | "naver-webtoon-800"
  | "kakaopage-720"
  | "line-webtoon-global-800x1280"
  | "tapas-940"
  | "print-book-cmyk-pdfx4"
  | "epub3-fixed-layout"
  | "cbz-comic-archive";

export type SliceImageFormat = "jpg" | "png" | "webp" | "tiff";
export type PrintPaperProfileId = "coated-fogra39" | "japan-color-2001-coated" | "uncoated-book";

export interface PlatformPublishSpec {
  readonly id: PublishTargetSpecId;
  readonly labelKo: string;
  readonly category: "webtoon-scroll" | "print-pdfx4" | "ebook-archive";
  readonly requiredWidthPx: number | null;
  readonly maxSliceHeightPx: number | null;
  readonly maxSingleSliceBytes: number;
  readonly maxEpisodeTotalBytes: number;
  readonly allowedFormats: readonly SliceImageFormat[];
  readonly colorSpace: "sRGB" | "CMYK-PDFX4";
  readonly minDpi: number;
  readonly minBleedMm: number;
  readonly maxTacPercent: number | null;
}

const MB = 1024 * 1024;

export const PLATFORM_PUBLISH_SPECS: Readonly<Record<PublishTargetSpecId, PlatformPublishSpec>> = {
  "naver-webtoon-690": {
    id: "naver-webtoon-690",
    labelKo: "네이버 웹툰 (도전/베스트 690px)",
    category: "webtoon-scroll",
    requiredWidthPx: 690,
    maxSliceHeightPx: 2000,
    maxSingleSliceBytes: 2 * MB,
    maxEpisodeTotalBytes: 20 * MB,
    allowedFormats: ["jpg", "png"],
    colorSpace: "sRGB",
    minDpi: 72,
    minBleedMm: 0,
    maxTacPercent: null,
  },
  "naver-webtoon-800": {
    id: "naver-webtoon-800",
    labelKo: "네이버 웹툰 (정식 연재 800px)",
    category: "webtoon-scroll",
    requiredWidthPx: 800,
    maxSliceHeightPx: 1600,
    maxSingleSliceBytes: 2 * MB,
    maxEpisodeTotalBytes: 20 * MB,
    allowedFormats: ["jpg", "png"],
    colorSpace: "sRGB",
    minDpi: 72,
    minBleedMm: 0,
    maxTacPercent: null,
  },
  "kakaopage-720": {
    id: "kakaopage-720",
    labelKo: "카카오페이지 (720px)",
    category: "webtoon-scroll",
    requiredWidthPx: 720,
    maxSliceHeightPx: 2000,
    maxSingleSliceBytes: 2 * MB,
    maxEpisodeTotalBytes: 25 * MB,
    allowedFormats: ["jpg", "png"],
    colorSpace: "sRGB",
    minDpi: 72,
    minBleedMm: 0,
    maxTacPercent: null,
  },
  "line-webtoon-global-800x1280": {
    id: "line-webtoon-global-800x1280",
    labelKo: "라인 웹툰 글로벌 (800×1280)",
    category: "webtoon-scroll",
    requiredWidthPx: 800,
    maxSliceHeightPx: 1280,
    maxSingleSliceBytes: 2 * MB,
    maxEpisodeTotalBytes: 20 * MB,
    allowedFormats: ["jpg", "png"],
    colorSpace: "sRGB",
    minDpi: 72,
    minBleedMm: 0,
    maxTacPercent: null,
  },
  "tapas-940": {
    id: "tapas-940",
    labelKo: "타파스 글로벌 (940px)",
    category: "webtoon-scroll",
    requiredWidthPx: 940,
    maxSliceHeightPx: 4000,
    maxSingleSliceBytes: 2 * MB,
    maxEpisodeTotalBytes: 40 * MB,
    allowedFormats: ["jpg", "png"],
    colorSpace: "sRGB",
    minDpi: 72,
    minBleedMm: 0,
    maxTacPercent: null,
  },
  "print-book-cmyk-pdfx4": {
    id: "print-book-cmyk-pdfx4",
    labelKo: "단행본 인쇄 CMYK PDF/X-4 (300 DPI · 3mm 도련 · TAC ≤ 300%)",
    category: "print-pdfx4",
    requiredWidthPx: null,
    maxSliceHeightPx: null,
    maxSingleSliceBytes: 50 * MB,
    maxEpisodeTotalBytes: 500 * MB,
    allowedFormats: ["png", "tiff", "jpg"],
    colorSpace: "CMYK-PDFX4",
    minDpi: 300,
    minBleedMm: 3,
    maxTacPercent: 300,
  },
  "epub3-fixed-layout": {
    id: "epub3-fixed-layout",
    labelKo: "EPUB 3.3 고정 레이아웃 전자책",
    category: "ebook-archive",
    requiredWidthPx: null,
    maxSliceHeightPx: null,
    maxSingleSliceBytes: 5 * MB,
    maxEpisodeTotalBytes: 150 * MB,
    allowedFormats: ["jpg", "png", "webp"],
    colorSpace: "sRGB",
    minDpi: 150,
    minBleedMm: 0,
    maxTacPercent: null,
  },
  "cbz-comic-archive": {
    id: "cbz-comic-archive",
    labelKo: "CBZ 코믹 아카이브 (ComicInfo.xml 포함)",
    category: "ebook-archive",
    requiredWidthPx: null,
    maxSliceHeightPx: null,
    maxSingleSliceBytes: 8 * MB,
    maxEpisodeTotalBytes: 200 * MB,
    allowedFormats: ["jpg", "png", "webp"],
    colorSpace: "sRGB",
    minDpi: 150,
    minBleedMm: 0,
    maxTacPercent: null,
  },
};

export interface RoyaltySplitShare {
  readonly creatorId: string;
  readonly displayName: string;
  readonly role: "story" | "art" | "coloring" | "background" | "lettering" | "assistant";
  readonly sharePercent: number;
}

export interface RightsBomAssetRecord {
  readonly assetId: string;
  readonly name: string;
  readonly kind: "font" | "brush" | "3d-prop" | "texture" | "audio" | "reference";
  readonly licenseCode: string;
  readonly commercialAllowed: boolean;
  readonly attributionRequired: boolean;
  readonly attributionText?: string;
}

export interface PublishRightsBom {
  readonly workId: string;
  readonly episodeId: string;
  readonly title: string;
  readonly language: string;
  readonly publisherName?: string;
  readonly isbn?: string;
  readonly generatedAtIso: string;
  readonly royaltySplits: readonly RoyaltySplitShare[];
  readonly assets: readonly RightsBomAssetRecord[];
}

export interface ManuscriptSliceInput {
  readonly sliceId: string;
  readonly fileName: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly format: SliceImageFormat;
  readonly byteLength: number;
  readonly dpi?: number;
  readonly bleedMm?: number;
  readonly trimWidthMm?: number;
  readonly trimHeightMm?: number;
  readonly rgba?: Uint8Array | Uint8ClampedArray;
  readonly reportedMaxTacPercent?: number;
  readonly rawBytes?: Uint8Array;
}

export interface CmykSample {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly rawTacPercent: number;
  readonly clampedTacPercent: number;
  readonly exceededTac: boolean;
}

export interface SoftProofRgbSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly outOfGamutDelta: number;
}

export interface TacHotspotCell {
  readonly gridX: number;
  readonly gridY: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly maxTacPercent: number;
  readonly overLimitRatio: number;
}

export interface PrintSoftProofAudit {
  readonly width: number;
  readonly height: number;
  readonly paperProfile: PrintPaperProfileId;
  readonly maxTacLimitPercent: number;
  readonly maxObservedRawTacPercent: number;
  readonly maxClampedTacPercent: number;
  readonly p99RawTacPercent: number;
  readonly overLimitPixelCount: number;
  readonly overLimitRatio: number;
  readonly hotspots: readonly TacHotspotCell[];
  readonly softProofRgba: Uint8ClampedArray;
}

export interface PaperProfileSpec {
  readonly iccName: string;
  readonly paperWhite: readonly [number, number, number];
  readonly dotGain: number;
  readonly inkDensity: number;
}

export const PRINT_PAPER_PROFILES: Readonly<Record<PrintPaperProfileId, PaperProfileSpec>> = {
  "coated-fogra39": {
    iccName: "ISO Coated v2 300% (ECI / FOGRA39)",
    paperWhite: [250, 249, 245],
    dotGain: 0.14,
    inkDensity: 0.94,
  },
  "japan-color-2001-coated": {
    iccName: "Japan Color 2001 Coated (300% TAC)",
    paperWhite: [251, 250, 246],
    dotGain: 0.13,
    inkDensity: 0.95,
  },
  "uncoated-book": {
    iccName: "PSO Uncoated v3 (FOGRA52)",
    paperWhite: [244, 239, 228],
    dotGain: 0.22,
    inkDensity: 0.86,
  },
};

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * sRGB(0..255)를 인쇄용 CMYK로 변환하고 TAC(Total Area Coverage) 상한을 검증·제한한다.
 */
export function srgbToPrintCmyk(
  r: number,
  g: number,
  b: number,
  options?: { readonly maxTacPercent?: number; readonly gcrStrength?: number },
): CmykSample {
  const maxTac = options?.maxTacPercent ?? 300;
  const gcr = clamp01(options?.gcrStrength ?? 0.65);

  const rawC = 1 - clamp01(r / 255);
  const rawM = 1 - clamp01(g / 255);
  const rawY = 1 - clamp01(b / 255);
  const minCmy = Math.min(rawC, rawM, rawY);

  const k = Math.min(0.95, minCmy * (0.55 + 0.4 * gcr));
  let c = clamp01(rawC - k * gcr * 0.72);
  let m = clamp01(rawM - k * gcr * 0.72);
  let y = clamp01(rawY - k * gcr * 0.72);
  const rawTacPercent = (c + m + y + k) * 100;
  const exceededTac = rawTacPercent > maxTac + 1e-6;

  if (exceededTac) {
    const allowedCmySum = Math.max(0, maxTac / 100 - k);
    const currentCmySum = c + m + y;
    if (currentCmySum > 1e-6) {
      const scale = Math.min(1, allowedCmySum / currentCmySum);
      c *= scale;
      m *= scale;
      y *= scale;
    }
  }

  return {
    c: round3(c),
    m: round3(m),
    y: round3(y),
    k: round3(k),
    rawTacPercent: round3(rawTacPercent),
    clampedTacPercent: round3((c + m + y + k) * 100),
    exceededTac,
  };
}

/**
 * 인쇄 CMYK 샘플과 용지 프로파일을 기반으로 실시간 소프트프루핑 sRGB 미리보기를 계산한다.
 */
export function cmykToSoftProofRgb(
  cmyk: Pick<CmykSample, "c" | "m" | "y" | "k">,
  paperProfile: PrintPaperProfileId = "coated-fogra39",
): SoftProofRgbSample {
  const profile = PRINT_PAPER_PROFILES[paperProfile];
  const gain = (ink: number): number => {
    const v = clamp01(ink);
    return clamp01(v + profile.dotGain * v * (1 - v));
  };

  const cg = gain(cmyk.c);
  const mg = gain(cmyk.m);
  const yg = gain(cmyk.y);
  const kg = gain(cmyk.k);

  const redRefl = (1 - cg * 0.89 - mg * 0.08 - yg * 0.02) * (1 - kg * profile.inkDensity);
  const grnRefl = (1 - mg * 0.86 - cg * 0.11 - yg * 0.05) * (1 - kg * profile.inkDensity);
  const bluRefl = (1 - yg * 0.87 - mg * 0.14 - cg * 0.06) * (1 - kg * profile.inkDensity);

  const r = clampByte(profile.paperWhite[0] * clamp01(redRefl));
  const g = clampByte(profile.paperWhite[1] * clamp01(grnRefl));
  const b = clampByte(profile.paperWhite[2] * clamp01(bluRefl));

  const idealR = 255 * (1 - cmyk.c) * (1 - cmyk.k);
  const idealG = 255 * (1 - cmyk.m) * (1 - cmyk.k);
  const idealB = 255 * (1 - cmyk.y) * (1 - cmyk.k);

  return {
    r,
    g,
    b,
    outOfGamutDelta: round3(Math.sqrt((r - idealR) ** 2 + (g - idealG) ** 2 + (b - idealB) ** 2) / 255),
  };
}

/**
 * RGBA 픽셀 버퍼 전체의 TAC(잉크 총량) 위반 영역을 감사하고 실시간 소프트프루핑 RGBA 버퍼를 생성한다.
 */
export function auditAndSoftProofRgbaBuffer(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options?: {
    readonly maxTacPercent?: number;
    readonly paperProfile?: PrintPaperProfileId;
    readonly gcrStrength?: number;
    readonly gridDivisions?: number;
  },
): PrintSoftProofAudit {
  const maxTacLimitPercent = options?.maxTacPercent ?? 300;
  const paperProfile = options?.paperProfile ?? "coated-fogra39";
  const gcrStrength = options?.gcrStrength ?? 0.65;
  const gridDivisions = Math.max(1, Math.min(16, options?.gridDivisions ?? 4));

  const pixelCount = width * height;
  const softProofRgba = new Uint8ClampedArray(pixelCount * 4);
  const rawTacSamples: number[] = [];
  const cellCounts = new Int32Array(gridDivisions * gridDivisions);
  const cellOver = new Int32Array(gridDivisions * gridDivisions);
  const cellMaxTac = new Float32Array(gridDivisions * gridDivisions);

  let maxObservedRawTacPercent = 0;
  let maxClampedTacPercent = 0;
  let overLimitPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const gy = Math.min(gridDivisions - 1, Math.floor((y / Math.max(1, height)) * gridDivisions));
    for (let x = 0; x < width; x += 1) {
      const gx = Math.min(gridDivisions - 1, Math.floor((x / Math.max(1, width)) * gridDivisions));
      const idx = (y * width + x) * 4;
      const a = rgba[idx + 3] ?? 255;
      const alpha = a / 255;
      const compR = Math.round((rgba[idx] ?? 255) * alpha + 255 * (1 - alpha));
      const compG = Math.round((rgba[idx + 1] ?? 255) * alpha + 255 * (1 - alpha));
      const compB = Math.round((rgba[idx + 2] ?? 255) * alpha + 255 * (1 - alpha));

      const cmyk = srgbToPrintCmyk(compR, compG, compB, {
        maxTacPercent: maxTacLimitPercent,
        gcrStrength,
      });
      const proof = cmykToSoftProofRgb(cmyk, paperProfile);
      softProofRgba[idx] = proof.r;
      softProofRgba[idx + 1] = proof.g;
      softProofRgba[idx + 2] = proof.b;
      softProofRgba[idx + 3] = a;

      rawTacSamples.push(cmyk.rawTacPercent);
      if (cmyk.rawTacPercent > maxObservedRawTacPercent) maxObservedRawTacPercent = cmyk.rawTacPercent;
      if (cmyk.clampedTacPercent > maxClampedTacPercent) maxClampedTacPercent = cmyk.clampedTacPercent;

      const cellIdx = gy * gridDivisions + gx;
      cellCounts[cellIdx] += 1;
      if (cmyk.rawTacPercent > cellMaxTac[cellIdx]) cellMaxTac[cellIdx] = cmyk.rawTacPercent;
      if (cmyk.exceededTac) {
        overLimitPixelCount += 1;
        cellOver[cellIdx] += 1;
      }
    }
  }

  rawTacSamples.sort((a, b) => a - b);
  const p99RawTacPercent =
    rawTacSamples.length > 0
      ? rawTacSamples[Math.min(rawTacSamples.length - 1, Math.floor(rawTacSamples.length * 0.99))]
      : 0;

  const hotspots: TacHotspotCell[] = [];
  for (let gy = 0; gy < gridDivisions; gy += 1) {
    for (let gx = 0; gx < gridDivisions; gx += 1) {
      const cellIdx = gy * gridDivisions + gx;
      if (cellOver[cellIdx] > 0) {
        hotspots.push({
          gridX: gx,
          gridY: gy,
          normalizedX: round3((gx + 0.5) / gridDivisions),
          normalizedY: round3((gy + 0.5) / gridDivisions),
          maxTacPercent: round3(cellMaxTac[cellIdx]),
          overLimitRatio: round3(cellOver[cellIdx] / Math.max(1, cellCounts[cellIdx])),
        });
      }
    }
  }

  return {
    width,
    height,
    paperProfile,
    maxTacLimitPercent,
    maxObservedRawTacPercent: round3(maxObservedRawTacPercent),
    maxClampedTacPercent: round3(maxClampedTacPercent),
    p99RawTacPercent: round3(p99RawTacPercent),
    overLimitPixelCount,
    overLimitRatio: round3(overLimitPixelCount / Math.max(1, pixelCount)),
    hotspots,
    softProofRgba,
  };
}
