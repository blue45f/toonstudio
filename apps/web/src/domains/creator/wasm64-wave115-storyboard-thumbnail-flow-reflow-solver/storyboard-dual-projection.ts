/**
 * Wave 115 — 2D 썸네일 보드(열 기반 씬 헤더 그리드)와 세로 스크롤 마스터 스트립 이중 투영기.
 *
 * - `buildStoryboardFlowProjection`: 컷 배열을 2D 보드 셀과 세로 스크롤 스트립으로 동시 투영
 * - `estimateCutReadingSec`: 대사·시각 복잡도·스크롤·여백 기반 모델 추정 읽기 시간 계산
 * - `auditContinuityLinks`: 복선→회수(`continuityTargetCutIds`) 인과 역전 실시간 적발
 */

import type {
  ContinuityLinkStatus,
  ContinuityViolation,
  NormalizedStoryboardCut,
  ProjectedBoardCell,
  ProjectedStoryboardCut,
  ProjectedVerticalStripItem,
  ResolvedStoryboardProjectionOptions,
  StoryboardAct,
  StoryboardCutInput,
  StoryboardFlowProjection,
  StoryboardProjectionOptions,
  StoryboardSceneHeader,
} from "./storyboard-board-types";
import { computeStoryboardStateSha256Hex } from "./storyboard-sha256-and-canonical";

export const DEFAULT_BOARD_COLUMNS = 4;
export const DEFAULT_CANVAS_WIDTH_PX = 800;
export const DEFAULT_CARD_WIDTH_PX = 180;
export const DEFAULT_CARD_HEIGHT_PX = 132;
export const DEFAULT_CARD_GAP_X_PX = 16;
export const DEFAULT_CARD_GAP_Y_PX = 16;
export const DEFAULT_SCENE_HEADER_HEIGHT_PX = 34;
export const DEFAULT_SCENE_GAP_Y_PX = 24;
export const DEFAULT_BOARD_PADDING_PX = 20;
export const DEFAULT_READING_CHARS_PER_SEC = 14;
export const DEFAULT_BASE_VISUAL_READ_SEC = 1.1;
export const DEFAULT_SCROLL_SPEED_PX_PER_SEC = 520;

const VALID_ACTS: ReadonlySet<string> = new Set<StoryboardAct>([
  "intro",
  "development",
  "twist",
  "climax",
  "epilogue",
]);

export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function dedupeStringIds(ids: readonly string[] | undefined): readonly string[] {
  if (!ids || ids.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    const clean = ids[i]?.trim() ?? "";
    if (clean.length > 0 && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export function cloneNormalizedCut(cut: NormalizedStoryboardCut): NormalizedStoryboardCut {
  return {
    ...cut,
    continuityTargetCutIds: [...cut.continuityTargetCutIds],
  };
}

export function resolveStoryboardProjectionOptions(
  options?: StoryboardProjectionOptions,
): ResolvedStoryboardProjectionOptions {
  return {
    episodeTitleKo: options?.episodeTitleKo?.trim() || "에피소드 스토리보드",
    columns: clampInt(options?.columns ?? DEFAULT_BOARD_COLUMNS, 1, 12, DEFAULT_BOARD_COLUMNS),
    canvasWidthPx: clampInt(
      options?.canvasWidthPx ?? DEFAULT_CANVAS_WIDTH_PX,
      320,
      2400,
      DEFAULT_CANVAS_WIDTH_PX,
    ),
    cardWidthPx: clampInt(
      options?.cardWidthPx ?? DEFAULT_CARD_WIDTH_PX,
      120,
      360,
      DEFAULT_CARD_WIDTH_PX,
    ),
    cardHeightPx: clampInt(
      options?.cardHeightPx ?? DEFAULT_CARD_HEIGHT_PX,
      88,
      280,
      DEFAULT_CARD_HEIGHT_PX,
    ),
    cardGapXPx: clampInt(options?.cardGapXPx ?? DEFAULT_CARD_GAP_X_PX, 6, 48, DEFAULT_CARD_GAP_X_PX),
    cardGapYPx: clampInt(options?.cardGapYPx ?? DEFAULT_CARD_GAP_Y_PX, 6, 48, DEFAULT_CARD_GAP_Y_PX),
    sceneHeaderHeightPx: clampInt(
      options?.sceneHeaderHeightPx ?? DEFAULT_SCENE_HEADER_HEIGHT_PX,
      24,
      64,
      DEFAULT_SCENE_HEADER_HEIGHT_PX,
    ),
    sceneGapYPx: clampInt(
      options?.sceneGapYPx ?? DEFAULT_SCENE_GAP_Y_PX,
      10,
      64,
      DEFAULT_SCENE_GAP_Y_PX,
    ),
    boardPaddingPx: clampInt(
      options?.boardPaddingPx ?? DEFAULT_BOARD_PADDING_PX,
      8,
      64,
      DEFAULT_BOARD_PADDING_PX,
    ),
    readingCharsPerSec: clampNumber(
      options?.readingCharsPerSec ?? DEFAULT_READING_CHARS_PER_SEC,
      4,
      40,
    ),
    baseVisualReadSec: clampNumber(
      options?.baseVisualReadSec ?? DEFAULT_BASE_VISUAL_READ_SEC,
      0.2,
      5,
    ),
    scrollSpeedPxPerSec: clampNumber(
      options?.scrollSpeedPxPerSec ?? DEFAULT_SCROLL_SPEED_PX_PER_SEC,
      150,
      1800,
    ),
  };
}

export function normalizeStoryboardCut(
  cut: StoryboardCutInput,
  fallbackIndex = 0,
): NormalizedStoryboardCut {
  const safeId = cut.cutId.trim() || `cut-${String(fallbackIndex + 1).padStart(2, "0")}`;
  const safeSceneId = cut.sceneId.trim() || "scene-01";
  const safeAct: StoryboardAct = VALID_ACTS.has(cut.act) ? cut.act : "development";
  return {
    cutId: safeId,
    sceneId: safeSceneId,
    sceneTitleKo: (cut.sceneTitleKo ?? safeSceneId).trim() || safeSceneId,
    titleKo: cut.titleKo.trim() || safeId,
    act: safeAct,
    tension: round3(clampNumber(cut.tension, 0, 1)),
    dialogueCharCount: clampInt(cut.dialogueCharCount, 0, 20000, 0),
    visualComplexity: round3(clampNumber(cut.visualComplexity, 0, 1)),
    heightPx: clampInt(cut.heightPx, 80, 12000, 640),
    gutterBeforePx: clampInt(cut.gutterBeforePx, 0, 5000, 0),
    lockedAnchor: Boolean(cut.lockedAnchor),
    continuityTargetCutIds: dedupeStringIds(cut.continuityTargetCutIds),
  };
}

export function normalizeStoryboardCuts(
  cuts: readonly StoryboardCutInput[],
): NormalizedStoryboardCut[] {
  return cuts.map((cut, index) => normalizeStoryboardCut(cut, index));
}

/**
 * 단일 컷의 모델 기반 예상 읽기 시간(초)을 계산한다.
 */
export function estimateCutReadingSec(
  cut: Pick<
    NormalizedStoryboardCut,
    "dialogueCharCount" | "visualComplexity" | "heightPx" | "gutterBeforePx"
  >,
  options?: Pick<
    ResolvedStoryboardProjectionOptions,
    "readingCharsPerSec" | "baseVisualReadSec" | "scrollSpeedPxPerSec"
  >,
): number {
  const charsPerSec = options?.readingCharsPerSec ?? DEFAULT_READING_CHARS_PER_SEC;
  const baseVisual = options?.baseVisualReadSec ?? DEFAULT_BASE_VISUAL_READ_SEC;
  const scrollSpeed = options?.scrollSpeedPxPerSec ?? DEFAULT_SCROLL_SPEED_PX_PER_SEC;

  const dialogueSec = Math.max(0, cut.dialogueCharCount) / charsPerSec;
  const visualSec = baseVisual * (0.65 + 0.85 * clampNumber(cut.visualComplexity, 0, 1));
  const scrollDwellSec = Math.max(0, cut.heightPx) / (scrollSpeed * 1.6);
  const gutterBreathSec = Math.max(0, cut.gutterBeforePx) / (scrollSpeed * 2.2);
  return round3(dialogueSec + visualSec + scrollDwellSec + gutterBreathSec);
}

/**
 * 복선→회수(`continuityTargetCutIds`) 인과 링크 전체와 역전 위반을 감사한다.
 */
export function auditContinuityLinks(cuts: readonly NormalizedStoryboardCut[]): {
  readonly links: readonly ContinuityLinkStatus[];
  readonly violations: readonly ContinuityViolation[];
} {
  const indexByCutId = new Map<string, number>();
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (cut && !indexByCutId.has(cut.cutId)) {
      indexByCutId.set(cut.cutId, i);
    }
  }

  const links: ContinuityLinkStatus[] = [];
  const violations: ContinuityViolation[] = [];

  for (let sourceIndex = 0; sourceIndex < cuts.length; sourceIndex += 1) {
    const source = cuts[sourceIndex];
    if (!source) continue;
    for (let t = 0; t < source.continuityTargetCutIds.length; t += 1) {
      const targetCutId = source.continuityTargetCutIds[t];
      if (!targetCutId) continue;
      const targetIndex = indexByCutId.get(targetCutId);
      if (targetIndex === undefined) continue;

      const reversed = targetIndex < sourceIndex;
      links.push({
        sourceCutId: source.cutId,
        targetCutId,
        sourceIndex,
        targetIndex,
        reversed,
        spanCuts: targetIndex - sourceIndex,
      });

      if (reversed) {
        violations.push({
          sourceCutId: source.cutId,
          targetCutId,
          sourceIndex,
          targetIndex,
          reasonKo: `복선 컷(${source.cutId}, #${sourceIndex + 1})이 회수 컷(${targetCutId}, #${targetIndex + 1})보다 뒤에 놓여 인과 순서가 역전되었습니다.`,
        });
      }
    }
  }

  return { links, violations };
}

interface ContiguousSceneRun {
  readonly sceneId: string;
  readonly sceneTitleKo: string;
  readonly startCutIndex: number;
  readonly endCutIndex: number;
}

function collectContiguousSceneRuns(cuts: readonly NormalizedStoryboardCut[]): ContiguousSceneRun[] {
  const runs: ContiguousSceneRun[] = [];
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.sceneId === cut.sceneId) {
      runs[runs.length - 1] = { ...prev, endCutIndex: i };
    } else {
      runs.push({
        sceneId: cut.sceneId,
        sceneTitleKo: cut.sceneTitleKo,
        startCutIndex: i,
        endCutIndex: i,
      });
    }
  }
  return runs;
}

/**
 * 웹툰 1화 컷 목록을 2D 썸네일 보드(열 수 `columns` · 씬 그룹 헤더)와
 * 세로 스크롤 마스터 스트립(`yPx`, `heightPx`, `gutterBeforePx`, `cumulativeReadingSec`)으로 결정론적 투영한다.
 */
export function buildStoryboardFlowProjection(
  cutsInput: readonly StoryboardCutInput[],
  optionsInput?: StoryboardProjectionOptions,
): StoryboardFlowProjection {
  const options = resolveStoryboardProjectionOptions(optionsInput);
  const normalized = normalizeStoryboardCuts(cutsInput);
  const runs = collectContiguousSceneRuns(normalized);

  const boardWidthPx =
    options.boardPaddingPx * 2 +
    options.columns * options.cardWidthPx +
    Math.max(0, options.columns - 1) * options.cardGapXPx;

  const projectedCuts: ProjectedStoryboardCut[] = [];
  const scenes: StoryboardSceneHeader[] = [];

  let cursorBoardY = options.boardPaddingPx;
  let globalRowBase = 0;
  let cursorStripY = 0;
  let cumulativeReadingSec = 0;
  let totalDialogueChars = 0;

  for (let sceneGroupIndex = 0; sceneGroupIndex < runs.length; sceneGroupIndex += 1) {
    const run = runs[sceneGroupIndex];
    if (!run) continue;

    const headerYPx = cursorBoardY;
    const cardsTopY = headerYPx + options.sceneHeaderHeightPx + 10;
    const cutCount = run.endCutIndex - run.startCutIndex + 1;
    const rowsInScene = Math.ceil(cutCount / options.columns);
    const startRow = globalRowBase;
    const endRow = globalRowBase + rowsInScene - 1;

    let sceneTensionSum = 0;
    let sceneDialogueChars = 0;
    let sceneReadingSec = 0;
    let stripStartYPx = cursorStripY;
    let stripEndYPx = cursorStripY;

    for (let localIdx = 0; localIdx < cutCount; localIdx += 1) {
      const cutIndex = run.startCutIndex + localIdx;
      const cut = normalized[cutIndex];
      if (!cut) continue;

      const localRow = Math.floor(localIdx / options.columns);
      const col = localIdx % options.columns;
      const row = globalRowBase + localRow;
      const xPx = options.boardPaddingPx + col * (options.cardWidthPx + options.cardGapXPx);
      const boardYPx = cardsTopY + localRow * (options.cardHeightPx + options.cardGapYPx);

      const boardCell: ProjectedBoardCell = {
        row,
        col,
        xPx,
        yPx: boardYPx,
        widthPx: options.cardWidthPx,
        heightPx: options.cardHeightPx,
        sceneHeaderYPx: headerYPx,
      };

      const yPx = cursorStripY + cut.gutterBeforePx;
      const endYPx = yPx + cut.heightPx;
      cursorStripY = endYPx;

      if (localIdx === 0) stripStartYPx = yPx;
      stripEndYPx = endYPx;

      const readingSec = estimateCutReadingSec(cut, options);
      cumulativeReadingSec = round3(cumulativeReadingSec + readingSec);
      sceneReadingSec = round3(sceneReadingSec + readingSec);
      sceneTensionSum += cut.tension;
      sceneDialogueChars += cut.dialogueCharCount;
      totalDialogueChars += cut.dialogueCharCount;

      const vertical: ProjectedVerticalStripItem = {
        yPx,
        heightPx: cut.heightPx,
        gutterBeforePx: cut.gutterBeforePx,
        endYPx,
        readingSec,
        cumulativeReadingSec,
      };

      projectedCuts.push({
        ...cut,
        index: cutIndex,
        sceneGroupIndex,
        row,
        col,
        yPx,
        endYPx,
        readingSec,
        cumulativeReadingSec,
        boardCell,
        vertical,
      });
    }

    scenes.push({
      sceneGroupIndex,
      sceneId: run.sceneId,
      sceneTitleKo: run.sceneTitleKo,
      startCutIndex: run.startCutIndex,
      endCutIndex: run.endCutIndex,
      cutCount,
      startRow,
      endRow,
      headerYPx,
      headerHeightPx: options.sceneHeaderHeightPx,
      stripStartYPx,
      stripEndYPx,
      averageTension: cutCount > 0 ? round3(sceneTensionSum / cutCount) : 0,
      totalDialogueChars: sceneDialogueChars,
      totalReadingSec: sceneReadingSec,
    });

    globalRowBase += rowsInScene;
    cursorBoardY =
      cardsTopY +
      rowsInScene * options.cardHeightPx +
      Math.max(0, rowsInScene - 1) * options.cardGapYPx +
      options.sceneGapYPx;
  }

  const boardHeightPx =
    runs.length === 0
      ? options.boardPaddingPx * 2 + options.cardHeightPx
      : cursorBoardY - options.sceneGapYPx + options.boardPaddingPx;

  const continuity = auditContinuityLinks(normalized);
  const stateSha256Hex = computeStoryboardStateSha256Hex(normalized);

  return {
    episodeTitleKo: options.episodeTitleKo,
    columns: options.columns,
    canvasWidthPx: options.canvasWidthPx,
    boardWidthPx,
    boardHeightPx,
    stripTotalHeightPx: cursorStripY,
    totalReadingSec: cumulativeReadingSec,
    totalDialogueChars,
    cuts: projectedCuts,
    scenes,
    continuityLinks: continuity.links,
    continuityViolations: continuity.violations,
    stateSha256Hex,
    options,
  };
}
