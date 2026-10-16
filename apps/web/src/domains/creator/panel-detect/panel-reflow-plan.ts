/**
 * 세로 스트립 재배열 계획 — 순서가 정해진 컷을 폭 규격(690/720)의 세로 한 줄로 늘어놓는 순수 계산.
 *
 * 이 모듈은 픽셀을 만지지 않는다. 컷마다 원본 사각형 → 스트립 사각형(배율 포함)을 정하고, Studio 페이지 높이에 맞춰
 * 컷 경계에서만 페이지를 나눈다. 손실·변경 사항은 코드와 수치로 돌려주고, 문구는 화면이 만든다(이중언어).
 *
 * 원칙(기존 가져오기 게이트와 같다)
 *  - 원본은 읽기만 한다. 결과는 항상 새 이미지·새 문서 사본이다.
 *  - 컷 밖 영역, 확대·축소, 재인코딩, 페이지 분할처럼 원본과 달라지는 모든 것을 손실 보고에 올린다.
 *  - 사용자가 보고를 확인하기 전에는 적용하지 않는다(확인 버튼은 화면의 책임).
 */

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";

import type { PanelRect } from "./panel-detect-types";

/**
 * Studio 문서 한도. 정본은 studio-project-file.ts(STUDIO_PROJECT_MAX_*)지만, 그 모듈은 3D 장면·zod 스키마까지 끌고 와서
 * 가져오기 화면의 지연 묶음에 싣기엔 무겁다. 값만 복제하고 panel-reflow-plan.test.ts 가 정본과 같은지 검사한다.
 */
export const PANEL_REFLOW_STUDIO_LIMITS = Object.freeze({ maxCanvasHeight: 100_000, maxPages: 200 });
const STUDIO_PROJECT_MAX_CANVAS_HEIGHT = PANEL_REFLOW_STUDIO_LIMITS.maxCanvasHeight;
const STUDIO_PROJECT_MAX_PAGES = PANEL_REFLOW_STUDIO_LIMITS.maxPages;

export const PANEL_REFLOW_WIDTHS = [690, 720] as const;
export type PanelReflowWidth = (typeof PANEL_REFLOW_WIDTHS)[number];

/** 폭 규격 프리셋: 690 = 네이버 연재형, 720 = 카카오 연재형(Studio 문서 폭과 같다). */
export const PANEL_REFLOW_WIDTH_PRESETS = Object.freeze([
  { width: 720 as const, label: "720px" },
  { width: 690 as const, label: "690px" },
]);

/** 컷 사이 표준 여백(px). */
export const PANEL_REFLOW_STANDARD_GAP = 80;
export const PANEL_REFLOW_MAX_GAP = 400;
/** Studio 웹툰 새 문서의 기본 세로 길이와 같다(studio-webtoon-canvas-presets). 이 길이를 넘기기 전에 컷 경계에서 페이지를 나눈다. */
export const PANEL_REFLOW_PAGE_TARGET_HEIGHT = 8_000;
/** 결과 이미지의 전체 픽셀 상한(메모리 보호). */
export const PANEL_REFLOW_MAX_OUTPUT_PIXELS = 80_000_000;

export type ReflowScaleMode = "fit-width" | "keep-size";

export type ReflowBackgroundKind = "gutter" | "white" | "black";

export interface PanelReflowOptions {
  readonly targetWidth: PanelReflowWidth;
  readonly gap: number;
  readonly scaleMode: ReflowScaleMode;
  /** 페이지 분할 기준 높이. 기본 PANEL_REFLOW_PAGE_TARGET_HEIGHT. */
  readonly pageHeight?: number;
}

export interface ReflowSourcePanel extends PanelRect {
  readonly id: string;
}

export interface ReflowPlacement {
  readonly panelId: string;
  /** 1부터 시작하는 재배열 순서. */
  readonly order: number;
  readonly source: PanelRect;
  /** 폭 targetWidth 짜리 스트립 안의 사각형(페이지 안 좌표). */
  readonly dest: PanelRect;
  /** dest.width / source.width. */
  readonly scale: number;
  readonly page: number;
}

export interface ReflowPage {
  readonly index: number;
  /** 페이지 높이(px). 마지막 컷 아래에 여백을 더하지 않는다. */
  readonly height: number;
  readonly placements: readonly ReflowPlacement[];
}

export type PanelReflowErrorCode =
  | "no-panels"
  | "invalid-options"
  | "invalid-panel"
  | "panel-too-tall"
  | "too-many-pages"
  | "output-too-large";

export class PanelReflowError extends Error {
  readonly code: PanelReflowErrorCode;

  constructor(code: PanelReflowErrorCode, message: string) {
    super(message);
    this.name = "PanelReflowError";
    this.code = code;
  }
}

export interface PanelReflowPlan {
  readonly options: Required<PanelReflowOptions>;
  readonly pages: readonly ReflowPage[];
  readonly placements: readonly ReflowPlacement[];
  /** 모든 페이지 높이의 합(페이지 사이 여백 제외). */
  readonly totalHeight: number;
  readonly outputPixels: number;
  /** Studio 문서 안에서 스트립을 가운데 정렬하는 가로 오프셋(690 → 15, 720 → 0). */
  readonly documentOffsetX: number;
  readonly minScale: number;
  readonly maxScale: number;
}

function assertOptions(options: PanelReflowOptions): Required<PanelReflowOptions> {
  if (!(PANEL_REFLOW_WIDTHS as readonly number[]).includes(options.targetWidth)) {
    throw new PanelReflowError("invalid-options", "폭 규격은 690 또는 720 만 쓸 수 있어요.");
  }
  if (!Number.isInteger(options.gap) || options.gap < 0 || options.gap > PANEL_REFLOW_MAX_GAP) {
    throw new PanelReflowError("invalid-options", `컷 사이 여백은 0~${PANEL_REFLOW_MAX_GAP}px 정수여야 해요.`);
  }
  if (options.scaleMode !== "fit-width" && options.scaleMode !== "keep-size") {
    throw new PanelReflowError("invalid-options", "배율 방식이 올바르지 않아요.");
  }
  const pageHeight = options.pageHeight ?? PANEL_REFLOW_PAGE_TARGET_HEIGHT;
  if (!Number.isInteger(pageHeight) || pageHeight < 256 || pageHeight > STUDIO_PROJECT_MAX_CANVAS_HEIGHT) {
    throw new PanelReflowError("invalid-options", "페이지 높이 값이 올바르지 않아요.");
  }
  return { targetWidth: options.targetWidth, gap: options.gap, scaleMode: options.scaleMode, pageHeight };
}

/**
 * 컷 사각형이 유한한 숫자이고 원본 안의 좌표(x·y ≥ 0, 크기 > 0)인지 본다. 검사하지 않으면 NaN·Infinity·0 이하 크기가
 * 배율 계산에 섞여 NaN 높이의 계획이 오류 없이 만들어지거나, 엉뚱하게 panel-too-tall 로 거절된다.
 */
function assertPanels(panels: readonly ReflowSourcePanel[]): void {
  panels.forEach((panel, index) => {
    const valid = Number.isFinite(panel.x) && Number.isFinite(panel.y) && Number.isFinite(panel.width) && Number.isFinite(panel.height)
      && panel.x >= 0 && panel.y >= 0 && panel.width > 0 && panel.height > 0;
    if (!valid) throw new PanelReflowError("invalid-panel", `${index + 1}번 컷의 위치나 크기가 올바르지 않아요.`);
  });
}

function destSize(panel: PanelRect, options: Required<PanelReflowOptions>): { width: number; height: number } {
  const scale = options.scaleMode === "fit-width"
    ? options.targetWidth / panel.width
    : Math.min(1, options.targetWidth / panel.width);
  const width = options.scaleMode === "fit-width" ? options.targetWidth : Math.max(1, Math.round(panel.width * scale));
  return { width, height: Math.max(1, Math.round(panel.height * scale)) };
}

export function planPanelReflow(
  panels: readonly ReflowSourcePanel[],
  optionsInput: PanelReflowOptions,
): PanelReflowPlan {
  if (panels.length === 0) throw new PanelReflowError("no-panels", "재배열할 컷이 없어요.");
  const options = assertOptions(optionsInput);
  assertPanels(panels);
  const placements: ReflowPlacement[] = [];
  const pages: ReflowPage[] = [];
  let current: ReflowPlacement[] = [];
  let currentHeight = 0;
  let outputPixels = 0;
  let minScale = Number.POSITIVE_INFINITY;
  let maxScale = 0;

  const closePage = (): void => {
    if (current.length === 0) return;
    pages.push({ index: pages.length, height: currentHeight, placements: current });
    current = [];
    currentHeight = 0;
  };

  panels.forEach((panel, index) => {
    const size = destSize(panel, options);
    if (size.height > STUDIO_PROJECT_MAX_CANVAS_HEIGHT) {
      throw new PanelReflowError("panel-too-tall", `${index + 1}번 컷이 배율을 적용하면 ${STUDIO_PROJECT_MAX_CANVAS_HEIGHT}px 를 넘어요.`);
    }
    if (current.length > 0 && currentHeight + options.gap + size.height > options.pageHeight) closePage();
    const y = current.length === 0 ? 0 : currentHeight + options.gap;
    const x = Math.round((options.targetWidth - size.width) / 2);
    const scale = size.width / panel.width;
    minScale = Math.min(minScale, scale);
    maxScale = Math.max(maxScale, scale);
    const placement: ReflowPlacement = {
      panelId: panel.id,
      order: index + 1,
      source: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
      dest: { x, y, width: size.width, height: size.height },
      scale,
      page: pages.length,
    };
    current.push(placement);
    placements.push(placement);
    currentHeight = y + size.height;
    outputPixels += size.width * size.height;
  });
  closePage();

  if (pages.length > STUDIO_PROJECT_MAX_PAGES) {
    throw new PanelReflowError("too-many-pages", `페이지가 ${STUDIO_PROJECT_MAX_PAGES}쪽을 넘어요. 컷 수를 줄여 주세요.`);
  }
  if (outputPixels > PANEL_REFLOW_MAX_OUTPUT_PIXELS) {
    throw new PanelReflowError("output-too-large", "결과 이미지가 너무 커요. 컷 수를 줄이거나 폭에 맞춤 대신 원본 크기 유지를 써 보세요.");
  }
  return {
    options,
    pages,
    placements,
    totalHeight: pages.reduce((sum, page) => sum + page.height, 0),
    outputPixels,
    documentOffsetX: Math.round((STUDIO_CANVAS_WIDTH - options.targetWidth) / 2),
    minScale,
    maxScale,
  };
}

// ── 손실·변경 보고 ────────────────────────────────────────────────────────

export type ReflowImageFormat = "png" | "webp";

export type ReflowLossCode =
  | "source-untouched"
  | "outside-cuts-dropped"
  | "upscaled"
  | "downscaled"
  | "recompressed-lossless"
  | "recompressed-lossy"
  | "cuts-overlap"
  | "centered-in-document"
  | "split-into-pages"
  | "undetectable-excluded"
  | "ignored-excluded"
  | "low-confidence-cuts";

export interface ReflowLossItem {
  readonly code: ReflowLossCode;
  /** warning 은 원본과 달라지는 내용(확인 필요), info 는 알려 두는 사실. */
  readonly severity: "info" | "warning";
  /** 문구에 끼울 수치. */
  readonly values: Readonly<Record<string, number>>;
}

export interface ReflowLossInput {
  readonly plan: PanelReflowPlan;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly format: ReflowImageFormat;
  readonly undetectableCount: number;
  readonly ignoredCount: number;
  /** 신뢰도가 낮은(low) 컷 수. */
  readonly lowConfidenceCount: number;
}

function overlapArea(a: PanelRect, b: PanelRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** 컷들이 원본에서 차지하는 면적의 합집합 비율(0~1). 겹침은 한 번만 센다. 컷이 많지 않아 좌표 압축으로 계산한다. */
export function coveredShare(panels: readonly PanelRect[], width: number, height: number): number {
  if (panels.length === 0 || width <= 0 || height <= 0) return 0;
  const xs = [...new Set(panels.flatMap((panel) => [panel.x, panel.x + panel.width]))].sort((a, b) => a - b);
  const ys = [...new Set(panels.flatMap((panel) => [panel.y, panel.y + panel.height]))].sort((a, b) => a - b);
  let covered = 0;
  for (let i = 0; i + 1 < xs.length; i += 1) {
    for (let j = 0; j + 1 < ys.length; j += 1) {
      const cell = { x: xs[i], y: ys[j], width: xs[i + 1] - xs[i], height: ys[j + 1] - ys[j] };
      if (panels.some((panel) => overlapArea(panel, cell) > 0)) covered += cell.width * cell.height;
    }
  }
  return Math.min(1, covered / (width * height));
}

export function buildReflowLossReport(input: ReflowLossInput): ReflowLossItem[] {
  const { plan } = input;
  const items: ReflowLossItem[] = [{ code: "source-untouched", severity: "info", values: {} }];
  const sources = plan.placements.map((placement) => placement.source);
  const outside = 1 - coveredShare(sources, input.sourceWidth, input.sourceHeight);
  if (outside > 0.001) {
    items.push({ code: "outside-cuts-dropped", severity: "warning", values: { percent: Math.round(outside * 1000) / 10 } });
  }
  const upscaled = plan.placements.filter((placement) => placement.scale > 1.0001);
  if (upscaled.length > 0) {
    items.push({
      code: "upscaled",
      severity: "warning",
      values: { count: upscaled.length, maxScale: Math.round(plan.maxScale * 100) / 100 },
    });
  }
  const downscaled = plan.placements.filter((placement) => placement.scale < 0.9999);
  if (downscaled.length > 0) {
    items.push({
      code: "downscaled",
      severity: "info",
      values: { count: downscaled.length, minScale: Math.round(plan.minScale * 100) / 100 },
    });
  }
  items.push({
    code: input.format === "png" ? "recompressed-lossless" : "recompressed-lossy",
    severity: input.format === "png" ? "info" : "warning",
    values: {},
  });
  let overlapping = 0;
  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      if (overlapArea(sources[i], sources[j]) > 0) overlapping += 1;
    }
  }
  if (overlapping > 0) items.push({ code: "cuts-overlap", severity: "warning", values: { pairs: overlapping } });
  if (plan.documentOffsetX > 0) {
    items.push({ code: "centered-in-document", severity: "info", values: { offset: plan.documentOffsetX } });
  }
  if (plan.pages.length > 1) {
    items.push({ code: "split-into-pages", severity: "info", values: { pages: plan.pages.length } });
  }
  if (input.undetectableCount > 0) {
    items.push({ code: "undetectable-excluded", severity: "warning", values: { count: input.undetectableCount } });
  }
  if (input.ignoredCount > 0) {
    items.push({ code: "ignored-excluded", severity: "info", values: { count: input.ignoredCount } });
  }
  if (input.lowConfidenceCount > 0) {
    items.push({ code: "low-confidence-cuts", severity: "warning", values: { count: input.lowConfidenceCount } });
  }
  return items;
}

/** 사용자 확인이 필요한 항목(원본과 달라지는 것)이 있는지. */
export function reflowLossNeedsConfirmation(items: readonly ReflowLossItem[]): boolean {
  return items.some((item) => item.severity === "warning");
}
