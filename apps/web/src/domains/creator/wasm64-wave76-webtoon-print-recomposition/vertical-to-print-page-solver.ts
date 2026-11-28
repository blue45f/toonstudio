/**
 * 세로 스크롤 웹툰을 가로 인쇄 단행본(B5·B6·북미 그래픽노블), ePub3 고정 레이아웃,
 * 9:16 숏폼 스토리보드로 자동 리컴포지션하는 페이지 분할·시선 동선 솔버.
 *
 * - 동적 계획법(DP) 기반 페이지 분할로 말풍선·핵심 피사체 잘림을 원천 차단한다.
 * - `isCliffhangerReveal` 컷은 책장을 넘긴 직후 짝수 페이지 첫 컷에 우선 배치한다.
 * - LTR/RTL 제본 방향과 홀·짝수(recto/verso) 안쪽 제본 여백을 반영해 재단·도련·안전 영역을 계산한다.
 */

export type PublicationFormatId =
  | "kr-b5-tankobon"
  | "jp-b6-manga"
  | "us-graphic-novel"
  | "epub-fixed-layout"
  | "shortform-9x16-storyboard";

export type ReadingDirection = "ltr" | "rtl";
export type ColorSpaceMode = "cmyk" | "rgb";
export type PageSide = "recto" | "verso";
export type SpineEdge = "left" | "right" | "none";
export type PanelFitMode = "cover-protected" | "contain-protected" | "full-bleed";

export interface TitleSafeInsetMm { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number; }
export interface PanelLocalRectPx { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly label?: string; }
export interface RectMm { readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number; }
export interface SourceCropRectPx { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface GazeFlowPointMm { readonly panelId: string; readonly xMm: number; readonly yMm: number; }

export interface PublicationFormatSpec {
  readonly formatId: PublicationFormatId;
  readonly labelKo: string;
  readonly colorSpace: ColorSpaceMode;
  readonly defaultReadingDirection: ReadingDirection;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly dpi: number;
  readonly trimWidthPx: number;
  readonly trimHeightPx: number;
  readonly bleedWidthPx: number;
  readonly bleedHeightPx: number;
  /** 바깥 여백 및 표준 페이지 거터(mm). */
  readonly gutterMm: number;
  /** 제본선 안쪽 여백(mm) — 홀·짝수 페이지에서 좌/우가 교대한다. */
  readonly insideSpineMarginMm: number;
  readonly outsideMarginMm: number;
  readonly topMarginMm: number;
  readonly bottomMarginMm: number;
  readonly panelGutterMm: number;
  readonly minPanelsPerPage: number;
  readonly targetPanelsPerPage: number;
  readonly maxPanelsPerPage: number;
  readonly supportsDualPageSpread: boolean;
  readonly hasAlternatingSpine: boolean;
  readonly titleSafeInsetMm?: TitleSafeInsetMm;
}

export interface VerticalWebtoonPanelSpec {
  readonly id: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly importanceWeight: number;
  readonly isCliffhangerReveal?: boolean;
  readonly isSplashSpread?: boolean;
  readonly focalSubjectBox?: PanelLocalRectPx;
  readonly speechBalloonSafeBoxes: readonly PanelLocalRectPx[];
  readonly verticalWhitespaceBeforePx: number;
}

export interface PageBoxGeometryMm {
  readonly pageNumber: number;
  readonly pageSide: PageSide;
  readonly spineEdge: SpineEdge;
  readonly trimBoxMm: RectMm;
  readonly bleedBoxMm: RectMm;
  readonly liveSafeBoxMm: RectMm;
  readonly spineZoneMm: RectMm | null;
}

export interface PlacedPrintPanel {
  readonly panelId: string;
  readonly sourceIndex: number;
  readonly readingOrderOnPage: number;
  readonly rowIndex: number;
  readonly columnIndexInReadingOrder: number;
  readonly isFullBleed: boolean;
  readonly isCliffhangerReveal: boolean;
  readonly isSplashSpread: boolean;
  readonly fitMode: PanelFitMode;
  readonly slotFrameMm: RectMm;
  readonly contentFrameMm: RectMm;
  readonly sourceCropPx: SourceCropRectPx;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly scaleMmPerPx: number;
  readonly effectiveDpi: number;
  readonly mappedFocalSubjectMm: RectMm | null;
  readonly mappedSpeechBalloonsMm: readonly RectMm[];
  readonly balloonClippedCount: number;
  readonly focalSubjectClippedCount: number;
}

export interface GazeFlowVerification {
  readonly readingDirection: ReadingDirection;
  readonly panelOrderIds: readonly string[];
  readonly overlapCount: number;
  readonly monotonicRowOrderValid: boolean;
  readonly verticalRowProgressionValid: boolean;
  readonly minGutterMm: number;
  readonly maxGutterMm: number;
  readonly gutterConsistent: boolean;
  readonly gazePathPointsMm: readonly GazeFlowPointMm[];
  readonly smoothnessScore: number;
}

export interface RecomposedPrintPage {
  readonly pageNumber: number;
  readonly pageSide: PageSide;
  readonly spineEdge: SpineEdge;
  readonly isSplashPage: boolean;
  readonly isDualPageSpread: boolean;
  readonly hasCliffhangerRevealAtStart: boolean;
  readonly isPostPageTurnReveal: boolean;
  readonly trimBoxMm: RectMm;
  readonly bleedBoxMm: RectMm;
  readonly liveSafeBoxMm: RectMm;
  readonly spineZoneMm: RectMm | null;
  readonly placedPanels: readonly PlacedPrintPanel[];
  readonly gazeFlow: GazeFlowVerification;
}

export interface RecompositionOptions {
  readonly formatId: PublicationFormatId;
  readonly readingDirection?: ReadingDirection;
  readonly startPageNumber?: number;
  readonly allowDualPageSplashSpread?: boolean;
}

export interface RecompositionMetricsSummary {
  readonly totalSourcePanels: number;
  readonly totalPages: number;
  readonly totalOverlapCount: number;
  readonly balloonClippedCount: number;
  readonly focalSubjectClippedCount: number;
  readonly cliffhangerTotalCount: number;
  readonly cliffhangerPostTurnPlacedCount: number;
  readonly splashPageCount: number;
  readonly allPagesMonotonicGazeValid: boolean;
  readonly averagePanelsPerPage: number;
}

export interface RecompositionResult {
  readonly format: PublicationFormatSpec;
  readonly readingDirection: ReadingDirection;
  readonly pages: readonly RecomposedPrintPage[];
  readonly summary: RecompositionMetricsSummary;
}

const MM_PER_INCH = 25.4;
const EPSILON = 1e-4;
const mmToPx = (mm: number, dpi: number): number => Math.round((mm / MM_PER_INCH) * dpi);
const roundMm = (value: number): number => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const SUPPORTED_PUBLICATION_FORMATS: readonly PublicationFormatId[] = [
  "kr-b5-tankobon", "jp-b6-manga", "us-graphic-novel", "epub-fixed-layout", "shortform-9x16-storyboard",
];

export const PUBLICATION_FORMAT_SPECS: Readonly<Record<PublicationFormatId, PublicationFormatSpec>> = {
  "kr-b5-tankobon": {
    formatId: "kr-b5-tankobon", labelKo: "한국 B5 단행본 인쇄판 (182×257mm, LTR)",
    colorSpace: "cmyk", defaultReadingDirection: "ltr",
    trimWidthMm: 182, trimHeightMm: 257, bleedMm: 3, dpi: 300,
    trimWidthPx: mmToPx(182, 300), trimHeightPx: mmToPx(257, 300), bleedWidthPx: mmToPx(188, 300), bleedHeightPx: mmToPx(263, 300),
    gutterMm: 12, insideSpineMarginMm: 14, outsideMarginMm: 12, topMarginMm: 14, bottomMarginMm: 15,
    panelGutterMm: 4.5, minPanelsPerPage: 1, targetPanelsPerPage: 4, maxPanelsPerPage: 6,
    supportsDualPageSpread: true, hasAlternatingSpine: true,
  },
  "jp-b6-manga": {
    formatId: "jp-b6-manga", labelKo: "일본 B6 코믹 단행본 (128×182mm, RTL)",
    colorSpace: "cmyk", defaultReadingDirection: "rtl",
    trimWidthMm: 128, trimHeightMm: 182, bleedMm: 3, dpi: 300,
    trimWidthPx: mmToPx(128, 300), trimHeightPx: mmToPx(182, 300), bleedWidthPx: mmToPx(134, 300), bleedHeightPx: mmToPx(188, 300),
    gutterMm: 9, insideSpineMarginMm: 12, outsideMarginMm: 9, topMarginMm: 11, bottomMarginMm: 12,
    panelGutterMm: 3.5, minPanelsPerPage: 1, targetPanelsPerPage: 4, maxPanelsPerPage: 6,
    supportsDualPageSpread: true, hasAlternatingSpine: true,
  },
  "us-graphic-novel": {
    formatId: "us-graphic-novel", labelKo: "북미 그래픽노블 (168×259mm, LTR)",
    colorSpace: "cmyk", defaultReadingDirection: "ltr",
    trimWidthMm: 168, trimHeightMm: 259, bleedMm: 3.175, dpi: 300,
    trimWidthPx: mmToPx(168, 300), trimHeightPx: mmToPx(259, 300), bleedWidthPx: mmToPx(174.35, 300), bleedHeightPx: mmToPx(265.35, 300),
    gutterMm: 10, insideSpineMarginMm: 12.7, outsideMarginMm: 10, topMarginMm: 12.7, bottomMarginMm: 12.7,
    panelGutterMm: 4, minPanelsPerPage: 1, targetPanelsPerPage: 4, maxPanelsPerPage: 6,
    supportsDualPageSpread: true, hasAlternatingSpine: true,
  },
  "epub-fixed-layout": {
    formatId: "epub-fixed-layout", labelKo: "ePub3 고정 레이아웃 전자책 (1600×2560px RGB)",
    colorSpace: "rgb", defaultReadingDirection: "ltr",
    trimWidthMm: 203.2, trimHeightMm: 325.12, bleedMm: 0, dpi: 200,
    trimWidthPx: 1600, trimHeightPx: 2560, bleedWidthPx: 1600, bleedHeightPx: 2560,
    gutterMm: 8, insideSpineMarginMm: 8, outsideMarginMm: 8, topMarginMm: 10, bottomMarginMm: 10,
    panelGutterMm: 4, minPanelsPerPage: 1, targetPanelsPerPage: 4, maxPanelsPerPage: 6,
    supportsDualPageSpread: true, hasAlternatingSpine: false,
  },
  "shortform-9x16-storyboard": {
    formatId: "shortform-9x16-storyboard", labelKo: "9:16 숏폼 스토리보드 (1080×1920px RGB)",
    colorSpace: "rgb", defaultReadingDirection: "ltr",
    trimWidthMm: 182.88, trimHeightMm: 325.12, bleedMm: 0, dpi: 150,
    trimWidthPx: 1080, trimHeightPx: 1920, bleedWidthPx: 1080, bleedHeightPx: 1920,
    gutterMm: 10, insideSpineMarginMm: 10, outsideMarginMm: 10, topMarginMm: 22, bottomMarginMm: 44,
    panelGutterMm: 5, minPanelsPerPage: 1, targetPanelsPerPage: 1, maxPanelsPerPage: 2,
    supportsDualPageSpread: false, hasAlternatingSpine: false,
    titleSafeInsetMm: { top: 22, right: 10, bottom: 44, left: 10 },
  },
};

/** 페이지 번호·제본 방향·펼침 여부에 따라 재단선(Trim)·도련(Bleed)·안전 영역(Live Safe)을 계산한다. */
export function computePageBoxGeometry(
  format: PublicationFormatSpec,
  pageNumber: number,
  readingDirection: ReadingDirection,
  isDualPageSpread = false
): PageBoxGeometryMm {
  const isOdd = pageNumber % 2 !== 0;
  const pageSide: PageSide = readingDirection === "ltr" ? (isOdd ? "recto" : "verso") : isOdd ? "verso" : "recto";
  const trimW = isDualPageSpread ? roundMm(format.trimWidthMm * 2) : format.trimWidthMm;
  const trimH = format.trimHeightMm;
  const bleed = format.bleedMm;
  const trimBoxMm: RectMm = { xMm: 0, yMm: 0, widthMm: trimW, heightMm: trimH };
  const bleedBoxMm: RectMm = {
    xMm: roundMm(-bleed), yMm: roundMm(-bleed),
    widthMm: roundMm(trimW + bleed * 2), heightMm: roundMm(trimH + bleed * 2),
  };

  if (isDualPageSpread) {
    return {
      pageNumber, pageSide, spineEdge: "none", trimBoxMm, bleedBoxMm,
      liveSafeBoxMm: {
        xMm: roundMm(format.outsideMarginMm), yMm: roundMm(format.topMarginMm),
        widthMm: roundMm(trimW - format.outsideMarginMm * 2),
        heightMm: roundMm(trimH - format.topMarginMm - format.bottomMarginMm),
      },
      spineZoneMm: {
        xMm: roundMm(format.trimWidthMm - format.insideSpineMarginMm), yMm: 0,
        widthMm: roundMm(format.insideSpineMarginMm * 2), heightMm: trimH,
      },
    };
  }

  let spineEdge: SpineEdge = "none";
  let leftM = format.titleSafeInsetMm ? format.titleSafeInsetMm.left : format.outsideMarginMm;
  let rightM = format.titleSafeInsetMm ? format.titleSafeInsetMm.right : format.outsideMarginMm;
  if (format.hasAlternatingSpine) {
    spineEdge = pageSide === "recto" ? "left" : "right";
    leftM = spineEdge === "left" ? format.insideSpineMarginMm : format.outsideMarginMm;
    rightM = spineEdge === "right" ? format.insideSpineMarginMm : format.outsideMarginMm;
  }
  const topM = format.titleSafeInsetMm ? format.titleSafeInsetMm.top : format.topMarginMm;
  const bottomM = format.titleSafeInsetMm ? format.titleSafeInsetMm.bottom : format.bottomMarginMm;
  const liveSafeBoxMm: RectMm = {
    xMm: roundMm(leftM), yMm: roundMm(topM),
    widthMm: roundMm(trimW - leftM - rightM), heightMm: roundMm(trimH - topM - bottomM),
  };
  const spineZoneMm: RectMm | null =
    spineEdge === "left"
      ? { xMm: 0, yMm: 0, widthMm: format.insideSpineMarginMm, heightMm: trimH }
      : spineEdge === "right"
        ? { xMm: roundMm(trimW - format.insideSpineMarginMm), yMm: 0, widthMm: format.insideSpineMarginMm, heightMm: trimH }
        : null;
  return { pageNumber, pageSide, spineEdge, trimBoxMm, bleedBoxMm, liveSafeBoxMm, spineZoneMm };
}

function clampLocalRect(r: PanelLocalRectPx, maxW: number, maxH: number): PanelLocalRectPx {
  const x1 = clamp(r.x, 0, maxW);
  const y1 = clamp(r.y, 0, maxH);
  return {
    x: x1, y: y1,
    width: clamp(r.x + Math.max(0, r.width), x1, maxW) - x1,
    height: clamp(r.y + Math.max(0, r.height), y1, maxH) - y1,
    label: r.label,
  };
}

function computeProtectedBoundsPx(panel: VerticalWebtoonPanelSpec): PanelLocalRectPx | null {
  const boxes: PanelLocalRectPx[] = [];
  if (panel.focalSubjectBox) boxes.push(clampLocalRect(panel.focalSubjectBox, panel.widthPx, panel.heightPx));
  for (const b of panel.speechBalloonSafeBoxes) boxes.push(clampLocalRect(b, panel.widthPx, panel.heightPx));
  if (boxes.length === 0) return null;
  let minX = boxes[0].x;
  let minY = boxes[0].y;
  let maxX = boxes[0].x + boxes[0].width;
  let maxY = boxes[0].y + boxes[0].height;
  for (let i = 1; i < boxes.length; i += 1) {
    minX = Math.min(minX, boxes[i].x);
    minY = Math.min(minY, boxes[i].y);
    maxX = Math.max(maxX, boxes[i].x + boxes[i].width);
    maxY = Math.max(maxY, boxes[i].y + boxes[i].height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function isRectContained(inner: RectMm, outer: RectMm): boolean {
  return (
    inner.xMm >= outer.xMm - EPSILON && inner.yMm >= outer.yMm - EPSILON &&
    inner.xMm + inner.widthMm <= outer.xMm + outer.widthMm + EPSILON &&
    inner.yMm + inner.heightMm <= outer.yMm + outer.heightMm + EPSILON
  );
}

const mapLocalRectToPageMm = (local: PanelLocalRectPx, crop: SourceCropRectPx, frame: RectMm, scale: number): RectMm => ({
  xMm: roundMm(frame.xMm + (local.x - crop.x) * scale),
  yMm: roundMm(frame.yMm + (local.y - crop.y) * scale),
  widthMm: roundMm(local.width * scale),
  heightMm: roundMm(local.height * scale),
});

/** 원본 컷을 목표 슬롯에 배치할 때 말풍선·핵심 피사체 잘림을 원천 차단하는 크롭/배율 솔버. */
function fitPanelIntoSlot(
  panel: VerticalWebtoonPanelSpec, sourceIndex: number, readingOrderOnPage: number,
  rowIndex: number, columnIndexInReadingOrder: number,
  slotFrameMm: RectMm, trimBoxMm: RectMm, isFullBleed: boolean
): PlacedPrintPanel {
  const srcW = Math.max(1, panel.widthPx);
  const srcH = Math.max(1, panel.heightPx);
  const protectedBox = computeProtectedBoundsPx(panel);
  const focalClamped = panel.focalSubjectBox ? clampLocalRect(panel.focalSubjectBox, srcW, srcH) : null;
  const balloonsClamped = panel.speechBalloonSafeBoxes.map((b) => clampLocalRect(b, srcW, srcH));

  const targetAspect = slotFrameMm.widthMm / Math.max(EPSILON, slotFrameMm.heightMm);
  const srcAspect = srcW / srcH;
  const coverW = srcAspect > targetAspect ? srcH * targetAspect : srcW;
  const coverH = srcAspect > targetAspect ? srcH : srcW / targetAspect;
  const canCover = protectedBox === null || (protectedBox.width <= coverW + EPSILON && protectedBox.height <= coverH + EPSILON);

  let sourceCropPx: SourceCropRectPx;
  let contentFrameMm: RectMm;
  let scaleMmPerPx: number;
  let fitMode: PanelFitMode;

  if (canCover) {
    const anchor = focalClamped ?? protectedBox;
    const anchorX = anchor ? anchor.x + anchor.width * 0.5 : srcW * 0.5;
    const anchorY = anchor ? anchor.y + anchor.height * 0.5 : srcH * 0.5;
    let minX = 0;
    let maxX = Math.max(0, srcW - coverW);
    let minY = 0;
    let maxY = Math.max(0, srcH - coverH);
    if (protectedBox) {
      minX = Math.max(minX, protectedBox.x + protectedBox.width - coverW);
      maxX = Math.min(maxX, protectedBox.x);
      minY = Math.max(minY, protectedBox.y + protectedBox.height - coverH);
      maxY = Math.min(maxY, protectedBox.y);
      if (minX > maxX) minX = maxX = (minX + maxX) * 0.5;
      if (minY > maxY) minY = maxY = (minY + maxY) * 0.5;
    }
    sourceCropPx = {
      x: roundMm(clamp(anchorX - coverW * 0.5, minX, maxX)),
      y: roundMm(clamp(anchorY - coverH * 0.5, minY, maxY)),
      width: roundMm(coverW), height: roundMm(coverH),
    };
    contentFrameMm = slotFrameMm;
    scaleMmPerPx = slotFrameMm.widthMm / Math.max(EPSILON, coverW);
    fitMode = isFullBleed ? "full-bleed" : "cover-protected";
  } else {
    const reqMinX = Math.max(0, protectedBox.x - srcW * 0.02);
    const reqMinY = Math.max(0, protectedBox.y - srcH * 0.02);
    const cropW = isFullBleed ? srcW : Math.max(1, Math.min(srcW, protectedBox.x + protectedBox.width + srcW * 0.02) - reqMinX);
    const cropH = isFullBleed ? srcH : Math.max(1, Math.min(srcH, protectedBox.y + protectedBox.height + srcH * 0.02) - reqMinY);
    sourceCropPx = isFullBleed
      ? { x: 0, y: 0, width: srcW, height: srcH }
      : { x: roundMm(reqMinX), y: roundMm(reqMinY), width: roundMm(cropW), height: roundMm(cropH) };
    scaleMmPerPx = Math.min(slotFrameMm.widthMm / cropW, slotFrameMm.heightMm / cropH);
    const rw = roundMm(cropW * scaleMmPerPx);
    const rh = roundMm(cropH * scaleMmPerPx);
    contentFrameMm = {
      xMm: roundMm(slotFrameMm.xMm + (slotFrameMm.widthMm - rw) * 0.5),
      yMm: roundMm(slotFrameMm.yMm + (slotFrameMm.heightMm - rh) * 0.5),
      widthMm: rw, heightMm: rh,
    };
    fitMode = isFullBleed ? "full-bleed" : "contain-protected";
  }

  const mappedFocalSubjectMm = focalClamped ? mapLocalRectToPageMm(focalClamped, sourceCropPx, contentFrameMm, scaleMmPerPx) : null;
  const mappedSpeechBalloonsMm = balloonsClamped.map((b) => mapLocalRectToPageMm(b, sourceCropPx, contentFrameMm, scaleMmPerPx));
  let balloonClippedCount = 0;
  for (const m of mappedSpeechBalloonsMm) {
    if (!isRectContained(m, contentFrameMm) || !isRectContained(m, trimBoxMm)) balloonClippedCount += 1;
  }
  const focalSubjectClippedCount =
    mappedFocalSubjectMm && (!isRectContained(mappedFocalSubjectMm, contentFrameMm) || !isRectContained(mappedFocalSubjectMm, trimBoxMm))
      ? 1 : 0;
  const effectiveDpi = Math.round(
    Math.min(
      (sourceCropPx.width / Math.max(EPSILON, contentFrameMm.widthMm)) * MM_PER_INCH,
      (sourceCropPx.height / Math.max(EPSILON, contentFrameMm.heightMm)) * MM_PER_INCH
    ) * 10
  ) / 10;

  return {
    panelId: panel.id, sourceIndex, readingOrderOnPage, rowIndex, columnIndexInReadingOrder,
    isFullBleed, isCliffhangerReveal: Boolean(panel.isCliffhangerReveal), isSplashSpread: Boolean(panel.isSplashSpread),
    fitMode, slotFrameMm, contentFrameMm, sourceCropPx, sourceWidthPx: srcW, sourceHeightPx: srcH,
    scaleMmPerPx: Math.round(scaleMmPerPx * 100000) / 100000, effectiveDpi,
    mappedFocalSubjectMm, mappedSpeechBalloonsMm, balloonClippedCount, focalSubjectClippedCount,
  };
}

function candidateRowPartitions(count: number): readonly (readonly number[])[] {
  if (count === 1) return [[1]];
  if (count === 2) return [[1, 1], [2]];
  if (count === 3) return [[1, 2], [2, 1], [1, 1, 1]];
  if (count === 4) return [[2, 2], [1, 2, 1], [2, 1, 1], [1, 1, 2], [1, 3], [3, 1]];
  if (count === 5) return [[2, 3], [3, 2], [1, 2, 2], [2, 2, 1], [2, 1, 2]];
  if (count === 6) return [[2, 2, 2], [3, 3], [2, 3, 1], [1, 3, 2]];
  const rows: number[] = [];
  for (let rem = count; rem > 0; rem -= rem >= 3 ? 2 : rem) rows.push(rem >= 3 ? 2 : rem);
  return [rows];
}

interface RowLayoutEvaluation {
  readonly slots: readonly { readonly rowIndex: number; readonly columnIndex: number; readonly slotFrameMm: RectMm }[];
  readonly layoutPenalty: number;
}

function panelPreferredAspect(panel: VerticalWebtoonPanelSpec): number {
  const prot = computeProtectedBoundsPx(panel);
  const raw = panel.widthPx / Math.max(1, panel.heightPx);
  return !prot || prot.height <= 0 ? clamp(raw, 0.45, 2.4) : clamp(raw * 0.45 + (prot.width / prot.height) * 0.55, 0.48, 2.2);
}

/** 주어진 컷 슬라이스에 대해 스트립 패킹 행 분할 중 왜곡이 가장 적은 레이아웃을 선택한다. */
function computeBestStripLayout(
  slice: readonly VerticalWebtoonPanelSpec[], liveBox: RectMm, panelGutterMm: number, readingDirection: ReadingDirection
): RowLayoutEvaluation {
  let best: RowLayoutEvaluation | null = null;
  for (const rowCounts of candidateRowPartitions(slice.length)) {
    const rowCount = rowCounts.length;
    const usableH = Math.max(10, liveBox.heightMm - panelGutterMm * Math.max(0, rowCount - 1));
    const rowNatHeights: number[] = [];
    const rowPanelsList: VerticalWebtoonPanelSpec[][] = [];
    let cursor = 0;

    for (let r = 0; r < rowCount; r += 1) {
      const cols = rowCounts[r];
      const rowPanels = slice.slice(cursor, cursor + cols);
      rowPanelsList.push(rowPanels);
      cursor += cols;
      const usableRowW = Math.max(10, liveBox.widthMm - panelGutterMm * Math.max(0, cols - 1));
      let aspectSum = 0;
      let maxImp = 1;
      for (const p of rowPanels) {
        aspectSum += panelPreferredAspect(p);
        if (p.importanceWeight > maxImp) maxImp = p.importanceWeight;
      }
      const idealH = (usableRowW / Math.max(0.35, aspectSum)) * (0.85 + 0.15 * clamp(maxImp, 0.6, 2.0));
      rowNatHeights.push(clamp(idealH, usableH * 0.18, usableH * 0.72));
    }

    const sumNatH = rowNatHeights.reduce((a, b) => a + b, 0);
    const slots: { rowIndex: number; columnIndex: number; slotFrameMm: RectMm }[] = [];
    let penalty = 0;
    let yCursor = liveBox.yMm;
    let hasMultiColRow = false;

    for (let r = 0; r < rowCount; r += 1) {
      const rowPanels = rowPanelsList[r];
      const cols = rowPanels.length;
      if (cols >= 2) hasMultiColRow = true;
      const rowH = (rowNatHeights[r] / sumNatH) * usableH;
      const usableRowW = Math.max(10, liveBox.widthMm - panelGutterMm * Math.max(0, cols - 1));
      const colWeights = rowPanels.map((p) => panelPreferredAspect(p) * (0.72 + 0.28 * clamp(p.importanceWeight, 0.6, 2.0)));
      const sumColW = colWeights.reduce((a, b) => a + b, 0);
      let xCursor = readingDirection === "ltr" ? liveBox.xMm : liveBox.xMm + liveBox.widthMm;

      for (let c = 0; c < cols; c += 1) {
        const w = (colWeights[c] / sumColW) * usableRowW;
        const xPos = readingDirection === "ltr" ? xCursor : xCursor - w;
        slots.push({
          rowIndex: r, columnIndex: c,
          slotFrameMm: { xMm: roundMm(xPos), yMm: roundMm(yCursor), widthMm: roundMm(w), heightMm: roundMm(rowH) },
        });
        const targetAspect = w / Math.max(EPSILON, rowH);
        const logRatio = Math.log(targetAspect / Math.max(EPSILON, panelPreferredAspect(rowPanels[c])));
        penalty += logRatio * logRatio * 6.5;
        const prot = computeProtectedBoundsPx(rowPanels[c]);
        if (prot && prot.height > 0) {
          const protLog = Math.log(targetAspect / Math.max(EPSILON, prot.width / prot.height));
          penalty += protLog * protLog * 2.5;
        }
        xCursor += readingDirection === "ltr" ? w + panelGutterMm : -(w + panelGutterMm);
      }
      yCursor += rowH + panelGutterMm;
    }

    if (slice.length >= 3 && !hasMultiColRow) penalty += 4.0;
    if (!best || penalty < best.layoutPenalty) best = { slots, layoutPenalty: penalty };
  }
  return best as RowLayoutEvaluation;
}

function rectsOverlapArea(a: RectMm, b: RectMm): number {
  const ox = Math.min(a.xMm + a.widthMm, b.xMm + b.widthMm) - Math.max(a.xMm, b.xMm);
  const oy = Math.min(a.yMm + a.heightMm, b.yMm + b.heightMm) - Math.max(a.yMm, b.yMm);
  return ox > EPSILON && oy > EPSILON ? ox * oy : 0;
}

/** 한 페이지 내 컷 배치의 시선 동선 단조성(LTR/RTL)·겹침 0건·거터 일관성을 검증한다. */
export function verifyPageGazeFlow(
  placedPanels: readonly PlacedPrintPanel[], readingDirection: ReadingDirection, expectedGutterMm: number
): GazeFlowVerification {
  const ordered = [...placedPanels].sort((a, b) => a.readingOrderOnPage - b.readingOrderOnPage);
  let overlapCount = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (rectsOverlapArea(ordered[i].slotFrameMm, ordered[j].slotFrameMm) > EPSILON) overlapCount += 1;
    }
  }

  const rowsMap = new Map<number, PlacedPrintPanel[]>();
  for (const p of ordered) {
    const list = rowsMap.get(p.rowIndex) ?? [];
    list.push(p);
    rowsMap.set(p.rowIndex, list);
  }
  const rowKeys = Array.from(rowsMap.keys()).sort((a, b) => a - b);

  let monotonicRowOrderValid = true;
  let verticalRowProgressionValid = true;
  const gutters: number[] = [];

  for (let rk = 0; rk < rowKeys.length; rk += 1) {
    const rowPanels = rowsMap.get(rowKeys[rk]) ?? [];
    for (let i = 1; i < rowPanels.length; i += 1) {
      const prev = rowPanels[i - 1].slotFrameMm;
      const curr = rowPanels[i].slotFrameMm;
      if (readingDirection === "ltr") {
        if (curr.xMm <= prev.xMm + EPSILON) monotonicRowOrderValid = false;
        gutters.push(roundMm(curr.xMm - (prev.xMm + prev.widthMm)));
      } else {
        if (curr.xMm >= prev.xMm - EPSILON) monotonicRowOrderValid = false;
        gutters.push(roundMm(prev.xMm - (curr.xMm + curr.widthMm)));
      }
    }
    if (rk > 0) {
      const prevRow = rowsMap.get(rowKeys[rk - 1]) ?? [];
      if (prevRow.length > 0 && rowPanels.length > 0) {
        const prevBottom = Math.max(...prevRow.map((p) => p.slotFrameMm.yMm + p.slotFrameMm.heightMm));
        const currTop = Math.min(...rowPanels.map((p) => p.slotFrameMm.yMm));
        if (currTop < prevBottom - EPSILON) verticalRowProgressionValid = false;
        gutters.push(roundMm(currTop - prevBottom));
      }
    }
  }

  const minGutterMm = gutters.length > 0 ? Math.min(...gutters) : expectedGutterMm;
  const maxGutterMm = gutters.length > 0 ? Math.max(...gutters) : expectedGutterMm;
  const gutterConsistent =
    gutters.length === 0 || (Math.abs(minGutterMm - expectedGutterMm) <= 0.15 && Math.abs(maxGutterMm - expectedGutterMm) <= 0.15);
  const gazePathPointsMm: GazeFlowPointMm[] = ordered.map((p) => ({
    panelId: p.panelId,
    xMm: roundMm(p.slotFrameMm.xMm + p.slotFrameMm.widthMm * 0.5),
    yMm: roundMm(p.slotFrameMm.yMm + p.slotFrameMm.heightMm * 0.5),
  }));

  let score = 100 - overlapCount * 35;
  if (!monotonicRowOrderValid) score -= 40;
  if (!verticalRowProgressionValid) score -= 30;
  if (!gutterConsistent) score -= 10;
  return {
    readingDirection, panelOrderIds: ordered.map((p) => p.panelId), overlapCount,
    monotonicRowOrderValid, verticalRowProgressionValid,
    minGutterMm: roundMm(minGutterMm), maxGutterMm: roundMm(maxGutterMm),
    gutterConsistent, gazePathPointsMm, smoothnessScore: clamp(score, 0, 100),
  };
}

interface PageRangePlan { readonly start: number; readonly end: number; readonly pageNumber: number; }

/** DP 상태 `dp[panelIndex][nextPageParity]`로 클리프행어 넘김·장면 호흡·비중 균형을 동시 최적화한다. */
function solveOptimalPagination(
  panels: readonly VerticalWebtoonPanelSpec[], format: PublicationFormatSpec,
  readingDirection: ReadingDirection, startPageNumber: number
): readonly PageRangePlan[] {
  const n = panels.length;
  if (n === 0) return [];
  const INF = 1e12;
  const dp: [number, number][] = Array.from({ length: n + 1 }, () => [INF, INF]);
  const prevIndex: [number, number][] = Array.from({ length: n + 1 }, () => [-1, -1]);
  const prevParity: [number, number][] = Array.from({ length: n + 1 }, () => [-1, -1]);
  dp[0][startPageNumber % 2 === 0 ? 0 : 1] = 0;

  const sampleLiveBox = computePageBoxGeometry(format, startPageNumber, readingDirection, false).liveSafeBoxMm;
  for (let start = 0; start < n; start += 1) {
    for (let parity = 0; parity <= 1; parity += 1) {
      const baseCost = dp[start][parity];
      if (baseCost >= INF * 0.5) continue;
      const first = panels[start];
      const maxEnd = first.isSplashSpread ? Math.min(n, start + 1) : Math.min(n, start + format.maxPanelsPerPage);

      for (let end = start + 1; end <= maxEnd; end += 1) {
        if (end - 1 > start && (panels[end - 1].isSplashSpread || panels[end - 1].isCliffhangerReveal)) break;
        const slice = panels.slice(start, end);
        let pageCost = 0;
        if (first.isSplashSpread) {
          pageCost += 1.5;
        } else {
          const count = slice.length;
          const countDiff = count - format.targetPanelsPerPage;
          pageCost += countDiff * countDiff * 2.6 + (count === 1 && n > 1 && format.targetPanelsPerPage >= 3 ? 9.5 : 0);
          const impDiff = slice.reduce((acc, p) => acc + clamp(p.importanceWeight, 0.5, 2.5), 0) - format.targetPanelsPerPage * 1.05;
          pageCost += impDiff * impDiff * 1.1;
          pageCost += computeBestStripLayout(slice, sampleLiveBox, format.panelGutterMm, readingDirection).layoutPenalty * 0.45;
        }
        if (start > 0 && first.verticalWhitespaceBeforePx >= 180) pageCost -= Math.min(14, first.verticalWhitespaceBeforePx / 28);
        if (first.isCliffhangerReveal && start > 0) pageCost += parity === 0 ? -80 : 140;

        const nextParity = 1 - parity;
        if (baseCost + pageCost < dp[end][nextParity]) {
          dp[end][nextParity] = baseCost + pageCost;
          prevIndex[end][nextParity] = start;
          prevParity[end][nextParity] = parity;
        }
      }
    }
  }

  const endParity = dp[n][0] <= dp[n][1] ? 0 : 1;
  if (dp[n][endParity] >= INF * 0.5) {
    return panels.map((_, idx) => ({ start: idx, end: idx + 1, pageNumber: startPageNumber + idx }));
  }
  const reversed: { start: number; end: number }[] = [];
  for (let cur = n, par = endParity; cur > 0; ) {
    const pStart = prevIndex[cur][par];
    const pPar = prevParity[cur][par];
    if (pStart < 0 || pPar < 0) break;
    reversed.push({ start: pStart, end: cur });
    cur = pStart;
    par = pPar;
  }
  reversed.reverse();
  return reversed.map((r, idx) => ({ start: r.start, end: r.end, pageNumber: startPageNumber + idx }));
}

/** 세로 스크롤 웹툰 컷열을 목표 출판 규격의 가로 페이지 단행본 레이아웃으로 리컴포지션한다. */
export function recomposeVerticalWebtoonToPages(
  panels: readonly VerticalWebtoonPanelSpec[],
  options: RecompositionOptions
): RecompositionResult {
  const format = PUBLICATION_FORMAT_SPECS[options.formatId];
  const readingDirection: ReadingDirection = options.readingDirection ?? format.defaultReadingDirection;
  const startPageNumber = Math.max(1, Math.floor(options.startPageNumber ?? 1));
  const allowDualSpread = options.allowDualPageSplashSpread ?? true;

  const ranges = solveOptimalPagination(panels, format, readingDirection, startPageNumber);
  const pages: RecomposedPrintPage[] = [];
  let totalOverlapCount = 0;
  let balloonClippedCount = 0;
  let focalSubjectClippedCount = 0;
  let cliffhangerTotalCount = 0;
  let cliffhangerPostTurnPlacedCount = 0;
  let splashPageCount = 0;
  let allPagesMonotonicGazeValid = true;

  for (const range of ranges) {
    const slice = panels.slice(range.start, range.end);
    const first = slice[0];
    const isSplashPage = slice.length === 1 && Boolean(first.isSplashSpread);
    const isDualPageSpread =
      isSplashPage && allowDualSpread && format.supportsDualPageSpread && first.widthPx / Math.max(1, first.heightPx) >= 1.15;
    const geom = computePageBoxGeometry(format, range.pageNumber, readingDirection, isDualPageSpread);

    const placedPanels: PlacedPrintPanel[] = [];
    if (isSplashPage) {
      splashPageCount += 1;
      placedPanels.push(fitPanelIntoSlot(first, range.start, 0, 0, 0, geom.bleedBoxMm, geom.trimBoxMm, true));
    } else {
      const strip = computeBestStripLayout(slice, geom.liveSafeBoxMm, format.panelGutterMm, readingDirection);
      for (let i = 0; i < slice.length; i += 1) {
        const slot = strip.slots[i];
        placedPanels.push(
          fitPanelIntoSlot(slice[i], range.start + i, i, slot.rowIndex, slot.columnIndex, slot.slotFrameMm, geom.trimBoxMm, false)
        );
      }
    }

    const gazeFlow = verifyPageGazeFlow(placedPanels, readingDirection, format.panelGutterMm);
    const hasCliffhangerRevealAtStart = Boolean(first.isCliffhangerReveal);
    const isPostPageTurnReveal = hasCliffhangerRevealAtStart && range.pageNumber % 2 === 0;

    for (const p of placedPanels) {
      balloonClippedCount += p.balloonClippedCount;
      focalSubjectClippedCount += p.focalSubjectClippedCount;
      if (p.isCliffhangerReveal) {
        cliffhangerTotalCount += 1;
        if (p.readingOrderOnPage === 0 && range.pageNumber % 2 === 0) cliffhangerPostTurnPlacedCount += 1;
      }
    }
    totalOverlapCount += gazeFlow.overlapCount;
    if (!gazeFlow.monotonicRowOrderValid || !gazeFlow.verticalRowProgressionValid) allPagesMonotonicGazeValid = false;

    pages.push({
      pageNumber: range.pageNumber, pageSide: geom.pageSide, spineEdge: geom.spineEdge,
      isSplashPage, isDualPageSpread, hasCliffhangerRevealAtStart, isPostPageTurnReveal,
      trimBoxMm: geom.trimBoxMm, bleedBoxMm: geom.bleedBoxMm, liveSafeBoxMm: geom.liveSafeBoxMm,
      spineZoneMm: geom.spineZoneMm, placedPanels, gazeFlow,
    });
  }

  return {
    format, readingDirection, pages,
    summary: {
      totalSourcePanels: panels.length, totalPages: pages.length, totalOverlapCount,
      balloonClippedCount, focalSubjectClippedCount, cliffhangerTotalCount,
      cliffhangerPostTurnPlacedCount, splashPageCount, allPagesMonotonicGazeValid,
      averagePanelsPerPage: pages.length > 0 ? Math.round((panels.length / pages.length) * 100) / 100 : 0,
    },
  };
}
