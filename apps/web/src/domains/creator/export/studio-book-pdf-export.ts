/**
 * Studio 단행본 인쇄용 PDF 빌더 — 판형 프리셋 기준의 MediaBox·TrimBox·BleedBox 조립.
 *
 * 기존 인쇄 빌더(studio-pdf-print-export)는 페이지 이미지 픽셀 크기에서 재단 크기를
 * 역산한다 — 웹툰 원본 픽셀은 판형과 무관하므로, 그 경로로는 "신국판을 고르면 재단
 * 박스가 신국판"이라는 보장이 성립하지 않는다. 이 빌더는 반대로 판형 스펙(mm)을
 * 진실로 삼는다: 페이지 박스는 전부 스펙에서 계산하고, 회차 이미지는 도련 박스에
 * 정확히 얹는다. 이미지는 도련 포함 크기(bookPagePixelSize)로 렌더된 것을 전제하되,
 * 종횡비가 도련 박스와 다르면 경고를 남긴다(조용히 찌그러뜨리지 않는다).
 *
 * - 재단 마크: TrimBox 네 모서리 바깥(도련 끝에서 간격을 둔 자리)에 벡터 선으로 그린다.
 *   마크가 켜지면 MediaBox가 그만큼 넓어지고 모든 박스가 같은 양만큼 이동한다.
 * - 안전 영역: PDF 표준 박스가 아니므로 파일에 그리지 않는다. 대신 페이지별 요소가
 *   있으면 checkBookPageElements로 판정해 경고 목록으로 돌려준다 — 내보내기를 막지
 *   않되, 작가가 결과를 보고 고칠 수 있게 결과에 반드시 실어 보낸다.
 * - 바이트 규약은 기존 라이터들과 같다(결정적 조립, 제목은 UTF-16BE hex, 순수 코어).
 * - 책 구성(binding, 선택): 페이지 이미지를 안전 영역 안에 비율을 지켜 맞추고(여백 보장), 본문 쪽마다
 *   쪽 번호를 표준 글꼴로 찍으며, role="cover" 페이지를 표지(단면·쪽 번호 없음·번호 매김 제외)로 다룬다.
 *   binding을 생략하면 이 확장은 전혀 동작하지 않고 출력 바이트도 이전과 같다.
 */

import {
  fitBoxInside,
  placeBookFolio,
  type BookBindingLayout,
} from "./studio-book-binding";
import {
  MM_TO_PT,
  checkBookPageElements,
  computeBookPageBoxes,
  resolveBookPageSide,
} from "./studio-book-layout-model";

import type {
  BookLayoutElement,
  BookPageBoxes,
  BookPageSide,
  BookSafeAreaWarning,
  BookTrimSpec,
} from "./studio-book-layout-model";

/** 재단 마크 길이(mm) — 기존 인쇄 빌더와 같은 관례. */
export const BOOK_MARK_LENGTH_MM = 5;
/** 재단 마크 오프셋 간격(mm) — 도련 가장자리에서 마크 시작점까지. */
export const BOOK_MARK_GAP_MM = 2;
/** 재단 마크 선 두께(pt). */
export const BOOK_MARK_WEIGHT_PT = 0.35;

/** 단행본 빌더 요청 — 판형 스펙이 진실이다. */
export interface BookPrintRequest {
  readonly spec: BookTrimSpec;
  /** 선택한 프리셋 id — 파일 안내·로깅용(계산에는 spec만 쓴다). */
  readonly presetId?: string;
  readonly cropMarks?: boolean;
  readonly dpi?: number;
  readonly firstPageSide?: "left" | "right";
  /** 페이지별 요소 목록(작가 좌표 mm) — 안전 영역 경고 판정에만 쓴다. */
  readonly elementsByPage?: readonly (readonly BookLayoutElement[] | undefined)[];
  /** 책 구성(여백 안에 맞춤·쪽 번호·표지). 생략하면 기존 풀블리드 동작과 바이트가 같다. */
  readonly binding?: BookBindingLayout;
}

/** 인쇄용 PDF 한 페이지가 될 JPEG 이미지 — 픽셀 크기는 XObject 선언용. */
export interface BookPdfPage {
  readonly jpegBytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** cover = 표지(단면·쪽 번호 없음·본문 번호 매김에서 제외·도련 끝까지 채움). 기본은 본문(body). */
  readonly role?: "cover" | "body";
}

export type BookPrintWarning =
  | (BookSafeAreaWarning & { readonly pageIndex: number })
  | {
      readonly pageIndex: number;
      readonly elementId?: string;
      readonly code: "aspect-mismatch";
      readonly message: string;
    };

export interface BuildBookPrintPdfResult {
  readonly bytes: Uint8Array;
  /** 페이지 순서대로의 박스 집합(마크 여유만큼 이동 반영). */
  readonly pageBoxes: BookPageBoxes[];
  readonly warnings: BookPrintWarning[];
  /** 페이지마다 찍힌 쪽 번호. 표지이거나 쪽 번호를 끄면 null. */
  readonly pageFolios: readonly (number | null)[];
}

const textEncoder = new TextEncoder();
const PDF_BINARY_MARKER = Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);

/** PDF 숫자 표기 — 기존 라이터와 동일 규칙. */
function formatPdfNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const text = value.toFixed(2).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

function pdfHexTextString(value: string): string {
  let hex = "FEFF";
  for (let i = 0; i < value.length; i++) {
    hex += value.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return `<${hex}>`;
}

/** PDF 문자열 리터럴 이스케이프 — 괄호와 역슬래시만 특별하다. */
function pdfLiteral(value: string): string {
  return value.replace(/[\\()]/gu, (character) => `\\${character}`);
}

function offsetBox(box: BookPageBoxes["trim"], dx: number, dy: number): BookPageBoxes["trim"] {
  return { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
}

function boxArray(box: BookPageBoxes["trim"]): readonly [number, number, number, number] {
  return [box.x, box.y, box.x + box.width, box.y + box.height];
}

/** 재단 마크 콘텐츠 스트림 조각 — TrimBox 모서리 바깥 8개 선분. */
export function buildBookCropMarksContent(boxes: BookPageBoxes, bleedPt: number): string {
  const start = bleedPt + BOOK_MARK_GAP_MM * MM_TO_PT;
  const end = start + BOOK_MARK_LENGTH_MM * MM_TO_PT;
  const tx1 = boxes.trim.x;
  const ty1 = boxes.trim.y;
  const tx2 = boxes.trim.x + boxes.trim.width;
  const ty2 = boxes.trim.y + boxes.trim.height;
  const segments: Array<[number, number, number, number]> = [];
  for (const y of [ty1, ty2]) {
    segments.push([tx1 - end, y, tx1 - start, y]);
    segments.push([tx2 + start, y, tx2 + end, y]);
  }
  for (const x of [tx1, tx2]) {
    segments.push([x, ty1 - end, x, ty1 - start]);
    segments.push([x, ty2 + start, x, ty2 + end]);
  }
  const paths = segments
    .map(
      ([x1, y1, x2, y2]) =>
        `${formatPdfNumber(x1)} ${formatPdfNumber(y1)} m ${formatPdfNumber(x2)} ${formatPdfNumber(y2)} l`
    )
    .join("\n");
  return `q\n${formatPdfNumber(BOOK_MARK_WEIGHT_PT)} w\n0 g\n${paths}\nS\nQ`;
}

/**
 * 판형 스펙 + JPEG 페이지들 → 인쇄용 PDF(순수·결정적).
 * 페이지마다 면(side)을 번갈아 적용해 안전 박스·경고를 계산한다. 빈 페이지,
 * 잘못된 크기, JPEG가 아닌 바이트는 한글 메시지로 throw 한다.
 */
export function buildBookPrintPdf(
  pages: readonly BookPdfPage[],
  request: BookPrintRequest,
  opts?: { title?: string }
): BuildBookPrintPdfResult {
  if (pages.length === 0) throw new Error("PDF로 내보낼 페이지가 없어요.");
  pages.forEach((page, index) => {
    const widthPx = Math.round(page.width);
    const heightPx = Math.round(page.height);
    if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
      throw new Error(`페이지 ${index + 1}의 크기가 올바르지 않아요.`);
    }
    if (page.jpegBytes.length < 4 || page.jpegBytes[0] !== 0xff || page.jpegBytes[1] !== 0xd8) {
      throw new Error(`페이지 ${index + 1}의 이미지가 JPEG 형식이 아니에요. 다시 시도해주세요.`);
    }
  });

  const spec = request.spec;
  const cropMarks = request.cropMarks ?? false;
  const markSpacePt = cropMarks ? (BOOK_MARK_GAP_MM + BOOK_MARK_LENGTH_MM) * MM_TO_PT : 0;
  const firstPageSide = request.firstPageSide ?? "right";

  const binding = request.binding;
  const placement = binding?.placement ?? "full-bleed";
  const folioOptions = binding?.folio;

  const warnings: BookPrintWarning[] = [];
  const pageSides: BookPageSide[] = [];
  const pageFolios: (number | null)[] = [];
  let bodyIndex = 0;
  const pageBoxes: BookPageBoxes[] = pages.map((page, index) => {
    const isCover = page.role === "cover";
    // 표지는 단면이고 쪽 번호 매김에 들어가지 않는다. 본문 쪽만 좌우를 번갈아 센다.
    const side: BookPageSide = isCover ? "single" : resolveBookPageSide(bodyIndex, firstPageSide);
    pageSides.push(side);
    pageFolios.push(!isCover && folioOptions ? folioOptions.startAt + bodyIndex : null);
    if (!isCover) bodyIndex += 1;
    const base = computeBookPageBoxes(spec, side);
    const boxes: BookPageBoxes = {
      // MediaBox는 마크 여유까지 포함해야 마크가 페이지 안에 찍힌다.
      media: {
        x: 0,
        y: 0,
        width: base.media.width + markSpacePt * 2,
        height: base.media.height + markSpacePt * 2,
      },
      bleed: offsetBox(base.bleed, markSpacePt, markSpacePt),
      trim: offsetBox(base.trim, markSpacePt, markSpacePt),
      safe: offsetBox(base.safe, markSpacePt, markSpacePt),
    };
    // 종횡비 검사 — 도련 박스를 채우는 페이지(풀블리드 배치·표지)만 본다. 안전 영역 안에 맞추는 배치는
    // 비율을 지키며 여백이 남으므로 늘어날 일이 없다.
    if (isCover || placement === "full-bleed") {
      const bleedAspect = base.bleed.width / base.bleed.height;
      const pageAspect = Math.round(page.width) / Math.round(page.height);
      if (Math.abs(pageAspect - bleedAspect) / bleedAspect > 0.01) {
        warnings.push({
          pageIndex: index,
          code: "aspect-mismatch",
          message:
            `페이지 ${index + 1}의 가로세로 비율이 판형(도련 포함)과 달라 ` +
            `인쇄 시 그림이 늘어나거나 잘릴 수 있어요. 판형 비율로 다시 렌더해 주세요.`,
        });
      }
    }
    const elements = request.elementsByPage?.[index];
    if (elements && elements.length > 0) {
      for (const warning of checkBookPageElements(spec, side, elements)) {
        warnings.push({ ...warning, pageIndex: index });
      }
    }
    return boxes;
  });
  const anyFolio = pageFolios.some((folio) => folio !== null);

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushText = (text: string): void => push(textEncoder.encode(text));
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

  const pageObjNum = (i: number): number => 3 + i * 3;
  const contentObjNum = (i: number): number => 4 + i * 3;
  const imageObjNum = (i: number): number => 5 + i * 3;
  const infoObjNum = 3 + pages.length * 3;
  // 쪽 번호용 표준 글꼴 오브젝트는 Info 뒤에 붙는다 — 쪽 번호를 쓰지 않으면 오브젝트도 늘지 않는다.
  const fontObjNum = infoObjNum + 1;
  const size = infoObjNum + 1 + (anyFolio ? 1 : 0);

  pushText("%PDF-1.4\n");
  push(PDF_BINARY_MARKER);
  pushObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(" ");
  pushObject(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  pages.forEach((page, i) => {
    const boxes = pageBoxes[i];
    const box = (rect: readonly [number, number, number, number]): string =>
      `[${rect.map(formatPdfNumber).join(" ")}]`;
    const folioNumber = pageFolios[i];
    const hasFolio = folioOptions !== undefined && folioNumber !== null;
    pushObject(
      pageObjNum(i),
      `<< /Type /Page /Parent 2 0 R /MediaBox ${box(boxArray(boxes.media))}` +
        ` /TrimBox ${box(boxArray(boxes.trim))} /BleedBox ${box(boxArray(boxes.bleed))}` +
        ` /Resources << /XObject << /Im0 ${imageObjNum(i)} 0 R >>` +
        `${hasFolio ? ` /Font << /F1 ${fontObjNum} 0 R >>` : ""}` +
        ` /ProcSet [/PDF ${hasFolio ? "/Text " : ""}/ImageC] >>` +
        ` /Contents ${contentObjNum(i)} 0 R >>`
    );
    // 표지와 풀블리드 배치는 도련 박스를 채운다. 안전 영역 배치의 본문은 비율을 지켜 안전 박스 안에 맞춘다.
    const target =
      page.role !== "cover" && placement === "inside-safe"
        ? fitBoxInside(boxes.safe, Math.round(page.width), Math.round(page.height))
        : boxes.bleed;
    const contentParts = [
      `q\n${formatPdfNumber(target.width)} 0 0 ${formatPdfNumber(target.height)} ` +
        `${formatPdfNumber(target.x)} ${formatPdfNumber(target.y)} cm\n/Im0 Do\nQ`,
    ];
    if (hasFolio) {
      const place = placeBookFolio(boxes, pageSides[i], folioNumber, folioOptions);
      contentParts.push(
        `BT\n/F1 ${formatPdfNumber(place.fontSizePt)} Tf\n0 g\n` +
          `${formatPdfNumber(place.x)} ${formatPdfNumber(place.y)} Td\n(${pdfLiteral(place.text)}) Tj\nET`
      );
    }
    if (cropMarks) {
      contentParts.push(buildBookCropMarksContent(boxes, spec.bleedMm * MM_TO_PT));
    }
    pushStreamObject(contentObjNum(i), "", textEncoder.encode(contentParts.join("\n")));
    pushStreamObject(
      imageObjNum(i),
      `/Type /XObject /Subtype /Image /Width ${Math.round(page.width)} /Height ${Math.round(page.height)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
      page.jpegBytes
    );
  });

  const title = opts?.title?.trim();
  const titleEntry = title ? `/Title ${pdfHexTextString(title)} ` : "";
  pushObject(infoObjNum, `<< ${titleEntry}/Producer (ToonStudio Studio) >>`);
  if (anyFolio) {
    pushObject(fontObjNum, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  }

  const xrefOffset = offset;
  pushText(`xref\n0 ${size}\n`);
  pushText("0000000000 65535 f \n");
  for (let num = 1; num < size; num++) {
    const objOffset = objectOffsets.get(num);
    if (objOffset === undefined) {
      throw new Error(`PDF 조립에 실패했어요(오브젝트 ${num} 누락). 다시 시도해주세요.`);
    }
    pushText(`${String(objOffset).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoObjNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const out = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return { bytes: out, pageBoxes, warnings, pageFolios };
}
