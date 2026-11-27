/**
 * Wave-52: `375×812` 스마트폰 뷰포트 기준 세로 스크롤 긴장감 곡선 및 리듬 진단기.
 *
 * - 장르별(액션·로맨스·스릴러·일상) 독자 엄지 스크롤 속도와 읽기 템포를 모델링한다.
 * - 컷 높이, 대사 글자 수, 말풍선 수, 컷 간 여백(Gutter)을 결합해 컷별 체류 시간(초)과
 *   `0..1` 긴장감 곡선을 산출한다.
 * - 숨 막히는 과밀 구간, 반전 직전 김빠짐(여백 부족·과다), 액션 연타 과다 여백을 정량 진단한다.
 */

export type WebtoonGenre = "action" | "romance" | "thriller" | "slice-of-life";

export type CutRole =
  | "setup"
  | "dialogue"
  | "action-combo"
  | "emotional-beat"
  | "pre-twist-buildup"
  | "twist-reveal"
  | "cliffhanger";

export type ScrollPacingIssueKind =
  | "suffocating-crowding"
  | "pre-twist-deflation-tight"
  | "pre-twist-deflation-excessive"
  | "action-momentum-drag"
  | "dead-air-gutter";

export interface MobileViewportSpec {
  readonly widthPx: number;
  readonly heightPx: number;
}

export const DEFAULT_MOBILE_VIEWPORT_375X812: MobileViewportSpec = {
  widthPx: 375,
  heightPx: 812,
};

export interface GenreScrollTempoProfile {
  readonly genre: WebtoonGenre;
  readonly labelKo: string;
  readonly baseThumbScrollPxPerSec: number;
  readonly readingCharsPerSec: number;
  readonly minComfortGutterPx: number;
  readonly comfortTargetGutterPx: number;
  readonly maxNormalGutterPx: number;
  readonly actionComboTargetGutterPx: number;
  readonly actionComboMaxGutterPx: number;
  readonly preTwistMinGutterPx: number;
  readonly preTwistTargetGutterPx: number;
  readonly preTwistMaxGutterPx: number;
}

export const GENRE_SCROLL_TEMPO_PROFILES: Readonly<Record<WebtoonGenre, GenreScrollTempoProfile>> = {
  action: {
    genre: "action",
    labelKo: "액션",
    baseThumbScrollPxPerSec: 920,
    readingCharsPerSec: 16.5,
    minComfortGutterPx: 68,
    comfortTargetGutterPx: 104,
    maxNormalGutterPx: 240,
    actionComboTargetGutterPx: 40,
    actionComboMaxGutterPx: 72,
    preTwistMinGutterPx: 290,
    preTwistTargetGutterPx: 380,
    preTwistMaxGutterPx: 540,
  },
  romance: {
    genre: "romance",
    labelKo: "로맨스",
    baseThumbScrollPxPerSec: 540,
    readingCharsPerSec: 12.5,
    minComfortGutterPx: 110,
    comfortTargetGutterPx: 175,
    maxNormalGutterPx: 340,
    actionComboTargetGutterPx: 64,
    actionComboMaxGutterPx: 110,
    preTwistMinGutterPx: 320,
    preTwistTargetGutterPx: 430,
    preTwistMaxGutterPx: 620,
  },
  thriller: {
    genre: "thriller",
    labelKo: "스릴러",
    baseThumbScrollPxPerSec: 600,
    readingCharsPerSec: 13.5,
    minComfortGutterPx: 115,
    comfortTargetGutterPx: 190,
    maxNormalGutterPx: 360,
    actionComboTargetGutterPx: 52,
    actionComboMaxGutterPx: 90,
    preTwistMinGutterPx: 380,
    preTwistTargetGutterPx: 490,
    preTwistMaxGutterPx: 680,
  },
  "slice-of-life": {
    genre: "slice-of-life",
    labelKo: "일상",
    baseThumbScrollPxPerSec: 700,
    readingCharsPerSec: 15.0,
    minComfortGutterPx: 84,
    comfortTargetGutterPx: 132,
    maxNormalGutterPx: 270,
    actionComboTargetGutterPx: 52,
    actionComboMaxGutterPx: 92,
    preTwistMinGutterPx: 230,
    preTwistTargetGutterPx: 310,
    preTwistMaxGutterPx: 460,
  },
};

export interface ScrollCutSpec {
  readonly cutId: string;
  readonly widthPx?: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly dialogueCharCount: number;
  readonly balloonCount: number;
  readonly role: CutRole;
  readonly visualComplexity?: number;
  readonly emotionalIntensity?: number;
  readonly eyeFlowFrictionRatio?: number;
  readonly hasGradientBreathingGutter?: boolean;
}

export interface ScrollTensionInput {
  readonly episodeId: string;
  readonly genre: WebtoonGenre;
  readonly cuts: readonly ScrollCutSpec[];
  readonly viewport?: MobileViewportSpec;
  readonly readerScrollSpeedMultiplier?: number;
}

export interface CutRhythmMetric {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly topY: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly role: CutRole;
  readonly dwellTimeSec: number;
  readonly effectiveScrollVelocityPxPerSec: number;
  readonly viewportOccupancyRatio: number;
  readonly windowDialogueChars: number;
  readonly windowBalloonCount: number;
  readonly tensionScore: number;
}

export interface ScrollPacingIssue {
  readonly cutId: string;
  readonly nextCutId: string | null;
  readonly kind: ScrollPacingIssueKind;
  readonly severity: "warning" | "critical";
  readonly currentGutterPx: number;
  readonly recommendedGutterPx: number;
  readonly tensionImpact: number;
  readonly messageKo: string;
}

export interface ScrollTensionReport {
  readonly episodeId: string;
  readonly genre: WebtoonGenre;
  readonly viewport: MobileViewportSpec;
  readonly genreProfile: GenreScrollTempoProfile;
  readonly cutMetrics: readonly CutRhythmMetric[];
  readonly tensionCurve: readonly number[];
  readonly totalEstimatedReadTimeSec: number;
  readonly averageTension: number;
  readonly peakTension: number;
  readonly peakTensionCutId: string | null;
  readonly issues: readonly ScrollPacingIssue[];
  readonly rhythmHealthScore: number;
  readonly summaryKo: string;
}

const ROLE_BASE_TENSION: Readonly<Record<CutRole, number>> = {
  setup: 0.34,
  dialogue: 0.44,
  "emotional-beat": 0.64,
  "action-combo": 0.76,
  "pre-twist-buildup": 0.78,
  "twist-reveal": 0.93,
  cliffhanger: 0.91,
};

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const isTwistTarget = (role: CutRole): boolean => role === "twist-reveal" || role === "cliffhanger";

function measureWindowCrowding(
  cuts: readonly ScrollCutSpec[],
  tops: readonly number[],
  startIdx: number,
  viewportH: number,
): { readonly chars: number; readonly balloons: number } {
  const startY = tops[startIdx] ?? 0;
  const endY = startY + viewportH;
  let chars = 0;
  let balloons = 0;
  for (let j = startIdx; j < cuts.length; j += 1) {
    const cut = cuts[j];
    const cutTop = tops[j];
    if (cut === undefined || cutTop === undefined || cutTop >= endY) break;
    const h = Math.max(1, cut.heightPx);
    const overlap = Math.max(0, Math.min(endY, cutTop + h) - Math.max(startY, cutTop));
    const ratio = clamp(overlap / h, 0, 1);
    chars += cut.dialogueCharCount * ratio;
    balloons += cut.balloonCount * ratio;
  }
  return { chars: Math.round(chars), balloons: round2(balloons) };
}

/**
 * 에피소드 전체 컷의 체류 시간, 긴장감 곡선(`0..1`), 과밀·김빠짐 구간을 정량 분석한다.
 */
export function analyzeScrollTensionRhythm(input: ScrollTensionInput): ScrollTensionReport {
  const viewport = input.viewport ?? DEFAULT_MOBILE_VIEWPORT_375X812;
  const profile = GENRE_SCROLL_TEMPO_PROFILES[input.genre];
  const thumbSpeed = profile.baseThumbScrollPxPerSec * clamp(input.readerScrollSpeedMultiplier ?? 1, 0.5, 2);

  const tops: number[] = [];
  let cursorY = 0;
  for (const cut of input.cuts) {
    tops.push(cursorY);
    cursorY += Math.max(1, cut.heightPx) + Math.max(0, cut.gutterAfterPx);
  }

  const cutMetrics: CutRhythmMetric[] = [];
  const tensionCurve: number[] = [];
  const issues: ScrollPacingIssue[] = [];

  for (let i = 0; i < input.cuts.length; i += 1) {
    const cut = input.cuts[i];
    if (cut === undefined) continue;
    const nextCut = input.cuts[i + 1];
    const topY = tops[i] ?? 0;
    const h = Math.max(1, cut.heightPx);
    const gutter = Math.max(0, cut.gutterAfterPx);
    const complexity = clamp(cut.visualComplexity ?? 0.5, 0, 1);
    const eyeFriction = clamp(cut.eyeFlowFrictionRatio ?? 0, 0, 1);

    const traverseSec = (h + gutter * 0.38) / Math.max(120, thumbSpeed);
    const readSec = Math.max(0, cut.dialogueCharCount) / profile.readingCharsPerSec + Math.max(0, cut.balloonCount) * 0.24;
    const inspectSec = (h / Math.max(240, viewport.heightPx)) * (0.45 + complexity * 0.85) + (isTwistTarget(cut.role) ? 0.65 : 0);
    const dwellTimeSec = round3(Math.max(traverseSec, readSec * 0.72 + inspectSec * 0.65) + readSec * 0.28 + eyeFriction * 0.55);
    const windowLoad = measureWindowCrowding(input.cuts, tops, i, viewport.heightPx);

    const baseTension = ROLE_BASE_TENSION[cut.role];
    let tension =
      cut.emotionalIntensity !== undefined
        ? baseTension * 0.65 + clamp(cut.emotionalIntensity, 0, 1) * 0.35
        : baseTension;

    const leadsIntoTwist = nextCut !== undefined && (isTwistTarget(nextCut.role) || cut.role === "pre-twist-buildup");
    const isActionPair =
      cut.role === "action-combo" &&
      nextCut !== undefined &&
      (nextCut.role === "action-combo" || nextCut.role === "twist-reveal");

    // 1. 반전 직전 김빠짐 진단 (여백 부족으로 미리 노출 또는 여백 과다로 이완)
    if (leadsIntoTwist && nextCut !== undefined) {
      const minPreTwist = Math.max(profile.preTwistMinGutterPx, Math.round(viewport.heightPx * 0.38));
      if (gutter < minPreTwist) {
        const drop = round3(0.24 + clamp((minPreTwist - gutter) / minPreTwist, 0, 1) * 0.22);
        tension -= drop;
        issues.push({
          cutId: cut.cutId,
          nextCutId: nextCut.cutId,
          kind: "pre-twist-deflation-tight",
          severity: gutter < minPreTwist * 0.65 ? "critical" : "warning",
          currentGutterPx: gutter,
          recommendedGutterPx: profile.preTwistTargetGutterPx,
          tensionImpact: -drop,
          messageKo: `반전 컷(${nextCut.cutId}) 직전 여백이 ${gutter}px로 짧아 ${viewport.widthPx}×${viewport.heightPx} 화면 하단에 반전이 미리 노출됩니다.`,
        });
      } else if (gutter > profile.preTwistMaxGutterPx) {
        const drop = round3(0.18 + clamp((gutter - profile.preTwistMaxGutterPx) / Math.max(120, profile.preTwistMaxGutterPx), 0, 1) * 0.2);
        tension -= drop;
        issues.push({
          cutId: cut.cutId,
          nextCutId: nextCut.cutId,
          kind: "pre-twist-deflation-excessive",
          severity: gutter > profile.preTwistMaxGutterPx * 1.35 ? "critical" : "warning",
          currentGutterPx: gutter,
          recommendedGutterPx: profile.preTwistTargetGutterPx,
          tensionImpact: -drop,
          messageKo: `반전 컷(${nextCut.cutId}) 직전 여백이 ${gutter}px로 지나치게 길어 스크롤 중 긴장감이 풀립니다.`,
        });
      } else {
        tension += cut.hasGradientBreathingGutter ? 0.08 : 0.05;
      }
    }

    // 2. 액션 연타 구간 과다 여백 진단
    if (isActionPair && nextCut !== undefined && !leadsIntoTwist) {
      if (gutter > profile.actionComboMaxGutterPx) {
        const drop = round3(0.14 + clamp((gutter - profile.actionComboMaxGutterPx) / Math.max(60, profile.actionComboMaxGutterPx), 0, 1) * 0.16);
        tension -= drop;
        issues.push({
          cutId: cut.cutId,
          nextCutId: nextCut.cutId,
          kind: "action-momentum-drag",
          severity: gutter > profile.actionComboMaxGutterPx * 1.7 ? "critical" : "warning",
          currentGutterPx: gutter,
          recommendedGutterPx: profile.actionComboTargetGutterPx,
          tensionImpact: -drop,
          messageKo: `액션 연타(${cut.cutId}→${nextCut.cutId}) 사이 여백이 ${gutter}px로 넓어 타격 템포가 끊깁니다.`,
        });
      } else {
        tension += 0.07;
      }
    }

    // 3. 숨 막힘(과밀) 구간 진단
    const highLoad = windowLoad.chars >= 95 || windowLoad.balloons >= 4;
    const cramped =
      !isActionPair && gutter < profile.minComfortGutterPx && (highLoad || cut.dialogueCharCount >= 42 || cut.balloonCount >= 3);
    const burst = windowLoad.chars >= 140 && gutter < profile.comfortTargetGutterPx;
    if ((cramped || burst) && !leadsIntoTwist && nextCut !== undefined) {
      issues.push({
        cutId: cut.cutId,
        nextCutId: nextCut.cutId,
        kind: "suffocating-crowding",
        severity: windowLoad.chars >= 135 || gutter < profile.minComfortGutterPx * 0.55 ? "critical" : "warning",
        currentGutterPx: gutter,
        recommendedGutterPx: Math.round(profile.comfortTargetGutterPx + Math.min(72, Math.max(0, windowLoad.chars - 95) * 0.55)),
        tensionImpact: -0.1,
        messageKo: `컷(${cut.cutId}) 주변 한 화면에 대사 ${windowLoad.chars}자·말풍선 ${windowLoad.balloons}개가 몰려 여백(${gutter}px)이 숨 막히게 좁습니다.`,
      });
      tension -= 0.08;
    }

    // 4. 일반 구간 과다 공백 진단
    if (!leadsIntoTwist && !isActionPair && nextCut !== undefined && gutter > profile.maxNormalGutterPx) {
      issues.push({
        cutId: cut.cutId,
        nextCutId: nextCut.cutId,
        kind: "dead-air-gutter",
        severity: gutter > profile.maxNormalGutterPx * 1.45 ? "critical" : "warning",
        currentGutterPx: gutter,
        recommendedGutterPx: profile.comfortTargetGutterPx,
        tensionImpact: -0.09,
        messageKo: `일반 전개 컷(${cut.cutId}) 뒤 여백이 ${gutter}px로 과도하게 비어 몰입 흐름이 느슨해집니다.`,
      });
      tension -= 0.09;
    }

    const finalTension = round3(clamp(tension, 0, 1));
    tensionCurve.push(finalTension);
    cutMetrics.push({
      cutId: cut.cutId,
      cutIndex: i,
      topY,
      heightPx: h,
      gutterAfterPx: gutter,
      role: cut.role,
      dwellTimeSec,
      effectiveScrollVelocityPxPerSec: round2((h + gutter) / Math.max(0.15, dwellTimeSec)),
      viewportOccupancyRatio: round2(h / Math.max(1, viewport.heightPx)),
      windowDialogueChars: windowLoad.chars,
      windowBalloonCount: windowLoad.balloons,
      tensionScore: finalTension,
    });
  }

  const totalReadSec = round2(cutMetrics.reduce((acc, m) => acc + m.dwellTimeSec, 0));
  const avgTension = tensionCurve.length > 0 ? round3(tensionCurve.reduce((a, b) => a + b, 0) / tensionCurve.length) : 0;
  let peakTension = 0;
  let peakCutId: string | null = null;
  for (const m of cutMetrics) {
    if (m.tensionScore >= peakTension) {
      peakTension = m.tensionScore;
      peakCutId = m.cutId;
    }
  }
  const health = round2(clamp(100 - issues.reduce((acc, i) => acc + (i.severity === "critical" ? 18 : 10), 0), 0, 100));
  const summaryKo =
    issues.length === 0
      ? `${profile.labelKo} 템포 기준 에피소드(${input.episodeId}) 세로 스크롤 리듬이 안정적입니다(건강도 ${health}점).`
      : `${profile.labelKo} 템포 진단 결과 ${issues.length}개 구간에서 과밀·김빠짐·속도 저하가 발견되었습니다(건강도 ${health}점).`;

  return {
    episodeId: input.episodeId,
    genre: input.genre,
    viewport,
    genreProfile: profile,
    cutMetrics,
    tensionCurve,
    totalEstimatedReadTimeSec: totalReadSec,
    averageTension: avgTension,
    peakTension: round3(peakTension),
    peakTensionCutId: peakCutId,
    issues,
    rhythmHealthScore: health,
    summaryKo,
  };
}
