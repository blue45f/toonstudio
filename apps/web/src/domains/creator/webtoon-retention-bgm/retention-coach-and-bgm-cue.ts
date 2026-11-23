/**
 * 무료 구간(1~5화) 연재 이탈 위험 분석 코치 & BGM·SFX 스크롤 연동 큐시트 엔진.
 * 순수 메모리 결정론적 연산(외부 네트워크·브라우저 스토리지·원시 색상 코드 없음).
 */

export type WebtoonGenreProfile = "action-fantasy" | "romance-drama" | "thriller-mystery" | "slice-of-life";
export type CutEmotionalBeat = "neutral" | "setup" | "tension" | "reveal" | "humor" | "cliffhanger";
export type PacingDipSeverity = "critical" | "warning" | "watch";
export type RetentionPrescriptionType =
  | "trim-dialogue"
  | "split-cut"
  | "pull-hook-forward"
  | "inject-scene-shift"
  | "amplify-cliffhanger";

export interface EpisodeCutMetric {
  readonly cutId: string; readonly cutIndex: number; readonly panelHeightPx: number;
  readonly wordCount: number; readonly balloonCount: number; readonly actionIntensity: number;
  readonly isSceneTransition?: boolean; readonly emotionalBeat?: CutEmotionalBeat; readonly hasHookElement?: boolean;
}

export interface EpisodeRetentionInput {
  readonly episodeNumber: number; readonly title: string;
  readonly genre?: WebtoonGenreProfile; readonly cuts: readonly EpisodeCutMetric[];
}

export interface CutRhythmPoint {
  readonly cutId: string; readonly cutIndex: number; readonly scrollOffsetPct: number;
  readonly cutDensityScore: number; readonly dialogueLoadScore: number; readonly sceneTransitionPulse: number;
  readonly engagementScore: number; readonly predictedDropoffRisk: number; readonly isPacingDip: boolean;
}

export interface PacingDipZone {
  readonly zoneId: string; readonly startCutIndex: number; readonly endCutIndex: number;
  readonly startScrollPct: number; readonly endScrollPct: number; readonly severity: PacingDipSeverity;
  readonly avgEngagement: number; readonly avgDialogueLoad: number;
  readonly reasonKo: string; readonly reasonEn: string;
}

export interface RetentionPrescription {
  readonly prescriptionId: string; readonly type: RetentionPrescriptionType;
  readonly priority: "critical" | "high" | "medium"; readonly targetCutRange: readonly [number, number];
  readonly titleKo: string; readonly titleEn: string; readonly actionKo: string; readonly actionEn: string;
  readonly expectedDropReductionPct: number;
}

export interface EpisodeRetentionSummaryMetrics {
  readonly avgWordsPerCut: number; readonly avgBalloonsPerCut: number;
  readonly sceneTransitionRatePer10Cuts: number; readonly maxDialogueStretchCuts: number;
  readonly firstHookCutIndex: number | null;
}

export interface EpisodeRetentionReport {
  readonly episodeNumber: number; readonly isFreeTierEpisode: boolean; readonly title: string;
  readonly genre: WebtoonGenreProfile; readonly cutCount: number; readonly totalScrollHeightPx: number;
  readonly openingHookScore: number; readonly cliffhangerScore: number;
  readonly pacingStabilityScore: number; readonly overallRetentionScore: number;
  readonly riskLevel: "low" | "moderate" | "high" | "critical";
  readonly estimatedCompletionRatePct: number; readonly calculationBasis: "heuristic-pacing-model";
  readonly metrics: EpisodeRetentionSummaryMetrics;
  readonly rhythmCurve: readonly CutRhythmPoint[];
  readonly pacingDipZones: readonly PacingDipZone[];
  readonly prescriptions: readonly RetentionPrescription[];
}

export interface FreeArcRetentionOverview {
  readonly episodeReports: readonly EpisodeRetentionReport[]; readonly freeEpisodeCount: number;
  readonly averageRetentionScore: number; readonly bottleneckEpisodeNumber: number | null;
  readonly paidWallReadinessScore: number; readonly summaryKo: string; readonly summaryEn: string;
}

interface GenreBenchmark {
  readonly idealWordsPerCut: number; readonly idealPanelHeightPx: number;
  readonly targetTransitionsPer10Cuts: number; readonly dipThreshold: number; readonly openingHookCutoffCut: number;
}

const GENRE_BENCHMARKS: Readonly<Record<WebtoonGenreProfile, GenreBenchmark>> = {
  "action-fantasy": { idealWordsPerCut: 18, idealPanelHeightPx: 1050, targetTransitionsPer10Cuts: 2.8, dipThreshold: 53, openingHookCutoffCut: 3 },
  "romance-drama": { idealWordsPerCut: 26, idealPanelHeightPx: 1180, targetTransitionsPer10Cuts: 2.1, dipThreshold: 49, openingHookCutoffCut: 4 },
  "thriller-mystery": { idealWordsPerCut: 20, idealPanelHeightPx: 1080, targetTransitionsPer10Cuts: 2.6, dipThreshold: 52, openingHookCutoffCut: 3 },
  "slice-of-life": { idealWordsPerCut: 28, idealPanelHeightPx: 1100, targetTransitionsPer10Cuts: 1.8, dipThreshold: 46, openingHookCutoffCut: 4 },
};

const BEAT_ENGAGEMENT_BOOST: Readonly<Record<CutEmotionalBeat, number>> = {
  neutral: 0, setup: 4, humor: 10, tension: 16, reveal: 22, cliffhanger: 26,
};

function clamp(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min; }
function round1(value: number): number { return Math.round(value * 10) / 10; }
function round3(value: number): number { return Math.round(value * 1000) / 1000; }

function resolveRiskLevel(score: number): "low" | "moderate" | "high" | "critical" {
  if (score >= 76) return "low";
  if (score >= 60) return "moderate";
  if (score >= 44) return "high";
  return "critical";
}

function buildDipReason(avgDialogueLoad: number, avgEngagement: number): { readonly ko: string; readonly en: string } {
  if (avgDialogueLoad >= 72) {
    return {
      ko: "대사·말풍선 밀도가 임계치를 넘어 독자 스크롤 호흡이 급격히 느려지는 중반 늘어짐 구간입니다.",
      en: "Dialogue and balloon density exceed threshold, creating a mid-episode pacing drag.",
    };
  }
  if (avgEngagement < 40) {
    return {
      ko: "시각적 동세와 장면 전환이 연속으로 정체되어 이탈 위험이 집중되는 침체 구간입니다.",
      en: "Consecutive low motion and static scenes create a sharp retention drop-off trough.",
    };
  }
  return {
    ko: "연출 완급 대비 설명 컷 비중이 높아 독자 몰입이 완만하게 식는 주의 구간입니다.",
    en: "Exposition weight outpaces visual momentum, softening reader engagement.",
  };
}

/** 무료 구간(1~5화) 중심 회차별 리듬 곡선·중반 늘어짐 구간·편집 처방을 산출한다. */
export function analyzeEpisodeHookAndRetention(input: EpisodeRetentionInput): EpisodeRetentionReport {
  const genre: WebtoonGenreProfile = input.genre ?? "action-fantasy";
  const bench = GENRE_BENCHMARKS[genre];
  const isFreeTierEpisode = input.episodeNumber >= 1 && input.episodeNumber <= 5;
  const sortedCuts = [...input.cuts].sort((a, b) => a.cutIndex - b.cutIndex);

  if (sortedCuts.length === 0) {
    return {
      episodeNumber: input.episodeNumber, isFreeTierEpisode, title: input.title.trim() || `EP.${input.episodeNumber}`,
      genre, cutCount: 0, totalScrollHeightPx: 0, openingHookScore: 0, cliffhangerScore: 0,
      pacingStabilityScore: 0, overallRetentionScore: 0, riskLevel: "critical",
      estimatedCompletionRatePct: 0, calculationBasis: "heuristic-pacing-model",
      metrics: { avgWordsPerCut: 0, avgBalloonsPerCut: 0, sceneTransitionRatePer10Cuts: 0, maxDialogueStretchCuts: 0, firstHookCutIndex: null },
      rhythmCurve: [], pacingDipZones: [],
      prescriptions: [{
        prescriptionId: `ep${input.episodeNumber}-add-hook`, type: "pull-hook-forward", priority: "critical",
        targetCutRange: [1, 3], titleKo: "오프닝 3컷 후크 구성 필요", titleEn: "Add 3-Cut Opening Hook",
        actionKo: "첫 3컷 안에 핵심 갈등이나 미스터리 장면을 배치해 초기 스크롤 이탈을 차단하세요.",
        actionEn: "Place the inciting conflict or mystery image within the first 3 cuts.",
        expectedDropReductionPct: 18,
      }],
    };
  }

  const totalScrollHeightPx = sortedCuts.reduce((acc, cut) => acc + Math.max(240, cut.panelHeightPx), 0);
  const rhythmCurve: CutRhythmPoint[] = [];
  let cumulativeY = 0;
  let cutsSinceTransition = 0;
  let consecutiveMonotony = 0;
  let currentDialogueStretch = 0;
  let maxDialogueStretchCuts = 0;
  let transitionCount = 0;
  let firstHookCutIndex: number | null = null;
  let totalWords = 0;
  let totalBalloons = 0;

  for (const cut of sortedCuts) {
    const heightPx = Math.max(240, cut.panelHeightPx);
    const words = Math.max(0, cut.wordCount);
    const balloons = Math.max(0, cut.balloonCount);
    const action = clamp(cut.actionIntensity, 0, 100);
    const beat: CutEmotionalBeat = cut.emotionalBeat ?? "neutral";
    totalWords += words;
    totalBalloons += balloons;

    if (cut.isSceneTransition) { transitionCount += 1; cutsSinceTransition = 0; } else { cutsSinceTransition += 1; }
    if (firstHookCutIndex === null && (cut.hasHookElement || beat === "reveal" || beat === "cliffhanger")) {
      firstHookCutIndex = cut.cutIndex;
    }

    const tempoScore = clamp(100 - Math.abs(heightPx / bench.idealPanelHeightPx - 0.92) * 44, 24, 100);
    const cutDensityScore = round1(clamp(tempoScore * 0.55 + action * 0.45, 0, 100));
    const dialogueLoadScore = round1(clamp((words / Math.max(1, bench.idealWordsPerCut)) * 46 + Math.max(0, balloons - 2) * 14 + Math.min(2, balloons) * 6, 0, 100));
    if (dialogueLoadScore >= 66) {
      currentDialogueStretch += 1;
      maxDialogueStretchCuts = Math.max(maxDialogueStretchCuts, currentDialogueStretch);
    } else {
      currentDialogueStretch = 0;
    }

    const sceneTransitionPulse = round1(clamp(100 * Math.pow(0.76, cutsSinceTransition), 14, 100));
    const engagementScore = round1(clamp(
      action * 0.36 + cutDensityScore * 0.24 + sceneTransitionPulse * 0.22 + BEAT_ENGAGEMENT_BOOST[beat] +
      (cut.hasHookElement ? 14 : 0) - Math.max(0, dialogueLoadScore - 56) * 0.68,
      6, 100,
    ));

    const isPacingDip = engagementScore < bench.dipThreshold || (dialogueLoadScore >= 72 && action < 48);
    consecutiveMonotony = isPacingDip ? consecutiveMonotony + 1 : 0;
    cumulativeY += heightPx;
    const scrollOffsetPct = round1(clamp((cumulativeY / Math.max(1, totalScrollHeightPx)) * 100, 0, 100));
    const earlyWeight = scrollOffsetPct <= 25 && isFreeTierEpisode ? 1.18 : 1;
    const predictedDropoffRisk = round1(clamp((100 - engagementScore) * 0.72 * earlyWeight + Math.min(24, consecutiveMonotony * 6), 4, 98));

    rhythmCurve.push({
      cutId: cut.cutId, cutIndex: cut.cutIndex, scrollOffsetPct, cutDensityScore,
      dialogueLoadScore, sceneTransitionPulse, engagementScore, predictedDropoffRisk, isPacingDip,
    });
  }

  const pacingDipZones: PacingDipZone[] = [];
  let runStart = -1;
  for (let i = 0; i <= rhythmCurve.length; i += 1) {
    if (rhythmCurve[i]?.isPacingDip) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      if (i - runStart >= 2) {
        const slice = rhythmCurve.slice(runStart, i);
        const avgEngagement = round1(slice.reduce((s, p) => s + p.engagementScore, 0) / slice.length);
        const avgDialogueLoad = round1(slice.reduce((s, p) => s + p.dialogueLoadScore, 0) / slice.length);
        const severity: PacingDipSeverity = avgEngagement < 38 || i - runStart >= 4 ? "critical" : avgEngagement < 46 ? "warning" : "watch";
        const reason = buildDipReason(avgDialogueLoad, avgEngagement);
        pacingDipZones.push({
          zoneId: `ep${input.episodeNumber}-dip-${pacingDipZones.length + 1}`,
          startCutIndex: slice[0].cutIndex, endCutIndex: slice[slice.length - 1].cutIndex,
          startScrollPct: slice[0].scrollOffsetPct, endScrollPct: slice[slice.length - 1].scrollOffsetPct,
          severity, avgEngagement, avgDialogueLoad, reasonKo: reason.ko, reasonEn: reason.en,
        });
      }
      runStart = -1;
    }
  }

  const openingSlice = rhythmCurve.slice(0, Math.max(1, Math.min(4, Math.ceil(rhythmCurve.length * 0.25))));
  const openingAvg = openingSlice.reduce((s, p) => s + p.engagementScore, 0) / openingSlice.length;
  const earlyHookBonus = firstHookCutIndex !== null && firstHookCutIndex <= bench.openingHookCutoffCut
    ? 14 : firstHookCutIndex !== null && firstHookCutIndex <= bench.openingHookCutoffCut + 2 ? 4 : -16;
  const openingHookScore = round1(clamp(openingAvg + earlyHookBonus, 8, 100));

  const closingCount = Math.max(1, Math.min(2, rhythmCurve.length));
  const closingCuts = sortedCuts.slice(-closingCount);
  const closingCurve = rhythmCurve.slice(-closingCount);
  const lastCut = sortedCuts[sortedCuts.length - 1];
  const closingAvg = closingCurve.reduce((s, p) => s + p.engagementScore, 0) / closingCurve.length;
  const endsWithCliffhanger = lastCut.emotionalBeat === "cliffhanger" || lastCut.emotionalBeat === "reveal" || Boolean(lastCut.hasHookElement);
  const hasClosingTension = closingCuts.some((c) => c.emotionalBeat === "cliffhanger");
  const cliffhangerBoost = endsWithCliffhanger ? 18 : hasClosingTension ? 6 : -16;
  const cliffhangerScore = round1(clamp(closingAvg + cliffhangerBoost, 10, 100));

  const avgEngagementAll = rhythmCurve.reduce((s, p) => s + p.engagementScore, 0) / rhythmCurve.length;
  const dipCutRatio = rhythmCurve.filter((p) => p.isPacingDip).length / rhythmCurve.length;
  const pacingStabilityScore = round1(clamp(avgEngagementAll * 0.72 + (1 - dipCutRatio) * 38 - pacingDipZones.length * 5, 10, 100));
  const overallRetentionScore = round1(clamp(openingHookScore * 0.34 + pacingStabilityScore * 0.38 + cliffhangerScore * 0.28, 8, 100));
  const estimatedCompletionRatePct = round1(clamp(28 + overallRetentionScore * 0.68, 18, 96));
  const avgWordsPerCut = round1(totalWords / sortedCuts.length);
  const avgBalloonsPerCut = round1(totalBalloons / sortedCuts.length);
  const sceneTransitionRatePer10Cuts = round1((transitionCount / sortedCuts.length) * 10);

  const prescriptions: RetentionPrescription[] = [];
  if (openingHookScore < 66 || firstHookCutIndex === null || firstHookCutIndex > bench.openingHookCutoffCut) {
    const firstCut = sortedCuts[0].cutIndex;
    prescriptions.push({
      prescriptionId: `ep${input.episodeNumber}-rx-hook`, type: "pull-hook-forward",
      priority: isFreeTierEpisode ? "critical" : "high",
      targetCutRange: [firstCut, Math.min(sortedCuts[sortedCuts.length - 1].cutIndex, firstCut + 2)],
      titleKo: "후크 앞당김 (초반 3컷 갈등 선행 배치)", titleEn: "Pull Hook Forward (Opening 3 Cuts)",
      actionKo: firstHookCutIndex === null
        ? "회차 초반 1~3컷에 핵심 갈등·미스터리 이미지를 추가해 스크롤 정지 훅을 만드세요."
        : `${firstHookCutIndex}번 컷의 핵심 갈등 장면을 2~3번 컷으로 앞당겨 초기 이탈을 줄이세요.`,
      actionEn: firstHookCutIndex === null
        ? "Insert an inciting conflict or mystery beat within cuts 1-3 to stop early exits."
        : `Move the primary hook from cut ${firstHookCutIndex} forward into cuts 2-3.`,
      expectedDropReductionPct: 12.5,
    });
  }

  for (const zone of pacingDipZones) {
    if (zone.avgDialogueLoad >= 65) {
      prescriptions.push({
        prescriptionId: `${zone.zoneId}-rx-dialogue`, type: "trim-dialogue",
        priority: zone.severity === "critical" ? "critical" : "high",
        targetCutRange: [zone.startCutIndex, zone.endCutIndex],
        titleKo: `대사 축약 (${zone.startCutIndex}~${zone.endCutIndex}컷)`,
        titleEn: `Trim Dialogue (Cuts ${zone.startCutIndex}-${zone.endCutIndex})`,
        actionKo: "설명성 대사를 30~35% 덜어내고 컷당 말풍선을 2개 이하로 줄여 스크롤 속도를 회복하세요.",
        actionEn: "Trim exposition dialogue by 30-35% and cap balloons at 2 per cut to restore scroll pace.",
        expectedDropReductionPct: zone.severity === "critical" ? 11 : 7.5,
      });
    } else {
      prescriptions.push({
        prescriptionId: `${zone.zoneId}-rx-shift`, type: "inject-scene-shift",
        priority: zone.severity === "critical" ? "high" : "medium",
        targetCutRange: [zone.startCutIndex, zone.endCutIndex],
        titleKo: `장면 전환·리듬 환기 (${zone.startCutIndex}~${zone.endCutIndex}컷)`,
        titleEn: `Inject Scene Shift (Cuts ${zone.startCutIndex}-${zone.endCutIndex})`,
        actionKo: "정적인 투샷을 깨는 클로즈업·배경 인서트·시점 전환 1컷을 삽입해 리듬을 환기하세요.",
        actionEn: "Break the static stretch with a close-up, environment insert, or camera POV cut.",
        expectedDropReductionPct: 8,
      });
    }
  }

  const oversizedCut = sortedCuts.find((cut) => cut.panelHeightPx >= 1650 && cut.balloonCount >= 4);
  if (oversizedCut) {
    prescriptions.push({
      prescriptionId: `ep${input.episodeNumber}-rx-split-${oversizedCut.cutIndex}`, type: "split-cut", priority: "high",
      targetCutRange: [oversizedCut.cutIndex, oversizedCut.cutIndex],
      titleKo: `세로 장컷 분할 (${oversizedCut.cutIndex}컷)`, titleEn: `Split Tall Exposition Cut (Cut ${oversizedCut.cutIndex})`,
      actionKo: `${oversizedCut.panelHeightPx}px 장컷(말풍선 ${oversizedCut.balloonCount}개)을 리액션·손동작 2~3컷으로 쪼개 체감 템포를 높이세요.`,
      actionEn: `Split the ${oversizedCut.panelHeightPx}px cut (${oversizedCut.balloonCount} balloons) into 2-3 snappy reaction beats.`,
      expectedDropReductionPct: 6.5,
    });
  }

  if (cliffhangerScore < 68) {
    const lastIdx = sortedCuts[sortedCuts.length - 1].cutIndex;
    prescriptions.push({
      prescriptionId: `ep${input.episodeNumber}-rx-cliff`, type: "amplify-cliffhanger",
      priority: input.episodeNumber === 5 ? "critical" : "high",
      targetCutRange: [Math.max(sortedCuts[0].cutIndex, lastIdx - 1), lastIdx],
      titleKo: input.episodeNumber === 5 ? "유료 전환 직전 클리프행어 강화" : "엔딩 클리프행어 강도 보강",
      titleEn: input.episodeNumber === 5 ? "Amplify Pre-Paywall Cliffhanger" : "Amplify Ending Cliffhanger",
      actionKo: "마무리 정리 컷을 다음 화 직전의 위기·반전·결정적 질문 컷으로 교체해 다음 화 클릭률을 끌어올리세요.",
      actionEn: "Replace the calm wrap-up with an unresolved reveal, threat, or decisive question beat.",
      expectedDropReductionPct: input.episodeNumber === 5 ? 14 : 9.5,
    });
  }

  if (sceneTransitionRatePer10Cuts < bench.targetTransitionsPer10Cuts && prescriptions.every((p) => p.type !== "inject-scene-shift")) {
    const midIdx = sortedCuts[Math.floor(sortedCuts.length / 2)].cutIndex;
    prescriptions.push({
      prescriptionId: `ep${input.episodeNumber}-rx-cadence`, type: "inject-scene-shift", priority: "medium",
      targetCutRange: [midIdx, Math.min(sortedCuts[sortedCuts.length - 1].cutIndex, midIdx + 1)],
      titleKo: "장면 전환 빈도 보강", titleEn: "Increase Scene Transition Cadence",
      actionKo: `10컷당 장면 전환(${sceneTransitionRatePer10Cuts}회)이 장르 권장(${bench.targetTransitionsPer10Cuts}회)보다 낮습니다. 중반 전환 컷을 보태세요.`,
      actionEn: `Scene shifts (${sceneTransitionRatePer10Cuts}/10 cuts) trail the genre target (${bench.targetTransitionsPer10Cuts}). Add a mid-episode shift.`,
      expectedDropReductionPct: 5.5,
    });
  }

  return {
    episodeNumber: input.episodeNumber, isFreeTierEpisode, title: input.title.trim() || `EP.${input.episodeNumber}`,
    genre, cutCount: sortedCuts.length, totalScrollHeightPx, openingHookScore, cliffhangerScore,
    pacingStabilityScore, overallRetentionScore, riskLevel: resolveRiskLevel(overallRetentionScore),
    estimatedCompletionRatePct, calculationBasis: "heuristic-pacing-model",
    metrics: { avgWordsPerCut, avgBalloonsPerCut, sceneTransitionRatePer10Cuts, maxDialogueStretchCuts, firstHookCutIndex },
    rhythmCurve, pacingDipZones, prescriptions,
  };
}

/** 1~5화 무료 구간 전체를 종합 분석해 이탈 병목 회차와 유료 전환 준비도를 계산한다. */
export function analyzeFreeArcRetention(episodes: readonly EpisodeRetentionInput[]): FreeArcRetentionOverview {
  const episodeReports = episodes.map((ep) => analyzeEpisodeHookAndRetention(ep));
  const freeReports = episodeReports.filter((rep) => rep.isFreeTierEpisode);
  const scope = freeReports.length > 0 ? freeReports : episodeReports;
  if (scope.length === 0) {
    return {
      episodeReports: [], freeEpisodeCount: 0, averageRetentionScore: 0,
      bottleneckEpisodeNumber: null, paidWallReadinessScore: 0,
      summaryKo: "분석할 회차 데이터가 없습니다.", summaryEn: "No episodes provided for retention analysis.",
    };
  }
  const averageRetentionScore = round1(scope.reduce((sum, rep) => sum + rep.overallRetentionScore, 0) / scope.length);
  const bottleneck = [...scope].sort((a, b) => a.overallRetentionScore - b.overallRetentionScore)[0];
  const ep5 = scope.find((rep) => rep.episodeNumber === 5) ?? scope[scope.length - 1];
  const paidWallReadinessScore = round1(clamp(averageRetentionScore * 0.55 + ep5.cliffhangerScore * 0.45, 0, 100));
  return {
    episodeReports, freeEpisodeCount: freeReports.length, averageRetentionScore,
    bottleneckEpisodeNumber: bottleneck.episodeNumber, paidWallReadinessScore,
    summaryKo: `무료 ${scope.length}개 회차 평균 리텐션 ${averageRetentionScore}점 · 최대 이탈 위험은 ${bottleneck.episodeNumber}화(${bottleneck.overallRetentionScore}점) · 유료 전환 준비도 ${paidWallReadinessScore}점`,
    summaryEn: `${scope.length} episodes avg retention ${averageRetentionScore} · Primary bottleneck EP.${bottleneck.episodeNumber} (${bottleneck.overallRetentionScore}) · Paywall readiness ${paidWallReadinessScore}`,
  };
}

// ============================================================================
// BGM 웹툰 스크롤 연동 사운드트랙 & SFX 큐시트 엔진
// ============================================================================

export type BgmEasingCurve = "linear" | "equal-power" | "ease-in-out";
export type SfxCategory = "thunder" | "door-open" | "footsteps" | "impact" | "heartbeat" | "wind" | "custom";
export type BgmTrackPhase = "idle" | "fade-in" | "sustain" | "fade-out" | "crossfading";
export type BgmCueSheetPlatform = "toonstudio-v1" | "naver-bgm-spec" | "kakao-sound-spec" | "generic-webtoon";

export interface BgmTrackCue {
  readonly trackId: string; readonly title: string; readonly mood: string; readonly bpm: number;
  readonly audioAssetRef: string; readonly startY: number; readonly endY: number;
  readonly fadeInPx: number; readonly fadeOutPx: number; readonly targetVolume: number;
  readonly loop: boolean; readonly easing?: BgmEasingCurve;
}

export interface SfxTriggerCue {
  readonly sfxId: string; readonly cutId: string; readonly labelKo: string; readonly labelEn: string;
  readonly category: SfxCategory; readonly triggerY: number; readonly windowPx: number;
  readonly volume: number; readonly pan?: number; readonly cooldownMs: number;
  readonly audioAssetRef: string; readonly oneShot?: boolean;
}

export interface ScrollBgmEvaluationInput {
  readonly scrollY: number; readonly previousScrollY?: number; readonly viewportHeightPx?: number;
  readonly focalRatio?: number; readonly masterVolume?: number;
  readonly tracks: readonly BgmTrackCue[]; readonly sfxCues: readonly SfxTriggerCue[];
}

export interface ActiveBgmTrackState {
  readonly trackId: string; readonly title: string; readonly mood: string; readonly phase: BgmTrackPhase;
  readonly rawGain: number; readonly effectiveVolume: number; readonly progressPct: number;
  readonly overlapTrackIds: readonly string[];
}

export interface TriggeredSfxState {
  readonly sfxId: string; readonly cutId: string; readonly category: SfxCategory;
  readonly labelKo: string; readonly labelEn: string; readonly fired: boolean; readonly inAuditionZone: boolean;
  readonly distancePx: number; readonly effectiveVolume: number; readonly pan: number;
  readonly cooldownMs: number; readonly audioAssetRef: string;
}

export interface ScrollVolumeSamplePoint { readonly scrollY: number; readonly gains: Readonly<Record<string, number>>; }

export interface ScrollBgmEvaluationResult {
  readonly scrollY: number; readonly focalY: number; readonly scrollDirection: "down" | "up" | "stationary";
  readonly activeTracks: readonly ActiveBgmTrackState[]; readonly crossfadeActive: boolean;
  readonly dominantTrackId: string | null; readonly totalNormalizedGain: number;
  readonly sfxStates: readonly TriggeredSfxState[]; readonly firedSfxIds: readonly string[];
  readonly volumeCurvePreview: readonly ScrollVolumeSamplePoint[];
}

export interface BgmCueSheetExportInput {
  readonly workTitle: string; readonly episodeCode: string; readonly canvasHeightPx: number;
  readonly platform?: BgmCueSheetPlatform; readonly tracks: readonly BgmTrackCue[]; readonly sfxCues: readonly SfxTriggerCue[];
}

export interface BgmCueSheetExportResult {
  readonly schemaVersion: "toonstudio.bgm-cuesheet.v1"; readonly platform: BgmCueSheetPlatform;
  readonly filenameBase: string; readonly json: string; readonly csv: string;
  readonly summary: {
    readonly trackCount: number; readonly sfxCount: number;
    readonly crossfadeOverlapCount: number; readonly totalCoveragePct: number; readonly warnings: readonly string[];
  };
}

function shapeFade(t: number, easing: BgmEasingCurve, isFadeOut: boolean): number {
  const u = clamp(t, 0, 1);
  if (easing === "linear") return isFadeOut ? 1 - u : u;
  if (easing === "ease-in-out") {
    const smooth = u * u * (3 - 2 * u);
    return isFadeOut ? 1 - smooth : smooth;
  }
  return isFadeOut ? Math.cos((u * Math.PI) / 2) : Math.sin((u * Math.PI) / 2);
}

function evaluateSingleTrackAtFocalY(track: BgmTrackCue, focalY: number): { readonly phase: BgmTrackPhase; readonly rawGain: number; readonly progressPct: number } {
  const span = Math.max(1, track.endY - track.startY);
  if (focalY < track.startY || focalY > track.endY) {
    return { phase: "idle", rawGain: 0, progressPct: focalY < track.startY ? 0 : 100 };
  }
  const easing: BgmEasingCurve = track.easing ?? "equal-power";
  const targetVol = clamp(track.targetVolume, 0, 1);
  const fadeInPx = clamp(track.fadeInPx, 0, span);
  const fadeOutPx = clamp(track.fadeOutPx, 0, span);
  const distFromStart = focalY - track.startY;
  const distToEnd = track.endY - focalY;
  let inMul = 1;
  let outMul = 1;
  let phase: BgmTrackPhase = "sustain";
  if (fadeInPx > 0 && distFromStart < fadeInPx) { inMul = shapeFade(distFromStart / fadeInPx, easing, false); phase = "fade-in"; }
  if (fadeOutPx > 0 && distToEnd < fadeOutPx) { outMul = shapeFade(1 - distToEnd / fadeOutPx, easing, true); phase = distToEnd < distFromStart ? "fade-out" : phase; }
  return { phase, rawGain: round3(clamp(targetVol * inMul * outMul, 0, 1)), progressPct: round1(clamp((distFromStart / span) * 100, 0, 100)) };
}

/** 세로 스크롤 좌표(scrollY) 기준 BGM 페이드인/아웃·크로스페이드 볼륨과 컷 진입 SFX 트리거를 실시간 계산한다. */
export function evaluateScrollBgmTriggers(input: ScrollBgmEvaluationInput): ScrollBgmEvaluationResult {
  const scrollY = Math.max(0, Number.isFinite(input.scrollY) ? input.scrollY : 0);
  const focalOffset = Math.round(clamp(input.viewportHeightPx ?? 900, 320, 2400) * clamp(input.focalRatio ?? 0.35, 0.05, 0.95));
  const masterVolume = clamp(input.masterVolume ?? 1, 0, 1);
  const focalY = scrollY + focalOffset;
  const prevScroll = input.previousScrollY !== undefined ? Math.max(0, input.previousScrollY) : undefined;
  const prevFocalY = prevScroll !== undefined ? prevScroll + focalOffset : undefined;
  const scrollDirection: "down" | "up" | "stationary" = prevScroll === undefined || prevScroll === scrollY ? "stationary" : scrollY > prevScroll ? "down" : "up";

  const rawEvaluations = input.tracks.map((track) => ({ track, evalResult: evaluateSingleTrackAtFocalY(track, focalY) }));
  const activeIds = rawEvaluations.filter((item) => item.evalResult.rawGain > 0.001).map((item) => item.track.trackId);
  const crossfadeActive = activeIds.length >= 2;
  const sumRawGain = rawEvaluations.reduce((sum, item) => sum + item.evalResult.rawGain, 0);
  const clipScale = sumRawGain > 1 ? 1 / sumRawGain : 1;

  const activeTracks: ActiveBgmTrackState[] = rawEvaluations.map(({ track, evalResult }) => {
    const isActive = evalResult.rawGain > 0.001;
    return {
      trackId: track.trackId, title: track.title, mood: track.mood,
      phase: isActive && crossfadeActive ? "crossfading" : evalResult.phase,
      rawGain: evalResult.rawGain,
      effectiveVolume: round3(clamp(evalResult.rawGain * clipScale * masterVolume, 0, 1)),
      progressPct: evalResult.progressPct,
      overlapTrackIds: isActive ? activeIds.filter((id) => id !== track.trackId) : [],
    };
  });

  const dominantTrackId = [...activeTracks].filter((t) => t.effectiveVolume > 0).sort((a, b) => b.effectiveVolume - a.effectiveVolume)[0]?.trackId ?? null;
  const totalNormalizedGain = round3(activeTracks.reduce((sum, t) => sum + t.effectiveVolume, 0));

  const sfxStates: TriggeredSfxState[] = input.sfxCues.map((cue) => {
    const distancePx = Math.round(focalY - cue.triggerY);
    const inAuditionZone = Math.abs(distancePx) <= Math.max(40, cue.windowPx) / 2;
    const fired = prevFocalY !== undefined
      ? (prevFocalY < cue.triggerY && focalY >= cue.triggerY) || (!cue.oneShot && prevFocalY > cue.triggerY && focalY <= cue.triggerY)
      : inAuditionZone;
    return {
      sfxId: cue.sfxId, cutId: cue.cutId, category: cue.category, labelKo: cue.labelKo, labelEn: cue.labelEn,
      fired, inAuditionZone, distancePx,
      effectiveVolume: round3(clamp(cue.volume, 0, 1) * masterVolume),
      pan: round3(clamp(cue.pan ?? 0, -1, 1)), cooldownMs: Math.max(0, Math.round(cue.cooldownMs)), audioAssetRef: cue.audioAssetRef,
    };
  });

  const maxY = Math.max(1000, ...input.tracks.map((t) => t.endY), ...input.sfxCues.map((s) => s.triggerY + s.windowPx));
  const volumeCurvePreview: ScrollVolumeSamplePoint[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const sampleY = Math.round((maxY * i) / 12);
    const gains: Record<string, number> = {};
    for (const track of input.tracks) gains[track.trackId] = evaluateSingleTrackAtFocalY(track, sampleY).rawGain;
    volumeCurvePreview.push({ scrollY: sampleY, gains });
  }

  return {
    scrollY, focalY, scrollDirection, activeTracks, crossfadeActive, dominantTrackId,
    totalNormalizedGain, sfxStates, firedSfxIds: sfxStates.filter((s) => s.fired).map((s) => s.sfxId), volumeCurvePreview,
  };
}

function escapeCsvCell(raw: string | number | boolean): string {
  let str = String(raw);
  if (/^[=+\-@\t\r]/u.test(str) && !/^-\d+(\.\d+)?$/u.test(str)) str = `'${str}`;
  return /[",\r\n]/u.test(str) ? `"${str.replace(/"/gu, '""')}"` : str;
}

function slugifyCueName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9가-힣_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "webtoon-cuesheet";
}

/** 플랫폼 납품용 BGM·SFX 스크롤 큐시트 JSON 및 RFC4180 CSV를 출고한다. */
export function exportBgmCueSheet(input: BgmCueSheetExportInput): BgmCueSheetExportResult {
  const platform: BgmCueSheetPlatform = input.platform ?? "toonstudio-v1";
  const canvasHeightPx = Math.max(1, Math.round(input.canvasHeightPx));
  const sortedTracks = [...input.tracks].sort((a, b) => a.startY - b.startY);
  const sortedSfx = [...input.sfxCues].sort((a, b) => a.triggerY - b.triggerY);

  let crossfadeOverlapCount = 0;
  const warnings: string[] = [];
  for (let i = 0; i < sortedTracks.length; i += 1) {
    if (sortedTracks[i].endY <= sortedTracks[i].startY) warnings.push(`BGM ${sortedTracks[i].trackId}: invalid range`);
    for (let j = i + 1; j < sortedTracks.length; j += 1) {
      if (sortedTracks[j].startY < sortedTracks[i].endY) crossfadeOverlapCount += 1;
    }
  }
  for (const sfx of sortedSfx) {
    if (sfx.triggerY > canvasHeightPx) warnings.push(`SFX ${sfx.sfxId}: triggerY exceeds canvasHeightPx`);
  }

  const intervals: [number, number][] = sortedTracks
    .filter((t) => t.endY > t.startY)
    .map((t) => [clamp(t.startY, 0, canvasHeightPx), clamp(t.endY, 0, canvasHeightPx)]);
  let coveredPx = 0;
  if (intervals.length > 0) {
    let [curStart, curEnd] = intervals[0];
    for (let i = 1; i < intervals.length; i += 1) {
      const [nextStart, nextEnd] = intervals[i];
      if (nextStart <= curEnd) curEnd = Math.max(curEnd, nextEnd);
      else { coveredPx += curEnd - curStart; curStart = nextStart; curEnd = nextEnd; }
    }
    coveredPx += curEnd - curStart;
  }
  const totalCoveragePct = round1(clamp((coveredPx / canvasHeightPx) * 100, 0, 100));

  const payload = {
    schemaVersion: "toonstudio.bgm-cuesheet.v1" as const, platform, workTitle: input.workTitle,
    episodeCode: input.episodeCode, canvasHeightPx,
    bgmTracks: sortedTracks.map((t) => ({
      ...t, startPct: round1((t.startY / canvasHeightPx) * 100), endPct: round1((t.endY / canvasHeightPx) * 100),
      targetVolume: round3(clamp(t.targetVolume, 0, 1)), easing: t.easing ?? "equal-power",
    })),
    sfxCues: sortedSfx.map((s) => ({
      ...s, triggerPct: round1((s.triggerY / canvasHeightPx) * 100),
      volume: round3(clamp(s.volume, 0, 1)), pan: round3(clamp(s.pan ?? 0, -1, 1)), oneShot: Boolean(s.oneShot),
    })),
    summary: { trackCount: sortedTracks.length, sfxCount: sortedSfx.length, crossfadeOverlapCount, totalCoveragePct, warnings },
  };

  const rows: string[] = [
    "cue_type,cue_id,cut_or_mood,title,start_or_trigger_y,end_y,fade_in_px,fade_out_px,volume,pan,cooldown_ms,asset_ref",
    ...sortedTracks.map((t) =>
      ["BGM", t.trackId, t.mood, t.title, t.startY, t.endY, t.fadeInPx, t.fadeOutPx, round3(clamp(t.targetVolume, 0, 1)), 0, 0, t.audioAssetRef].map(escapeCsvCell).join(","),
    ),
    ...sortedSfx.map((s) =>
      ["SFX", s.sfxId, `${s.cutId}:${s.category}`, s.labelKo, s.triggerY, s.triggerY + s.windowPx, 0, 0, round3(clamp(s.volume, 0, 1)), round3(clamp(s.pan ?? 0, -1, 1)), s.cooldownMs, s.audioAssetRef].map(escapeCsvCell).join(","),
    ),
  ];

  return {
    schemaVersion: "toonstudio.bgm-cuesheet.v1", platform,
    filenameBase: `${slugifyCueName(input.workTitle)}-${slugifyCueName(input.episodeCode)}-${platform}`,
    json: JSON.stringify(payload, null, 2), csv: rows.join("\r\n"), summary: payload.summary,
  };
}

export const DEFAULT_FREE_ARC_EPISODES: readonly EpisodeRetentionInput[] = [
  {
    episodeNumber: 1, title: "1화 · 빗속의 첫 계약", genre: "action-fantasy",
    cuts: [
      { cutId: "ep1-c01", cutIndex: 1, panelHeightPx: 980, wordCount: 8, balloonCount: 1, actionIntensity: 86, isSceneTransition: true, emotionalBeat: "reveal", hasHookElement: true },
      { cutId: "ep1-c02", cutIndex: 2, panelHeightPx: 860, wordCount: 14, balloonCount: 2, actionIntensity: 78, emotionalBeat: "tension" },
      { cutId: "ep1-c03", cutIndex: 3, panelHeightPx: 1020, wordCount: 19, balloonCount: 2, actionIntensity: 70, isSceneTransition: true, emotionalBeat: "setup" },
      { cutId: "ep1-c04", cutIndex: 4, panelHeightPx: 1120, wordCount: 22, balloonCount: 2, actionIntensity: 62, emotionalBeat: "setup" },
      { cutId: "ep1-c05", cutIndex: 5, panelHeightPx: 920, wordCount: 15, balloonCount: 1, actionIntensity: 74, isSceneTransition: true, emotionalBeat: "tension" },
      { cutId: "ep1-c06", cutIndex: 6, panelHeightPx: 1050, wordCount: 12, balloonCount: 1, actionIntensity: 88, emotionalBeat: "cliffhanger", hasHookElement: true },
    ],
  },
  {
    episodeNumber: 2, title: "2화 · 길드 규약과 침묵의 복도", genre: "action-fantasy",
    cuts: [
      { cutId: "ep2-c01", cutIndex: 1, panelHeightPx: 1180, wordCount: 28, balloonCount: 3, actionIntensity: 42, emotionalBeat: "setup" },
      { cutId: "ep2-c02", cutIndex: 2, panelHeightPx: 1320, wordCount: 34, balloonCount: 3, actionIntensity: 34, emotionalBeat: "neutral" },
      { cutId: "ep2-c03", cutIndex: 3, panelHeightPx: 1780, wordCount: 52, balloonCount: 5, actionIntensity: 26, emotionalBeat: "neutral" },
      { cutId: "ep2-c04", cutIndex: 4, panelHeightPx: 1540, wordCount: 44, balloonCount: 4, actionIntensity: 28, emotionalBeat: "neutral" },
      { cutId: "ep2-c05", cutIndex: 5, panelHeightPx: 1420, wordCount: 38, balloonCount: 4, actionIntensity: 31, emotionalBeat: "neutral" },
      { cutId: "ep2-c06", cutIndex: 6, panelHeightPx: 940, wordCount: 14, balloonCount: 2, actionIntensity: 76, isSceneTransition: true, emotionalBeat: "reveal", hasHookElement: true },
      { cutId: "ep2-c07", cutIndex: 7, panelHeightPx: 1080, wordCount: 18, balloonCount: 2, actionIntensity: 46, emotionalBeat: "neutral" },
    ],
  },
  {
    episodeNumber: 3, title: "3화 · 옥상 추격전과 검은 문", genre: "thriller-mystery",
    cuts: [
      { cutId: "ep3-c01", cutIndex: 1, panelHeightPx: 920, wordCount: 11, balloonCount: 1, actionIntensity: 82, isSceneTransition: true, emotionalBeat: "tension", hasHookElement: true },
      { cutId: "ep3-c02", cutIndex: 2, panelHeightPx: 980, wordCount: 16, balloonCount: 2, actionIntensity: 74, emotionalBeat: "tension" },
      { cutId: "ep3-c03", cutIndex: 3, panelHeightPx: 1480, wordCount: 42, balloonCount: 4, actionIntensity: 30, emotionalBeat: "setup" },
      { cutId: "ep3-c04", cutIndex: 4, panelHeightPx: 1520, wordCount: 45, balloonCount: 4, actionIntensity: 28, emotionalBeat: "neutral" },
      { cutId: "ep3-c05", cutIndex: 5, panelHeightPx: 890, wordCount: 12, balloonCount: 1, actionIntensity: 84, isSceneTransition: true, emotionalBeat: "reveal" },
      { cutId: "ep3-c06", cutIndex: 6, panelHeightPx: 960, wordCount: 9, balloonCount: 1, actionIntensity: 90, emotionalBeat: "cliffhanger", hasHookElement: true },
    ],
  },
  {
    episodeNumber: 4, title: "4화 · 잊힌 서약의 대가", genre: "romance-drama",
    cuts: [
      { cutId: "ep4-c01", cutIndex: 1, panelHeightPx: 1080, wordCount: 18, balloonCount: 2, actionIntensity: 68, isSceneTransition: true, emotionalBeat: "tension", hasHookElement: true },
      { cutId: "ep4-c02", cutIndex: 2, panelHeightPx: 1120, wordCount: 24, balloonCount: 2, actionIntensity: 58, emotionalBeat: "setup" },
      { cutId: "ep4-c03", cutIndex: 3, panelHeightPx: 1040, wordCount: 22, balloonCount: 2, actionIntensity: 64, isSceneTransition: true, emotionalBeat: "humor" },
      { cutId: "ep4-c04", cutIndex: 4, panelHeightPx: 1160, wordCount: 25, balloonCount: 2, actionIntensity: 66, emotionalBeat: "tension" },
      { cutId: "ep4-c05", cutIndex: 5, panelHeightPx: 1020, wordCount: 15, balloonCount: 1, actionIntensity: 82, emotionalBeat: "cliffhanger", hasHookElement: true },
    ],
  },
  {
    episodeNumber: 5, title: "5화 · 유료 전환 직전, 봉인 해제", genre: "action-fantasy",
    cuts: [
      { cutId: "ep5-c01", cutIndex: 1, panelHeightPx: 940, wordCount: 12, balloonCount: 1, actionIntensity: 84, isSceneTransition: true, emotionalBeat: "tension", hasHookElement: true },
      { cutId: "ep5-c02", cutIndex: 2, panelHeightPx: 1020, wordCount: 16, balloonCount: 2, actionIntensity: 78, emotionalBeat: "tension" },
      { cutId: "ep5-c03", cutIndex: 3, panelHeightPx: 960, wordCount: 15, balloonCount: 2, actionIntensity: 80, isSceneTransition: true, emotionalBeat: "reveal" },
      { cutId: "ep5-c04", cutIndex: 4, panelHeightPx: 1260, wordCount: 26, balloonCount: 3, actionIntensity: 48, emotionalBeat: "setup" },
      { cutId: "ep5-c05", cutIndex: 5, panelHeightPx: 1240, wordCount: 28, balloonCount: 3, actionIntensity: 42, emotionalBeat: "neutral" },
    ],
  },
];

export const DEFAULT_BGM_TRACK_CUES: readonly BgmTrackCue[] = [
  { trackId: "bgm-rain-alley", title: "Rain Alley Nocturne", mood: "suspense", bpm: 84, audioAssetRef: "audio/bgm/ep03-rain-alley.ogg", startY: 0, endY: 5600, fadeInPx: 700, fadeOutPx: 1200, targetVolume: 0.78, loop: true, easing: "equal-power" },
  { trackId: "bgm-rooftop-chase", title: "Rooftop Pulse Chase", mood: "battle", bpm: 138, audioAssetRef: "audio/bgm/ep03-rooftop-chase.ogg", startY: 4400, endY: 11200, fadeInPx: 1200, fadeOutPx: 900, targetVolume: 0.88, loop: true, easing: "equal-power" },
];

export const DEFAULT_SFX_TRIGGER_CUES: readonly SfxTriggerCue[] = [
  { sfxId: "sfx-thunder-01", cutId: "ep3-c01", labelKo: "천둥 벼락", labelEn: "Thunder Crack", category: "thunder", triggerY: 1450, windowPx: 280, volume: 0.92, pan: -0.15, cooldownMs: 3200, audioAssetRef: "audio/sfx/thunder-crack.wav", oneShot: true },
  { sfxId: "sfx-door-02", cutId: "ep3-c03", labelKo: "철문 열림", labelEn: "Heavy Door Open", category: "door-open", triggerY: 4850, windowPx: 260, volume: 0.8, pan: 0.2, cooldownMs: 2400, audioAssetRef: "audio/sfx/iron-door-creak.wav", oneShot: false },
  { sfxId: "sfx-footsteps-03", cutId: "ep3-c05", labelKo: "젖은 옥상 발소리", labelEn: "Wet Rooftop Footsteps", category: "footsteps", triggerY: 7900, windowPx: 320, volume: 0.75, pan: 0.05, cooldownMs: 1400, audioAssetRef: "audio/sfx/wet-footsteps-run.wav", oneShot: false },
  { sfxId: "sfx-heartbeat-04", cutId: "ep3-c06", labelKo: "클리프행어 심장 박동", labelEn: "Cliffhanger Heartbeat", category: "heartbeat", triggerY: 10100, windowPx: 300, volume: 0.86, pan: 0, cooldownMs: 2800, audioAssetRef: "audio/sfx/heartbeat-deep.wav", oneShot: true },
];
