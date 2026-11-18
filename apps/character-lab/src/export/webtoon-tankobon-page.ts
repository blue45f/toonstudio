/**
 * 단행본(Tankobon) 우→좌(Right-to-Left · 일본 만화/단행본 표준) 및 좌→우(Left-to-Right · 한국 단행본)
 * 2×2 출판 페이지 조판 합성기 (`webtoon-tankobon-page.ts`).
 *
 * - 인쇄 재단선(Crop/Trim Marks · Bleed 여백), 홀수/짝수 페이지 책등 제본 여백(`bindingSide`: `odd-recto` / `even-verso`),
 *   하단 트림 내 결정적 비트맵 페이지 넘버(`Folio`: `P.01`..`P.999`) 인쇄를 지원한다.
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";
import { buildActingCutPlan, findWebtoonStripActingArc } from "./webtoon-strip-acting";
import { bakeSpeechBubbleBalloon } from "./webtoon-strip-bubbles";
import {
  WEBTOON_VERTICAL_STRIP_CUTS,
  gradeCharacterPixelByMood,
  resolveSpeakerBubblePlacement,
  resolveWebtoonCutCameraSpec,
  rotateRasterBilinear,
} from "./webtoon-strip-composer";
import { bakePanelActionLines, bakePanelSfxStamp } from "./webtoon-strip-manga-fx";
import { WEBTOON_MANUSCRIPT_MOODS } from "./webtoon-strip-pacing-tategaki";
import { bakePanelHalftoneScreentone } from "./webtoon-strip-screentone";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type { TankobonReadingOrder } from "./webtoon-episode-cutsheet";
import type {
  ExportWebtoonVerticalStripOptions,
  WebtoonDialogueLocale,
  WebtoonJaWritingMode,
  WebtoonManuscriptMoodId,
  WebtoonScreentoneId,
  WebtoonSfxStampOption,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripFxLinesKind,
  WebtoonStripMangaFxOptions,
  WebtoonStripScreentones,
  WebtoonStripSpeakerTarget,
} from "./webtoon-strip-composer";
import type { CaptureProvenance, CapturedRaster, CharacterEngine, LabFailure } from "../contracts";

export const TANKOBON_READING_ORDERS = ["rtl-tankobon", "ltr-manhwa"] as const;

export const TANKOBON_READING_ORDER_LABELS_KO: Readonly<Record<TankobonReadingOrder, string>> = Object.freeze({
  "rtl-tankobon": "단행본 우→좌 (1우상·2좌상·3우하·4좌하)",
  "ltr-manhwa": "출판 좌→우 (1좌상·2우상·3좌하·4우하)",
});

export type TankobonBindingSide = "none" | "odd-recto" | "even-verso";
export const TANKOBON_BINDING_SIDES = ["none", "odd-recto", "even-verso"] as const;

export const TANKOBON_BINDING_SIDE_LABELS_KO: Readonly<Record<TankobonBindingSide, string>> = Object.freeze({
  none: "대칭 여백 (디지털·단면)",
  "odd-recto": "홀수 쪽 (책등 안쪽 여백 확대)",
  "even-verso": "짝수 쪽 (맞면 대칭 여백)",
});

export interface WebtoonTankobonPageLayout {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly bleedMarginPx: number;
  readonly leftMarginPx: number;
  readonly rightMarginPx: number;
  readonly trimInsetPx: number;
  readonly gutterX: number;
  readonly gutterY: number;
  readonly borderPx: number;
  readonly bubbleSafeTopPx: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
}

export interface ExportWebtoonTankobonPageOptions extends Omit<ExportWebtoonVerticalStripOptions, "stripWidth"> {
  /** 요청 단행본 페이지 가로 폭(px, 기본 1200px · 최대 2800px; 세로는 B5 1:1.414 비율로 결정) */
  readonly pageWidth: number;
  readonly readingOrder?: TankobonReadingOrder;
  readonly includeCropMarks?: boolean;
  /** 인쇄 하단 트림 여백에 찍을 페이지 번호(1..999; 0 또는 미지정 시 생략) */
  readonly pageNumber?: number;
  /** 책등 제본 여백 방향(우→좌 책은 홀수 쪽 우측이 책등, 좌→우 책은 홀수 쪽 좌측이 책등) */
  readonly bindingSide?: TankobonBindingSide;
}

const defaultNow = (): number => Date.now();
const MAX_TANKOBON_WIDTH = 2800;

/** 결정적 3×5 비트맵 글리프(P, ., 0~9) */
const FOLIO_GLYPHS_3X5: Readonly<Record<string, readonly [number, number, number, number, number]>> = Object.freeze({
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  "0": [0b111, 0b101, 0b101, 0b101, 0b111],
  "1": [0b010, 0b110, 0b010, 0b010, 0b111],
  "2": [0b111, 0b001, 0b111, 0b100, 0b111],
  "3": [0b111, 0b001, 0b111, 0b001, 0b111],
  "4": [0b101, 0b101, 0b111, 0b001, 0b001],
  "5": [0b111, 0b100, 0b111, 0b001, 0b111],
  "6": [0b111, 0b100, 0b111, 0b101, 0b111],
  "7": [0b111, 0b001, 0b001, 0b010, 0b010],
  "8": [0b111, 0b101, 0b111, 0b101, 0b111],
  "9": [0b111, 0b101, 0b111, 0b001, 0b111],
});

function toPageFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

function resolveSpineSideIsRight(
  readingOrder: TankobonReadingOrder,
  bindingSide: TankobonBindingSide,
): boolean | null {
  if (bindingSide === "none") return null;
  if (readingOrder === "rtl-tankobon") {
    // 일본식 우철(Right-bound) 단행본: 홀수 쪽(1p)은 왼쪽 페이지로 우측이 책등, 짝수 쪽(2p)은 좌측이 책등
    return bindingSide === "odd-recto";
  }
  // 한국·서구식 좌철(Left-bound) 단행본: 홀수 쪽(1p)은 오른쪽 페이지로 좌측이 책등, 짝수 쪽(2p)은 우측이 책등
  return bindingSide === "even-verso";
}

/**
 * B5/A5(1 : √2 ≈ 1 : 1.414) 인쇄 판형 비율에 맞춰 재단 여백·책등 제본 시프트·2×2 컷 크기·말풍선 상단 안전 영역을 계산한다.
 */
export function clampWebtoonTankobonPageLayout(
  requestedPageWidth: number,
  includeBubbleSafeZone = true,
  bindingSide: TankobonBindingSide = "none",
  readingOrder: TankobonReadingOrder = "rtl-tankobon",
): WebtoonTankobonPageLayout {
  const safePageW = Number.isFinite(requestedPageWidth)
    ? Math.min(MAX_TANKOBON_WIDTH, Math.max(MIN_EXPORT_DIMENSION * 3, Math.floor(requestedPageWidth)))
    : 1200;

  const bleedMarginPx = Math.max(6, Math.round(safePageW * 0.044));
  const trimInsetPx = Math.max(2, Math.round(safePageW * 0.02));
  const borderPx = Math.max(1, Math.round(safePageW * 0.0028));
  const gutterX = Math.max(4, Math.round(safePageW * 0.024));
  const gutterY = Math.max(6, Math.round(safePageW * 0.032));
  const bubbleSafeTopPx = includeBubbleSafeZone ? Math.max(4, Math.round(safePageW * 0.038)) : 0;

  const spineShift = Math.max(2, Math.floor(bleedMarginPx * 0.28));
  const spineIsRight = resolveSpineSideIsRight(readingOrder, bindingSide);
  const leftMarginPx =
    spineIsRight === null ? bleedMarginPx : spineIsRight ? bleedMarginPx - spineShift : bleedMarginPx + spineShift;
  const rightMarginPx =
    spineIsRight === null ? bleedMarginPx : spineIsRight ? bleedMarginPx + spineShift : bleedMarginPx - spineShift;

  const usableW = safePageW - (leftMarginPx + rightMarginPx) - gutterX - borderPx * 4;
  const cutWidth = Math.max(MIN_EXPORT_DIMENSION, Math.floor(usableW / 2));
  const effectivePageW = leftMarginPx + rightMarginPx + gutterX + (cutWidth + borderPx * 2) * 2;

  const targetPageH = Math.min(MAX_PNG_EXPORT_DIMENSION, Math.round(effectivePageW * 1.414));
  const fixedH = bleedMarginPx * 2 + gutterY + (borderPx * 2 + bubbleSafeTopPx) * 2;
  const cutHeight = Math.max(MIN_EXPORT_DIMENSION, Math.floor((targetPageH - fixedH) / 2));
  const pageHeight = fixedH + cutHeight * 2;

  return {
    pageWidth: effectivePageW,
    pageHeight,
    bleedMarginPx,
    leftMarginPx,
    rightMarginPx,
    trimInsetPx,
    gutterX,
    gutterY,
    borderPx,
    bubbleSafeTopPx,
    cutWidth,
    cutHeight,
  };
}

/**
 * 컷 인덱스(0..3)가 배치될 (열 col: 0=좌, 1=우 / 행 row: 0=상, 1=하) 좌표를 반환한다.
 */
export function resolveTankobonCellGridCoord(
  cutIndex: number,
  readingOrder: TankobonReadingOrder = "rtl-tankobon",
): { readonly col: 0 | 1; readonly row: 0 | 1 } {
  const row: 0 | 1 = cutIndex >= 2 ? 1 : 0;
  const isFirstInRow = cutIndex % 2 === 0;
  if (readingOrder === "rtl-tankobon") {
    return { col: isFirstInRow ? 1 : 0, row };
  }
  return { col: isFirstInRow ? 0 : 1, row };
}

function fillRect(
  rgba: Uint8ClampedArray,
  canvasW: number,
  canvasH: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
): void {
  const xEnd = Math.min(canvasW, x0 + w);
  const yEnd = Math.min(canvasH, y0 + h);
  for (let y = Math.max(0, y0); y < yEnd; y += 1) {
    let dst = (y * canvasW + Math.max(0, x0)) * 4;
    for (let x = Math.max(0, x0); x < xEnd; x += 1) {
      rgba[dst] = r;
      rgba[dst + 1] = g;
      rgba[dst + 2] = b;
      rgba[dst + 3] = 255;
      dst += 4;
    }
  }
}

function drawTrimCropMarks(
  rgba: Uint8ClampedArray,
  pageW: number,
  pageH: number,
  trimInset: number,
  r: number,
  g: number,
  b: number,
): void {
  const arm = Math.max(4, Math.floor(trimInset * 0.62));
  const gap = Math.max(1, Math.floor(trimInset * 0.22));
  const left = trimInset;
  const right = pageW - 1 - trimInset;
  const top = trimInset;
  const bottom = pageH - 1 - trimInset;

  fillRect(rgba, pageW, pageH, Math.max(0, left - gap - arm), top, arm, 1, r, g, b);
  fillRect(rgba, pageW, pageH, left, Math.max(0, top - gap - arm), 1, arm, r, g, b);

  fillRect(rgba, pageW, pageH, Math.min(pageW - arm, right + gap), top, arm, 1, r, g, b);
  fillRect(rgba, pageW, pageH, right, Math.max(0, top - gap - arm), 1, arm, r, g, b);

  fillRect(rgba, pageW, pageH, Math.max(0, left - gap - arm), bottom, arm, 1, r, g, b);
  fillRect(rgba, pageW, pageH, left, Math.min(pageH - arm, bottom + gap), 1, arm, r, g, b);

  fillRect(rgba, pageW, pageH, Math.min(pageW - arm, right + gap), bottom, arm, 1, r, g, b);
  fillRect(rgba, pageW, pageH, right, Math.min(pageH - arm, bottom + gap), 1, arm, r, g, b);
}

/**
 * 단행본 하단 트림 안전 영역 안에 결정적 `P.01`..`P.999` 페이지 번호(Folio)를 인쇄한다.
 */
export function formatTankobonFolioLabel(pageNumber: number): string {
  const clamped = Math.max(1, Math.min(999, Math.floor(pageNumber)));
  return `P.${String(clamped).padStart(2, "0")}`;
}

function stampTankobonFolioNumber(
  rgba: Uint8ClampedArray,
  layout: WebtoonTankobonPageLayout,
  pageNumber: number,
  readingOrder: TankobonReadingOrder,
  bindingSide: TankobonBindingSide,
  r: number,
  g: number,
  b: number,
): void {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return;
  const label = formatTankobonFolioLabel(pageNumber);
  const scale = Math.max(1, Math.min(4, Math.floor(layout.bleedMarginPx / 8)));
  const glyphW = 3 * scale;
  const glyphH = 5 * scale;
  const spacing = Math.max(1, scale);
  const totalW = label.length * glyphW + (label.length - 1) * spacing;

  const spineIsRight = resolveSpineSideIsRight(readingOrder, bindingSide);
  const startX =
    spineIsRight === null
      ? Math.round((layout.pageWidth - totalW) * 0.5)
      : spineIsRight
        ? layout.leftMarginPx
        : Math.max(0, layout.pageWidth - layout.rightMarginPx - totalW);

  const footerTop = layout.pageHeight - layout.bleedMarginPx;
  const footerBottom = layout.pageHeight - layout.trimInsetPx;
  const startY = Math.max(
    footerTop + 1,
    Math.min(layout.pageHeight - glyphH - 1, Math.round((footerTop + footerBottom - glyphH) * 0.5)),
  );

  let cursorX = startX;
  for (const ch of label) {
    const bitmap = FOLIO_GLYPHS_3X5[ch];
    if (bitmap) {
      for (let row = 0; row < 5; row += 1) {
        const rowBits = bitmap[row]!;
        for (let col = 0; col < 3; col += 1) {
          if (((rowBits >> (2 - col)) & 1) === 1) {
            fillRect(
              rgba,
              layout.pageWidth,
              layout.pageHeight,
              cursorX + col * scale,
              startY + row * scale,
              scale,
              scale,
              r,
              g,
              b,
            );
          }
        }
      }
    }
    cursorX += glyphW + spacing;
  }
}

export function composeWebtoonTankobonPage(
  panels: readonly CapturedRaster[],
  layout: WebtoonTankobonPageLayout,
  options: {
    readonly readingOrder?: TankobonReadingOrder;
    readonly includeCropMarks?: boolean;
    readonly pageNumber?: number;
    readonly bindingSide?: TankobonBindingSide;
    readonly mangaFx?: WebtoonStripMangaFxOptions;
    readonly manuscriptMood?: WebtoonManuscriptMoodId;
    readonly screentones?: WebtoonStripScreentones;
  } = {},
): CapturedRaster {
  if (panels.length !== WEBTOON_VERTICAL_STRIP_CUTS.length) {
    throw new Error(`단행본 4컷 조판에는 ${WEBTOON_VERTICAL_STRIP_CUTS.length}개의 컷이 필요합니다(전달됨: ${panels.length}).`);
  }
  const readingOrder = options.readingOrder ?? "rtl-tankobon";
  const bindingSide = options.bindingSide ?? "none";
  const moodId: WebtoonManuscriptMoodId = options.manuscriptMood ?? options.mangaFx?.manuscriptMood ?? "daylight-paper";
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];

  const out = new Uint8ClampedArray(layout.pageWidth * layout.pageHeight * 4);
  fillRect(
    out,
    layout.pageWidth,
    layout.pageHeight,
    0,
    0,
    layout.pageWidth,
    layout.pageHeight,
    moodSpec.stripMarginRgb[0],
    moodSpec.stripMarginRgb[1],
    moodSpec.stripMarginRgb[2],
  );

  if (options.includeCropMarks !== false) {
    drawTrimCropMarks(
      out,
      layout.pageWidth,
      layout.pageHeight,
      layout.trimInsetPx,
      moodSpec.borderRgb[0],
      moodSpec.borderRgb[1],
      moodSpec.borderRgb[2],
    );
  }

  if (options.pageNumber && options.pageNumber >= 1) {
    stampTankobonFolioNumber(
      out,
      layout,
      options.pageNumber,
      readingOrder,
      bindingSide,
      moodSpec.borderRgb[0],
      moodSpec.borderRgb[1],
      moodSpec.borderRgb[2],
    );
  }

  const frameW = layout.cutWidth + layout.borderPx * 2;
  const frameH = layout.bubbleSafeTopPx + layout.cutHeight + layout.borderPx * 2;
  const mangaFx = options.mangaFx;
  const fxEnabled = mangaFx?.enabled === true;
  const fxLinesKind: WebtoonStripFxLinesKind = fxEnabled ? (mangaFx?.linesKind ?? "focus-radial") : "none";
  const fxIncludeBubbles = fxEnabled && mangaFx?.includeSpeechBubbles !== false;
  const fxIntensity = Math.min(1, Math.max(0.2, Number.isFinite(mangaFx?.intensity) ? (mangaFx?.intensity ?? 0.75) : 0.75));
  const partnerSide: "left" | "right" = mangaFx?.partnerSide ?? "right";
  const locale: WebtoonDialogueLocale = mangaFx?.locale ?? "ko";
  const jaWritingMode: WebtoonJaWritingMode = mangaFx?.jaWritingMode ?? "horizontal";

  for (let idx = 0; idx < panels.length; idx += 1) {
    const panel = panels[idx]!;
    if (panel.width !== layout.cutWidth || panel.height !== layout.cutHeight) {
      throw new Error(`${idx + 1}컷 크기(${panel.width}×${panel.height})가 단행본 셀 크기(${layout.cutWidth}×${layout.cutHeight})와 다릅니다.`);
    }
    const { col, row } = resolveTankobonCellGridCoord(idx, readingOrder);
    const frameX = layout.leftMarginPx + col * (frameW + layout.gutterX);
    const frameY = layout.bleedMarginPx + row * (frameH + layout.gutterY);

    fillRect(
      out,
      layout.pageWidth,
      layout.pageHeight,
      frameX,
      frameY,
      frameW,
      frameH,
      moodSpec.borderRgb[0],
      moodSpec.borderRgb[1],
      moodSpec.borderRgb[2],
    );

    const innerX = frameX + layout.borderPx;
    const innerY = frameY + layout.borderPx;
    const innerH = layout.bubbleSafeTopPx + layout.cutHeight;
    const [topR, topG, topB] = moodSpec.panelTopRgb;
    const [botR, botG, botB] = moodSpec.panelBottomRgb;

    for (let py = 0; py < innerH; py += 1) {
      const t = innerH > 1 ? py / (innerH - 1) : 0;
      const bgR = Math.round(topR + (botR - topR) * t);
      const bgG = Math.round(topG + (botG - topG) * t);
      const bgB = Math.round(topB + (botB - topB) * t);
      let dst = ((innerY + py) * layout.pageWidth + innerX) * 4;
      for (let px = 0; px < layout.cutWidth; px += 1) {
        out[dst] = bgR;
        out[dst + 1] = bgG;
        out[dst + 2] = bgB;
        out[dst + 3] = 255;
        dst += 4;
      }
    }

    const cutScreentone: WebtoonScreentoneId = options.screentones?.[idx] ?? mangaFx?.screentones?.[idx] ?? "none";
    if (cutScreentone !== "none") {
      bakePanelHalftoneScreentone(out, layout.pageWidth, innerX, innerY, layout.cutWidth, innerH, cutScreentone, fxIntensity);
    }

    if (fxLinesKind !== "none") {
      bakePanelActionLines(out, layout.pageWidth, innerX, innerY, layout.cutWidth, innerH, fxLinesKind, fxIntensity, idx);
    }

    const cutStartY = innerY + layout.bubbleSafeTopPx;
    for (let cy = 0; cy < layout.cutHeight; cy += 1) {
      let src = cy * layout.cutWidth * 4;
      let dst = ((cutStartY + cy) * layout.pageWidth + innerX) * 4;
      for (let cx = 0; cx < layout.cutWidth; cx += 1) {
        const srcA = panel.rgba[src + 3] ?? 0;
        if (srcA > 0) {
          const [gr, gg, gb] = gradeCharacterPixelByMood(
            panel.rgba[src] ?? 0,
            panel.rgba[src + 1] ?? 0,
            panel.rgba[src + 2] ?? 0,
            moodSpec,
          );
          if (srcA === 255) {
            out[dst] = gr;
            out[dst + 1] = gg;
            out[dst + 2] = gb;
          } else {
            const alpha = srcA / 255;
            const inv = 1 - alpha;
            out[dst] = Math.round(gr * alpha + (out[dst] ?? 255) * inv);
            out[dst + 1] = Math.round(gg * alpha + (out[dst + 1] ?? 255) * inv);
            out[dst + 2] = Math.round(gb * alpha + (out[dst + 2] ?? 255) * inv);
          }
        }
        out[dst + 3] = 255;
        src += 4;
        dst += 4;
      }
    }

    const cutSpeaker: WebtoonStripSpeakerTarget = mangaFx?.speakerTargets?.[idx] ?? "auto";
    const placement = resolveSpeakerBubblePlacement(idx, cutSpeaker, partnerSide);
    if (fxIncludeBubbles) {
      const cutDialogue = mangaFx?.dialogueLines?.[idx];
      const cutShape: WebtoonStripBubbleShape = mangaFx?.bubbleShapes?.[idx] ?? "oval";
      const cutFontScale: WebtoonStripBubbleFontScale = mangaFx?.bubbleFontScales?.[idx] ?? "md";
      bakeSpeechBubbleBalloon(
        out,
        layout.pageWidth,
        innerX,
        innerY,
        layout.cutWidth,
        innerH,
        placement,
        cutDialogue,
        cutShape,
        cutFontScale,
        locale,
        jaWritingMode,
      );
    }

    if (fxEnabled) {
      const cutSfx: WebtoonSfxStampOption = mangaFx?.sfxStamps?.[idx] ?? "none";
      if (cutSfx !== "none") {
        bakePanelSfxStamp(out, layout.pageWidth, innerX, innerY, layout.cutWidth, innerH, !placement.placeRight, cutSfx, locale);
      }
    }
  }

  return { width: layout.pageWidth, height: layout.pageHeight, rgba: out };
}

export async function exportWebtoonTankobonPagePng(
  engine: CharacterEngine,
  options: ExportWebtoonTankobonPageOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const readingOrder = options.readingOrder ?? "rtl-tankobon";
  const bindingSide = options.bindingSide ?? "none";
  const layout = clampWebtoonTankobonPageLayout(
    options.pageWidth,
    options.includeBubbleSafeZone ?? true,
    bindingSide,
    readingOrder,
  );
  if (layout.pageWidth > MAX_PNG_EXPORT_DIMENSION || layout.pageHeight > MAX_PNG_EXPORT_DIMENSION) {
    return {
      ok: false,
      failure: failVisible(
        "export-tankobon-page-size",
        `단행본 조판 크기(${layout.pageWidth}×${layout.pageHeight}px)가 최대 허용 해상도(${MAX_PNG_EXPORT_DIMENSION}px)를 초과합니다.`,
        undefined,
        started,
      ),
    };
  }

  const settleSteps = Math.min(MAX_SETTLE_STEPS, Math.max(0, Math.floor(options.settleSteps ?? 0)));
  if (settleSteps > 0) {
    try {
      await engine.settle(settleSteps);
    } catch (error) {
      return { ok: false, failure: toPageFailure("export-settle", "단행본 조판 캡처 전 물리 settle에 실패했습니다.", error, started) };
    }
  }

  const resolvedArc = options.actingArc ? findWebtoonStripActingArc(options.actingArc.arcId) : null;
  const panels: CapturedRaster[] = [];
  let lastProvenance: CaptureProvenance | undefined = undefined;
  let appliedActingKeyframe = false;

  try {
    for (let idx = 0; idx < WEBTOON_VERTICAL_STRIP_CUTS.length; idx += 1) {
      const cutPresetId = options.cutCameraPresets?.[idx] ?? "default";
      const cut = resolveWebtoonCutCameraSpec(idx, cutPresetId);
      const keyframe = resolvedArc?.cuts[idx];
      const stepLabel = keyframe ? `${cut.labelKo} (${keyframe.beatKo})` : cut.labelKo;
      options.onProgress?.(idx + 1, WEBTOON_VERTICAL_STRIP_CUTS.length, `단행본 조판 · ${stepLabel}`);

      if (keyframe && options.actingArc) {
        try {
          engine.applyPlan(buildActingCutPlan(options.actingArc.basePlan, keyframe, idx));
          appliedActingKeyframe = true;
        } catch (error) {
          return { ok: false, failure: toPageFailure("export-acting-plan", `${stepLabel} 연기 스냅샷 적용에 실패했습니다.`, error, started) };
        }
      }

      try {
        const captured = await engine.renderPasses({
          width: layout.cutWidth,
          height: layout.cutHeight,
          passes: ["lit"],
          transparentBackground: true,
          settleSteps: 0,
          camera: {
            ...DEFAULT_FRAMING,
            mode: cut.mode,
            yawDeg: cut.yawDeg,
            pitchDeg: cut.pitchDeg,
            distanceScale: cut.distanceScale,
          },
        });
        if (captured.width !== layout.cutWidth || captured.height !== layout.cutHeight) {
          return {
            ok: false,
            failure: failVisible(
              "export-capture-size",
              `엔진이 단행본 컷 크기 ${layout.cutWidth}×${layout.cutHeight} 대신 ${captured.width}×${captured.height}를 반환했습니다.`,
              undefined,
              started,
            ),
          };
        }
        const lit = captured.passes.lit;
        if (!lit) {
          return { ok: false, failure: failVisible("export-missing-lit", `${cut.labelKo} 캡처에 lit 패스가 없습니다.`, undefined, started) };
        }
        panels.push(cut.dutchTiltDeg ? rotateRasterBilinear(lit, cut.dutchTiltDeg) : lit);
        lastProvenance = captured.provenance;
      } catch (error) {
        return { ok: false, failure: toPageFailure("export-capture", `단행본 4컷(${cut.labelKo}) 캡처에 실패했습니다.`, error, started) };
      }
    }
  } finally {
    if (appliedActingKeyframe && options.actingArc) {
      try {
        engine.applyPlan(options.actingArc.basePlan);
      } catch {
        // 엔진 해제 시 무시
      }
    }
  }

  if (!lastProvenance) {
    return { ok: false, failure: failVisible("export-missing-lit", "단행본 4컷 캡처 결과가 비어 있습니다.", undefined, started) };
  }

  try {
    const effectiveMood = options.manuscriptMood ?? options.mangaFx?.manuscriptMood ?? "daylight-paper";
    const effectiveScreentones = options.screentones ?? options.mangaFx?.screentones;
    const pageNum = options.pageNumber && options.pageNumber >= 1 ? Math.min(999, Math.floor(options.pageNumber)) : 0;
    const composed = composeWebtoonTankobonPage(panels, layout, {
      readingOrder,
      includeCropMarks: options.includeCropMarks ?? true,
      ...(pageNum > 0 ? { pageNumber: pageNum } : {}),
      bindingSide,
      ...(options.mangaFx ? { mangaFx: options.mangaFx } : {}),
      manuscriptMood: effectiveMood,
      ...(effectiveScreentones ? { screentones: effectiveScreentones } : {}),
    });
    const bytes = await encodePng(composed, { filter: "adaptive" });
    const baseName = exportFileName("png", lastProvenance.recipeDigest, composed.width, composed.height);
    const orderTag = readingOrder === "rtl-tankobon" ? "-rtl" : "-ltr";
    const toneTag = effectiveScreentones?.some((t) => t !== "none") ? "-tone" : "";
    const fxTag = options.mangaFx?.enabled ? "-fx" : "";
    const folioTag = pageNum > 0 ? `-p${String(pageNum).padStart(2, "0")}` : "";
    const fileName = baseName.replace(/\.png$/u, `-tankobon${orderTag}${fxTag}${toneTag}${folioTag}-page.png`);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: composed.width,
        height: composed.height,
        settleSteps,
        provenance: lastProvenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toPageFailure("export-png-encode", "단행본 4컷 조판 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
