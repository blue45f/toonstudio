/**
 * 단행본(Tankobon) 표지(`Cover`) · 목차 내지(`Table of Contents`) · 양면 펼침면(`2-Page Facing Spread`)
 * B5 인쇄 조판 합성기 (`webtoon-tankobon-booklet.ts`).
 *
 * - 인쇄 재단선(Crop/Trim Marks), 권수 배지(`VOL.01`..`VOL.99`), 한글·다국어 제목/작가 타이포그래피 베이킹,
 *   할프톤 스크린톤, 에피소드 큐시트 비트 연동 점선 리더(`...... P.03`) 목차, 센터 책등 접지선(Spine Fold Marks)이 포함된
 *   양면 펼침면 대지(`MAX_PNG_EXPORT_DIMENSION` 자동 배율 클램프)를 순수 결정적으로 생성한다.
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";
import { bakeDeterministicDialogueGlyphs, splitLocalizedBubbleDialogue } from "./webtoon-strip-bubbles";
import { gradeCharacterPixelByMood } from "./webtoon-strip-composer";
import { WEBTOON_MANUSCRIPT_MOODS } from "./webtoon-strip-pacing-tategaki";
import { drawClippedLineRgba } from "./webtoon-strip-raster";
import { bakePanelHalftoneScreentone } from "./webtoon-strip-screentone";
import { clampWebtoonTankobonPageLayout, formatTankobonFolioLabel } from "./webtoon-tankobon-page";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type { EpisodeCutsheetBeat, TankobonReadingOrder } from "./webtoon-episode-cutsheet";
import type {
  WebtoonDialogueLocale,
  WebtoonManuscriptMoodId,
  WebtoonScreentoneId,
} from "./webtoon-strip-composer";
import type { WebtoonTankobonPageLayout } from "./webtoon-tankobon-page";
import type { CameraFramingMode, CapturedRaster, CharacterEngine, LabFailure } from "../contracts";

export interface TankobonChapterEntry {
  readonly chapterNumber: number;
  readonly titleKo: string;
  readonly cutRangeLabel: string;
  readonly startPageNumber: number;
}

export interface ComposeTankobonCoverOptions {
  readonly volumeNumber?: number;
  readonly titleKo: string;
  readonly authorKo?: string;
  readonly locale?: WebtoonDialogueLocale;
  readonly manuscriptMood?: WebtoonManuscriptMoodId;
  readonly screentone?: WebtoonScreentoneId;
  readonly includeCropMarks?: boolean;
}

export interface ComposeTankobonTocOptions {
  readonly volumeNumber?: number;
  readonly episodeTitleKo: string;
  readonly locale?: WebtoonDialogueLocale;
  readonly manuscriptMood?: WebtoonManuscriptMoodId;
  readonly readingOrder?: TankobonReadingOrder;
  readonly pageNumber?: number;
  readonly includeCropMarks?: boolean;
}

export interface ExportWebtoonTankobonBookletOptions {
  readonly pageWidth: number;
  readonly volumeNumber?: number;
  readonly titleKo: string;
  readonly authorKo?: string;
  readonly locale?: WebtoonDialogueLocale;
  readonly manuscriptMood?: WebtoonManuscriptMoodId;
  readonly screentone?: WebtoonScreentoneId;
  readonly readingOrder?: TankobonReadingOrder;
  readonly framingMode?: CameraFramingMode;
  readonly settleSteps?: number;
  readonly includeCropMarks?: boolean;
  readonly beats?: readonly EpisodeCutsheetBeat[];
  readonly onProgress?: (step: number, total: number, labelKo: string) => void;
}

const defaultNow = (): number => Date.now();

function toBookletFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

/** 대문자 영문·숫자·기호 3×5 비트맵 폰트 (`VOL.01`, `CONTENTS`, `CH.01`, `P.03`, `ISBN` 표기용) */
const ASCII_BITMAP_3X5: Readonly<Record<string, readonly [number, number, number, number, number]>> = Object.freeze({
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b111, 0b101, 0b101, 0b101, 0b101],
  O: [0b111, 0b101, 0b101, 0b101, 0b111],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  "-": [0b000, 0b000, 0b111, 0b000, 0b000],
  ":": [0b000, 0b010, 0b000, 0b010, 0b000],
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

function fillRectBooklet(
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
  const xStart = Math.max(0, Math.floor(x0));
  const yStart = Math.max(0, Math.floor(y0));
  const xEnd = Math.min(canvasW, Math.floor(x0 + w));
  const yEnd = Math.min(canvasH, Math.floor(y0 + h));
  for (let y = yStart; y < yEnd; y += 1) {
    let dst = (y * canvasW + xStart) * 4;
    for (let x = xStart; x < xEnd; x += 1) {
      rgba[dst] = r;
      rgba[dst + 1] = g;
      rgba[dst + 2] = b;
      rgba[dst + 3] = 255;
      dst += 4;
    }
  }
}

function drawOutlineBox(
  rgba: Uint8ClampedArray,
  canvasW: number,
  canvasH: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  borderPx: number,
  r: number,
  g: number,
  b: number,
): void {
  fillRectBooklet(rgba, canvasW, canvasH, x0, y0, w, borderPx, r, g, b);
  fillRectBooklet(rgba, canvasW, canvasH, x0, y0 + h - borderPx, w, borderPx, r, g, b);
  fillRectBooklet(rgba, canvasW, canvasH, x0, y0, borderPx, h, r, g, b);
  fillRectBooklet(rgba, canvasW, canvasH, x0 + w - borderPx, y0, borderPx, h, r, g, b);
}

function drawCornerCropMarks(
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

  fillRectBooklet(rgba, pageW, pageH, Math.max(0, left - gap - arm), top, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, left, Math.max(0, top - gap - arm), 1, arm, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, Math.min(pageW - arm, right + gap), top, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, right, Math.max(0, top - gap - arm), 1, arm, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, Math.max(0, left - gap - arm), bottom, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, left, Math.min(pageH - arm, bottom + gap), 1, arm, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, Math.min(pageW - arm, right + gap), bottom, arm, 1, r, g, b);
  fillRectBooklet(rgba, pageW, pageH, right, Math.min(pageH - arm, bottom + gap), 1, arm, r, g, b);
}

function stampAsciiBitmapText(
  rgba: Uint8ClampedArray,
  canvasW: number,
  canvasH: number,
  text: string,
  x: number,
  y: number,
  scale: number,
  rgb: readonly [number, number, number],
): number {
  const upper = text.toUpperCase();
  const s = Math.max(1, Math.floor(scale));
  const glyphW = 3 * s;
  const spacing = Math.max(1, s);
  let cursorX = Math.round(x);
  for (const ch of upper) {
    if (ch === " ") {
      cursorX += glyphW;
      continue;
    }
    const rows = ASCII_BITMAP_3X5[ch];
    if (rows) {
      for (let r = 0; r < 5; r += 1) {
        const bits = rows[r]!;
        for (let c = 0; c < 3; c += 1) {
          if (((bits >> (2 - c)) & 1) === 1) {
            fillRectBooklet(rgba, canvasW, canvasH, cursorX + c * s, y + r * s, s, s, rgb[0], rgb[1], rgb[2]);
          }
        }
      }
    }
    cursorX += glyphW + spacing;
  }
  return cursorX - Math.round(x);
}

function blitMoodGradedCharacterFit(
  dstRgba: Uint8ClampedArray,
  dstW: number,
  dstH: number,
  src: CapturedRaster,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  moodId: WebtoonManuscriptMoodId,
): void {
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];
  for (let py = 0; py < boxH; py += 1) {
    const sy = Math.min(src.height - 1, Math.floor((py / Math.max(1, boxH - 1)) * (src.height - 1)));
    const gy = boxY + py;
    if (gy < 0 || gy >= dstH) continue;
    for (let px = 0; px < boxW; px += 1) {
      const sx = Math.min(src.width - 1, Math.floor((px / Math.max(1, boxW - 1)) * (src.width - 1)));
      const gx = boxX + px;
      if (gx < 0 || gx >= dstW) continue;
      const sIdx = (sy * src.width + sx) * 4;
      const sA = src.rgba[sIdx + 3] ?? 0;
      if (sA === 0) continue;
      const [gr, gg, gb] = gradeCharacterPixelByMood(
        src.rgba[sIdx] ?? 0,
        src.rgba[sIdx + 1] ?? 0,
        src.rgba[sIdx + 2] ?? 0,
        moodSpec,
      );
      const dIdx = (gy * dstW + gx) * 4;
      const alpha = sA / 255;
      dstRgba[dIdx] = Math.round(gr * alpha + (dstRgba[dIdx] ?? 255) * (1 - alpha));
      dstRgba[dIdx + 1] = Math.round(gg * alpha + (dstRgba[dIdx + 1] ?? 255) * (1 - alpha));
      dstRgba[dIdx + 2] = Math.round(gb * alpha + (dstRgba[dIdx + 2] ?? 255) * (1 - alpha));
      dstRgba[dIdx + 3] = 255;
    }
  }
}

export function buildTankobonChaptersFromBeats(
  beats: readonly EpisodeCutsheetBeat[],
  fallbackTitleKo = "제1장 프롤로그",
  firstChapterStartPage = 3,
): readonly TankobonChapterEntry[] {
  if (beats.length === 0) {
    return [
      {
        chapterNumber: 1,
        titleKo: fallbackTitleKo.trim() || "제1장 프롤로그",
        cutRangeLabel: "1~4컷",
        startPageNumber: firstChapterStartPage,
      },
    ];
  }
  return beats.slice(0, 12).map((beat, idx) => ({
    chapterNumber: idx + 1,
    titleKo: beat.titleKo,
    cutRangeLabel: beat.cutRangeLabel,
    startPageNumber: firstChapterStartPage + idx,
  }));
}

/**
 * B5 단행본 표지(`VOL.01` 배지 · 캐릭터 메인 일러스트 · 제목/작가 타이포 밴드 · ISBN 바코드 박스 · 재단선)를 결정적으로 합성한다.
 */
export function composeTankobonCoverPage(
  heroPortrait: CapturedRaster,
  layout: WebtoonTankobonPageLayout,
  options: ComposeTankobonCoverOptions,
): CapturedRaster {
  const pageW = layout.pageWidth;
  const pageH = layout.pageHeight;
  const moodId = options.manuscriptMood ?? "daylight-paper";
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];
  const volNum = Math.max(1, Math.min(99, Math.floor(options.volumeNumber ?? 1)));
  const locale = options.locale ?? "ko";

  const out = new Uint8ClampedArray(pageW * pageH * 4);
  fillRectBooklet(
    out,
    pageW,
    pageH,
    0,
    0,
    pageW,
    pageH,
    moodSpec.stripMarginRgb[0],
    moodSpec.stripMarginRgb[1],
    moodSpec.stripMarginRgb[2],
  );

  if (options.includeCropMarks !== false) {
    drawCornerCropMarks(out, pageW, pageH, layout.trimInsetPx, moodSpec.borderRgb[0], moodSpec.borderRgb[1], moodSpec.borderRgb[2]);
  }

  const frameX = layout.leftMarginPx;
  const frameY = layout.bleedMarginPx;
  const frameW = pageW - layout.leftMarginPx - layout.rightMarginPx;
  const frameH = pageH - layout.bleedMarginPx * 2;
  const border = Math.max(2, layout.borderPx * 2);

  // 표지 메인 그라데이션 배경
  for (let py = 0; py < frameH; py += 1) {
    const t = frameH > 1 ? py / (frameH - 1) : 0;
    const r = Math.round(moodSpec.panelTopRgb[0] * (1 - t) + moodSpec.panelBottomRgb[0] * t);
    const g = Math.round(moodSpec.panelTopRgb[1] * (1 - t) + moodSpec.panelBottomRgb[1] * t);
    const b = Math.round(moodSpec.panelTopRgb[2] * (1 - t) + moodSpec.panelBottomRgb[2] * t);
    fillRectBooklet(out, pageW, pageH, frameX, frameY + py, frameW, 1, r, g, b);
  }

  const tone = options.screentone ?? "rose-duotone-dots";
  if (tone !== "none") {
    bakePanelHalftoneScreentone(out, pageW, frameX, frameY, frameW, frameH, tone, 0.68);
  }

  // 이중 장식 외곽 프레임
  drawOutlineBox(out, pageW, pageH, frameX, frameY, frameW, frameH, border, moodSpec.borderRgb[0], moodSpec.borderRgb[1], moodSpec.borderRgb[2]);
  const insetGap = Math.max(3, border * 2);
  drawOutlineBox(
    out,
    pageW,
    pageH,
    frameX + insetGap,
    frameY + insetGap,
    Math.max(8, frameW - insetGap * 2),
    Math.max(8, frameH - insetGap * 2),
    1,
    moodSpec.borderRgb[0],
    moodSpec.borderRgb[1],
    moodSpec.borderRgb[2],
  );

  // 캐릭터 메인 초상 영역 배치
  const heroBoxW = Math.max(16, Math.round(frameW * 0.86));
  const heroBoxH = Math.max(16, Math.round(frameH * 0.68));
  const heroBoxX = frameX + Math.round((frameW - heroBoxW) * 0.5);
  const heroBoxY = frameY + Math.round(frameH * 0.08);
  blitMoodGradedCharacterFit(out, pageW, pageH, heroPortrait, heroBoxX, heroBoxY, heroBoxW, heroBoxH, moodId);

  // 상단 좌측 VOL.XX 배지 박스
  const badgeScale = Math.max(1, Math.min(5, Math.floor(frameW / 72)));
  const volLabel = `VOL.${String(volNum).padStart(2, "0")}`;
  const badgeW = volLabel.length * 4 * badgeScale + badgeScale * 4;
  const badgeH = 5 * badgeScale + badgeScale * 4;
  const badgeX = frameX + insetGap * 2;
  const badgeY = frameY + insetGap * 2;
  fillRectBooklet(out, pageW, pageH, badgeX, badgeY, badgeW, badgeH, 24, 21, 28);
  stampAsciiBitmapText(out, pageW, pageH, volLabel, badgeX + badgeScale * 2, badgeY + badgeScale * 2, badgeScale, [240, 201, 120]);

  // 하단 타이틀 오비(띠지) 밴드 + 제목·작가 한글/다국어 타이포 베이킹
  const bandH = Math.max(18, Math.round(frameH * 0.2));
  const bandY = frameY + frameH - insetGap * 2 - bandH;
  const bandX = frameX + insetGap * 2;
  const bandW = Math.max(16, frameW - insetGap * 4);
  fillRectBooklet(out, pageW, pageH, bandX, bandY, bandW, bandH, 252, 249, 242);
  drawOutlineBox(out, pageW, pageH, bandX, bandY, bandW, bandH, Math.max(1, Math.floor(border * 0.75)), 24, 21, 28);
  // 상단 골드 포인트 라인
  fillRectBooklet(out, pageW, pageH, bandX + 2, bandY + 2, Math.max(4, bandW - 4), Math.max(2, badgeScale), 214, 164, 78);

  const safeTitle = options.titleKo.trim() || "툰스튜디오 단행본";
  const [titleLine1, titleLine2] = splitLocalizedBubbleDialogue(safeTitle, locale);
  const titleCx = bandX + Math.round(bandW * 0.5);
  const titleCy = bandY + Math.round(bandH * 0.44);
  bakeDeterministicDialogueGlyphs(
    out,
    pageW,
    bandX + 2,
    bandY + 2,
    bandX + bandW - 2,
    bandY + bandH - 2,
    titleCx,
    titleCy,
    Math.max(8, Math.round(bandW * 0.44)),
    Math.max(6, Math.round(bandH * 0.32)),
    titleLine1,
    titleLine2,
    "lg",
    [24, 21, 28],
  );

  const authorText = options.authorKo?.trim() || "TOONSTUDIO ATELIER";
  bakeDeterministicDialogueGlyphs(
    out,
    pageW,
    bandX + 2,
    bandY + 2,
    bandX + bandW - 2,
    bandY + bandH - 2,
    bandX + Math.round(bandW * 0.36),
    bandY + Math.round(bandH * 0.82),
    Math.max(6, Math.round(bandW * 0.28)),
    Math.max(4, Math.round(bandH * 0.16)),
    authorText,
    null,
    "sm",
    [72, 64, 58],
  );

  // 우하단 인쇄 ISBN 바코드 모티프 박스
  const isbnW = Math.max(12, Math.round(bandW * 0.22));
  const isbnH = Math.max(6, Math.round(bandH * 0.28));
  const isbnX = bandX + bandW - isbnW - Math.max(3, badgeScale * 2);
  const isbnY = bandY + bandH - isbnH - Math.max(2, badgeScale);
  fillRectBooklet(out, pageW, pageH, isbnX, isbnY, isbnW, isbnH, 255, 255, 255);
  for (let bx = 2; bx < isbnW - 2; bx += 2) {
    if ((bx * 7) % 3 !== 0) {
      fillRectBooklet(out, pageW, pageH, isbnX + bx, isbnY + 1, 1, Math.max(2, isbnH - 2), 24, 21, 28);
    }
  }

  return { width: pageW, height: pageH, rgba: out };
}

/**
 * B5 단행본 목차 내지(`CONTENTS` 헤더 · 캐릭터 비네트 · 챕터 번호 + 제목 + 점선 리더 + `P.03` 쪽번호 목록 · 재단선)를 합성한다.
 */
export function composeTankobonTocPage(
  vignettePortrait: CapturedRaster,
  layout: WebtoonTankobonPageLayout,
  chapters: readonly TankobonChapterEntry[],
  options: ComposeTankobonTocOptions,
): CapturedRaster {
  const pageW = layout.pageWidth;
  const pageH = layout.pageHeight;
  const moodId = options.manuscriptMood ?? "daylight-paper";
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];

  const out = new Uint8ClampedArray(pageW * pageH * 4);
  // 내지는 가독성을 위해 밝은 미색 종이 지질 유지
  fillRectBooklet(out, pageW, pageH, 0, 0, pageW, pageH, 250, 247, 241);

  if (options.includeCropMarks !== false) {
    drawCornerCropMarks(out, pageW, pageH, layout.trimInsetPx, 36, 32, 38);
  }

  const contentX = layout.leftMarginPx + layout.borderPx * 2;
  const contentY = layout.bleedMarginPx + layout.borderPx * 2;
  const contentW = Math.max(24, pageW - layout.leftMarginPx - layout.rightMarginPx - layout.borderPx * 4);
  const contentH = Math.max(32, pageH - layout.bleedMarginPx * 2 - layout.borderPx * 4);
  const scale = Math.max(1, Math.min(4, Math.floor(contentW / 85)));

  // 상단 CONTENTS 헤더 & 수평 구분선
  stampAsciiBitmapText(out, pageW, pageH, "CONTENTS", contentX, contentY, scale + 1, [28, 25, 30]);
  const volTag = `VOL.${String(Math.max(1, Math.min(99, Math.floor(options.volumeNumber ?? 1)))).padStart(2, "0")}`;
  const volTagW = volTag.length * 4 * scale;
  stampAsciiBitmapText(out, pageW, pageH, volTag, contentX + contentW - volTagW, contentY + scale, scale, [112, 96, 74]);

  const headerLineY = contentY + (5 * (scale + 1)) + scale * 3;
  fillRectBooklet(out, pageW, pageH, contentX, headerLineY, contentW, Math.max(1, Math.floor(scale * 0.8)), 28, 25, 30);

  // 우측 상단 캐릭터 미니 비네트 액자
  const vigSize = Math.max(14, Math.round(Math.min(contentW * 0.28, contentH * 0.2)));
  const vigX = contentX + contentW - vigSize;
  const vigY = headerLineY + scale * 3;
  fillRectBooklet(
    out,
    pageW,
    pageH,
    vigX,
    vigY,
    vigSize,
    vigSize,
    moodSpec.panelTopRgb[0],
    moodSpec.panelTopRgb[1],
    moodSpec.panelTopRgb[2],
  );
  blitMoodGradedCharacterFit(out, pageW, pageH, vignettePortrait, vigX + 2, vigY + 2, vigSize - 4, vigSize - 4, moodId);
  drawOutlineBox(out, pageW, pageH, vigX, vigY, vigSize, vigSize, 1, 28, 25, 30);

  // 좌측 상단 에피소드 총제 표기
  const epTitleW = Math.max(12, vigX - contentX - scale * 3);
  bakeDeterministicDialogueGlyphs(
    out,
    pageW,
    contentX,
    vigY,
    contentX + epTitleW,
    vigY + vigSize,
    contentX + Math.round(epTitleW * 0.5),
    vigY + Math.round(vigSize * 0.45),
    Math.max(6, Math.round(epTitleW * 0.46)),
    Math.max(5, Math.round(vigSize * 0.32)),
    options.episodeTitleKo.trim() || "주간 연재 단행본 수록 목록",
    null,
    "md",
    [28, 25, 30],
  );

  // 챕터 리스트 (최대 12개 행, 번호 + 제목 + 점선 리더 + P.XX)
  const listTopY = vigY + vigSize + scale * 5;
  const listAvailH = Math.max(20, contentY + contentH - listTopY - scale * 4);
  const safeChapters = chapters.slice(0, 12);
  const rowStepY = Math.max(6, Math.min(Math.floor(scale * 11), Math.floor(listAvailH / Math.max(1, safeChapters.length))));

  safeChapters.forEach((chap, idx) => {
    const rowY = listTopY + idx * rowStepY;
    if (rowY + 5 * scale >= pageH - layout.bleedMarginPx) return;
    const chCode = `${String(chap.chapterNumber).padStart(2, "0")}.`;
    const codeW = stampAsciiBitmapText(out, pageW, pageH, chCode, contentX, rowY, scale, [156, 108, 44]);

    const folioStr = formatTankobonFolioLabel(chap.startPageNumber);
    const folioW = folioStr.length * 4 * scale;
    const folioX = contentX + contentW - folioW;
    stampAsciiBitmapText(out, pageW, pageH, folioStr, folioX, rowY, scale, [28, 25, 30]);

    const titleStartX = contentX + codeW + scale * 2;
    const titleMaxW = Math.max(8, Math.round((folioX - titleStartX) * 0.62));
    bakeDeterministicDialogueGlyphs(
      out,
      pageW,
      titleStartX,
      rowY - scale,
      titleStartX + titleMaxW,
      rowY + 6 * scale,
      titleStartX + Math.round(titleMaxW * 0.5),
      rowY + Math.round(2.5 * scale),
      Math.max(4, Math.round(titleMaxW * 0.46)),
      Math.max(3, Math.round(2.5 * scale)),
      chap.titleKo,
      null,
      "sm",
      [36, 32, 38],
    );

    // 점선 리더 (......)
    const dotStartX = titleStartX + titleMaxW + scale * 2;
    const dotEndX = folioX - scale * 2;
    const dotY = rowY + 4 * scale;
    for (let dx = dotStartX; dx < dotEndX; dx += Math.max(2, scale * 2)) {
      fillRectBooklet(out, pageW, pageH, dx, dotY, Math.max(1, Math.floor(scale * 0.7)), Math.max(1, Math.floor(scale * 0.7)), 140, 132, 124);
    }
  });

  // 하단 목차 페이지 번호 (기본 P.02)
  const tocFolio = formatTankobonFolioLabel(options.pageNumber ?? 2);
  const tocFolioW = tocFolio.length * 4 * scale;
  const footerY = Math.min(pageH - 5 * scale - 2, pageH - Math.round((layout.bleedMarginPx + layout.trimInsetPx) * 0.5));
  stampAsciiBitmapText(out, pageW, pageH, tocFolio, Math.round((pageW - tocFolioW) * 0.5), footerY, scale, [60, 54, 62]);

  return { width: pageW, height: pageH, rgba: out };
}

/**
 * 두 장의 단행본 B5 대지(예: 표지 + 목차, 또는 홀수 쪽 + 짝수 쪽)를 센터 책등 접지선(Spine Fold Marks)이 포함된
 * 양면 펼침면(`2-Page Facing Spread`) 인쇄 교정 대지 하나로 합성한다.
 */
export function composeTankobonFacingSpread(
  leftPage: CapturedRaster,
  rightPage: CapturedRaster,
  readingOrder: TankobonReadingOrder = "rtl-tankobon",
): CapturedRaster {
  if (leftPage.height !== rightPage.height) {
    throw new Error(`양면 펼침면 대지 높이가 서로 다릅니다(${leftPage.height} vs ${rightPage.height}).`);
  }
  const spineGapPx = Math.max(2, Math.round(leftPage.width * 0.006));
  const spreadW = leftPage.width + spineGapPx + rightPage.width;
  const spreadH = leftPage.height;
  const out = new Uint8ClampedArray(spreadW * spreadH * 4);
  fillRectBooklet(out, spreadW, spreadH, 0, 0, spreadW, spreadH, 236, 231, 222);

  // 우→좌 단행본(우철)은 첫 페이지(표지/홀수)가 우측에 오거나 펼침 기준 우→좌로 읽히므로 우측에 첫 페이지 배치
  const firstOnRight = readingOrder === "rtl-tankobon";
  const actualLeft = firstOnRight ? rightPage : leftPage;
  const actualRight = firstOnRight ? leftPage : rightPage;

  for (let y = 0; y < spreadH; y += 1) {
    const leftSrcOff = y * actualLeft.width * 4;
    const dstLeftOff = y * spreadW * 4;
    out.set(actualLeft.rgba.subarray(leftSrcOff, leftSrcOff + actualLeft.width * 4), dstLeftOff);

    const rightSrcOff = y * actualRight.width * 4;
    const dstRightOff = (y * spreadW + actualLeft.width + spineGapPx) * 4;
    out.set(actualRight.rgba.subarray(rightSrcOff, rightSrcOff + actualRight.width * 4), dstRightOff);
  }

  // 중앙 책등(Spine) 점선 접지 가이드라인 인쇄
  const spineCenterX = actualLeft.width + Math.floor(spineGapPx * 0.5);
  drawClippedLineRgba(
    out,
    spreadW,
    0,
    0,
    spreadW,
    spreadH,
    spineCenterX,
    0,
    spineCenterX,
    Math.max(4, Math.round(spreadH * 0.035)),
    1,
    40,
    36,
    42,
    0.85,
  );
  drawClippedLineRgba(
    out,
    spreadW,
    0,
    0,
    spreadW,
    spreadH,
    spineCenterX,
    spreadH - Math.max(4, Math.round(spreadH * 0.035)),
    spineCenterX,
    spreadH - 1,
    1,
    40,
    36,
    42,
    0.85,
  );

  return { width: spreadW, height: spreadH, rgba: out };
}

async function captureBookletHeroPortrait(
  engine: CharacterEngine,
  width: number,
  height: number,
  framingMode: CameraFramingMode,
  settleSteps: number,
  started: number,
): Promise<
  | { readonly ok: true; readonly lit: CapturedRaster; readonly recipeDigest: string; readonly provenance: import("../contracts").CaptureProvenance }
  | { readonly ok: false; readonly failure: LabFailure }
> {
  const safeSettle = Math.min(MAX_SETTLE_STEPS, Math.max(0, Math.floor(settleSteps)));
  if (safeSettle > 0) {
    try {
      await engine.settle(safeSettle);
    } catch (error) {
      return { ok: false, failure: toBookletFailure("export-settle", "단행본 표지 캡처 전 물리 settle에 실패했습니다.", error, started) };
    }
  }
  try {
    const captured = await engine.renderPasses({
      width,
      height,
      passes: ["lit"],
      transparentBackground: true,
      settleSteps: 0,
      camera: {
        ...DEFAULT_FRAMING,
        mode: framingMode,
        yawDeg: 16,
        pitchDeg: -6,
        distanceScale: framingMode === "full-body" ? 0.96 : 0.92,
      },
    });
    const lit = captured.passes.lit;
    if (!lit) {
      return { ok: false, failure: failVisible("export-missing-lit", "단행본 표지 캡처에 lit 패스가 없습니다.", undefined, started) };
    }
    return { ok: true, lit, recipeDigest: captured.provenance.recipeDigest, provenance: captured.provenance };
  } catch (error) {
    return { ok: false, failure: toBookletFailure("export-capture", "단행본 캐릭터 일러스트 캡처에 실패했습니다.", error, started) };
  }
}

/**
 * 단행본 B5 표지(`-tankobon-volXX-cover.png`)를 캡처·합성해 PNG로 내보낸다.
 */
export async function exportWebtoonTankobonCoverPng(
  engine: CharacterEngine,
  options: ExportWebtoonTankobonBookletOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const layout = clampWebtoonTankobonPageLayout(options.pageWidth, false, "none", options.readingOrder ?? "rtl-tankobon");
  options.onProgress?.(1, 2, "단행본 표지 메인 캐릭터 일러스트 캡처");

  const heroW = Math.max(16, Math.round((layout.pageWidth - layout.leftMarginPx - layout.rightMarginPx) * 0.86));
  const heroH = Math.max(16, Math.round((layout.pageHeight - layout.bleedMarginPx * 2) * 0.68));
  const captured = await captureBookletHeroPortrait(
    engine,
    heroW,
    heroH,
    options.framingMode ?? "bust",
    options.settleSteps ?? 0,
    started,
  );
  if (!captured.ok) return captured;

  try {
    options.onProgress?.(2, 2, "단행본 표지 타이포·권수 배지·재단선 조판 인코딩");
    const volNum = Math.max(1, Math.min(99, Math.floor(options.volumeNumber ?? 1)));
    const composed = composeTankobonCoverPage(captured.lit, layout, {
      volumeNumber: volNum,
      titleKo: options.titleKo,
      ...(options.authorKo !== undefined ? { authorKo: options.authorKo } : {}),
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      ...(options.manuscriptMood !== undefined ? { manuscriptMood: options.manuscriptMood } : {}),
      ...(options.screentone !== undefined ? { screentone: options.screentone } : {}),
      includeCropMarks: options.includeCropMarks ?? true,
    });
    const bytes = await encodePng(composed, { filter: "adaptive" });
    const baseName = exportFileName("png", captured.recipeDigest, composed.width, composed.height);
    const volTag = `-vol${String(volNum).padStart(2, "0")}`;
    const fileName = baseName.replace(/\.png$/u, `-tankobon${volTag}-cover.png`);
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
        provenance: captured.provenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toBookletFailure("export-png-encode", "단행본 표지 PNG 인코딩에 실패했습니다.", error, started) };
  }
}

/**
 * 에피소드 큐시트 비트 목록과 연동된 B5 단행본 목차 내지(`-tankobon-volXX-toc.png`)를 PNG로 내보낸다.
 */
export async function exportWebtoonTankobonTocPng(
  engine: CharacterEngine,
  options: ExportWebtoonTankobonBookletOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const readingOrder = options.readingOrder ?? "rtl-tankobon";
  const layout = clampWebtoonTankobonPageLayout(options.pageWidth, false, "even-verso", readingOrder);
  options.onProgress?.(1, 2, "단행본 목차 비네트 초상 캡처");

  const vigDim = Math.max(16, Math.round(layout.pageWidth * 0.28));
  const captured = await captureBookletHeroPortrait(
    engine,
    vigDim,
    vigDim,
    "face",
    options.settleSteps ?? 0,
    started,
  );
  if (!captured.ok) return captured;

  try {
    options.onProgress?.(2, 2, "단행본 목차 챕터·쪽번호 조판 인코딩");
    const volNum = Math.max(1, Math.min(99, Math.floor(options.volumeNumber ?? 1)));
    const chapters = buildTankobonChaptersFromBeats(options.beats ?? [], options.titleKo);
    const composed = composeTankobonTocPage(captured.lit, layout, chapters, {
      volumeNumber: volNum,
      episodeTitleKo: options.titleKo,
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      ...(options.manuscriptMood !== undefined ? { manuscriptMood: options.manuscriptMood } : {}),
      readingOrder,
      pageNumber: 2,
      includeCropMarks: options.includeCropMarks ?? true,
    });
    const bytes = await encodePng(composed, { filter: "adaptive" });
    const baseName = exportFileName("png", captured.recipeDigest, composed.width, composed.height);
    const volTag = `-vol${String(volNum).padStart(2, "0")}`;
    const fileName = baseName.replace(/\.png$/u, `-tankobon${volTag}-toc.png`);
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
        provenance: captured.provenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toBookletFailure("export-png-encode", "단행본 목차 PNG 인코딩에 실패했습니다.", error, started) };
  }
}

/**
 * 단행본 표지(`Cover`)와 목차(`TOC`)를 양면 펼침면(`2-Page Facing Spread`, 단일 PNG `<= 4096px` 폭 자동 보정) 인쇄 교정 대지로 동시 합성해 내보낸다.
 */
export async function exportWebtoonTankobonSpreadPng(
  engine: CharacterEngine,
  options: ExportWebtoonTankobonBookletOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const readingOrder = options.readingOrder ?? "rtl-tankobon";
  // 펼침면 가로 폭(2페이지 + 책등 간격)이 MAX_PNG_EXPORT_DIMENSION(4096px) 이하가 되도록 페이지 폭을 안전 클램프
  const safeSinglePageW = Math.min(1980, Math.max(48, Math.floor(options.pageWidth)));
  const coverLayout = clampWebtoonTankobonPageLayout(safeSinglePageW, false, "odd-recto", readingOrder);
  const tocLayout = clampWebtoonTankobonPageLayout(safeSinglePageW, false, "even-verso", readingOrder);

  options.onProgress?.(1, 3, "단행본 펼침면 표지 일러스트 캡처");
  const heroW = Math.max(16, Math.round((coverLayout.pageWidth - coverLayout.leftMarginPx - coverLayout.rightMarginPx) * 0.86));
  const heroH = Math.max(16, Math.round((coverLayout.pageHeight - coverLayout.bleedMarginPx * 2) * 0.68));
  const heroCap = await captureBookletHeroPortrait(
    engine,
    heroW,
    heroH,
    options.framingMode ?? "bust",
    options.settleSteps ?? 0,
    started,
  );
  if (!heroCap.ok) return heroCap;

  options.onProgress?.(2, 3, "단행본 펼침면 목차 비네트 캡처");
  const vigDim = Math.max(16, Math.round(tocLayout.pageWidth * 0.28));
  const vigCap = await captureBookletHeroPortrait(engine, vigDim, vigDim, "face", 0, started);
  if (!vigCap.ok) return vigCap;

  try {
    options.onProgress?.(3, 3, "단행본 표지·목차 양면 펼침면 대지 인코딩");
    const volNum = Math.max(1, Math.min(99, Math.floor(options.volumeNumber ?? 1)));
    const coverPage = composeTankobonCoverPage(heroCap.lit, coverLayout, {
      volumeNumber: volNum,
      titleKo: options.titleKo,
      ...(options.authorKo !== undefined ? { authorKo: options.authorKo } : {}),
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      ...(options.manuscriptMood !== undefined ? { manuscriptMood: options.manuscriptMood } : {}),
      ...(options.screentone !== undefined ? { screentone: options.screentone } : {}),
      includeCropMarks: options.includeCropMarks ?? true,
    });
    const chapters = buildTankobonChaptersFromBeats(options.beats ?? [], options.titleKo);
    const tocPage = composeTankobonTocPage(vigCap.lit, tocLayout, chapters, {
      volumeNumber: volNum,
      episodeTitleKo: options.titleKo,
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      ...(options.manuscriptMood !== undefined ? { manuscriptMood: options.manuscriptMood } : {}),
      readingOrder,
      pageNumber: 2,
      includeCropMarks: options.includeCropMarks ?? true,
    });

    const spread = composeTankobonFacingSpread(coverPage, tocPage, readingOrder);
    if (spread.width > MAX_PNG_EXPORT_DIMENSION || spread.height > MAX_PNG_EXPORT_DIMENSION) {
      return {
        ok: false,
        failure: failVisible(
          "export-tankobon-spread-size",
          `단행본 펼침면 크기(${spread.width}×${spread.height}px)가 최대 해상도(${MAX_PNG_EXPORT_DIMENSION}px)를 초과합니다.`,
          undefined,
          started,
        ),
      };
    }

    const bytes = await encodePng(spread, { filter: "adaptive" });
    const baseName = exportFileName("png", heroCap.recipeDigest, spread.width, spread.height);
    const volTag = `-vol${String(volNum).padStart(2, "0")}`;
    const orderTag = readingOrder === "rtl-tankobon" ? "-rtl" : "-ltr";
    const fileName = baseName.replace(/\.png$/u, `-tankobon${volTag}${orderTag}-spread.png`);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: spread.width,
        height: spread.height,
        provenance: heroCap.provenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toBookletFailure("export-png-encode", "단행본 양면 펼침면 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
