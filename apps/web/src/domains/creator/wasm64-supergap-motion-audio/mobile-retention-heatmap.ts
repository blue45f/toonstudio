/**
 * #10 출간 전 10초 모바일 독자 이탈(Retention) & 엄지 스크롤 리듬 히트맵 분석기 (₩0 로컬 · 0 AI 토큰).
 *
 * 390×844(iPhone 14/15) · 360×800(Galaxy S) 등 실제 모바일 뷰포트 창을 에피소드 세로 스트립 위에
 * 슬라이딩하면서 대사 밀집 과부하, 빈 여백(Dead Gutter) 지루함 구간, 시선 역주행(Eye-Flow Backtracking),
 * 시각 임팩트 대비(Contrast Delta)를 10ms 이내에 정량 평가한다.
 */

export type MobileViewportPresetId = "iphone15" | "galaxyS" | "compact" | "proMax";

export interface MobileViewportSpec {
  readonly id: MobileViewportPresetId;
  readonly label: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dpr: number;
}

export const MOBILE_VIEWPORT_PRESETS: Readonly<Record<MobileViewportPresetId, MobileViewportSpec>> = {
  iphone15: {
    id: "iphone15",
    label: "iPhone 14/15 (390×844)",
    widthPx: 390,
    heightPx: 844,
    dpr: 3,
  },
  galaxyS: {
    id: "galaxyS",
    label: "Galaxy S (360×800)",
    widthPx: 360,
    heightPx: 800,
    dpr: 3,
  },
  compact: {
    id: "compact",
    label: "Compact Mobile (375×667)",
    widthPx: 375,
    heightPx: 667,
    dpr: 2,
  },
  proMax: {
    id: "proMax",
    label: "Large Mobile (430×932)",
    widthPx: 430,
    heightPx: 932,
    dpr: 3,
  },
};

export type CutShotScale = "extreme-closeup" | "closeup" | "medium" | "wide" | "splash";

export interface BalloonLayoutMetric {
  readonly balloonId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly orderIndex?: number;
}

export interface EpisodeCutMetricsInput {
  readonly cutId: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly gutterAfterPx?: number;
  readonly balloons: readonly BalloonLayoutMetric[];
  readonly meanLuminance?: number;
  readonly contrastRatio?: number;
  readonly visualEntropy?: number;
  readonly hasImpactHook?: boolean;
  readonly isDramaticPause?: boolean;
  readonly shotScale?: CutShotScale;
}

export type RetentionRiskKind =
  | "text-density-overload"
  | "dead-gutter-boredom"
  | "eye-flow-backtracking"
  | "low-impact-contrast"
  | "weak-10s-hook";

export interface RetentionRiskFlag {
  readonly kind: RetentionRiskKind;
  readonly severity: number;
  readonly detailKo: string;
}

export interface ViewportScreenSample {
  readonly screenIndex: number;
  readonly yStartPx: number;
  readonly yEndPx: number;
  readonly estimatedTimeMs: number;
  readonly dwellMs: number;
  readonly retentionScore: number;
  readonly riskHeat: number;
  readonly textDensityRatio: number;
  readonly weightedCharCount: number;
  readonly balloonCount: number;
  readonly deadGutterRatio: number;
  readonly eyeFlowBacktrackScore: number;
  readonly visualImpactScore: number;
  readonly impactContrastDelta: number;
  readonly cutIds: readonly string[];
  readonly flags: readonly RetentionRiskFlag[];
}

export interface RetentionDropoffSpan {
  readonly spanId: string;
  readonly startScreenIndex: number;
  readonly endScreenIndex: number;
  readonly yStartPx: number;
  readonly yEndPx: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly peakRisk: number;
  readonly minRetentionScore: number;
  readonly dominantRisk: RetentionRiskKind;
  readonly cutIds: readonly string[];
  readonly recommendationKo: string;
}

export interface ThumbScrollRhythmSample {
  readonly screenIndex: number;
  readonly timeMs: number;
  readonly thumbVelocityPxPerSec: number;
  readonly dwellMs: number;
  readonly rhythmState: "engaged" | "skimming" | "stalled-text" | "bored-flick";
}

export interface MobileRetentionHeatmapOptions {
  readonly viewportPreset?: MobileViewportPresetId;
  readonly customViewport?: MobileViewportSpec;
  readonly strideRatio?: number;
  readonly dropoffRiskThreshold?: number;
  readonly readingCharsPerSec?: number;
  readonly baseScrollPxPerSec?: number;
}

export interface MobileRetentionHeatmapReport {
  readonly viewport: MobileViewportSpec;
  readonly totalScaledHeightPx: number;
  readonly estimatedTotalReadMs: number;
  readonly overallRetentionScore: number;
  readonly first10SecRetentionScore: number;
  readonly first10SecReachedYPx: number;
  readonly predictedCompletionRate: number;
  readonly screens: readonly ViewportScreenSample[];
  readonly flaggedDropoffSpans: readonly RetentionDropoffSpan[];
  readonly thumbScrollRhythm: readonly ThumbScrollRhythmSample[];
  readonly elapsedMs: number;
  readonly aiTokensUsed: 0;
}

interface ScaledBalloon {
  readonly cutIndex: number;
  readonly orderIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly weightedChars: number;
}

interface ScaledCutSpan {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly yStart: number;
  readonly yEnd: number;
  readonly gutterEnd: number;
  readonly contrastRatio: number;
  readonly visualEntropy: number;
  readonly hasImpactHook: boolean;
  readonly isDramaticPause: boolean;
  readonly shotBoost: number;
  readonly balloons: readonly ScaledBalloon[];
}

const SHOT_SCALE_IMPACT_BOOST: Readonly<Record<CutShotScale, number>> = {
  "extreme-closeup": 0.16,
  closeup: 0.1,
  medium: 0.04,
  wide: 0.08,
  splash: 0.24,
};

const RISK_RECOMMENDATIONS_KO: Readonly<Record<RetentionRiskKind, string>> = {
  "text-density-overload":
    "한 화면 말풍선 밀도를 낮추고 대사를 2~3개 컷으로 분할해 엄지 호흡을 확보하세요.",
  "dead-gutter-boredom":
    "긴 여백 구간에 시선 유도 효과선, 소품 컷, 혹은 짧은 나레이션 비트를 삽입하세요.",
  "eye-flow-backtracking":
    "말풍선 읽기 순서를 위→아래(좌→우) 자연 동선으로 재배치해 시선 역주행을 제거하세요.",
  "low-impact-contrast":
    "연속 평탄한 구도에 클로즈업·스플래시 컷 또는 명암 대비가 강한 임팩트 컷을 배치하세요.",
  "weak-10s-hook":
    "초반 10초(상단 2~3스크린) 안에 핵심 사건·강한 대비 컷을 앞당겨 이탈을 방지하세요.",
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function measureWeightedCharCount(text: string): number {
  let weight = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x20) {
      weight += 0.15;
    } else if (
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff)
    ) {
      weight += 1.0;
    } else {
      weight += 0.55;
    }
  }
  return weight;
}

function buildScaledLayout(
  cuts: readonly EpisodeCutMetricsInput[],
  viewportWidth: number,
): { readonly spans: readonly ScaledCutSpan[]; readonly totalHeightPx: number } {
  const spans: ScaledCutSpan[] = [];
  let cursorY = 0;

  for (let cutIndex = 0; cutIndex < cuts.length; cutIndex += 1) {
    const cut = cuts[cutIndex];
    const safeWidth = cut.widthPx > 0 ? cut.widthPx : viewportWidth;
    const scale = viewportWidth / safeWidth;
    const scaledHeight = Math.max(1, cut.heightPx * scale);
    const scaledGutter = Math.max(0, (cut.gutterAfterPx ?? 0) * scale);
    const yStart = cursorY;
    const yEnd = yStart + scaledHeight;
    const gutterEnd = yEnd + scaledGutter;

    const scaledBalloons: ScaledBalloon[] = [];
    for (let b = 0; b < cut.balloons.length; b += 1) {
      const balloon = cut.balloons[b];
      const bx = balloon.x * scale;
      const by = yStart + balloon.y * scale;
      const bw = Math.max(1, balloon.width * scale);
      const bh = Math.max(1, balloon.height * scale);
      scaledBalloons.push({
        cutIndex,
        orderIndex: balloon.orderIndex ?? b,
        x: bx,
        y: by,
        width: bw,
        height: bh,
        centerX: bx + bw * 0.5,
        centerY: by + bh * 0.5,
        weightedChars: measureWeightedCharCount(balloon.text),
      });
    }

    const shotBoost = cut.shotScale ? SHOT_SCALE_IMPACT_BOOST[cut.shotScale] : 0.05;
    spans.push({
      cutId: cut.cutId,
      cutIndex,
      yStart,
      yEnd,
      gutterEnd,
      contrastRatio: clamp(cut.contrastRatio ?? 0.55, 0, 1),
      visualEntropy: clamp(cut.visualEntropy ?? 0.55, 0, 1),
      hasImpactHook: Boolean(cut.hasImpactHook),
      isDramaticPause: Boolean(cut.isDramaticPause),
      shotBoost,
      balloons: scaledBalloons,
    });
    cursorY = gutterEnd;
  }

  return { spans, totalHeightPx: cursorY };
}

function computeEyeFlowBacktracking(
  balloons: readonly ScaledBalloon[],
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (balloons.length < 2) {
    return 0;
  }
  const ordered = balloons.slice().sort((a, b) => {
    if (a.cutIndex !== b.cutIndex) return a.cutIndex - b.cutIndex;
    return a.orderIndex - b.orderIndex;
  });

  let backtrackAccum = 0;
  let peakTransitionPenalty = 0;
  let prevDx = 0;
  const verticalThreshold = viewportHeight * 0.025;
  const horizontalReversalSpan = viewportWidth * 0.42;
  const shallowRowBand = viewportHeight * 0.09;

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const dx = curr.centerX - prev.centerX;
    const dy = curr.centerY - prev.centerY;
    let stepPenalty = 0;

    if (dy < -verticalThreshold) {
      const upwardRatio = clamp((-dy) / (viewportHeight * 0.25), 0.15, 1.0);
      stepPenalty += upwardRatio * 0.72;
    }

    if (
      i >= 2 &&
      prevDx * dx < 0 &&
      Math.abs(dx) > horizontalReversalSpan &&
      Math.abs(dy) < shallowRowBand
    ) {
      stepPenalty += 0.3;
    }

    backtrackAccum += stepPenalty;
    if (stepPenalty > peakTransitionPenalty) {
      peakTransitionPenalty = stepPenalty;
    }
    prevDx = dx;
  }

  const meanPenalty = backtrackAccum / Math.max(1, ordered.length - 1);
  return clamp(Math.max(meanPenalty, peakTransitionPenalty * 0.75), 0, 1);
}

function mergeDropoffSpans(
  screens: readonly ViewportScreenSample[],
  dropoffThreshold: number,
): readonly RetentionDropoffSpan[] {
  const result: RetentionDropoffSpan[] = [];
  let runStart = -1;

  const flushRun = (startIdx: number, endIdx: number): void => {
    const riskTotals: Record<RetentionRiskKind, number> = {
      "text-density-overload": 0,
      "dead-gutter-boredom": 0,
      "eye-flow-backtracking": 0,
      "low-impact-contrast": 0,
      "weak-10s-hook": 0,
    };
    const cutIdSet = new Set<string>();
    let peakRisk = 0;
    let minRetention = 100;

    for (let i = startIdx; i <= endIdx; i += 1) {
      const s = screens[i];
      if (s.riskHeat > peakRisk) peakRisk = s.riskHeat;
      if (s.retentionScore < minRetention) minRetention = s.retentionScore;
      for (const cid of s.cutIds) cutIdSet.add(cid);
      for (const flag of s.flags) {
        riskTotals[flag.kind] += flag.severity;
      }
    }

    let dominantRisk: RetentionRiskKind = "low-impact-contrast";
    let dominantScore = -1;
    const riskKinds: readonly RetentionRiskKind[] = [
      "text-density-overload",
      "dead-gutter-boredom",
      "eye-flow-backtracking",
      "low-impact-contrast",
      "weak-10s-hook",
    ];
    for (const kind of riskKinds) {
      if (riskTotals[kind] > dominantScore) {
        dominantScore = riskTotals[kind];
        dominantRisk = kind;
      }
    }

    const first = screens[startIdx];
    const last = screens[endIdx];
    result.push({
      spanId: `dropoff-${result.length + 1}`,
      startScreenIndex: startIdx,
      endScreenIndex: endIdx,
      yStartPx: Math.round(first.yStartPx),
      yEndPx: Math.round(last.yEndPx),
      startTimeMs: Math.round(first.estimatedTimeMs),
      endTimeMs: Math.round(last.estimatedTimeMs + last.dwellMs),
      peakRisk: Number(peakRisk.toFixed(3)),
      minRetentionScore: minRetention,
      dominantRisk,
      cutIds: Array.from(cutIdSet),
      recommendationKo: RISK_RECOMMENDATIONS_KO[dominantRisk],
    });
  };

  for (let i = 0; i < screens.length; i += 1) {
    if (screens[i].riskHeat >= dropoffThreshold) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      flushRun(runStart, i - 1);
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    flushRun(runStart, screens.length - 1);
  }

  return result;
}

/**
 * 모바일 뷰포트(390×844 / 360×800 등) 기준으로 에피소드의 독자 이탈 위험 히트맵을 산출한다.
 */
export function analyzeMobileRetentionHeatmap(
  cuts: readonly EpisodeCutMetricsInput[],
  options: MobileRetentionHeatmapOptions = {},
): MobileRetentionHeatmapReport {
  const startMs = performance.now();
  const viewport =
    options.customViewport ??
    MOBILE_VIEWPORT_PRESETS[options.viewportPreset ?? "iphone15"];
  const strideRatio = clamp(options.strideRatio ?? 0.5, 0.25, 1.0);
  const dropoffThreshold = clamp(options.dropoffRiskThreshold ?? 0.45, 0.15, 0.9);
  const readingCharsPerSec = Math.max(2, options.readingCharsPerSec ?? 7.8);
  const baseScrollPxPerSec = Math.max(180, options.baseScrollPxPerSec ?? 540);

  if (cuts.length === 0) {
    return {
      viewport,
      totalScaledHeightPx: 0,
      estimatedTotalReadMs: 0,
      overallRetentionScore: 0,
      first10SecRetentionScore: 0,
      first10SecReachedYPx: 0,
      predictedCompletionRate: 0,
      screens: [],
      flaggedDropoffSpans: [],
      thumbScrollRhythm: [],
      elapsedMs: Number((performance.now() - startMs).toFixed(3)),
      aiTokensUsed: 0,
    };
  }

  const { spans, totalHeightPx } = buildScaledLayout(cuts, viewport.widthPx);
  const screenArea = viewport.widthPx * viewport.heightPx;
  const stridePx = Math.max(1, Math.round(viewport.heightPx * strideRatio));

  const windowStarts: number[] = [];
  if (totalHeightPx <= viewport.heightPx) {
    windowStarts.push(0);
  } else {
    for (let y = 0; y + viewport.heightPx < totalHeightPx; y += stridePx) {
      windowStarts.push(y);
    }
    const lastStart = Math.max(0, totalHeightPx - viewport.heightPx);
    if (windowStarts.length === 0 || lastStart - windowStarts[windowStarts.length - 1] > 1) {
      windowStarts.push(lastStart);
    }
  }

  const screens: ViewportScreenSample[] = [];
  const thumbScrollRhythm: ThumbScrollRhythmSample[] = [];
  let cumulativeTimeMs = 0;
  let prevImpactScore = 0.35;
  let consecutiveFlatScreens = 0;
  let consecutiveDeadPx = 0;

  for (let sIdx = 0; sIdx < windowStarts.length; sIdx += 1) {
    const winTop = windowStarts[sIdx];
    const winBottom = Math.min(totalHeightPx, winTop + viewport.heightPx);
    const winHeight = Math.max(1, winBottom - winTop);

    let visibleBalloonArea = 0;
    let weightedCharCount = 0;
    let deadVoidHeight = 0;
    let impactWeightedSum = 0;
    let artOverlapHeight = 0;
    let entropyWeightedSum = 0;
    const cutIds: string[] = [];
    const visibleBalloons: ScaledBalloon[] = [];

    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i];
      if (span.gutterEnd <= winTop) continue;
      if (span.yStart >= winBottom) break;

      const artOverlap = Math.max(0, Math.min(span.yEnd, winBottom) - Math.max(span.yStart, winTop));
      const gutterOverlap = Math.max(
        0,
        Math.min(span.gutterEnd, winBottom) - Math.max(span.yEnd, winTop),
      );

      if (artOverlap > 0) {
        cutIds.push(span.cutId);
        artOverlapHeight += artOverlap;
        entropyWeightedSum += span.visualEntropy * artOverlap;

        const cutImpact = clamp(
          span.contrastRatio * 0.52 +
            span.visualEntropy * 0.28 +
            span.shotBoost +
            (span.hasImpactHook ? 0.22 : 0),
          0,
          1,
        );
        impactWeightedSum += cutImpact * artOverlap;

        if (span.visualEntropy < 0.2 && span.balloons.length === 0) {
          deadVoidHeight += artOverlap * (span.isDramaticPause ? 0.35 : 0.85);
        }
      }

      if (gutterOverlap > 0) {
        deadVoidHeight += gutterOverlap * (span.isDramaticPause ? 0.42 : 1.0);
      }

      for (let b = 0; b < span.balloons.length; b += 1) {
        const balloon = span.balloons[b];
        const bTop = balloon.y;
        const bBottom = balloon.y + balloon.height;
        const overlapY = Math.max(0, Math.min(bBottom, winBottom) - Math.max(bTop, winTop));
        if (overlapY > 0) {
          const visibilityFraction = overlapY / balloon.height;
          visibleBalloonArea += balloon.width * overlapY;
          weightedCharCount += balloon.weightedChars * visibilityFraction;
          visibleBalloons.push(balloon);
        }
      }
    }

    const textDensityRatio = clamp(visibleBalloonArea / screenArea, 0, 1);
    const deadGutterRatio = clamp(deadVoidHeight / winHeight, 0, 1);
    const meanEntropy = artOverlapHeight > 0 ? entropyWeightedSum / artOverlapHeight : 0;
    const visualImpactScore = artOverlapHeight > 0 ? impactWeightedSum / artOverlapHeight : 0.08;
    const impactContrastDelta = Math.abs(visualImpactScore - prevImpactScore);
    prevImpactScore = visualImpactScore;

    if (deadGutterRatio >= 0.65) {
      consecutiveDeadPx += sIdx === 0 ? winHeight * deadGutterRatio : stridePx * deadGutterRatio;
    } else {
      consecutiveDeadPx = Math.max(0, consecutiveDeadPx * 0.25);
    }

    if (impactContrastDelta < 0.08 && visualImpactScore < 0.56) {
      consecutiveFlatScreens += 1;
    } else {
      consecutiveFlatScreens = 0;
    }

    const eyeFlowBacktrackScore = computeEyeFlowBacktracking(
      visibleBalloons,
      viewport.widthPx,
      viewport.heightPx,
    );

    const flags: RetentionRiskFlag[] = [];

    // 1. 대사 밀집 과부하 평가
    let textRisk = 0;
    if (weightedCharCount > 78 || textDensityRatio > 0.26 || visibleBalloons.length >= 6) {
      const charSeverity = clamp((weightedCharCount - 70) / 110, 0, 1);
      const areaSeverity = clamp((textDensityRatio - 0.22) / 0.32, 0, 1);
      const countSeverity = clamp((visibleBalloons.length - 4) / 5, 0, 1);
      textRisk = clamp(Math.max(charSeverity, areaSeverity * 0.9, countSeverity * 0.75), 0, 1);
      if (textRisk >= 0.2) {
        flags.push({
          kind: "text-density-overload",
          severity: Number(textRisk.toFixed(3)),
          detailKo: `화면당 가중 글자수 ${Math.round(weightedCharCount)}자 · 말풍선 점유율 ${Math.round(textDensityRatio * 100)}%`,
        });
      }
    }

    // 2. 빈 여백(Dead Gutter) 지루함 구간 평가
    let deadGutterRisk = 0;
    if (deadGutterRatio > 0.62 || consecutiveDeadPx > viewport.heightPx * 1.05) {
      const ratioSeverity = clamp((deadGutterRatio - 0.55) / 0.42, 0, 1);
      const streakSeverity = clamp((consecutiveDeadPx - viewport.heightPx * 0.9) / viewport.heightPx, 0, 1);
      deadGutterRisk = clamp(Math.max(ratioSeverity, streakSeverity), 0, 1);
      if (deadGutterRisk >= 0.2) {
        flags.push({
          kind: "dead-gutter-boredom",
          severity: Number(deadGutterRisk.toFixed(3)),
          detailKo: `빈 여백 비율 ${Math.round(deadGutterRatio * 100)}% · 연속 무자극 ${Math.round(consecutiveDeadPx)}px`,
        });
      }
    }

    // 3. 시선 역주행 평가
    let backtrackRisk = 0;
    if (eyeFlowBacktrackScore >= 0.22) {
      backtrackRisk = clamp(eyeFlowBacktrackScore, 0, 1);
      flags.push({
        kind: "eye-flow-backtracking",
        severity: Number(backtrackRisk.toFixed(3)),
        detailKo: `말풍선 읽기 동선 역주행 지수 ${Math.round(backtrackRisk * 100)}점`,
      });
    }

    // 4. 임팩트 대비 평탄화 평가
    let flatContrastRisk = 0;
    if (consecutiveFlatScreens >= 3) {
      flatContrastRisk = clamp(0.32 + (consecutiveFlatScreens - 2) * 0.14, 0, 0.85);
      flags.push({
        kind: "low-impact-contrast",
        severity: Number(flatContrastRisk.toFixed(3)),
        detailKo: `${consecutiveFlatScreens}스크린 연속 시각 임팩트 변화 부족 (Δ${impactContrastDelta.toFixed(2)})`,
      });
    }

    // 엄지 스크롤 체류 시간 및 속도 모델링
    const readingDwellMs = (weightedCharCount / readingCharsPerSec) * 1000;
    const artDwellMs = (1 - deadGutterRatio) * (240 + meanEntropy * 420);
    const transitMs = (stridePx / baseScrollPxPerSec) * 1000;
    const dwellMs = clamp(
      readingDwellMs * 0.72 + artDwellMs * 0.65 + transitMs * (0.45 + deadGutterRatio * 0.4),
      260,
      9000,
    );
    const thumbVelocityPxPerSec = Math.round(
      clamp((stridePx / Math.max(0.18, dwellMs / 1000)) * (1 + deadGutterRatio * 0.55), 80, 1800),
    );

    let rhythmState: ThumbScrollRhythmSample["rhythmState"] = "engaged";
    if (deadGutterRisk >= 0.4) {
      rhythmState = "bored-flick";
    } else if (textRisk >= 0.45) {
      rhythmState = "stalled-text";
    } else if (thumbVelocityPxPerSec > baseScrollPxPerSec * 1.45) {
      rhythmState = "skimming";
    }

    const baseRisk = clamp(
      textRisk * 0.42 +
        deadGutterRisk * 0.42 +
        backtrackRisk * 0.34 +
        flatContrastRisk * 0.28 +
        Math.max(textRisk, deadGutterRisk, backtrackRisk) * 0.38 -
        visualImpactScore * 0.12,
      0,
      1,
    );
    const retentionScore = Math.round(clamp((1 - baseRisk) * 100, 0, 100));

    screens.push({
      screenIndex: sIdx,
      yStartPx: Math.round(winTop),
      yEndPx: Math.round(winBottom),
      estimatedTimeMs: Math.round(cumulativeTimeMs),
      dwellMs: Math.round(dwellMs),
      retentionScore,
      riskHeat: Number(baseRisk.toFixed(3)),
      textDensityRatio: Number(textDensityRatio.toFixed(3)),
      weightedCharCount: Number(weightedCharCount.toFixed(1)),
      balloonCount: visibleBalloons.length,
      deadGutterRatio: Number(deadGutterRatio.toFixed(3)),
      eyeFlowBacktrackScore: Number(eyeFlowBacktrackScore.toFixed(3)),
      visualImpactScore: Number(visualImpactScore.toFixed(3)),
      impactContrastDelta: Number(impactContrastDelta.toFixed(3)),
      cutIds,
      flags,
    });

    thumbScrollRhythm.push({
      screenIndex: sIdx,
      timeMs: Math.round(cumulativeTimeMs),
      thumbVelocityPxPerSec,
      dwellMs: Math.round(dwellMs),
      rhythmState,
    });

    cumulativeTimeMs += dwellMs;
  }

  // 초반 10초 훅(Hook) 진단 및 첫 화면 반영
  const openingScreens = screens.filter((screen) => screen.estimatedTimeMs <= 10_000);
  const effectiveOpening = openingScreens.length > 0 ? openingScreens : screens.slice(0, 1);
  let peakOpeningImpact = 0;
  let openingRetentionSum = 0;
  let first10SecReachedYPx = 0;

  for (let i = 0; i < effectiveOpening.length; i += 1) {
    const s = effectiveOpening[i];
    if (s.visualImpactScore > peakOpeningImpact) peakOpeningImpact = s.visualImpactScore;
    openingRetentionSum += s.retentionScore;
    if (s.yEndPx > first10SecReachedYPx) first10SecReachedYPx = s.yEndPx;
  }

  const openingMeanRetention = openingRetentionSum / Math.max(1, effectiveOpening.length);
  const weakHookPenalty = peakOpeningImpact < 0.56 ? (0.56 - peakOpeningImpact) * 58 : 0;
  const first10SecRetentionScore = Math.round(clamp(openingMeanRetention - weakHookPenalty, 0, 100));

  if (weakHookPenalty >= 12 && screens.length > 0) {
    const first = screens[0];
    const updatedRisk = clamp(first.riskHeat + weakHookPenalty / 120, 0, 1);
    screens[0] = {
      ...first,
      riskHeat: Number(updatedRisk.toFixed(3)),
      retentionScore: Math.round(clamp((1 - updatedRisk) * 100, 0, 100)),
      flags: [
        ...first.flags,
        {
          kind: "weak-10s-hook",
          severity: Number(clamp(weakHookPenalty / 35, 0.25, 1).toFixed(3)),
          detailKo: `초반 10초 최대 시각 임팩트 ${Math.round(peakOpeningImpact * 100)}점(권장 56점 이상)`,
        },
      ],
    };
  }

  const flaggedDropoffSpans = mergeDropoffSpans(screens, dropoffThreshold);

  let fullScoreSum = 0;
  for (let i = 0; i < screens.length; i += 1) {
    fullScoreSum += screens[i].retentionScore;
  }
  const fullMeanScore = fullScoreSum / Math.max(1, screens.length);
  const spanPenalty = Math.min(20, flaggedDropoffSpans.length * 4.5);
  const overallRetentionScore = Math.round(
    clamp(first10SecRetentionScore * 0.35 + fullMeanScore * 0.65 - spanPenalty, 0, 100),
  );
  const predictedCompletionRate = Number(
    clamp(0.18 + (overallRetentionScore / 100) * 0.78, 0.05, 0.98).toFixed(3),
  );

  return {
    viewport,
    totalScaledHeightPx: Math.round(totalHeightPx),
    estimatedTotalReadMs: Math.round(cumulativeTimeMs),
    overallRetentionScore,
    first10SecRetentionScore,
    first10SecReachedYPx,
    predictedCompletionRate,
    screens,
    flaggedDropoffSpans,
    thumbScrollRhythm,
    elapsedMs: Number((performance.now() - startMs).toFixed(3)),
    aiTokensUsed: 0,
  };
}
