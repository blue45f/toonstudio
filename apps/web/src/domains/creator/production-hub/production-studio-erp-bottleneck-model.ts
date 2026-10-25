/**
 * 투니스트(Toonist / ATOON) 및 대형 웹툰 스튜디오 전용 ERP (재담미디어 · 케나즈 · 스피노프) 도메인 모델
 *
 * 1. 수십 편 동시 연재작 멀티트랙 ERP & 채색(Coloring)·공정 지연 실시간 레이더
 *    - 재담미디어 4대 사업 트랙(매니지먼트·프로덕션 투자제작·스튜디오 인하우스·글로벌 현지화)
 *    - 케나즈 7단계 사전제작(Pre-Production) 파이프라인(01 콘티 → 02 선화 → 03 컬러(채색) → 04 배경 → 05 후보정 → 06 편집 → 07 현지화)
 * 2. 어시스턴트 병목 현상(Bottleneck) 실시간 감지 및 1클릭 부하 분산 재배치 엔진
 *    - 스피노프 9대 전문 공정 파트 × 4대 DCC 툴(클립스튜디오·포토샵·스케치업·일러스트레이터) 숙련도 매칭
 * 3. 투니스트/에이툰(ATOON) 작가 연재 경력 자동 계산기, 3종 썸네일·파일럿 투고 규격 검증기 및 MG/RS 정산 원장
 */

export type StudioErpBusinessTrack =
  | "management"
  | "production-investment"
  | "inhouse-studio"
  | "global-localization";

export const STUDIO_ERP_TRACK_LABELS_KO: Readonly<Record<StudioErpBusinessTrack, string>> = {
  management: "웹툰 매니지먼트 (7단계)",
  "production-investment": "프로덕션 투자·제작 (10단계)",
  "inhouse-studio": "인하우스 스튜디오 (사전제작)",
  "global-localization": "글로벌 현지화·유통",
};

export type KenazSevenStageKey =
  | "01-storyboard"
  | "02-lineart"
  | "03-color"
  | "04-background"
  | "05-postprocess"
  | "06-editing"
  | "07-localization";

export const KENAZ_SEVEN_STAGE_LABELS_KO: Readonly<Record<KenazSevenStageKey, string>> = {
  "01-storyboard": "01 콘티",
  "02-lineart": "02 선화",
  "03-color": "03 컬러(채색)",
  "04-background": "04 배경·3D",
  "05-postprocess": "05 후보정",
  "06-editing": "06 편집·식자",
  "07-localization": "07 글로벌 현지화",
};

export const KENAZ_SEVEN_STAGE_ORDER: readonly KenazSevenStageKey[] = [
  "01-storyboard",
  "02-lineart",
  "03-color",
  "04-background",
  "05-postprocess",
  "06-editing",
  "07-localization",
] as const;

export interface SerializedSeriesErpEntry {
  readonly seriesId: string;
  readonly title: string;
  readonly track: StudioErpBusinessTrack;
  readonly platform: string;
  readonly serialDayOfWeek: "월" | "화" | "수" | "목" | "금" | "토" | "일";
  readonly currentEpisodeNumber: number;
  readonly preProductionBufferEpisodes: number;
  readonly currentStage: KenazSevenStageKey;
  readonly stageDelayHours: Readonly<Record<KenazSevenStageKey, number>>;
  readonly assignedColorAssistantId: string;
  readonly assignedLineAssistantId: string;
  readonly assignedBackgroundAssistantId: string;
  readonly pendingRedPenCount: number;
  readonly partnerCode: string | null;
}

export type SeriesDelaySeverity = "critical" | "warning" | "healthy";

export interface SeriesDelayDiagnosis {
  readonly seriesId: string;
  readonly title: string;
  readonly track: StudioErpBusinessTrack;
  readonly platform: string;
  readonly currentEpisodeNumber: number;
  readonly isColoringDelayed: boolean;
  readonly coloringDelayHours: number;
  readonly maxDelayedStage: KenazSevenStageKey | null;
  readonly maxDelayHours: number;
  readonly preProductionBufferEpisodes: number;
  readonly isBufferLow: boolean;
  readonly severity: SeriesDelaySeverity;
  readonly summaryKo: string;
}

/**
 * 동시 연재 중인 수십 편의 작품 중 채색(03-color) 또는 특정 공정이 밀리고 있는 작품과 사전제작 세이브 부족 작품을 진단한다.
 */
export function detectDelayedSeriesAndStages(
  seriesList: readonly SerializedSeriesErpEntry[],
  stageFilter: KenazSevenStageKey | "all" = "all",
): readonly SeriesDelayDiagnosis[] {
  return seriesList
    .map((series) => {
      const coloringDelayHours = Math.max(0, series.stageDelayHours["03-color"] ?? 0);
      const isColoringDelayed = coloringDelayHours > 0;

      let maxDelayedStage: KenazSevenStageKey | null = null;
      let maxDelayHours = 0;

      for (const stageKey of KENAZ_SEVEN_STAGE_ORDER) {
        const delay = Math.max(0, series.stageDelayHours[stageKey] ?? 0);
        if (delay > maxDelayHours) {
          maxDelayHours = delay;
          maxDelayedStage = stageKey;
        }
      }

      const isBufferLow = series.preProductionBufferEpisodes < 2;

      let severity: SeriesDelaySeverity = "healthy";
      if (coloringDelayHours >= 24 || maxDelayHours >= 24 || series.preProductionBufferEpisodes === 0) {
        severity = "critical";
      } else if (coloringDelayHours >= 6 || maxDelayHours >= 6 || isBufferLow) {
        severity = "warning";
      }

      const summaryParts: string[] = [];
      if (isColoringDelayed) {
        summaryParts.push(`채색 ${coloringDelayHours}시간 지연`);
      }
      if (maxDelayedStage && maxDelayedStage !== "03-color" && maxDelayHours > 0) {
        summaryParts.push(`${KENAZ_SEVEN_STAGE_LABELS_KO[maxDelayedStage]} ${maxDelayHours}시간 지연`);
      }
      if (isBufferLow) {
        summaryParts.push(`사전제작 세이브 ${series.preProductionBufferEpisodes}화 부족`);
      }

      return {
        seriesId: series.seriesId,
        title: series.title,
        track: series.track,
        platform: series.platform,
        currentEpisodeNumber: series.currentEpisodeNumber,
        isColoringDelayed,
        coloringDelayHours,
        maxDelayedStage,
        maxDelayHours,
        preProductionBufferEpisodes: series.preProductionBufferEpisodes,
        isBufferLow,
        severity,
        summaryKo: summaryParts.length > 0 ? summaryParts.join(" · ") : "전 공정 정상 가동",
      };
    })
    .filter((diag) => {
      if (stageFilter === "all") return true;
      const targetSeries = seriesList.find((s) => s.seriesId === diag.seriesId);
      if (!targetSeries) return false;
      return (targetSeries.stageDelayHours[stageFilter] ?? 0) > 0 || targetSeries.currentStage === stageFilter;
    });
}

export interface MultiSeriesFleetSummary {
  readonly totalSeriesCount: number;
  readonly coloringDelayedCount: number;
  readonly criticalSeriesCount: number;
  readonly lowBufferSeriesCount: number;
  readonly averageBufferEpisodes: number;
  readonly countsByTrack: Readonly<Record<StudioErpBusinessTrack, number>>;
}

/**
 * 스튜디오 전체 동시 연재작 파이프라인 지표를 요약한다.
 */
export function summarizeMultiSeriesErpFleet(
  seriesList: readonly SerializedSeriesErpEntry[],
): MultiSeriesFleetSummary {
  const diagnoses = detectDelayedSeriesAndStages(seriesList, "all");
  const countsByTrack: Record<StudioErpBusinessTrack, number> = {
    management: 0,
    "production-investment": 0,
    "inhouse-studio": 0,
    "global-localization": 0,
  };

  let totalBuffer = 0;
  for (const series of seriesList) {
    countsByTrack[series.track] += 1;
    totalBuffer += series.preProductionBufferEpisodes;
  }

  const totalSeriesCount = seriesList.length;
  const averageBufferEpisodes =
    totalSeriesCount > 0 ? Math.round((totalBuffer / totalSeriesCount) * 10) / 10 : 0;

  return {
    totalSeriesCount,
    coloringDelayedCount: diagnoses.filter((d) => d.isColoringDelayed).length,
    criticalSeriesCount: diagnoses.filter((d) => d.severity === "critical").length,
    lowBufferSeriesCount: diagnoses.filter((d) => d.isBufferLow).length,
    averageBufferEpisodes,
    countsByTrack,
  };
}

// ============================================================================
// 2. 어시스턴트 병목 현상(Bottleneck) 실시간 감지 및 부하 재배치 엔진
// ============================================================================

export type AssistantSpecialtyPart =
  | "script-conti"
  | "draw-conti"
  | "lineart"
  | "flat-color"
  | "shading"
  | "postprocess"
  | "background"
  | "typesetting"
  | "3d-asset";

export const ASSISTANT_PART_LABELS_KO: Readonly<Record<AssistantSpecialtyPart, string>> = {
  "script-conti": "글콘티",
  "draw-conti": "그림콘티",
  lineart: "선화",
  "flat-color": "밑색",
  shading: "명암·채색",
  postprocess: "후보정",
  background: "배경",
  typesetting: "식자",
  "3d-asset": "3D 소재",
};

export type AssistantDccTool = "clip-studio" | "photoshop" | "sketchup" | "illustrator";

export const ASSISTANT_DCC_LABELS_KO: Readonly<Record<AssistantDccTool, string>> = {
  "clip-studio": "클립스튜디오",
  photoshop: "포토샵",
  sketchup: "스케치업",
  illustrator: "일러스트레이터",
};

export interface StudioAssistantNode {
  readonly assistantId: string;
  readonly name: string;
  readonly primaryPart: AssistantSpecialtyPart;
  readonly dccTool: AssistantDccTool;
  readonly proficiency: "high" | "medium" | "low";
  readonly workMode: "remote" | "in-house";
  readonly availability: "immediate" | "negotiable" | "busy";
  readonly assignedSeriesIds: readonly string[];
  readonly wipCutCount: number;
  readonly dailyCapacityCuts: number;
  readonly openRevisionLoops: number;
  readonly ratePerEpisodeKrw: number;
}

export type BottleneckRootCause =
  | "wip-overload"
  | "revision-loop"
  | "multi-series-collision"
  | "none";

export interface AssistantBottleneckDiagnosis {
  readonly assistantId: string;
  readonly assistantName: string;
  readonly primaryPart: AssistantSpecialtyPart;
  readonly dccTool: AssistantDccTool;
  readonly assignedSeriesCount: number;
  readonly affectedSeriesTitles: readonly string[];
  readonly wipCutCount: number;
  readonly dailyCapacityCuts: number;
  readonly estimatedClearDays: number;
  readonly utilizationPercent: number;
  readonly bottleneckScore: number;
  readonly bottleneckLevel: "critical" | "warning" | "optimal" | "underutilized";
  readonly rootCause: BottleneckRootCause;
  readonly rootCauseLabelKo: string;
}

/**
 * 어시스턴트별 현재 할당 컷(WIP), 일일 처리 속도(cuts/day), 빨간펜 재수정 루프, 다작품 동시 배정 충돌을 분석해 병목 지수를 산출한다.
 */
export function analyzeAssistantBottlenecks(
  assistants: readonly StudioAssistantNode[],
  seriesList: readonly SerializedSeriesErpEntry[],
): readonly AssistantBottleneckDiagnosis[] {
  const seriesTitleMap = new Map(seriesList.map((s) => [s.seriesId, s.title]));

  return assistants.map((ast) => {
    const capacity = Math.max(1, ast.dailyCapacityCuts);
    const estimatedClearDays = Math.round((ast.wipCutCount / capacity) * 10) / 10;
    // 2일치 기준 용량을 100% 기준선으로 계산
    const twoDayCapacity = capacity * 2;
    const utilizationPercent = Math.round((ast.wipCutCount / twoDayCapacity) * 100);

    const seriesPenalty = Math.max(0, ast.assignedSeriesIds.length - 1) * 15;
    const revisionPenalty = ast.openRevisionLoops * 12;
    const rawScore = Math.round(utilizationPercent * 0.65 + seriesPenalty + revisionPenalty);
    const bottleneckScore = Math.max(0, Math.min(100, rawScore));

    let bottleneckLevel: AssistantBottleneckDiagnosis["bottleneckLevel"] = "optimal";
    if (bottleneckScore >= 85 || estimatedClearDays >= 3) {
      bottleneckLevel = "critical";
    } else if (bottleneckScore >= 65 || estimatedClearDays >= 2) {
      bottleneckLevel = "warning";
    } else if (utilizationPercent < 40) {
      bottleneckLevel = "underutilized";
    }

    let rootCause: BottleneckRootCause = "none";
    let rootCauseLabelKo = "정상 처리 범위";
    if (bottleneckLevel === "critical" || bottleneckLevel === "warning") {
      if (ast.openRevisionLoops >= 3) {
        rootCause = "revision-loop";
        rootCauseLabelKo = `빨간펜 재수정 루프(${ast.openRevisionLoops}회) 병목`;
      } else if (ast.assignedSeriesIds.length >= 3) {
        rootCause = "multi-series-collision";
        rootCauseLabelKo = `동시 ${ast.assignedSeriesIds.length}작품 마감 충돌 병목`;
      } else {
        rootCause = "wip-overload";
        rootCauseLabelKo = `잔여 ${ast.wipCutCount}컷 적체 (예상 ${estimatedClearDays}일 소요)`;
      }
    }

    const affectedSeriesTitles = ast.assignedSeriesIds.map(
      (id) => seriesTitleMap.get(id) ?? id,
    );

    return {
      assistantId: ast.assistantId,
      assistantName: ast.name,
      primaryPart: ast.primaryPart,
      dccTool: ast.dccTool,
      assignedSeriesCount: ast.assignedSeriesIds.length,
      affectedSeriesTitles,
      wipCutCount: ast.wipCutCount,
      dailyCapacityCuts: ast.dailyCapacityCuts,
      estimatedClearDays,
      utilizationPercent,
      bottleneckScore,
      bottleneckLevel,
      rootCause,
      rootCauseLabelKo,
    };
  });
}

export interface AssistantRebalanceResult {
  readonly rebalanced: boolean;
  readonly targetSeriesId: string | null;
  readonly fromAssistantId: string;
  readonly toAssistantId: string | null;
  readonly transferredCuts: number;
  readonly messageKo: string;
  readonly assistants: readonly StudioAssistantNode[];
  readonly seriesList: readonly SerializedSeriesErpEntry[];
}

/**
 * 병목 현상을 겪는 어시스턴트의 지연 작품을 동일·유사 파트 여유 어시스턴트에게 1클릭 분산 배정한다.
 */
export function recommendAssistantLoadRebalance(
  assistants: readonly StudioAssistantNode[],
  seriesList: readonly SerializedSeriesErpEntry[],
  overloadedAssistantId: string,
): AssistantRebalanceResult {
  const source = assistants.find((a) => a.assistantId === overloadedAssistantId);
  if (!source || source.assignedSeriesIds.length === 0) {
    return {
      rebalanced: false,
      targetSeriesId: null,
      fromAssistantId: overloadedAssistantId,
      toAssistantId: null,
      transferredCuts: 0,
      messageKo: "재배치할 배정 작품이 없습니다.",
      assistants,
      seriesList,
    };
  }

  const candidate = assistants
    .filter(
      (a) =>
        a.assistantId !== source.assistantId
        && (a.primaryPart === source.primaryPart
          || (source.primaryPart === "shading" && a.primaryPart === "flat-color")
          || (source.primaryPart === "flat-color" && a.primaryPart === "shading"))
        && a.proficiency !== "low",
    )
    .sort((a, b) => a.wipCutCount - b.wipCutCount)[0];

  if (!candidate) {
    return {
      rebalanced: false,
      targetSeriesId: null,
      fromAssistantId: overloadedAssistantId,
      toAssistantId: null,
      transferredCuts: 0,
      messageKo: "동일 파트에 투입 가능한 대체 어시스턴트가 없습니다.",
      assistants,
      seriesList,
    };
  }

  const targetSeriesId = source.assignedSeriesIds[source.assignedSeriesIds.length - 1] ?? null;
  if (!targetSeriesId) {
    return {
      rebalanced: false,
      targetSeriesId: null,
      fromAssistantId: overloadedAssistantId,
      toAssistantId: null,
      transferredCuts: 0,
      messageKo: "대상 작품을 찾을 수 없습니다.",
      assistants,
      seriesList,
    };
  }

  const transferredCuts = Math.min(24, Math.max(10, Math.round(source.wipCutCount * 0.35)));

  const nextAssistants = assistants.map((ast) => {
    if (ast.assistantId === source.assistantId) {
      return {
        ...ast,
        assignedSeriesIds: ast.assignedSeriesIds.filter((id) => id !== targetSeriesId),
        wipCutCount: Math.max(0, ast.wipCutCount - transferredCuts),
        openRevisionLoops: Math.max(0, ast.openRevisionLoops - 1),
      };
    }
    if (ast.assistantId === candidate.assistantId) {
      return {
        ...ast,
        assignedSeriesIds: ast.assignedSeriesIds.includes(targetSeriesId)
          ? ast.assignedSeriesIds
          : [...ast.assignedSeriesIds, targetSeriesId],
        wipCutCount: ast.wipCutCount + transferredCuts,
      };
    }
    return ast;
  });

  const nextSeriesList = seriesList.map((series) => {
    if (series.seriesId !== targetSeriesId) return series;
    const reducedColorDelay = Math.max(0, (series.stageDelayHours["03-color"] ?? 0) - 14);
    return {
      ...series,
      assignedColorAssistantId:
        source.primaryPart === "shading" || source.primaryPart === "flat-color"
          ? candidate.assistantId
          : series.assignedColorAssistantId,
      stageDelayHours: {
        ...series.stageDelayHours,
        "03-color": reducedColorDelay,
      },
    };
  });

  return {
    rebalanced: true,
    targetSeriesId,
    fromAssistantId: source.assistantId,
    toAssistantId: candidate.assistantId,
    transferredCuts,
    messageKo: `'${source.name}'의 병목 물량 ${transferredCuts}컷을 '${candidate.name}'(${ASSISTANT_DCC_LABELS_KO[candidate.dccTool]} 상급)에게 분산 재배치하여 채색 지연을 완화했습니다.`,
    assistants: nextAssistants,
    seriesList: nextSeriesList,
  };
}

// ============================================================================
// 3. 투니스트/에이툰(ATOON) 연재 경력 계산기, 투고 규격 검증기 & MG/RS 정산 원장
// ============================================================================

export interface ArtistCareerRecord {
  readonly workTitle: string;
  readonly startYearMonth: string; // YYYY-MM
  readonly endYearMonth: string; // YYYY-MM (inclusive)
}

export interface ArtistCareerSummary {
  readonly workCount: number;
  readonly totalMonths: number;
  readonly years: number;
  readonly remainingMonths: number;
  readonly formattedKo: string;
}

function parseYearMonthToIndex(ym: string): number | null {
  const match = /^(\d{4})-(\d{2})$/u.exec(ym.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

/**
 * 에이툰(ATOON `/creator/artist/`) 방식의 작가 연재 경력 기간(N년 M개월 · 총 K작품)을 자동 계산한다.
 */
export function computeArtistCareerSummary(
  records: readonly ArtistCareerRecord[],
): ArtistCareerSummary {
  let totalMonths = 0;
  let validWorks = 0;

  for (const rec of records) {
    const startIdx = parseYearMonthToIndex(rec.startYearMonth);
    const endIdx = parseYearMonthToIndex(rec.endYearMonth);
    if (startIdx !== null && endIdx !== null && endIdx >= startIdx) {
      totalMonths += endIdx - startIdx + 1;
      validWorks += 1;
    }
  }

  const years = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;

  return {
    workCount: validWorks,
    totalMonths,
    years,
    remainingMonths,
    formattedKo: `${years}년 ${remainingMonths}개월 (총 ${validWorks}작품)`,
  };
}

export interface AtoonSeriesSubmissionInput {
  readonly title: string;
  readonly genres: readonly string[];
  readonly hashtags: readonly string[];
  readonly synopsis: string;
  readonly expectedEpisodeCount: number;
  readonly allowKrJpStudioMatching: boolean;
  readonly bannerSizePx: { readonly width: number; readonly height: number; readonly sizeMb: number };
  readonly mainThumbSizePx: { readonly width: number; readonly height: number; readonly sizeMb: number };
  readonly episodeThumbSizePx: { readonly width: number; readonly height: number; readonly sizeMb: number };
  readonly sampleEpisodeCount: number;
}

export interface AtoonSubmissionValidationResult {
  readonly valid: boolean;
  readonly errorsKo: readonly string[];
}

/**
 * 에이툰(ATOON `/creator/series/`) 연재 작품 업로드 및 한·일 스튜디오 매칭 패키지의 필수 규격을 검증한다.
 * - 제목 30자 이내, 장르 1~7개, 해시태그 최대 3개, 줄거리 1000자 이내
 * - 3종 썸네일: 대표 배너(1920×1080), 메인(300×420), 회차(250×125), 각 2MB 이하
 */
export function validateAtoonSeriesSubmission(
  input: AtoonSeriesSubmissionInput,
): AtoonSubmissionValidationResult {
  const errorsKo: string[] = [];
  const trimmedTitle = input.title.trim();

  if (!trimmedTitle || trimmedTitle.length > 30) {
    errorsKo.push("작품 제목은 1자 이상 30자 이내여야 합니다.");
  }
  if (input.genres.length < 1 || input.genres.length > 7) {
    errorsKo.push("장르는 최소 1개 이상 최대 7개까지 선택해야 합니다.");
  }
  if (input.hashtags.length > 3) {
    errorsKo.push("핵심 #해시태그는 최대 3개까지만 등록할 수 있습니다.");
  }
  if (!input.synopsis.trim() || input.synopsis.trim().length > 1000) {
    errorsKo.push("줄거리는 1자 이상 1,000자 이내로 입력해야 합니다.");
  }
  if (input.expectedEpisodeCount < 1) {
    errorsKo.push("예상 회차수는 1화 이상이어야 합니다.");
  }
  if (
    input.bannerSizePx.width !== 1920
    || input.bannerSizePx.height !== 1080
    || input.bannerSizePx.sizeMb > 2
  ) {
    errorsKo.push("대표 배너 이미지는 1920×1080px (2MB 이하) 규격이어야 합니다.");
  }
  if (
    input.mainThumbSizePx.width !== 300
    || input.mainThumbSizePx.height !== 420
    || input.mainThumbSizePx.sizeMb > 2
  ) {
    errorsKo.push("메인 썸네일은 300×420px (2MB 이하) 규격이어야 합니다.");
  }
  if (
    input.episodeThumbSizePx.width !== 250
    || input.episodeThumbSizePx.height !== 125
    || input.episodeThumbSizePx.sizeMb > 2
  ) {
    errorsKo.push("회차 썸네일은 250×125px (2MB 이하) 규격이어야 합니다.");
  }
  if (input.sampleEpisodeCount < 1) {
    errorsKo.push("최소 1화 이상의 샘플 원고 이미지를 업로드해야 합니다.");
  }

  return {
    valid: errorsKo.length === 0,
    errorsKo,
  };
}

export interface StudioMgRsSettlementInput {
  readonly grossPlatformRevenueKrw: number;
  readonly minimumGuaranteePerEpisodeKrw: number;
  readonly episodeCount: number;
  readonly creatorRsPercent: number;
  readonly assistantLaborCostKrw: number;
}

export interface StudioMgRsSettlementResult {
  readonly totalMgKrw: number;
  readonly grossRsShareKrw: number;
  readonly excessRsPayoutKrw: number;
  readonly creatorGrossPayoutKrw: number;
  readonly creatorNetAfterAssistantKrw: number;
  readonly studioNetShareKrw: number;
}

/**
 * 스튜디오 표준 MG(미니멈 개런티) + RS(수익 배분율) 및 어시스턴트 공정비 정산액을 계산한다.
 */
export function computeStudioMgRsSettlement(
  input: StudioMgRsSettlementInput,
): StudioMgRsSettlementResult {
  const totalMgKrw = Math.max(0, input.minimumGuaranteePerEpisodeKrw * input.episodeCount);
  const clampedRs = Math.max(0, Math.min(100, input.creatorRsPercent));
  const grossRsShareKrw = Math.round((Math.max(0, input.grossPlatformRevenueKrw) * clampedRs) / 100);
  const excessRsPayoutKrw = Math.max(0, grossRsShareKrw - totalMgKrw);
  const creatorGrossPayoutKrw = totalMgKrw + excessRsPayoutKrw;
  const creatorNetAfterAssistantKrw = Math.max(
    0,
    creatorGrossPayoutKrw - Math.max(0, input.assistantLaborCostKrw),
  );
  const studioNetShareKrw = Math.max(
    0,
    input.grossPlatformRevenueKrw - creatorGrossPayoutKrw,
  );

  return {
    totalMgKrw,
    grossRsShareKrw,
    excessRsPayoutKrw,
    creatorGrossPayoutKrw,
    creatorNetAfterAssistantKrw,
    studioNetShareKrw,
  };
}
