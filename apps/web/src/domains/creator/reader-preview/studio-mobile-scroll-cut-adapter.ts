/**
 * Studio Mobile Scroll Cut Adapter — Studio 페이지 배열을 모바일 390×844px 컷 배열로 변환한다.
 *
 * `StudioScrollPreviewPanel`의 `StudioScrollRhythmPageLike[]` 데이터를 받아 컷 높이·간격·
 * 대사 글자 수·액션/정적 유형을 추출하고 `analyzeMobileScrollCutRhythm`에 연결한다.
 */

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import {
  isStudioScrollRhythmSfxElement,
  type StudioScrollRhythmElementLike,
  type StudioScrollRhythmPageLike,
} from "../studio-scroll-rhythm";
import {
  analyzeMobileScrollCutRhythm,
  type MobileScrollCutInput,
  type MobileScrollCutRhythmReport,
  type MobileScrollCutType,
} from "./studio-mobile-scroll-cut-rhythm";

const FRAME_ELEMENT_TYPES = new Set(["frame", "panel"]);
const DIALOGUE_ELEMENT_TYPES = new Set(["bubble", "dialogue", "caption", "text"]);

export interface ExtractMobileScrollCutsOptions {
  /** 페이지 사이 연결 여백(캔버스 px). 기본 24px(스크롤 미리보기 기본값과 일치). */
  readonly pageGapPx?: number;
}

interface PositionedCutDraft {
  readonly id: string;
  readonly pageId: string;
  readonly topY: number;
  readonly bottomY: number;
  readonly dialogueCharCount: number;
  readonly cutType: MobileScrollCutType;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function verticalBounds(
  element: StudioScrollRhythmElementLike,
  canvasH: number,
): { start: number; end: number } | null {
  if (
    typeof element.y === "number" &&
    Number.isFinite(element.y) &&
    typeof element.height === "number" &&
    Number.isFinite(element.height) &&
    element.height > 0
  ) {
    const start = clamp(element.y, 0, canvasH);
    const end = clamp(element.y + element.height, 0, canvasH);
    return end > start ? { start, end } : null;
  }
  return null;
}

/**
 * Studio 페이지 배열(`StudioScrollRhythmPageLike[]`)에서 세로 컷 배열을 추출한다.
 * 추출된 컷은 `canvasWidthPx: STUDIO_CANVAS_WIDTH`(720px) 좌표계를 유지하므로
 * `analyzeMobileScrollCutRhythm(cuts, { canvasWidthPx: STUDIO_CANVAS_WIDTH })`에 바로 넣을 수 있다.
 */
export function extractMobileScrollCutsFromPages(
  pages: readonly StudioScrollRhythmPageLike[],
  options: ExtractMobileScrollCutsOptions = {},
): readonly MobileScrollCutInput[] {
  const pageGapPx =
    options.pageGapPx !== undefined && Number.isFinite(options.pageGapPx) && options.pageGapPx >= 0
      ? options.pageGapPx
      : 24;

  const positioned: PositionedCutDraft[] = [];
  let pageOffsetY = 0;

  for (const page of pages) {
    const canvasH =
      Number.isFinite(page.canvasH) && page.canvasH > 0 ? page.canvasH : 1_080;
    const visible = page.elements.filter(
      (el) =>
        !el.hidden &&
        (el.opacity === undefined || !Number.isFinite(el.opacity) || el.opacity > 0),
    );

    const dialogueItems: { start: number; end: number; chars: number }[] = [];
    const sfxItems: { start: number; end: number }[] = [];
    const frames: { id: string; start: number; end: number }[] = [];

    for (let elIndex = 0; elIndex < visible.length; elIndex += 1) {
      const el = visible[elIndex];
      if (!el) continue;
      const type = el.type.trim().toLowerCase();
      const bounds = verticalBounds(el, canvasH);
      if (!bounds) continue;

      if (FRAME_ELEMENT_TYPES.has(type)) {
        frames.push({
          id: el.id ?? `${page.id}-frame-${elIndex + 1}`,
          start: bounds.start,
          end: bounds.end,
        });
      } else if (isStudioScrollRhythmSfxElement(el)) {
        sfxItems.push(bounds);
      } else if (DIALOGUE_ELEMENT_TYPES.has(type)) {
        const textLen = (el.text ?? "").replace(/\s+/gu, " ").trim().length;
        dialogueItems.push({
          start: bounds.start,
          end: bounds.end,
          chars: textLen,
        });
      }
    }

    if (frames.length > 0) {
      frames.sort((a, b) => a.start - b.start || a.end - b.end);
      for (const frame of frames) {
        const dialogueCharCount = dialogueItems
          .filter((item) => item.end > frame.start && item.start < frame.end)
          .reduce((sum, item) => sum + item.chars, 0);
        const hasSfx = sfxItems.some(
          (item) => item.end > frame.start && item.start < frame.end,
        );
        const cutType: MobileScrollCutType =
          hasSfx || dialogueCharCount === 0 ? "action" : "static";

        positioned.push({
          id: frame.id,
          pageId: page.id,
          topY: pageOffsetY + frame.start,
          bottomY: pageOffsetY + frame.end,
          dialogueCharCount,
          cutType,
        });
      }
    } else if (visible.length > 0) {
      // 프레임 요소가 없는 스케치/단일 페이지도 1컷으로 집계해 리듬 누락을 막는다.
      const allBounds = visible
        .map((el) => verticalBounds(el, canvasH))
        .filter((bounds): bounds is { start: number; end: number } => bounds !== null);
      const minStart = allBounds.reduce((min, item) => Math.min(min, item.start), canvasH);
      const maxEnd = allBounds.reduce((max, item) => Math.max(max, item.end), 0);
      const start = maxEnd > minStart ? minStart : 0;
      const end = maxEnd > minStart ? maxEnd : canvasH;
      const dialogueCharCount = dialogueItems.reduce((sum, item) => sum + item.chars, 0);
      const cutType: MobileScrollCutType =
        sfxItems.length > 0 || dialogueCharCount === 0 ? "action" : "static";

      positioned.push({
        id: `${page.id}-cut-1`,
        pageId: page.id,
        topY: pageOffsetY + start,
        bottomY: pageOffsetY + end,
        dialogueCharCount,
        cutType,
      });
    }

    pageOffsetY += canvasH + pageGapPx;
  }

  const totalCanvasEndY = Math.max(0, pageOffsetY - pageGapPx);
  return Object.freeze(
    positioned.map((draft, index) => {
      const next = positioned[index + 1];
      const gapAfterPx = next
        ? Math.max(0, roundTo(next.topY - draft.bottomY, 1))
        : Math.max(0, roundTo(totalCanvasEndY - draft.bottomY, 1));
      return Object.freeze({
        id: draft.id,
        pageId: draft.pageId,
        heightPx: Math.max(1, roundTo(draft.bottomY - draft.topY, 1)),
        gapAfterPx,
        dialogueCharCount: draft.dialogueCharCount,
        cutType: draft.cutType,
      });
    }),
  );
}

/** Studio 페이지 배열을 모바일 390×844px 컷 리듬 리포트로 한 번에 분석하는 편의 함수. */
export function analyzeStudioPagesMobileCutRhythm(
  pages: readonly StudioScrollRhythmPageLike[],
  options: ExtractMobileScrollCutsOptions & {
    readonly canvasWidthPx?: number;
    readonly viewportWidthPx?: number;
    readonly viewportHeightPx?: number;
  } = {},
): MobileScrollCutRhythmReport {
  const cuts = extractMobileScrollCutsFromPages(pages, {
    pageGapPx: options.pageGapPx,
  });
  return analyzeMobileScrollCutRhythm(cuts, {
    canvasWidthPx: options.canvasWidthPx ?? STUDIO_CANVAS_WIDTH,
    viewportWidthPx: options.viewportWidthPx,
    viewportHeightPx: options.viewportHeightPx,
  });
}
