/**
 * Studio PDF 인쇄 스펙 확장 — 단행본 인쇄용 내보내기 옵션(도련·재단 마크·CMYK·스프레드 배열).
 *
 * 기본 라이터(studio-pdf-export.ts의 buildPdfFromJpegPages)는 "페이지 크기 = 이미지 크기,
 * 여백 없음"인 화면·공유용 PDF다. 이 모듈은 그 위에 인쇄소가 요구하는 스펙을 얹는다:
 *
 * - 재단 여백(bleed): TrimBox(재단 크기) 바깥으로 BleedBox까지 이미지를 넓혀 깔고
 *   MediaBox·TrimBox·BleedBox를 페이지 사전에 명시한다. 원본 이미지는 재단 크기 기준이라
 *   도련 영역은 이미지를 균일 확대해 채운다 — 진짜 도련(재단보다 큰 원본)이 필요하면
 *   원본 자체가 커야 하며, 이 확대는 가장자리 잘림을 막는 차선임을 숨기지 않는다.
 * - 재단 마크(crop marks): TrimBox 네 모서리에 오프셋을 둔 가는 선을 콘텐츠 스트림에
 *   벡터로 그린다. CMYK 모드에서는 전판(registration) 색으로 찍는다.
 * - CMYK: 캔버스 픽셀(RGBA)을 단순 변환(GCR 100% 방식, 아래 한계 참조)으로 CMYK 래스터로
 *   바꿔 DeviceCMYK 이미지로 임베드한다. JPEG는 CMYK로 재인코딩할 수단(디코더)이 없어
 *   래스터 경유만 지원하고, FlateDecode는 무압축 저장 블록으로 만들어 결정성을 유지한다.
 * - 양면 스프레드 배열(booklet): 중철 제본 기준 [마지막·첫] 짝 배열로 펼침면(스프레드)을
 *   만든다. 출력 페이지 1장이 펼침면 1면이며 앞·뒤를 번갈아 내보낸다(양면 인쇄 전제).
 *
 * ★ CMYK 변환의 한계(정직 표기): 이 변환은 ICC 프로파일 기반 색관리가 아니다. 렌더링
 * 인텐트, 총잉크량(TAC) 제한, 도트 게인 보정이 없으므로 인쇄소 프로파일 변환 결과와 색이
 * 다를 수 있다. 규격 적합(PDF/X-4·OutputIntent)이 필요한 발행은 적합성 파이프라인
 * (studio-pdf-conformance-export.ts)이 담당하고, 이 모듈의 CMYK는 "CMYK 채널로 된
 * 인쇄용 파일"이 필요한 경량 동선용이다.
 *
 * 기본값(옵션 없음·전부 기본값)이면 산출 구조는 기본 라이터와 동일하다 — 페이지 사전에
 * 박스가 추가되지 않고 콘텐츠 스트림도 이미지 배치만으로 구성되며, 회귀 테스트가 기본
 * 라이터와의 바이트 동등까지 고정한다. 순수 코어는 DOM 없이 동작한다.
 */

import { PDF_PX_TO_PT } from "./studio-pdf-export";

/** mm → pt 변환 계수 (1 inch = 25.4mm = 72pt). */
export const PRINT_MM_TO_PT = 72 / 25.4;

/** 재단 마크 길이(mm) — 재단선 바깥 오프셋 끝에서 이만큼 그린다. */
export const PRINT_MARK_LENGTH_MM = 5;
/** 재단 마크 오프셋 간격(mm) — 도련 가장자리에서 마크 시작점까지의 간격. */
export const PRINT_MARK_GAP_MM = 2;
/** 재단 마크 선 두께(pt). */
export const PRINT_MARK_WEIGHT_PT = 0.35;

/** 인쇄 스펙 옵션 — 전부 선택이며 기본값은 "인쇄 스펙 없음"이다. */
export interface PdfPrintOptions {
  /** 재단 여백(mm). 0이면 도련 없음. 기본 0. */
  bleedMm?: number;
  /** 재단 마크 렌더링 여부. 기본 false. */
  cropMarks?: boolean;
  /**
   * 색상 모드. "rgb"(기본)는 JPEG(DeviceRGB) 페이지를, "cmyk"는 CMYK 래스터 페이지를
   * 요구한다 — 페이지 종류와 모순되면 throw 한다.
   */
  colorMode?: "rgb" | "cmyk";
  /**
   * 페이지 배열. "none"(기본)은 읽기 순서 그대로, "booklet"은 중철 제본 스프레드 배열.
   * booklet은 모든 페이지의 재단 크기가 같아야 한다.
   */
  imposition?: "none" | "booklet";
}

/** 인쇄용 PDF 한 페이지 — 색상 모드에 따라 두 종류 중 하나. */
export type PrintPdfPage =
  | { kind: "jpeg"; jpegBytes: Uint8Array; width: number; height: number }
  | { kind: "cmyk-raster"; cmykBytes: Uint8Array; width: number; height: number };

export interface BuildPrintPdfOptions {
  /** 문서 정보(docinfo) 제목 — 비어 있으면 /Title을 생략한다. */
  title?: string;
  print?: PdfPrintOptions;
}

const textEncoder = new TextEncoder();

// studio-pdf-export.ts와 같은 이유로 raw 바이트로 둔다(바이너리 마커 주석).
const PDF_BINARY_MARKER = Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);

/** PDF 숫자 표기 — 기본 라이터와 동일 규칙(정수는 그대로, 소수는 둘째 자리까지 꼬리 0 제거). */
function formatPdfNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const text = value.toFixed(2).replace(/\.?0+$/, "");
  // -0.001 같은 미세 음수가 "-0"으로 찍히지 않게 정규화한다.
  return text === "-0" ? "0" : text;
}

/** UTF-16BE(BOM) hex 문자열 — 기본 라이터와 동일 규칙. */
function pdfHexTextString(value: string): string {
  let hex = "FEFF";
  for (let i = 0; i < value.length; i++) {
    hex += value.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return `<${hex}>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 지오메트리 — 재단/도련/미디어 박스와 이미지 배치, 재단 마크 선분(전부 pt, 순수).
// ─────────────────────────────────────────────────────────────────────────────

export interface PrintRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintPageLayout {
  /** 재단(완성) 크기. */
  trimWidthPt: number;
  trimHeightPt: number;
  /** 도련 폭(pt). */
  bleedPt: number;
  /** MediaBox 한쪽 여유 — 도련 + (마크가 있으면 간격+길이). */
  marginPt: number;
  /** [x1 y1 x2 y2] — 항상 원점 시작. */
  mediaBox: readonly [number, number, number, number];
  /** 재단 박스. marginPt가 0이면 null(기본 라이터와 동일하게 생략). */
  trimBox: readonly [number, number, number, number] | null;
  /** 도련 박스. bleedPt가 0이면 null. */
  bleedBox: readonly [number, number, number, number] | null;
  /** 단일 페이지 이미지 배치 영역(= 도련 박스). */
  imageRect: PrintRect;
}

/**
 * 재단 크기 + 인쇄 옵션 → 페이지 지오메트리.
 * MediaBox는 마크가 들어갈 여유까지 포함하고, TrimBox는 그 안에서 도련만큼 안쪽,
 * BleedBox는 MediaBox에서 마크 여유만큼만 안쪽이다.
 */
export function computePrintLayout(
  trimWidthPt: number,
  trimHeightPt: number,
  opts: { bleedMm?: number; cropMarks?: boolean }
): PrintPageLayout {
  const bleedPt = (opts.bleedMm ?? 0) * PRINT_MM_TO_PT;
  const markSpacePt = opts.cropMarks
    ? (PRINT_MARK_GAP_MM + PRINT_MARK_LENGTH_MM) * PRINT_MM_TO_PT
    : 0;
  const marginPt = bleedPt + markSpacePt;
  const mediaWidth = trimWidthPt + marginPt * 2;
  const mediaHeight = trimHeightPt + marginPt * 2;
  return {
    trimWidthPt,
    trimHeightPt,
    bleedPt,
    marginPt,
    mediaBox: [0, 0, mediaWidth, mediaHeight],
    trimBox:
      marginPt > 0
        ? [marginPt, marginPt, marginPt + trimWidthPt, marginPt + trimHeightPt]
        : null,
    bleedBox:
      bleedPt > 0
        ? [
            marginPt - bleedPt,
            marginPt - bleedPt,
            marginPt + trimWidthPt + bleedPt,
            marginPt + trimHeightPt + bleedPt,
          ]
        : null,
    imageRect: {
      x: marginPt - bleedPt,
      y: marginPt - bleedPt,
      width: trimWidthPt + bleedPt * 2,
      height: trimHeightPt + bleedPt * 2,
    },
  };
}

export interface PrintMarkSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 재단 마크 선분 목록 — TrimBox 네 모서리의 바깥에 가로·세로 한 쌍씩.
 * spineXPt를 주면(스프레드) 접지선 위치에 위·아래 마크를 추가한다.
 * 마크는 도련 가장자리에서 PRINT_MARK_GAP_MM만큼 떨어져 시작한다.
 */
export function cropMarkSegments(layout: PrintPageLayout, spineXPt?: number): PrintMarkSegment[] {
  if (!layout.trimBox) return [];
  const [tx1, ty1, tx2, ty2] = layout.trimBox;
  const start = layout.bleedPt + PRINT_MARK_GAP_MM * PRINT_MM_TO_PT;
  const end = start + PRINT_MARK_LENGTH_MM * PRINT_MM_TO_PT;
  const segments: PrintMarkSegment[] = [];
  // 모서리마다: 수평선(왼쪽/오른쪽 바깥) + 수직선(아래/위 바깥).
  for (const y of [ty1, ty2]) {
    segments.push({ x1: tx1 - end, y1: y, x2: tx1 - start, y2: y });
    segments.push({ x1: tx2 + start, y1: y, x2: tx2 + end, y2: y });
  }
  for (const x of [tx1, tx2]) {
    segments.push({ x1: x, y1: ty1 - end, x2: x, y2: ty1 - start });
    segments.push({ x1: x, y1: ty2 + start, x2: x, y2: ty2 + end });
  }
  if (spineXPt !== undefined) {
    segments.push({ x1: spineXPt, y1: ty1 - end, x2: spineXPt, y2: ty1 - start });
    segments.push({ x1: spineXPt, y1: ty2 + start, x2: spineXPt, y2: ty2 + end });
  }
  return segments;
}

/** 재단 마크를 그리는 콘텐츠 스트림 조각 — 색상 연산자까지 포함한다. */
export function buildCropMarksContent(layout: PrintPageLayout, colorMode: "rgb" | "cmyk", spineXPt?: number): string {
  const segments = cropMarkSegments(layout, spineXPt);
  if (segments.length === 0) return "";
  // RGB 모드는 검정(gray 0), CMYK 모드는 전판(registration 100% 전 색판)으로 찍는다.
  const colorOp = colorMode === "cmyk" ? "1 1 1 1 k" : "0 g";
  const paths = segments
    .map(
      (s) =>
        `${formatPdfNumber(s.x1)} ${formatPdfNumber(s.y1)} m ${formatPdfNumber(s.x2)} ${formatPdfNumber(s.y2)} l`
    )
    .join("\n");
  return `q\n${formatPdfNumber(PRINT_MARK_WEIGHT_PT)} w\n${colorOp}\n${paths}\nS\nQ`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CMYK 변환 — RGBA 픽셀 → CMYK 샘플(순수). ICC 색관리가 아닌 단순 변환이다.
// ─────────────────────────────────────────────────────────────────────────────

/** RGB(0..1) → CMYK(0..1) 단순 변환 — K를 최대한 뽑는 GCR 100% 방식. */
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  const denom = 1 - k;
  return [(1 - r - k) / denom, (1 - g - k) / denom, (1 - b - k) / denom, k];
}

/**
 * RGBA 바이트 → CMYK 바이트(픽셀당 4바이트, 255 = 잉크 100%).
 * 알파는 흰 배경에 합성한 뒤 변환한다(인쇄 페이지는 어차피 불투명 종이 위다).
 */
export function rgbaToCmykBytes(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  if (rgba.length % 4 !== 0) throw new Error("CMYK로 변환할 픽셀 데이터 길이가 올바르지 않아요.");
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255;
    const r = (rgba[i] / 255) * alpha + (1 - alpha);
    const g = (rgba[i + 1] / 255) * alpha + (1 - alpha);
    const b = (rgba[i + 2] / 255) * alpha + (1 - alpha);
    const [c, m, y, k] = rgbToCmyk(r, g, b);
    out[i] = Math.round(c * 255);
    out[i + 1] = Math.round(m * 255);
    out[i + 2] = Math.round(y * 255);
    out[i + 3] = Math.round(k * 255);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// zlib 저장(무압축) 블록 인코더 — FlateDecode 스트림을 결정적으로 만든다.
// ─────────────────────────────────────────────────────────────────────────────

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * zlib 형식(RFC 1950) + DEFLATE 저장 블록(RFC 1951)으로 감싼다. 압축률은 없지만
 * 표준 FlateDecode로 읽히고, 순수·동기·결정적이다. CMYK 래스터는 이미 덩치가 크므로
 * 이 경로는 "규격에 맞는 컨테이너"가 목적이며 크기 최적화는 범위 밖이다.
 */
export function deflateStoredZlib(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  let cursor = 0;
  out[cursor++] = 0x78;
  out[cursor++] = 0x01; // CMF/FLG — 31의 배수 검사를 통과하는 무압축 프리셋.
  let read = 0;
  for (let block = 0; block < blockCount; block++) {
    const len = Math.min(65535, data.length - read);
    const isFinal = block === blockCount - 1;
    out[cursor++] = isFinal ? 0x01 : 0x00; // BFINAL + BTYPE=00 (저장), 바이트 정렬 상태.
    out[cursor++] = len & 0xff;
    out[cursor++] = (len >> 8) & 0xff;
    const nlen = ~len & 0xffff;
    out[cursor++] = nlen & 0xff;
    out[cursor++] = (nlen >> 8) & 0xff;
    out.set(data.subarray(read, read + len), cursor);
    cursor += len;
    read += len;
  }
  const checksum = adler32(data);
  out[cursor++] = (checksum >>> 24) & 0xff;
  out[cursor++] = (checksum >>> 16) & 0xff;
  out[cursor++] = (checksum >>> 8) & 0xff;
  out[cursor] = checksum & 0xff;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 중철 제본 스프레드 배열 — 읽기 순서 페이지 → 펼침면 앞/뒤 짝.
// ─────────────────────────────────────────────────────────────────────────────

/** 출력 페이지 수 — 스프레드 배열이면 펼침면 수(시트 수 × 앞뒤), 아니면 입력 페이지 수. */
export function countPrintPdfOutputPages(pageCount: number, print?: PdfPrintOptions): number {
  if (print?.imposition !== "booklet") return pageCount;
  return planBookletImposition(pageCount).length * 2;
}

export interface BookletSheet {
  /** 펼침면 앞면 [왼쪽, 오른쪽] — 0-based 페이지 인덱스, null은 빈(패딩) 페이지. */
  front: [number | null, number | null];
  /** 펼침면 뒷면 [왼쪽, 오른쪽]. */
  back: [number | null, number | null];
}

/**
 * 중철( saddle-stitch ) 배열 계획. 전체를 4의 배수로 패딩하고, 시트 i(0-based)의
 * 앞면은 [마지막-2i, 2i], 뒷면은 [2i+1, 마지막-2i-1] (전부 0-based) 짝이다.
 */
export function planBookletImposition(pageCount: number): BookletSheet[] {
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    throw new Error("스프레드로 배열할 페이지가 없어요.");
  }
  const padded = Math.ceil(pageCount / 4) * 4;
  const at = (index: number): number | null => (index < pageCount ? index : null);
  const sheets: BookletSheet[] = [];
  for (let i = 0; i < padded / 4; i++) {
    sheets.push({
      front: [at(padded - 1 - 2 * i), at(2 * i)],
      back: [at(2 * i + 1), at(padded - 2 - 2 * i)],
    });
  }
  return sheets;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF 조립 — 기본 라이터와 같은 바이트 규약을 따르는 인쇄용 빌더.
// ─────────────────────────────────────────────────────────────────────────────

interface OutputImageRef {
  page: PrintPdfPage;
  /** 이 출력 페이지 안에서의 배치 영역. */
  rect: PrintRect;
}

interface OutputPagePlan {
  layout: PrintPageLayout;
  images: OutputImageRef[];
  /** 스프레드면 접지선 x좌표(pt) — 단일 페이지면 undefined. */
  spineXPt?: number;
}

function validatePrintPage(page: PrintPdfPage, index: number): void {
  const widthPx = Math.round(page.width);
  const heightPx = Math.round(page.height);
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new Error(`페이지 ${index + 1}의 크기가 올바르지 않아요.`);
  }
  if (page.kind === "jpeg") {
    if (page.jpegBytes.length < 4 || page.jpegBytes[0] !== 0xff || page.jpegBytes[1] !== 0xd8) {
      throw new Error(`페이지 ${index + 1}의 이미지가 JPEG 형식이 아니에요. 다시 시도해주세요.`);
    }
  } else if (page.cmykBytes.length !== widthPx * heightPx * 4) {
    throw new Error(`페이지 ${index + 1}의 CMYK 데이터 길이가 이미지 크기와 맞지 않아요.`);
  }
}

/** 출력 페이지 계획 수립 — 배열 모드에 따라 단일 페이지 또는 스프레드로 펼친다. */
function planOutputPages(pages: PrintPdfPage[], print: Required<PdfPrintOptions>): OutputPagePlan[] {
  const layoutOpts = { bleedMm: print.bleedMm, cropMarks: print.cropMarks };
  if (print.imposition === "none") {
    return pages.map((page) => {
      const layout = computePrintLayout(
        Math.round(page.width) * PDF_PX_TO_PT,
        Math.round(page.height) * PDF_PX_TO_PT,
        layoutOpts
      );
      return { layout, images: [{ page, rect: layout.imageRect }] };
    });
  }
  // booklet — 재단 크기가 전부 같아야 펼침면을 만들 수 있다.
  const first = pages[0];
  for (const page of pages) {
    if (page.width !== first.width || page.height !== first.height) {
      throw new Error("스프레드 배열은 모든 페이지의 크기가 같을 때만 쓸 수 있어요.");
    }
  }
  const trimWidthPt = Math.round(first.width) * PDF_PX_TO_PT;
  const trimHeightPt = Math.round(first.height) * PDF_PX_TO_PT;
  const sheets = planBookletImposition(pages.length);
  const plans: OutputPagePlan[] = [];
  for (const sheet of sheets) {
    for (const side of [sheet.front, sheet.back]) {
      const layout = computePrintLayout(trimWidthPt * 2, trimHeightPt, layoutOpts);
      const images: OutputImageRef[] = [];
      const halfRect = (half: 0 | 1): PrintRect => ({
        x: layout.marginPt - layout.bleedPt + half * trimWidthPt,
        y: layout.imageRect.y,
        width: trimWidthPt + layout.bleedPt * 2,
        height: layout.imageRect.height,
      });
      const [left, right] = side;
      if (left !== null) images.push({ page: pages[left], rect: halfRect(0) });
      if (right !== null) images.push({ page: pages[right], rect: halfRect(1) });
      plans.push({ layout, images, spineXPt: layout.marginPt + trimWidthPt });
    }
  }
  return plans;
}

/**
 * 인쇄 스펙 PDF 조립(순수·결정적).
 *
 * 오브젝트 번호: 1=Catalog, 2=Pages, 이후 출력 페이지마다 [Page, Contents, Image...]를
 * 순서대로 배정하고 마지막이 Info. 기본 옵션(도련 0·마크 없음·rgb·배열 없음)이면
 * buildPdfFromJpegPages와 바이트가 동일하다(회귀 테스트 고정).
 */
export function buildPrintPdfFromPages(pages: PrintPdfPage[], opts?: BuildPrintPdfOptions): Uint8Array {
  if (pages.length === 0) throw new Error("PDF로 내보낼 페이지가 없어요.");
  pages.forEach(validatePrintPage);

  const print: Required<PdfPrintOptions> = {
    bleedMm: opts?.print?.bleedMm ?? 0,
    cropMarks: opts?.print?.cropMarks ?? false,
    colorMode: opts?.print?.colorMode ?? "rgb",
    imposition: opts?.print?.imposition ?? "none",
  };
  if (!Number.isFinite(print.bleedMm) || print.bleedMm < 0 || print.bleedMm > 100) {
    throw new Error("재단 여백은 0~100mm 사이로 지정해주세요.");
  }
  for (const page of pages) {
    if (print.colorMode === "cmyk" && page.kind !== "cmyk-raster") {
      throw new Error("CMYK 모드에서는 CMYK 래스터 페이지가 필요해요.");
    }
    if (print.colorMode === "rgb" && page.kind !== "jpeg") {
      throw new Error("RGB 모드에서는 JPEG 페이지가 필요해요.");
    }
  }

  const plans = planOutputPages(pages, print);

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushText = (text: string): void => push(textEncoder.encode(text));

  // 오브젝트 번호 사전 배정.
  let nextNum = 3;
  const assignments = plans.map((plan) => {
    const pageNum = nextNum++;
    const contentNum = nextNum++;
    const imageNums = plan.images.map(() => nextNum++);
    return { pageNum, contentNum, imageNums };
  });
  const infoObjNum = nextNum;
  const size = infoObjNum + 1;

  const objectOffsets = new Map<number, number>();
  const pushObject = (num: number, body: string): void => {
    objectOffsets.set(num, offset);
    pushText(`${num} 0 obj\n${body}\nendobj\n`);
  };
  const pushStreamObject = (num: number, dict: string, data: Uint8Array): void => {
    objectOffsets.set(num, offset);
    const entries = dict.length > 0 ? `${dict} /Length ${data.length}` : `/Length ${data.length}`;
    pushText(`${num} 0 obj\n<< ${entries} >>\nstream\n`);
    push(data);
    pushText("\nendstream\nendobj\n");
  };

  pushText("%PDF-1.4\n");
  push(PDF_BINARY_MARKER);

  pushObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = assignments.map((a) => `${a.pageNum} 0 R`).join(" ");
  pushObject(2, `<< /Type /Pages /Kids [${kids}] /Count ${plans.length} >>`);

  plans.forEach((plan, planIndex) => {
    const { pageNum, contentNum, imageNums } = assignments[planIndex];
    const { layout } = plan;
    const box = (rect: readonly [number, number, number, number]): string =>
      `[${rect.map(formatPdfNumber).join(" ")}]`;
    let pageDict =
      `<< /Type /Page /Parent 2 0 R /MediaBox ${box(layout.mediaBox)}`;
    if (layout.trimBox) pageDict += ` /TrimBox ${box(layout.trimBox)}`;
    if (layout.bleedBox) pageDict += ` /BleedBox ${box(layout.bleedBox)}`;
    const xobjects = plan.images.map((_, i) => `/Im${i} ${imageNums[i]} 0 R`).join(" ");
    pageDict +=
      ` /Resources << /XObject << ${xobjects} >> /ProcSet [/PDF /ImageC] >>` +
      ` /Contents ${contentNum} 0 R >>`;
    pushObject(pageNum, pageDict);

    const contentParts: string[] = [];
    plan.images.forEach((image, i) => {
      const r = image.rect;
      contentParts.push(
        `q\n${formatPdfNumber(r.width)} 0 0 ${formatPdfNumber(r.height)} ${formatPdfNumber(r.x)} ${formatPdfNumber(r.y)} cm\n/Im${i} Do\nQ`
      );
    });
    if (print.cropMarks) {
      const marks = buildCropMarksContent(layout, print.colorMode, plan.spineXPt);
      if (marks) contentParts.push(marks);
    }
    pushStreamObject(contentNum, "", textEncoder.encode(contentParts.join("\n")));

    plan.images.forEach((image, i) => {
      const page = image.page;
      const widthPx = Math.round(page.width);
      const heightPx = Math.round(page.height);
      if (page.kind === "jpeg") {
        pushStreamObject(
          imageNums[i],
          `/Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
          page.jpegBytes
        );
      } else {
        pushStreamObject(
          imageNums[i],
          `/Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} ` +
            `/ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /FlateDecode`,
          deflateStoredZlib(page.cmykBytes)
        );
      }
    });
  });

  const title = opts?.title?.trim();
  const titleEntry = title ? `/Title ${pdfHexTextString(title)} ` : "";
  pushObject(infoObjNum, `<< ${titleEntry}/Producer (ToonStudio Studio) >>`);

  const xrefOffset = offset;
  pushText(`xref\n0 ${size}\n`);
  pushText("0000000000 65535 f \n");
  for (let num = 1; num < size; num++) {
    const objOffset = objectOffsets.get(num);
    if (objOffset === undefined) throw new Error(`PDF 조립에 실패했어요(오브젝트 ${num} 누락). 다시 시도해주세요.`);
    pushText(`${String(objOffset).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoObjNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const out = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
