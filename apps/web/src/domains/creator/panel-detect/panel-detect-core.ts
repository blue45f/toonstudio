/**
 * 컷 자동 감지 — 여백(거터) 기반 재귀 XY-cut. 외부 의존성 없는 순수 알고리즘.
 *
 * 흐름
 *  1. 입력 RGBA 를 검증하고, 이미지 전체에서 여백색(흰·검정·단색·투명)을 추정한다. 여백이 하나도 없으면
 *     (전면 삽화) 컷을 쪼개지 않고 이미지 전체를 낮은 신뢰도의 컷 하나로 돌려준다.
 *  2. 입력이 분석 상한을 넘으면 정수 배율로 다운샘플한 "내용 마스크"를 만든다(여백 아님 = 1).
 *  3. 영역을 바깥 여백까지 잘라 낸 뒤, 행 투영으로 위아래로 나누고(여백 줄 묶음이 최소 두께 이상일 때)
 *     못 나누면 열 투영으로 좌우로 나눈다. 나뉜 조각은 반대 축을 먼저 시도하며 재귀한다(최대 깊이 제한).
 *     양끝이 끊김 없는 선으로 막힌 빈 칸(테두리가 둘러싼 컷 안쪽)은 컷 사이 여백으로 보지 않는다(panel-detect-frames).
 *     그런 칸만 있는 영역은 "페이지 테두리 안에 직사각형 컷이 둘 이상"일 때만 컨테이너로 보고 안쪽을 나눈다.
 *  4. 더 나뉘지 않는 잎은 작은 조각이면 제외(ignored), 서로 이어지지 않은 큰 덩어리가 겹쳐 있으면 검출 불가,
 *     아니면 컷으로 채택한다. 기울어진 컷·겹침은 지어내지 않고 검출 불가로 보고한다.
 *  5. 원본 좌표로 되돌려 읽기 순서를 붙이고 신뢰도를 계산한다.
 *
 * 결정성: 난수·시계 의존 없음. 같은 입력·옵션은 입력 배열 종류(Uint8ClampedArray 등)와 무관하게 같은 결과다.
 * 실행: 알고리즘은 generator 하나이고, 동기(detectPanels)·비동기(detectPanelsAsync) 드라이버가 구동한다.
 */

import { assemblePanelDetectResult, type FragmentRecord, type LeafRecord, type UndetectableRecord } from "./panel-detect-assemble";
import { evaluateLeaf, type LeafContext } from "./panel-detect-leaf";
import { createSeparatorClassifier, isRectangularRegion } from "./panel-detect-frames";
import {
  allowedInk,
  colInkCounts,
  findSeparators,
  regionHeight,
  regionInkTotal,
  regionWidth,
  rowInkCounts,
  splitSegmentsAt,
  trimRegion,
  type IndexRun,
  type PanelRegion,
} from "./panel-detect-profile";
import {
  analysisStepFor,
  assertPanelDetectRaster,
  buildInkMask,
  estimateGutter,
} from "./panel-detect-raster";
import {
  PANEL_DETECT_INK_TOLERANCE,
  PanelDetectBudget,
  createDriverHooks,
  minGapForSensitivity,
  resolvePanelDetectOptions,
  runPanelDetectAsync,
  runPanelDetectSync,
  type ResolvedPanelDetectOptions,
} from "./panel-detect-runtime";
import { PanelDetectError } from "./panel-detect-types";

import type { PanelSide, PanelSides } from "./panel-detect-confidence";
import type { InkMask } from "./panel-detect-raster";
import type {
  GutterInfo,
  PanelDetectOptions,
  PanelDetectRaster,
  PanelDetectResult,
  PanelWarningCode,
} from "./panel-detect-types";

type Axis = "rows" | "cols";

interface AnalysisContext extends LeafContext {
  readonly options: ResolvedPanelDetectOptions;
  readonly inkTolerance: number;
  readonly imageArea: number;
  readonly leaves: LeafRecord[];
  readonly ignored: FragmentRecord[];
  readonly undetectable: UndetectableRecord[];
}

interface Child {
  readonly region: PanelRegion;
  readonly sides: PanelSides;
}

const BLEED: PanelSide = Object.freeze({ kind: "bleed", width: 0 });

function gapSide(width: number): PanelSide {
  return { kind: "gap", width };
}

function shrinkSide(side: PanelSide, delta: number): PanelSide {
  if (delta <= 0) return side;
  if (side.kind === "bleed") return { kind: "margin", width: delta };
  return { kind: side.kind, width: side.width + delta };
}

function shrinkSides(sides: PanelSides, before: PanelRegion, after: PanelRegion): PanelSides {
  return {
    top: shrinkSide(sides.top, after.y0 - before.y0),
    bottom: shrinkSide(sides.bottom, before.y1 - after.y1),
    left: shrinkSide(sides.left, after.x0 - before.x0),
    right: shrinkSide(sides.right, before.x1 - after.x1),
  };
}

/** 한 축으로 나누는 두 가지 제안: 열린 여백만 쓴 것(strict)과 양끝이 막힌 칸까지 쓴 컨테이너 해석(lenient, 그런 칸이 있을 때만). */
interface SplitProposal {
  readonly strict: Child[] | null;
  readonly lenient: Child[] | null;
}

function splitRegion(
  context: AnalysisContext,
  region: PanelRegion,
  sides: PanelSides,
  axis: Axis,
): SplitProposal {
  const counts = axis === "rows" ? rowInkCounts(context.mask, region) : colInkCounts(context.mask, region);
  const crossLength = axis === "rows" ? regionWidth(region) : regionHeight(region);
  const separators = findSeparators(counts, allowedInk(crossLength, context.inkTolerance), context.minGap);
  if (separators.length === 0) return { strict: null, lenient: null };
  const classify = createSeparatorClassifier(context.mask, region, axis, context.minGap);
  const kinds = separators.map((run) => ({ run, kind: classify(run) }));
  const open = kinds.filter((entry) => entry.kind === "open").map((entry) => entry.run);
  // 컨테이너 해석에는 열린 여백과 양끝이 모두 막힌 칸만 쓴다. 한쪽만 막힌 칸은 다른 컷이 지나가는 자리라 쓰지 않는다.
  const container = kinds.filter((entry) => entry.kind !== "crossed").map((entry) => entry.run);
  const childrenAt = (runs: readonly IndexRun[]): Child[] | null => {
    const segments = splitSegmentsAt(counts.length, runs);
    if (segments === null) return null;
    return segments.map((segment): Child => {
      if (axis === "rows") {
        return {
          region: { x0: region.x0, x1: region.x1, y0: region.y0 + segment.start, y1: region.y0 + segment.end },
          sides: {
            left: sides.left,
            right: sides.right,
            top: segment.gapBefore === null ? sides.top : gapSide(segment.gapBefore),
            bottom: segment.gapAfter === null ? sides.bottom : gapSide(segment.gapAfter),
          },
        };
      }
      return {
        region: { x0: region.x0 + segment.start, x1: region.x0 + segment.end, y0: region.y0, y1: region.y1 },
        sides: {
          top: sides.top,
          bottom: sides.bottom,
          left: segment.gapBefore === null ? sides.left : gapSide(segment.gapBefore),
          right: segment.gapAfter === null ? sides.right : gapSide(segment.gapAfter),
        },
      };
    });
  };
  return { strict: childrenAt(open), lenient: container.length === open.length ? null : childrenAt(container) };
}

/**
 * 닫힌 여백(양끝이 선으로 막힌 빈 칸)만 있는 영역을 컨테이너로 볼 수 있는지 시험한다.
 * 페이지 테두리나 스캔 가장자리 그림자 안에 컷들이 들어 있는 경우다. 안쪽을 실제로 나눠 보고, 직사각형 컷이 둘 이상이고
 * 모두 직사각형일 때만 채택한다. 컷 하나가 테두리 안에 인물·말풍선을 띄운 경우(덩어리가 직사각형이 아님)는 되돌리고 컷 하나로 둔다.
 */
function* acceptContainer(
  context: AnalysisContext,
  children: readonly Child[],
  depth: number,
  next: Axis,
): Generator<void, boolean, void> {
  if (depth >= context.options.maxDepth) return false;
  const saved = { leaves: context.leaves.length, ignored: context.ignored.length, undetectable: context.undetectable.length };
  const rollback = (): void => {
    context.leaves.length = saved.leaves;
    context.ignored.length = saved.ignored;
    context.undetectable.length = saved.undetectable;
  };
  try {
    for (const child of children) yield* analyzeRegion(context, child.region, child.sides, depth + 1, next);
  } catch (error) {
    // 안쪽 무늬가 잘게 쪼개져 컷 상한을 넘으면 컨테이너가 아니라는 뜻이다. 조용히 되돌린다.
    if (error instanceof PanelDetectError && error.code === "too-many-panels") {
      rollback();
      return false;
    }
    throw error;
  }
  const added = context.leaves.slice(saved.leaves);
  if (added.length >= 2 && added.every((leaf) => isRectangularRegion(context.mask, leaf.region, context.minGap))) return true;
  rollback();
  return false;
}

function* analyzeRegion(
  context: AnalysisContext,
  region: PanelRegion,
  sides: PanelSides,
  depth: number,
  preferred: Axis,
): Generator<void, void, void> {
  const trimmed = trimRegion(context.mask, region, context.inkTolerance);
  if (context.budget.consume(regionWidth(region) * regionHeight(region) * 2)) yield;
  if (trimmed === null) return;
  const trimmedSides = shrinkSides(sides, region, trimmed);
  const trimmedArea = regionWidth(trimmed) * regionHeight(trimmed);
  const axes: readonly Axis[] = preferred === "rows" ? ["rows", "cols"] : ["cols", "rows"];
  const inherited: PanelWarningCode[] = [];
  for (const axis of axes) {
    const proposal = splitRegion(context, trimmed, trimmedSides, axis);
    if (context.budget.consume(trimmedArea)) yield;
    const next: Axis = axis === "rows" ? "cols" : "rows";
    if (proposal.strict === null && proposal.lenient !== null && (yield* acceptContainer(context, proposal.lenient, depth, next))) return;
    const children = proposal.strict;
    if (children === null) continue;
    if (depth >= context.options.maxDepth) {
      // 깊이 제한 때문에 더 나누지 않은 것이므로 경고로 남긴다.
      inherited.push("max-depth-reached");
      break;
    }
    for (const child of children) yield* analyzeRegion(context, child.region, child.sides, depth + 1, next);
    return;
  }

  const verdict = yield* evaluateLeaf(context, trimmed, context.imageArea, inherited);
  if (verdict.kind === "ignored") {
    context.ignored.push({ region: trimmed, reason: verdict.reason });
    return;
  }
  if (verdict.kind === "undetectable") {
    context.undetectable.push({ region: trimmed, componentCount: verdict.componentCount });
    return;
  }
  context.leaves.push({
    region: trimmed,
    sides: trimmedSides,
    density: verdict.density,
    warnings: verdict.warnings,
    bridges: verdict.bridges,
  });
  if (context.leaves.length > context.options.maxPanels) throw new PanelDetectError("too-many-panels");
}

function wholeImageResult(
  raster: PanelDetectRaster,
  options: ResolvedPanelDetectOptions,
  gutter: GutterInfo,
): PanelDetectResult {
  const region: PanelRegion = { x0: 0, y0: 0, x1: raster.width, y1: raster.height };
  const bleed: PanelSides = { top: BLEED, bottom: BLEED, left: BLEED, right: BLEED };
  return assemblePanelDetectResult({
    raster,
    options,
    gutter,
    step: 1,
    analysisWidth: raster.width,
    analysisHeight: raster.height,
    minGap: 1,
    // 여백이 하나도 없는 이미지: 전체를 컷 하나로 보되, 내용 밀도를 알 수 없으므로 중립값을 쓴다.
    leaves: [{ region, sides: bleed, density: 0.03, warnings: ["no-gutter-found"], bridges: [] }],
    ignored: [],
    undetectable: [],
    blank: false,
  });
}

export function* detectPanelSteps(
  raster: PanelDetectRaster,
  options: ResolvedPanelDetectOptions,
): Generator<void, PanelDetectResult, void> {
  assertPanelDetectRaster(raster);
  const gutter = estimateGutter(raster, options.gutterTolerance);
  if (gutter.kind === "none") return wholeImageResult(raster, options, gutter);

  const budget = new PanelDetectBudget();
  const step = analysisStepFor(raster.width, raster.height, options.maxAnalysisPixels);
  const mask: InkMask = yield* buildInkMask(raster, gutter, step, budget);
  const full: PanelRegion = { x0: 0, y0: 0, x1: mask.width, y1: mask.height };
  const totalInk = regionInkTotal(mask, full);
  if (budget.consume(mask.width * mask.height)) yield;

  const minGap = minGapForSensitivity(options.sensitivity, mask.width, mask.height);
  const base = Math.min(mask.width, mask.height);
  const imageArea = mask.width * mask.height;
  const context: AnalysisContext = {
    mask,
    budget,
    options,
    minGap,
    minSide: Math.max(6, Math.round(0.02 * base)),
    minArea: Math.max(36, Math.round((0.05 * base) ** 2)),
    componentCheckMinArea: Math.round(0.04 * imageArea),
    inkTolerance: PANEL_DETECT_INK_TOLERANCE,
    imageArea,
    leaves: [],
    ignored: [],
    undetectable: [],
  };
  if (totalInk > 0) {
    const bleed: PanelSides = { top: BLEED, bottom: BLEED, left: BLEED, right: BLEED };
    yield* analyzeRegion(context, full, bleed, 0, "rows");
  }
  return assemblePanelDetectResult({
    raster,
    options,
    gutter,
    step,
    analysisWidth: mask.width,
    analysisHeight: mask.height,
    minGap,
    leaves: context.leaves,
    ignored: context.ignored,
    undetectable: context.undetectable,
    blank: totalInk === 0,
  });
}

/** 동기 실행. 시간 상한(timeLimitMs)과 isCancelled 를 점검 시점마다 확인한다. */
export function detectPanels(raster: PanelDetectRaster, options?: PanelDetectOptions): PanelDetectResult {
  const resolved = resolvePanelDetectOptions(options);
  return runPanelDetectSync(detectPanelSteps(raster, resolved), createDriverHooks(resolved));
}

export interface DetectPanelsAsyncHooks {
  /** 이벤트 루프에 양보하는 함수. 기본은 setTimeout(0). Worker 는 MessageChannel 등으로 바꿔 쓸 수 있다. */
  readonly yieldNow?: () => Promise<void>;
}

function defaultYieldNow(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** 비동기 실행. 일정 시간마다 양보하므로 화면이 멈추지 않고, 그 틈에 취소 신호가 전달된다. */
export function detectPanelsAsync(
  raster: PanelDetectRaster,
  options?: PanelDetectOptions,
  hooks: DetectPanelsAsyncHooks = {},
): Promise<PanelDetectResult> {
  const resolved = resolvePanelDetectOptions(options);
  return runPanelDetectAsync(
    detectPanelSteps(raster, resolved),
    createDriverHooks(resolved),
    hooks.yieldNow ?? defaultYieldNow,
  );
}
