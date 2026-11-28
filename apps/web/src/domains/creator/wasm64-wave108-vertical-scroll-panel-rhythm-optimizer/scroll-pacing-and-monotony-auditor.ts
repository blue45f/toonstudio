/**
 * Wave 108 — 세로 스크롤 웹툰 리듬·스포일러 노출·대사 벽·단조 반복 독립 감사기.
 *
 * 수동 배치 또는 솔버 산출 레이아웃(`VerticalScrollPanelLayout`)을 입력받아
 * 3종 모바일 뷰포트(`360×780`, `390×844`, `412×915`) 기준으로
 * 1) 반전/엔딩 스포일러 조기 노출(`spoilerLeaks`),
 * 2) 한 화면 대사 과밀(`dialogueTextWalls`),
 * 3) 유사 높이·여백 4컷 이상 연속 단조 구간(`monotonyRuns`),
 * 4) 모델 기반 추정 읽기 시간(`estimatedReadDurationSec`, `isEstimatedReadingTime: true`),
 * 5) 종합 리듬 건전성 점수(`0..100`)와 한국어 리밸런싱 권고를 산출한다.
 */

import {
  BEAT_RHYTHM_PRESETS,
  DEFAULT_MAX_DIALOGUE_CHARS_PER_VIEWPORT,
  MOBILE_VIEWPORT_SPECS,
  computeScaledViewportHeightPx,
  computeSetupCenteredViewportBounds,
  normalizeTargetViewports,
  shouldIsolateRevealCut,
  type MobileViewportProfile,
  type OptimizedVerticalScrollCut,
  type PanelRhythmBeatKind,
  type VerticalScrollPanelLayout,
} from "./vertical-scroll-gutter-rhythm-solver";

export const DEFAULT_MONOTONY_MIN_RUN_LENGTH = 4;
export const DEFAULT_MONOTONY_HEIGHT_VARIANCE_RATIO = 0.08;
export const DEFAULT_MONOTONY_GUTTER_VARIANCE_RATIO = 0.1;
export const DEFAULT_VIEWPORT_SCAN_STEP_PX = 80;

const BEAT_VISUAL_READ_SEC: Readonly<Record<PanelRhythmBeatKind, number>> = {
  "action-rush": 1.35,
  "dialogue-volley": 1.65,
  "suspense-hold": 2.6,
  "twist-reveal": 3.4,
  "quiet-aftermath": 2.8,
  "cliffhanger-end": 3.2,
};

const KOREAN_CHARS_PER_SEC = 11.5;
const BUBBLE_FIXATION_SEC = 0.22;
const SCROLL_SPEED_PX_PER_SEC = 1200;

export interface AuditVerticalScrollOptions {
  readonly viewports?: readonly MobileViewportProfile[];
  readonly maxCharsPerViewport?: number;
  readonly monotonyMinRunLength?: number;
  readonly monotonyHeightVarianceRatio?: number;
  readonly monotonyGutterVarianceRatio?: number;
  readonly viewportScanStepPx?: number;
}

export interface SpoilerLeakFinding {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly beatKind: PanelRhythmBeatKind;
  readonly setupCutIndex: number;
  readonly setupCutId: string;
  readonly viewport: MobileViewportProfile;
  readonly viewportHeightCanvasPx: number;
  readonly setupViewportBottomYPx: number;
  readonly revealCutTopYPx: number;
  readonly leakPx: number;
  readonly requiredAdditionalGutterPx: number;
  readonly severity: "high" | "critical";
}

export interface DialogueTextWallFinding {
  readonly viewport: MobileViewportProfile;
  readonly viewportHeightCanvasPx: number;
  readonly windowStartYPx: number;
  readonly windowEndYPx: number;
  readonly peakViewportTopYPx: number;
  readonly peakViewportBottomYPx: number;
  readonly visibleDialogueChars: number;
  readonly maxCharsPerViewport: number;
  readonly excessChars: number;
  readonly cutIndices: readonly number[];
  readonly cutIds: readonly string[];
}

export interface MonotonyRunFinding {
  readonly startCutIndex: number;
  readonly endCutIndex: number;
  readonly runLength: number;
  readonly cutIds: readonly string[];
  readonly meanHeightPx: number;
  readonly heightVarianceRatio: number;
  readonly meanGutterPx: number;
  readonly gutterVarianceRatio: number;
}

export interface DialogueDensitySample {
  readonly viewportTopYPx: number;
  readonly viewportCenterYPx: number;
  readonly normalizedScrollPosition: number;
  readonly visibleDialogueChars: number;
  readonly exceedsThreshold: boolean;
}

export interface VerticalScrollPacingAuditResult {
  readonly auditedViewports: readonly MobileViewportProfile[];
  readonly maxCharsPerViewport: number;
  readonly spoilerLeaks: readonly SpoilerLeakFinding[];
  readonly maxSpoilerLeakPx: number;
  readonly dialogueTextWalls: readonly DialogueTextWallFinding[];
  readonly peakDialogueCharsPerViewport: number;
  readonly monotonyRuns: readonly MonotonyRunFinding[];
  readonly estimatedReadDurationSec: number;
  readonly isEstimatedReadingTime: true;
  readonly readingTimeBasis: "model-derived-estimate";
  readonly pacingHealthScore: number;
  readonly rebalanceHintsKo: readonly string[];
  readonly dialogueDensitySamples: readonly DialogueDensitySample[];
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveAuditOptions(
  layout: VerticalScrollPanelLayout,
  viewportsOrOptions?: readonly MobileViewportProfile[] | AuditVerticalScrollOptions,
): {
  readonly viewports: readonly MobileViewportProfile[];
  readonly maxCharsPerViewport: number;
  readonly monotonyMinRunLength: number;
  readonly monotonyHeightVarianceRatio: number;
  readonly monotonyGutterVarianceRatio: number;
  readonly viewportScanStepPx: number;
} {
  if (Array.isArray(viewportsOrOptions)) {
    return {
      viewports: normalizeTargetViewports(viewportsOrOptions),
      maxCharsPerViewport: DEFAULT_MAX_DIALOGUE_CHARS_PER_VIEWPORT,
      monotonyMinRunLength: DEFAULT_MONOTONY_MIN_RUN_LENGTH,
      monotonyHeightVarianceRatio: DEFAULT_MONOTONY_HEIGHT_VARIANCE_RATIO,
      monotonyGutterVarianceRatio: DEFAULT_MONOTONY_GUTTER_VARIANCE_RATIO,
      viewportScanStepPx: DEFAULT_VIEWPORT_SCAN_STEP_PX,
    };
  }
  const opts = (viewportsOrOptions ?? {}) as AuditVerticalScrollOptions;
  return {
    viewports: normalizeTargetViewports(opts.viewports ?? layout.targetViewports),
    maxCharsPerViewport: Math.max(
      20,
      Math.round(
        opts.maxCharsPerViewport !== undefined && Number.isFinite(opts.maxCharsPerViewport)
          ? opts.maxCharsPerViewport
          : DEFAULT_MAX_DIALOGUE_CHARS_PER_VIEWPORT,
      ),
    ),
    monotonyMinRunLength: Math.max(
      2,
      Math.round(
        opts.monotonyMinRunLength !== undefined && Number.isFinite(opts.monotonyMinRunLength)
          ? opts.monotonyMinRunLength
          : DEFAULT_MONOTONY_MIN_RUN_LENGTH,
      ),
    ),
    monotonyHeightVarianceRatio: clamp(
      opts.monotonyHeightVarianceRatio ?? DEFAULT_MONOTONY_HEIGHT_VARIANCE_RATIO,
      0,
      0.5,
    ),
    monotonyGutterVarianceRatio: clamp(
      opts.monotonyGutterVarianceRatio ?? DEFAULT_MONOTONY_GUTTER_VARIANCE_RATIO,
      0,
      0.5,
    ),
    viewportScanStepPx: Math.max(
      16,
      Math.round(
        opts.viewportScanStepPx !== undefined && Number.isFinite(opts.viewportScanStepPx)
          ? opts.viewportScanStepPx
          : DEFAULT_VIEWPORT_SCAN_STEP_PX,
      ),
    ),
  };
}

function detectSpoilerLeaks(
  layout: VerticalScrollPanelLayout,
  viewports: readonly MobileViewportProfile[],
): { readonly findings: readonly SpoilerLeakFinding[]; readonly maxLeakPx: number } {
  const findings: SpoilerLeakFinding[] = [];
  let maxLeakPx = 0;

  for (let i = 1; i < layout.cuts.length; i += 1) {
    const cut = layout.cuts[i];
    const setupCut = layout.cuts[i - 1];
    if (!cut || !setupCut) continue;
    if (!shouldIsolateRevealCut(cut)) continue;

    for (let v = 0; v < viewports.length; v += 1) {
      const profile = viewports[v];
      if (!profile) continue;
      const viewportHeightCanvasPx = computeScaledViewportHeightPx(layout.canvasWidthPx, profile);
      const bounds = computeSetupCenteredViewportBounds(
        setupCut.yPx,
        setupCut.heightPx,
        viewportHeightCanvasPx,
      );
      const rawLeak = bounds.viewportBottomYPx - cut.yPx;
      if (rawLeak > 0) {
        const leakPx = round2(rawLeak);
        if (leakPx > maxLeakPx) maxLeakPx = leakPx;
        const severity: "high" | "critical" =
          leakPx >= 120 || leakPx >= cut.heightPx * 0.15 ? "critical" : "high";
        findings.push({
          cutIndex: cut.index,
          cutId: cut.cutId,
          beatKind: cut.beatKind,
          setupCutIndex: setupCut.index,
          setupCutId: setupCut.cutId,
          viewport: profile,
          viewportHeightCanvasPx: round2(viewportHeightCanvasPx),
          setupViewportBottomYPx: round2(bounds.viewportBottomYPx),
          revealCutTopYPx: round2(cut.yPx),
          leakPx,
          requiredAdditionalGutterPx: Math.ceil(rawLeak),
          severity,
        });
      }
    }
  }

  return { findings, maxLeakPx };
}

function evaluateViewportDialogueAt(
  cuts: readonly OptimizedVerticalScrollCut[],
  viewportTopY: number,
  viewportBottomY: number,
): { readonly visibleChars: number; readonly cutIndices: readonly number[]; readonly cutIds: readonly string[] } {
  let weightedChars = 0;
  const cutIndices: number[] = [];
  const cutIds: string[] = [];

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut || cut.dialogueCharCount <= 0) continue;
    const overlapTop = Math.max(viewportTopY, cut.yPx);
    const overlapBottom = Math.min(viewportBottomY, cut.bottomYPx);
    const overlapPx = overlapBottom - overlapTop;
    if (overlapPx <= 0) continue;

    const ratio = clamp(overlapPx / Math.max(1, cut.heightPx), 0, 1);
    weightedChars += cut.dialogueCharCount * ratio;
    if (ratio >= 0.2) {
      cutIndices.push(cut.index);
      cutIds.push(cut.cutId);
    }
  }

  return {
    visibleChars: Math.round(weightedChars),
    cutIndices,
    cutIds,
  };
}

function buildCandidateWindowTops(
  layout: VerticalScrollPanelLayout,
  viewportHeightPx: number,
  stepPx: number,
): readonly number[] {
  const maxTop = Math.max(0, layout.totalHeightPx - viewportHeightPx);
  const raw: number[] = [0, maxTop];

  for (let y = 0; y <= maxTop; y += stepPx) {
    raw.push(y);
  }
  for (let i = 0; i < layout.cuts.length; i += 1) {
    const cut = layout.cuts[i];
    if (!cut) continue;
    raw.push(clamp(cut.yPx, 0, maxTop));
    raw.push(clamp(cut.bottomYPx - viewportHeightPx, 0, maxTop));
  }

  raw.sort((a, b) => a - b);
  const deduped: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const val = round2(raw[i] ?? 0);
    const prev = deduped.length > 0 ? deduped[deduped.length - 1] : undefined;
    if (prev === undefined || val - prev >= 1) {
      deduped.push(val);
    }
  }
  return deduped;
}

function detectDialogueTextWalls(
  layout: VerticalScrollPanelLayout,
  viewports: readonly MobileViewportProfile[],
  maxCharsPerViewport: number,
  stepPx: number,
): {
  readonly findings: readonly DialogueTextWallFinding[];
  readonly peakChars: number;
  readonly samples: readonly DialogueDensitySample[];
} {
  const findings: DialogueTextWallFinding[] = [];
  let peakChars = 0;
  let tallestProfile: MobileViewportProfile = viewports[0] ?? "mobile-412x915";
  let tallestHeightPx = 0;

  for (let v = 0; v < viewports.length; v += 1) {
    const profile = viewports[v];
    if (!profile) continue;
    const vh = computeScaledViewportHeightPx(layout.canvasWidthPx, profile);
    if (vh >= tallestHeightPx) {
      tallestHeightPx = vh;
      tallestProfile = profile;
    }
  }

  const samples: DialogueDensitySample[] = [];
  const sampleDenom = Math.max(1, layout.totalHeightPx);

  for (let v = 0; v < viewports.length; v += 1) {
    const profile = viewports[v];
    if (!profile) continue;
    const viewportHeightPx = computeScaledViewportHeightPx(layout.canvasWidthPx, profile);
    const tops = buildCandidateWindowTops(layout, viewportHeightPx, stepPx);
    const collectSamples = profile === tallestProfile;

    interface WallCluster {
      windowStartYPx: number;
      windowEndYPx: number;
      peakViewportTopYPx: number;
      peakViewportBottomYPx: number;
      visibleDialogueChars: number;
      cutIndices: readonly number[];
      cutIds: readonly string[];
    }
    const pushCluster = (cluster: WallCluster): void => {
      findings.push({
        viewport: profile,
        viewportHeightCanvasPx: round2(viewportHeightPx),
        windowStartYPx: round2(cluster.windowStartYPx),
        windowEndYPx: round2(cluster.windowEndYPx),
        peakViewportTopYPx: round2(cluster.peakViewportTopYPx),
        peakViewportBottomYPx: round2(cluster.peakViewportBottomYPx),
        visibleDialogueChars: cluster.visibleDialogueChars,
        maxCharsPerViewport,
        excessChars: cluster.visibleDialogueChars - maxCharsPerViewport,
        cutIndices: cluster.cutIndices,
        cutIds: cluster.cutIds,
      });
    };

    let activeCluster: WallCluster | null = null;
    for (let t = 0; t < tops.length; t += 1) {
      const topY = tops[t] ?? 0;
      const bottomY = topY + viewportHeightPx;
      const evalResult = evaluateViewportDialogueAt(layout.cuts, topY, bottomY);

      if (evalResult.visibleChars > peakChars) peakChars = evalResult.visibleChars;
      if (collectSamples) {
        const centerY = Math.min(layout.totalHeightPx, topY + viewportHeightPx / 2);
        samples.push({
          viewportTopYPx: round2(topY),
          viewportCenterYPx: round2(centerY),
          normalizedScrollPosition: round2(clamp(centerY / sampleDenom, 0, 1)),
          visibleDialogueChars: evalResult.visibleChars,
          exceedsThreshold: evalResult.visibleChars > maxCharsPerViewport,
        });
      }

      if (evalResult.visibleChars > maxCharsPerViewport) {
        if (!activeCluster || topY > activeCluster.windowEndYPx) {
          if (activeCluster) pushCluster(activeCluster);
          activeCluster = {
            windowStartYPx: topY,
            windowEndYPx: bottomY,
            peakViewportTopYPx: topY,
            peakViewportBottomYPx: bottomY,
            visibleDialogueChars: evalResult.visibleChars,
            cutIndices: evalResult.cutIndices,
            cutIds: evalResult.cutIds,
          };
        } else {
          activeCluster.windowEndYPx = Math.max(activeCluster.windowEndYPx, bottomY);
          if (evalResult.visibleChars > activeCluster.visibleDialogueChars) {
            activeCluster.visibleDialogueChars = evalResult.visibleChars;
            activeCluster.peakViewportTopYPx = topY;
            activeCluster.peakViewportBottomYPx = bottomY;
            activeCluster.cutIndices = evalResult.cutIndices;
            activeCluster.cutIds = evalResult.cutIds;
          }
        }
      } else if (activeCluster) {
        pushCluster(activeCluster);
        activeCluster = null;
      }
    }
    if (activeCluster) pushCluster(activeCluster);
  }

  return { findings, peakChars, samples };
}

function measureRunVariance(
  cuts: readonly OptimizedVerticalScrollCut[],
  start: number,
  end: number,
): {
  readonly meanHeightPx: number;
  readonly heightVarianceRatio: number;
  readonly meanGutterPx: number;
  readonly gutterVarianceRatio: number;
} {
  let minH = Number.POSITIVE_INFINITY;
  let maxH = 0;
  let sumH = 0;
  let minG = Number.POSITIVE_INFINITY;
  let maxG = 0;
  let sumG = 0;
  let gutterCount = 0;

  for (let i = start; i <= end; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;
    if (cut.heightPx < minH) minH = cut.heightPx;
    if (cut.heightPx > maxH) maxH = cut.heightPx;
    sumH += cut.heightPx;
    if (i > start) {
      if (cut.gutterBeforePx < minG) minG = cut.gutterBeforePx;
      if (cut.gutterBeforePx > maxG) maxG = cut.gutterBeforePx;
      sumG += cut.gutterBeforePx;
      gutterCount += 1;
    }
  }

  const count = end - start + 1;
  const meanHeightPx = count > 0 ? sumH / count : 0;
  const heightVarianceRatio = count > 1 ? (maxH - minH) / Math.max(1, meanHeightPx) : 0;
  const meanGutterPx = gutterCount > 0 ? sumG / gutterCount : 0;
  const gutterVarianceRatio =
    gutterCount > 1 && maxG > 0 ? (maxG - minG) / Math.max(1, meanGutterPx) : 0;

  return {
    meanHeightPx,
    heightVarianceRatio,
    meanGutterPx,
    gutterVarianceRatio,
  };
}

function detectMonotonyRuns(
  cuts: readonly OptimizedVerticalScrollCut[],
  minRunLength: number,
  maxHeightVarianceRatio: number,
  maxGutterVarianceRatio: number,
): readonly MonotonyRunFinding[] {
  const runs: MonotonyRunFinding[] = [];
  if (cuts.length < minRunLength) return runs;

  let start = 0;
  while (start <= cuts.length - minRunLength) {
    let end = start;
    while (end + 1 < cuts.length) {
      const nextStats = measureRunVariance(cuts, start, end + 1);
      if (
        nextStats.heightVarianceRatio <= maxHeightVarianceRatio + 1e-9 &&
        nextStats.gutterVarianceRatio <= maxGutterVarianceRatio + 1e-9
      ) {
        end += 1;
      } else {
        break;
      }
    }

    const runLength = end - start + 1;
    if (runLength >= minRunLength) {
      const stats = measureRunVariance(cuts, start, end);
      const cutIds: string[] = [];
      for (let i = start; i <= end; i += 1) {
        const cut = cuts[i];
        if (cut) cutIds.push(cut.cutId);
      }
      runs.push({
        startCutIndex: start,
        endCutIndex: end,
        runLength,
        cutIds,
        meanHeightPx: round2(stats.meanHeightPx),
        heightVarianceRatio: round2(stats.heightVarianceRatio),
        meanGutterPx: round2(stats.meanGutterPx),
        gutterVarianceRatio: round2(stats.gutterVarianceRatio),
      });
      start = end + 1;
    } else {
      start += 1;
    }
  }

  return runs;
}

function estimateScrollReadDurationSec(layout: VerticalScrollPanelLayout): number {
  if (layout.cuts.length === 0) return 0;

  let totalSec = 0;
  for (let i = 0; i < layout.cuts.length; i += 1) {
    const cut = layout.cuts[i];
    if (!cut) continue;
    const visualBase = BEAT_VISUAL_READ_SEC[cut.beatKind];
    const tallPanelBonus = Math.max(0, cut.heightPx - 700) / 1400;
    const dialogueSec =
      cut.dialogueCharCount / KOREAN_CHARS_PER_SEC + cut.speechBubbleCount * BUBBLE_FIXATION_SEC;
    const gutterScrollSec = cut.gutterBeforePx / SCROLL_SPEED_PX_PER_SEC;
    const anticipationPauseSec = cut.gutterBeforePx >= 320 ? 0.35 : 0;
    totalSec += visualBase + tallPanelBonus + dialogueSec + gutterScrollSec + anticipationPauseSec;
  }

  totalSec += layout.bottomMarginPx / SCROLL_SPEED_PX_PER_SEC;
  return round2(totalSec);
}

function computePacingHealthScoreAndHints(
  layout: VerticalScrollPanelLayout,
  spoilerLeaks: readonly SpoilerLeakFinding[],
  dialogueTextWalls: readonly DialogueTextWallFinding[],
  monotonyRuns: readonly MonotonyRunFinding[],
  maxCharsPerViewport: number,
): { readonly score: number; readonly hintsKo: readonly string[] } {
  if (layout.cuts.length === 0) {
    return {
      score: 100,
      hintsKo: ["배치된 컷이 없어 세로 스크롤 리듬 검사를 생략했습니다."],
    };
  }

  let penalty = 0;
  const hintsKo: string[] = [];

  const worstLeakByCut = new Map<number, SpoilerLeakFinding>();
  for (let i = 0; i < spoilerLeaks.length; i += 1) {
    const finding = spoilerLeaks[i];
    if (!finding) continue;
    const prev = worstLeakByCut.get(finding.cutIndex);
    if (!prev || finding.leakPx > prev.leakPx) {
      worstLeakByCut.set(finding.cutIndex, finding);
    }
  }

  worstLeakByCut.forEach((finding) => {
    penalty += Math.min(35, 18 + Math.round(finding.leakPx / 25));
    const beatLabel = BEAT_RHYTHM_PRESETS[finding.beatKind].labelKo;
    const viewportLabel = MOBILE_VIEWPORT_SPECS[finding.viewport].labelKo;
    hintsKo.push(
      `${finding.cutId}(${beatLabel}) 앞 여백을 최소 ${finding.requiredAdditionalGutterPx}px 이상 늘려 ${viewportLabel} 화면에서 반전 컷이 미리 보이지 않게 차단하세요.`,
    );
  });

  const worstWallByRangeKey = new Map<string, DialogueTextWallFinding>();
  for (let i = 0; i < dialogueTextWalls.length; i += 1) {
    const wall = dialogueTextWalls[i];
    if (!wall) continue;
    const rangeKey = wall.cutIds.join(",") || `${Math.round(wall.peakViewportTopYPx)}`;
    const prev = worstWallByRangeKey.get(rangeKey);
    if (!prev || wall.visibleDialogueChars > prev.visibleDialogueChars) {
      worstWallByRangeKey.set(rangeKey, wall);
    }
  }

  worstWallByRangeKey.forEach((wall) => {
    penalty += Math.min(22, 10 + Math.round(wall.excessChars / 8));
    const rangeLabel =
      wall.cutIds.length > 1
        ? `${wall.cutIds[0]}–${wall.cutIds[wall.cutIds.length - 1]}`
        : wall.cutIds[0] ?? `${Math.round(wall.peakViewportTopYPx)}px 부근`;
    hintsKo.push(
      `${rangeLabel} 구간의 한 화면 대사가 ${wall.visibleDialogueChars}자로 권장 상한(${maxCharsPerViewport}자)을 넘습니다. 컷 높이를 키우거나 대사를 인접 컷으로 나누세요.`,
    );
  });

  for (let i = 0; i < monotonyRuns.length; i += 1) {
    const run = monotonyRuns[i];
    if (!run) continue;
    penalty += Math.min(20, 10 + (run.runLength - 3) * 3);
    const firstId = run.cutIds[0] ?? `#${run.startCutIndex + 1}`;
    const lastId = run.cutIds[run.cutIds.length - 1] ?? `#${run.endCutIndex + 1}`;
    hintsKo.push(
      `${firstId}–${lastId} 구간(${run.runLength}컷)의 높이와 여백이 거의 같아 스크롤 리듬이 단조롭습니다. 클로즈업 높이 변주나 호흡 여백을 넣어 주세요.`,
    );
  }

  if (hintsKo.length === 0) {
    hintsKo.push(
      "반전 스포일러 노출 0px, 대사 밀집 구간과 단조 반복이 없어 모바일 세로 스크롤 호흡이 안정적입니다.",
    );
  }

  return {
    score: Math.round(clamp(100 - penalty, 0, 100)),
    hintsKo,
  };
}

/**
 * 임의의 세로 스크롤 웹툰 배치에 대해 모바일 뷰포트 3종 기준 독립 리듬·스포일러 감사를 수행한다.
 */
export function auditVerticalScrollPacingRhythm(
  layout: VerticalScrollPanelLayout,
  viewportsOrOptions?: readonly MobileViewportProfile[] | AuditVerticalScrollOptions,
): VerticalScrollPacingAuditResult {
  const opts = resolveAuditOptions(layout, viewportsOrOptions);
  const spoilerAudit = detectSpoilerLeaks(layout, opts.viewports);
  const dialogueAudit = detectDialogueTextWalls(
    layout,
    opts.viewports,
    opts.maxCharsPerViewport,
    opts.viewportScanStepPx,
  );
  const monotonyRuns = detectMonotonyRuns(
    layout.cuts,
    opts.monotonyMinRunLength,
    opts.monotonyHeightVarianceRatio,
    opts.monotonyGutterVarianceRatio,
  );
  const estimatedReadDurationSec = estimateScrollReadDurationSec(layout);
  const health = computePacingHealthScoreAndHints(
    layout,
    spoilerAudit.findings,
    dialogueAudit.findings,
    monotonyRuns,
    opts.maxCharsPerViewport,
  );

  return {
    auditedViewports: opts.viewports,
    maxCharsPerViewport: opts.maxCharsPerViewport,
    spoilerLeaks: spoilerAudit.findings,
    maxSpoilerLeakPx: spoilerAudit.maxLeakPx,
    dialogueTextWalls: dialogueAudit.findings,
    peakDialogueCharsPerViewport: dialogueAudit.peakChars,
    monotonyRuns,
    estimatedReadDurationSec,
    isEstimatedReadingTime: true,
    readingTimeBasis: "model-derived-estimate",
    pacingHealthScore: health.score,
    rebalanceHintsKo: health.hintsKo,
    dialogueDensitySamples: dialogueAudit.samples,
  };
}
