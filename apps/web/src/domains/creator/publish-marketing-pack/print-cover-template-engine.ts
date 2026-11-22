/**
 * 단행본 인쇄 규격 표지 템플릿 생성기 (신국판·A5·B6 / 책등 폭 spineMm 자동 계산 / 3mm 재단선 bleed).
 *
 * 쪽수·종이 평량(GSM)·제본 방식에 따라 실제 인쇄소 입고 기준의 앞표지·책등·뒤표지 펼침면 치수,
 * 300 DPI 픽셀 환산, 3mm 재단선(bleed) 및 5mm 안전선 가이드 SVG를 100% 브라우저 로컬(₩0)로 생성한다.
 */

export const PRINT_BOOK_FORMAT_IDS = ["shinguk", "a5", "b6", "b6-kr"] as const;
export type PrintBookFormatId = (typeof PRINT_BOOK_FORMAT_IDS)[number];

export const PRINT_PAPER_STOCK_IDS = [
  "art-100",
  "art-120",
  "art-150",
  "mozo-80",
  "mozo-100",
  "cream-90",
] as const;
export type PrintPaperStockId = (typeof PRINT_PAPER_STOCK_IDS)[number];

export type PrintBindingType = "perfect-soft" | "hardcover";

export interface PrintBookFormatSpec {
  readonly id: PrintBookFormatId;
  readonly labelKo: string;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly useCaseKo: string;
}

export interface PrintPaperStockSpec {
  readonly id: PrintPaperStockId;
  readonly labelKo: string;
  readonly gsm: number;
  /** 1장(2쪽) 기준 종이 두께(mm) */
  readonly caliperMmPerSheet: number;
  readonly noteKo: string;
}

export const PRINT_BOOK_FORMATS: Readonly<Record<PrintBookFormatId, PrintBookFormatSpec>> = {
  shinguk: {
    id: "shinguk",
    labelKo: "신국판 (152×225mm)",
    trimWidthMm: 152,
    trimHeightMm: 225,
    useCaseKo: "한국 풀컬러 웹툰 단행본 표준",
  },
  a5: {
    id: "a5",
    labelKo: "A5 국판 (148×210mm)",
    trimWidthMm: 148,
    trimHeightMm: 210,
    useCaseKo: "독립출판·소장본·일러스트북 표준",
  },
  b6: {
    id: "b6",
    labelKo: "B6 사륙판 (128×182mm)",
    trimWidthMm: 128,
    trimHeightMm: 182,
    useCaseKo: "코믹스·흑백 만화 단행본 표준",
  },
  "b6-kr": {
    id: "b6-kr",
    labelKo: "4×6판 변형 (128×188mm)",
    trimWidthMm: 128,
    trimHeightMm: 188,
    useCaseKo: "국내 만화·라이트노벨 단행본",
  },
};

export const PRINT_PAPER_STOCKS: Readonly<Record<PrintPaperStockId, PrintPaperStockSpec>> = {
  "art-100": {
    id: "art-100",
    labelKo: "스노우/아트지 100g",
    gsm: 100,
    caliperMmPerSheet: 0.092,
    noteKo: "컬러 웹툰 단행본 기본 권장",
  },
  "art-120": {
    id: "art-120",
    labelKo: "스노우/아트지 120g",
    gsm: 120,
    caliperMmPerSheet: 0.112,
    noteKo: "도톰한 컬러 화보·고급 단행본",
  },
  "art-150": {
    id: "art-150",
    labelKo: "아트지 150g",
    gsm: 150,
    caliperMmPerSheet: 0.135,
    noteKo: "소량 화집·아트북용 두꺼운 코팅지",
  },
  "mozo-80": {
    id: "mozo-80",
    labelKo: "백색 모조지 80g",
    gsm: 80,
    caliperMmPerSheet: 0.095,
    noteKo: "흑백 만화·경량 단행본",
  },
  "mozo-100": {
    id: "mozo-100",
    labelKo: "백색 모조지 100g",
    gsm: 100,
    caliperMmPerSheet: 0.118,
    noteKo: "비침 적은 흑백·컬러 혼합 인쇄",
  },
  "cream-90": {
    id: "cream-90",
    labelKo: "미색 모조지 90g",
    gsm: 90,
    caliperMmPerSheet: 0.11,
    noteKo: "눈이 편한 에세이·스토리북 단행본",
  },
};

export interface PrintCoverInput {
  readonly formatId: PrintBookFormatId;
  readonly pageCount: number;
  readonly paperStockId: PrintPaperStockId;
  readonly binding: PrintBindingType;
  readonly bleedMm?: number;
  readonly safeMarginMm?: number;
  readonly bookTitle: string;
  readonly volumeLabel: string;
  readonly authorName: string;
  readonly publisherName?: string;
}

export interface RectMm {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PrintCoverComputedSpec {
  readonly format: PrintBookFormatSpec;
  readonly paperStock: PrintPaperStockSpec;
  readonly binding: PrintBindingType;
  readonly normalizedPageCount: number;
  readonly sheetCount: number;
  readonly paperThicknessMm: number;
  readonly coverAllowanceMm: number;
  readonly spineMm: number;
  readonly bleedMm: number;
  readonly safeMarginMm: number;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  readonly totalWidthPx300: number;
  readonly totalHeightPx300: number;
  readonly canPrintSpineText: boolean;
  readonly warningsKo: readonly string[];
  readonly backCover: RectMm;
  readonly spine: RectMm;
  readonly frontCover: RectMm;
  readonly backSafe: RectMm;
  readonly spineSafe: RectMm | null;
  readonly frontSafe: RectMm;
  readonly barcodeSafe: RectMm;
}

export interface PrintCoverTemplateArtifact {
  readonly spec: PrintCoverComputedSpec;
  readonly svgMarkup: string;
  readonly svgDataUrl: string;
}

export const PRINT_MIN_PAGES = 32;
export const PRINT_MAX_PAGES = 800;
export const PRINT_DEFAULT_BLEED_MM = 3;
export const PRINT_DEFAULT_SAFE_MARGIN_MM = 5;
export const PRINT_MIN_SPINE_TEXT_MM = 6;

function roundMm(value: number): number {
  return Number(value.toFixed(2));
}

function mmToPx300(mm: number): number {
  return Math.round((mm / 25.4) * 300);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 판형·쪽수·평량·제본 방식으로부터 단행본 표지 펼침면 치수 및 책등 폭(spineMm)을 계산한다.
 */
export function calculatePrintCoverSpec(input: PrintCoverInput): PrintCoverComputedSpec {
  const format = PRINT_BOOK_FORMATS[input.formatId];
  const paperStock = PRINT_PAPER_STOCKS[input.paperStockId];
  const bleedMm = roundMm(
    Math.max(2, Math.min(10, input.bleedMm ?? PRINT_DEFAULT_BLEED_MM)),
  );
  const safeMarginMm = roundMm(
    Math.max(3, Math.min(15, input.safeMarginMm ?? PRINT_DEFAULT_SAFE_MARGIN_MM)),
  );

  const rawPages = Number.isFinite(input.pageCount) ? Math.round(input.pageCount) : 200;
  const clampedPages = Math.max(PRINT_MIN_PAGES, Math.min(PRINT_MAX_PAGES, rawPages));
  const warningsKo: string[] = [];

  const normalizedPageCount = clampedPages % 2 === 0 ? clampedPages : clampedPages + 1;
  if (clampedPages % 2 !== 0) {
    warningsKo.push(
      `홀수 쪽수(${clampedPages}쪽)를 인쇄 표준 짝수(${normalizedPageCount}쪽)로 자동 보정했습니다.`,
    );
  }
  if (normalizedPageCount % 16 !== 0) {
    warningsKo.push(
      `오프셋 인쇄 시 16쪽 대수 배수(권장 ${Math.ceil(normalizedPageCount / 16) * 16}쪽)로 맞추면 여백 페이지 손실을 줄일 수 있습니다.`,
    );
  }

  const sheetCount = normalizedPageCount / 2;
  const paperThicknessMm = roundMm(sheetCount * paperStock.caliperMmPerSheet);
  // 무선제본(아트지 250g 표지 + 풀접착 0.6mm) vs 양장제본(보드 합지 + 여분 4.0mm)
  const coverAllowanceMm = input.binding === "hardcover" ? 4.0 : 0.6;
  const spineMm = roundMm(paperThicknessMm + coverAllowanceMm);

  const canPrintSpineText = spineMm >= PRINT_MIN_SPINE_TEXT_MM;
  if (!canPrintSpineText) {
    warningsKo.push(
      `책등 폭(${spineMm}mm)이 ${PRINT_MIN_SPINE_TEXT_MM}mm 미만입니다. 책등 제목 인쇄 시 밀림 위험이 있어 텍스트 생략을 권장합니다.`,
    );
  }

  const totalWidthMm = roundMm(bleedMm + format.trimWidthMm + spineMm + format.trimWidthMm + bleedMm);
  const totalHeightMm = roundMm(bleedMm + format.trimHeightMm + bleedMm);

  // 한국어 좌철(왼쪽 제본) 기준 펼침면: [뒤표지] - [책등] - [앞표지]
  const backCover: RectMm = {
    x: bleedMm,
    y: bleedMm,
    width: format.trimWidthMm,
    height: format.trimHeightMm,
  };
  const spine: RectMm = {
    x: roundMm(bleedMm + format.trimWidthMm),
    y: bleedMm,
    width: spineMm,
    height: format.trimHeightMm,
  };
  const frontCover: RectMm = {
    x: roundMm(bleedMm + format.trimWidthMm + spineMm),
    y: bleedMm,
    width: format.trimWidthMm,
    height: format.trimHeightMm,
  };

  const backSafe: RectMm = {
    x: roundMm(backCover.x + safeMarginMm),
    y: roundMm(backCover.y + safeMarginMm),
    width: roundMm(backCover.width - safeMarginMm * 2),
    height: roundMm(backCover.height - safeMarginMm * 2),
  };
  const frontSafe: RectMm = {
    x: roundMm(frontCover.x + safeMarginMm),
    y: roundMm(frontCover.y + safeMarginMm),
    width: roundMm(frontCover.width - safeMarginMm * 2),
    height: roundMm(frontCover.height - safeMarginMm * 2),
  };
  const spineSafe: RectMm | null = canPrintSpineText
    ? {
        x: roundMm(spine.x + 1.5),
        y: roundMm(spine.y + safeMarginMm),
        width: roundMm(Math.max(1, spine.width - 3)),
        height: roundMm(spine.height - safeMarginMm * 2),
      }
    : null;

  // ISBN 바코드 표준 안전 박스(뒤표지 좌하단 38×25mm, 재단선에서 12mm 여백)
  const barcodeSafe: RectMm = {
    x: roundMm(backCover.x + 12),
    y: roundMm(backCover.y + backCover.height - 12 - 25),
    width: 38,
    height: 25,
  };

  return {
    format,
    paperStock,
    binding: input.binding,
    normalizedPageCount,
    sheetCount,
    paperThicknessMm,
    coverAllowanceMm,
    spineMm,
    bleedMm,
    safeMarginMm,
    totalWidthMm,
    totalHeightMm,
    totalWidthPx300: mmToPx300(totalWidthMm),
    totalHeightPx300: mmToPx300(totalHeightMm),
    canPrintSpineText,
    warningsKo,
    backCover,
    spine,
    frontCover,
    backSafe,
    spineSafe,
    frontSafe,
    barcodeSafe,
  };
}

/**
 * 실제 mm 단위 앞/책등/뒤 표지 재단선(3mm bleed) + 안전선 + 톰보 가이드 SVG를 생성한다.
 */
export function renderPrintCoverTemplateSvg(input: PrintCoverInput): PrintCoverTemplateArtifact {
  const spec = calculatePrintCoverSpec(input);
  const {
    totalWidthMm,
    totalHeightMm,
    bleedMm,
    spineMm,
    backCover,
    spine,
    frontCover,
    backSafe,
    spineSafe,
    frontSafe,
    barcodeSafe,
  } = spec;

  const safeTitle = escapeXml(input.bookTitle.trim() || "단행본 제목");
  const safeVolume = escapeXml(input.volumeLabel.trim() || "1권");
  const safeAuthor = escapeXml(input.authorName.trim() || "작가");
  const safePublisher = escapeXml(input.publisherName?.trim() || "1인 독립출판");

  const cropLen = Math.min(bleedMm, 3);
  const trimRight = roundMm(totalWidthMm - bleedMm);
  const trimBottom = roundMm(totalHeightMm - bleedMm);
  const spineRight = roundMm(spine.x + spine.width);
  const spineCenterX = roundMm(spine.x + spine.width / 2);
  const spineCenterY = roundMm(spine.y + spine.height / 2);

  // 외곽 재단선 톰보 마크 + 책등 접지 마크
  const cropMarks = [
    // 좌상
    `<line x1="${bleedMm}" y1="0" x2="${bleedMm}" y2="${cropLen}" stroke="#111827" stroke-width="0.25" />`,
    `<line x1="0" y1="${bleedMm}" x2="${cropLen}" y2="${bleedMm}" stroke="#111827" stroke-width="0.25" />`,
    // 우상
    `<line x1="${trimRight}" y1="0" x2="${trimRight}" y2="${cropLen}" stroke="#111827" stroke-width="0.25" />`,
    `<line x1="${roundMm(totalWidthMm - cropLen)}" y1="${bleedMm}" x2="${totalWidthMm}" y2="${bleedMm}" stroke="#111827" stroke-width="0.25" />`,
    // 좌하
    `<line x1="${bleedMm}" y1="${roundMm(totalHeightMm - cropLen)}" x2="${bleedMm}" y2="${totalHeightMm}" stroke="#111827" stroke-width="0.25" />`,
    `<line x1="0" y1="${trimBottom}" x2="${cropLen}" y2="${trimBottom}" stroke="#111827" stroke-width="0.25" />`,
    // 우하
    `<line x1="${trimRight}" y1="${roundMm(totalHeightMm - cropLen)}" x2="${trimRight}" y2="${totalHeightMm}" stroke="#111827" stroke-width="0.25" />`,
    `<line x1="${roundMm(totalWidthMm - cropLen)}" y1="${trimBottom}" x2="${totalWidthMm}" y2="${trimBottom}" stroke="#111827" stroke-width="0.25" />`,
    // 책등 접지 톰보(상/하)
    `<line x1="${spine.x}" y1="0" x2="${spine.x}" y2="${cropLen}" stroke="#2563eb" stroke-width="0.3" />`,
    `<line x1="${spineRight}" y1="0" x2="${spineRight}" y2="${cropLen}" stroke="#2563eb" stroke-width="0.3" />`,
    `<line x1="${spine.x}" y1="${roundMm(totalHeightMm - cropLen)}" x2="${spine.x}" y2="${totalHeightMm}" stroke="#2563eb" stroke-width="0.3" />`,
    `<line x1="${spineRight}" y1="${roundMm(totalHeightMm - cropLen)}" x2="${spineRight}" y2="${totalHeightMm}" stroke="#2563eb" stroke-width="0.3" />`,
  ].join("");

  const spineTextElement = spec.canPrintSpineText
    ? `<text x="${spineCenterX}" y="${spineCenterY}" text-anchor="middle" dominant-baseline="middle" transform="rotate(90 ${spineCenterX} ${spineCenterY})" fill="#1e293b" font-size="${Math.min(4.8, Math.max(2.6, roundMm(spineMm * 0.42)))}" font-weight="700" font-family="'Pretendard', sans-serif">${safeTitle} ${safeVolume} · ${safeAuthor}</text>`
    : "";

  const spineSafeElement = spineSafe
    ? `<rect x="${spineSafe.x}" y="${spineSafe.y}" width="${spineSafe.width}" height="${spineSafe.height}" fill="none" stroke="#0891b2" stroke-width="0.3" stroke-dasharray="1.8 1.2" />`
    : "";

  const specFooter = escapeXml(
    `${spec.format.labelKo} | ${spec.normalizedPageCount}쪽 ${spec.paperStock.labelKo} | 책등 ${spineMm}mm | 재단선(Bleed) ${bleedMm}mm | 펼침 ${totalWidthMm}×${totalHeightMm}mm (${spec.totalWidthPx300}×${spec.totalHeightPx300}px @300DPI)`,
  );

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidthMm}mm" height="${totalHeightMm}mm" viewBox="0 0 ${totalWidthMm} ${totalHeightMm}" role="img" aria-label="${safeTitle} 단행본 앞·책등·뒤 재단선 표지 템플릿">`,
    // 전체 Bleed 바탕(3mm 재단 여분)
    `<rect x="0" y="0" width="${totalWidthMm}" height="${totalHeightMm}" fill="#fde8ee" />`,
    // 뒤표지 / 책등 / 앞표지 실 재단 영역
    `<rect x="${backCover.x}" y="${backCover.y}" width="${backCover.width}" height="${backCover.height}" fill="#faf8f5" stroke="#e11d48" stroke-width="0.35" />`,
    `<rect x="${spine.x}" y="${spine.y}" width="${spine.width}" height="${spine.height}" fill="#eef4ff" stroke="#2563eb" stroke-width="0.35" />`,
    `<rect x="${frontCover.x}" y="${frontCover.y}" width="${frontCover.width}" height="${frontCover.height}" fill="#ffffff" stroke="#e11d48" stroke-width="0.35" />`,
    // 안전선 가이드 (5mm safe zone)
    `<rect x="${backSafe.x}" y="${backSafe.y}" width="${backSafe.width}" height="${backSafe.height}" fill="none" stroke="#0891b2" stroke-width="0.35" stroke-dasharray="2.5 1.5" />`,
    `<rect x="${frontSafe.x}" y="${frontSafe.y}" width="${frontSafe.width}" height="${frontSafe.height}" fill="none" stroke="#0891b2" stroke-width="0.35" stroke-dasharray="2.5 1.5" />`,
    spineSafeElement,
    // 뒤표지 바코드 안전 박스
    `<rect x="${barcodeSafe.x}" y="${barcodeSafe.y}" width="${barcodeSafe.width}" height="${barcodeSafe.height}" fill="#ffffff" stroke="#64748b" stroke-width="0.35" stroke-dasharray="1.5 1" />`,
    `<text x="${roundMm(barcodeSafe.x + barcodeSafe.width / 2)}" y="${roundMm(barcodeSafe.y + barcodeSafe.height / 2)}" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-size="3.2" font-family="sans-serif">ISBN 바코드 안전구역 (38×25mm)</text>`,
    // 뒤표지 안내 라벨
    `<text x="${roundMm(backCover.x + backCover.width / 2)}" y="${roundMm(backCover.y + 18)}" text-anchor="middle" fill="#64748b" font-size="4.2" font-weight="700" font-family="'Pretendard', sans-serif">뒤표지 (BACK COVER)</text>`,
    `<text x="${roundMm(backCover.x + backCover.width / 2)}" y="${roundMm(backCover.y + 26)}" text-anchor="middle" fill="#94a3b8" font-size="3.3" font-family="sans-serif">${spec.format.trimWidthMm} × ${spec.format.trimHeightMm} mm</text>`,
    // 책등 중앙선 및 텍스트
    `<line x1="${spineCenterX}" y1="${spine.y}" x2="${spineCenterX}" y2="${roundMm(spine.y + spine.height)}" stroke="#93c5fd" stroke-width="0.25" stroke-dasharray="1.5 1.5" />`,
    `<text x="${spineCenterX}" y="${roundMm(spine.y + 10)}" text-anchor="middle" fill="#1d4ed8" font-size="2.6" font-weight="700" font-family="sans-serif">${spineMm}mm</text>`,
    spineTextElement,
    // 앞표지 타이틀 조판 미리보기
    `<text x="${roundMm(frontCover.x + frontCover.width / 2)}" y="${roundMm(frontCover.y + 18)}" text-anchor="middle" fill="#0891b2" font-size="4.2" font-weight="700" font-family="'Pretendard', sans-serif">앞표지 (FRONT COVER)</text>`,
    `<text x="${roundMm(frontCover.x + frontCover.width / 2)}" y="${roundMm(frontCover.y + 72)}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="800" font-family="'Pretendard', sans-serif">${safeTitle}</text>`,
    `<text x="${roundMm(frontCover.x + frontCover.width / 2)}" y="${roundMm(frontCover.y + 88)}" text-anchor="middle" fill="#334155" font-size="6.2" font-weight="700" font-family="'Pretendard', sans-serif">${safeVolume}</text>`,
    `<text x="${roundMm(frontCover.x + frontCover.width / 2)}" y="${roundMm(frontCover.y + frontCover.height - 24)}" text-anchor="middle" fill="#475569" font-size="4.6" font-weight="600" font-family="'Pretendard', sans-serif">${safeAuthor} · ${safePublisher}</text>`,
    // 하단 스펙 바
    `<text x="${roundMm(totalWidthMm / 2)}" y="${roundMm(totalHeightMm - bleedMm - 2.5)}" text-anchor="middle" fill="#64748b" font-size="2.8" font-family="sans-serif">${specFooter}</text>`,
    cropMarks,
    "</svg>",
  ].join("");

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  return { spec, svgMarkup, svgDataUrl };
}
