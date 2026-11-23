/**
 * Wave 26B — 웹툰 제작사(CP) 50작품 통합 관제 Fleet QA 레이더(마감 위험·자동 QA·
 * Rights BOM 30일 만료·어시스턴트 과부하 재배치) 및 독자 반응·이탈 히트맵 원고 컷 역추적 엔진.
 */

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const roundTo = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

// === 1. CP 50작품 통합 관제 Fleet QA 레이더 ===

export type FleetPlatformName = "Naver" | "Kakao" | "Lezhin" | "WEBTOON" | "Piccoma";
export type AssistantSpecialty = "lineart" | "coloring" | "bg3d" | "lettering";
export type FleetRiskTier = "critical" | "high" | "watch" | "healthy";
export type FleetAlertCode =
  | "RIGHTS_BOM_EXPIRED" | "DEADLINE_CRITICAL" | "ASSISTANT_OVERLOAD" | "RIGHTS_BOM_EXPIRING_30D" | "QA_REGRESSION";

export interface FleetRightsBomAssetInput {
  readonly assetId: string; readonly assetName: string; readonly vendor: string;
  readonly licenseScope: string; readonly expiresAtIso: string;
}
export interface FleetAssistantAssignmentInput {
  readonly assistantId: string; readonly assistantName: string;
  readonly specialty: AssistantSpecialty; readonly allocatedLoadPct: number;
}
export interface FleetSeriesInput {
  readonly seriesId: string; readonly titleKo: string; readonly titleEn: string;
  readonly genreKo: string; readonly genreEn: string; readonly platform: FleetPlatformName;
  readonly episodeNumber: number; readonly leadArtist: string;
  readonly hoursToDeadline: number; readonly completionPct: number;
  readonly qaPassedChecks: number; readonly qaTotalChecks: number; readonly failedQaChecks: readonly string[];
  readonly rightsAssets: readonly FleetRightsBomAssetInput[];
  readonly assistantAssignments: readonly FleetAssistantAssignmentInput[];
}
export interface EvaluateFleetQaRadarInput {
  readonly referenceDateIso: string; readonly series: readonly FleetSeriesInput[];
  readonly rightsExpiryHorizonDays?: number; readonly assistantOverloadThresholdPct?: number;
}
export interface ExpiringRightsAssetRecord {
  readonly assetId: string; readonly assetName: string; readonly vendor: string;
  readonly licenseScope: string; readonly expiresAtIso: string; readonly daysRemaining: number; readonly expired: boolean;
}
export interface FleetAssistantLoadSummary {
  readonly assistantId: string; readonly assistantName: string; readonly specialty: AssistantSpecialty;
  readonly totalUtilizationPct: number; readonly assignedSeriesIds: readonly string[];
  readonly status: "critical-overload" | "overload-warning" | "balanced" | "available";
}
export interface AssistantRebalanceSuggestion {
  readonly fromAssistantId: string; readonly fromAssistantName: string; readonly fromUtilizationPct: number;
  readonly toAssistantId: string; readonly toAssistantName: string; readonly toUtilizationPct: number;
  readonly specialty: AssistantSpecialty; readonly suggestedTransferLoadPct: number; readonly targetSeriesId: string;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface SeriesFleetRiskRecord {
  readonly seriesId: string; readonly titleKo: string; readonly titleEn: string;
  readonly genreKo: string; readonly genreEn: string; readonly platform: FleetPlatformName;
  readonly episodeNumber: number; readonly leadArtist: string; readonly hoursToDeadline: number; readonly completionPct: number;
  readonly deadlineRiskScore: number; readonly qaPassRatePct: number; readonly failedQaChecks: readonly string[];
  readonly expiringRightsAssets30d: readonly ExpiringRightsAssetRecord[]; readonly expiredRightsCount: number;
  readonly peakAssistantUtilizationPct: number; readonly overloadedAssistantIds: readonly string[];
  readonly compositePriorityScore: number; readonly riskTier: FleetRiskTier;
  readonly recommendedActionKo: string; readonly recommendedActionEn: string;
}
export interface FleetQaAlert {
  readonly alertId: string; readonly code: FleetAlertCode; readonly severity: "critical" | "warn";
  readonly affectedCount: number; readonly sampleSeriesIds: readonly string[];
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
}
export interface StudioFleetQaRadarReport {
  readonly evaluatedAtIso: string; readonly rightsExpiryHorizonDays: number; readonly totalSeriesCount: number;
  readonly tierCounts: Readonly<Record<FleetRiskTier, number>>; readonly averageQaPassRatePct: number;
  readonly totalExpiringRightsAssets30d: number; readonly expiredRightsAssetCount: number;
  readonly seriesWithExpiringRightsCount: number; readonly totalAssistantCount: number;
  readonly overloadedAssistantCount: number; readonly averageAssistantUtilizationPct: number;
  readonly assistantDirectory: readonly FleetAssistantLoadSummary[];
  readonly rebalancingSuggestions: readonly AssistantRebalanceSuggestion[];
  readonly alerts: readonly FleetQaAlert[]; readonly priorityQueue: readonly SeriesFleetRiskRecord[];
}

const MS_PER_DAY = 86_400_000;

function computeDeadlineRisk(hoursToDeadline: number, completionPct: number): number {
  const remainingWork = clamp(100 - completionPct, 0, 100);
  if (remainingWork <= 1) return 4;
  if (hoursToDeadline <= 0) return 100;
  const urgency = hoursToDeadline <= 12 ? 1.45 : hoursToDeadline <= 24 ? 1.25 : hoursToDeadline <= 48 ? 1.05 : 0.8;
  return roundTo(clamp((remainingWork / hoursToDeadline) * 22 * urgency + (hoursToDeadline <= 18 && remainingWork >= 15 ? 24 : 0), 0, 100), 1);
}

/** 50개 연재작의 마감 위험·자동 QA·Rights BOM 30일 만료·어시스턴트 과부하를 단일 관제 모델로 집계한다. */
export function evaluateStudioFleetQaRadar(input: EvaluateFleetQaRadarInput): StudioFleetQaRadarReport {
  const horizonDays = clamp(Math.round(input.rightsExpiryHorizonDays ?? 30), 7, 90);
  const overloadThreshold = clamp(Math.round(input.assistantOverloadThresholdPct ?? 95), 80, 120);
  const parsedRef = Date.parse(input.referenceDateIso);
  const refMs = Number.isNaN(parsedRef) ? Date.parse("2026-11-23T12:00:00Z") : parsedRef;

  const staffMap = new Map<string, { id: string; name: string; spec: AssistantSpecialty; load: number; series: string[] }>();
  for (const s of input.series) {
    for (const a of s.assistantAssignments) {
      const prev = staffMap.get(a.assistantId);
      if (prev) {
        prev.load += a.allocatedLoadPct;
        if (!prev.series.includes(s.seriesId)) prev.series.push(s.seriesId);
      } else {
        staffMap.set(a.assistantId, { id: a.assistantId, name: a.assistantName, spec: a.specialty, load: a.allocatedLoadPct, series: [s.seriesId] });
      }
    }
  }

  const assistantDirectory: FleetAssistantLoadSummary[] = Array.from(staffMap.values())
    .map((a): FleetAssistantLoadSummary => {
      const total = roundTo(a.load, 1);
      const status: FleetAssistantLoadSummary["status"] = total >= overloadThreshold + 15
        ? "critical-overload" : total >= overloadThreshold ? "overload-warning" : total <= 75 ? "available" : "balanced";
      return { assistantId: a.id, assistantName: a.name, specialty: a.spec, totalUtilizationPct: total, assignedSeriesIds: a.series, status };
    })
    .sort((a, b) => b.totalUtilizationPct - a.totalUtilizationPct || a.assistantId.localeCompare(b.assistantId));
  const assistantById = new Map(assistantDirectory.map((a) => [a.assistantId, a]));

  const evaluated: SeriesFleetRiskRecord[] = input.series.map((s) => {
    const deadlineRiskScore = computeDeadlineRisk(s.hoursToDeadline, s.completionPct);
    const qaPassRatePct = s.qaTotalChecks > 0 ? roundTo(clamp((s.qaPassedChecks / s.qaTotalChecks) * 100, 0, 100), 1) : 100;
    const expiring: ExpiringRightsAssetRecord[] = [];
    for (const asset of s.rightsAssets) {
      const expMs = Date.parse(asset.expiresAtIso);
      if (Number.isNaN(expMs)) continue;
      const daysRemaining = Math.ceil((expMs - refMs) / MS_PER_DAY);
      if (daysRemaining <= horizonDays) {
        expiring.push({ ...asset, daysRemaining, expired: daysRemaining <= 0 });
      }
    }
    expiring.sort((a, b) => a.daysRemaining - b.daysRemaining || a.assetId.localeCompare(b.assetId));
    const expiredRightsCount = expiring.filter((a) => a.expired).length;
    const rightsRisk = clamp(
      expiredRightsCount * 55 + expiring.filter((a) => !a.expired && a.daysRemaining <= 7).length * 28 + expiring.filter((a) => a.daysRemaining > 7).length * 14,
      0, 100,
    );

    let peakUtil = 0;
    const overloadedIds: string[] = [];
    for (const a of s.assistantAssignments) {
      const load = assistantById.get(a.assistantId)?.totalUtilizationPct ?? a.allocatedLoadPct;
      if (load > peakUtil) peakUtil = load;
      if (load >= overloadThreshold && !overloadedIds.includes(a.assistantId)) overloadedIds.push(a.assistantId);
    }
    const overloadRisk = peakUtil >= overloadThreshold ? clamp((peakUtil - overloadThreshold + 12) * 2.1, 0, 100) : 0;
    const compositePriorityScore = roundTo(
      clamp(deadlineRiskScore * 0.36 + (100 - qaPassRatePct) * 1.15 + rightsRisk * 0.3 + overloadRisk * 0.22 + (expiredRightsCount > 0 ? 18 : 0), 0, 100),
      1,
    );
    const riskTier: FleetRiskTier = compositePriorityScore >= 72 || expiredRightsCount > 0 || deadlineRiskScore >= 85
      ? "critical" : compositePriorityScore >= 48 ? "high" : compositePriorityScore >= 25 ? "watch" : "healthy";

    let actionKo = "정상 공정 유지 · 마감 전 최종 자동 QA 확인";
    let actionEn = "On track · run final automated QA before delivery";
    if (expiredRightsCount > 0) {
      actionKo = `만료된 Rights BOM 에셋 ${expiredRightsCount}건 즉시 갱신 또는 대체 에셋 교체 필요`;
      actionEn = `Renew or replace ${expiredRightsCount} expired Rights BOM asset(s) immediately`;
    } else if (deadlineRiskScore >= 75) {
      actionKo = `마감 ${s.hoursToDeadline}시간 전(공정 ${s.completionPct}%) · 여유 어시스턴트 긴급 투입 권고`;
      actionEn = `${s.hoursToDeadline}h to deadline (${s.completionPct}% done) · reinforce with available assistant`;
    } else if (qaPassRatePct < 88) {
      actionKo = `자동 QA 통과율 ${qaPassRatePct}% · 실패 항목(${s.failedQaChecks.slice(0, 2).join(", ")}) 우선 수정`;
      actionEn = `QA pass rate ${qaPassRatePct}% · fix ${s.failedQaChecks.slice(0, 2).join(", ")} first`;
    } else if (overloadedIds.length > 0) {
      actionKo = `배정 어시스턴트 가동률 ${peakUtil}% 과부하 · 동일 파트 인력 분산 권고`;
      actionEn = `Assigned assistant at ${peakUtil}% load · rebalance within specialty`;
    } else if (expiring.length > 0) {
      actionKo = `30일 내 Rights BOM 만료 예정 ${expiring.length}건(최소 D-${expiring[0]?.daysRemaining ?? 0}) 사전 갱신`;
      actionEn = `Pre-renew ${expiring.length} Rights BOM asset(s) expiring within 30d (min D-${expiring[0]?.daysRemaining ?? 0})`;
    }

    return {
      seriesId: s.seriesId, titleKo: s.titleKo, titleEn: s.titleEn, genreKo: s.genreKo, genreEn: s.genreEn,
      platform: s.platform, episodeNumber: s.episodeNumber, leadArtist: s.leadArtist,
      hoursToDeadline: s.hoursToDeadline, completionPct: s.completionPct, deadlineRiskScore, qaPassRatePct,
      failedQaChecks: s.failedQaChecks, expiringRightsAssets30d: expiring, expiredRightsCount,
      peakAssistantUtilizationPct: roundTo(peakUtil, 1), overloadedAssistantIds: overloadedIds,
      compositePriorityScore, riskTier, recommendedActionKo: actionKo, recommendedActionEn: actionEn,
    };
  });

  const priorityQueue = evaluated.sort(
    (a, b) => b.compositePriorityScore - a.compositePriorityScore || a.hoursToDeadline - b.hoursToDeadline || a.seriesId.localeCompare(b.seriesId),
  );

  const rebalancingSuggestions: AssistantRebalanceSuggestion[] = [];
  const overloadedStaff = assistantDirectory.filter((a) => a.totalUtilizationPct >= overloadThreshold + 5);
  const availableStaff = assistantDirectory.filter((a) => a.totalUtilizationPct <= 78);
  const usedTargets = new Set<string>();
  for (const src of overloadedStaff) {
    const match = availableStaff.find((c) => c.specialty === src.specialty && !usedTargets.has(c.assistantId));
    if (!match) continue;
    usedTargets.add(match.assistantId);
    const transfer = Math.min(Math.max(10, Math.round((src.totalUtilizationPct - 85) / 2)), Math.max(10, Math.round(90 - match.totalUtilizationPct)), 35);
    const targetSeriesId = src.assignedSeriesIds[0] ?? "CP-01";
    rebalancingSuggestions.push({
      fromAssistantId: src.assistantId, fromAssistantName: src.assistantName, fromUtilizationPct: src.totalUtilizationPct,
      toAssistantId: match.assistantId, toAssistantName: match.assistantName, toUtilizationPct: match.totalUtilizationPct,
      specialty: src.specialty, suggestedTransferLoadPct: transfer, targetSeriesId,
      summaryKo: `${src.assistantName}(${src.totalUtilizationPct}%) → ${match.assistantName}(${match.totalUtilizationPct}%)에게 ${targetSeriesId} ${src.specialty} ${transfer}% 이관`,
      summaryEn: `Shift ${transfer}% ${src.specialty} on ${targetSeriesId} from ${src.assistantName} (${src.totalUtilizationPct}%) to ${match.assistantName} (${match.totalUtilizationPct}%)`,
    });
  }

  const tierCounts: Record<FleetRiskTier, number> = { critical: 0, high: 0, watch: 0, healthy: 0 };
  let qaSum = 0; let totalExpiring = 0; let expiredTotal = 0; let seriesWithExpiring = 0;
  for (const r of priorityQueue) {
    tierCounts[r.riskTier] += 1; qaSum += r.qaPassRatePct;
    totalExpiring += r.expiringRightsAssets30d.length; expiredTotal += r.expiredRightsCount;
    if (r.expiringRightsAssets30d.length > 0) seriesWithExpiring += 1;
  }
  const overloadedCount = assistantDirectory.filter((a) => a.totalUtilizationPct >= overloadThreshold).length;
  const avgUtil = assistantDirectory.length > 0
    ? roundTo(assistantDirectory.reduce((sum, a) => sum + a.totalUtilizationPct, 0) / assistantDirectory.length, 1) : 0;

  const alerts: FleetQaAlert[] = [];
  const pushAlert = (
    alertId: string, code: FleetAlertCode, severity: "critical" | "warn", affectedCount: number,
    sample: readonly SeriesFleetRiskRecord[], titleKo: string, titleEn: string, detailKo: string, detailEn: string,
  ): void => {
    alerts.push({ alertId, code, severity, affectedCount, sampleSeriesIds: sample.slice(0, 4).map((s) => s.seriesId), titleKo, titleEn, detailKo, detailEn });
  };
  const expiredSeries = priorityQueue.filter((r) => r.expiredRightsCount > 0);
  if (expiredSeries.length > 0) {
    pushAlert("alert-rights-expired", "RIGHTS_BOM_EXPIRED", "critical", expiredTotal, expiredSeries,
      `만료된 Rights BOM 에셋 ${expiredTotal}건 출고 차단`, `${expiredTotal} expired Rights BOM asset(s) blocking release`,
      `${expiredSeries.length}개 작품에서 만료 에셋 감지 · 즉시 갱신 필요`, `Expired assets across ${expiredSeries.length} series require renewal.`);
  }
  const deadlineCrit = priorityQueue.filter((r) => r.deadlineRiskScore >= 75);
  if (deadlineCrit.length > 0) {
    pushAlert("alert-deadline-critical", "DEADLINE_CRITICAL", "critical", deadlineCrit.length, deadlineCrit,
      `마감 임박 고위험 작품 ${deadlineCrit.length}편`, `${deadlineCrit.length} series at imminent deadline risk`,
      `잔여 공정 대비 마감 시간 부족 · 긴급 어시 투입 필요`, `${deadlineCrit.length} episodes trail deadline velocity.`);
  }
  if (overloadedCount > 0) {
    const overSeries = priorityQueue.filter((r) => r.overloadedAssistantIds.length > 0);
    pushAlert("alert-assistant-overload", "ASSISTANT_OVERLOAD", "critical", overloadedCount, overSeries,
      `어시스턴트 과부하 ${overloadedCount}명 (${overloadThreshold}%+)`, `${overloadedCount} assistant(s) overloaded (>= ${overloadThreshold}%)`,
      `다작품 병행 과부하 ${overloadedCount}명 · 재배치안 ${rebalancingSuggestions.length}건`, `${overloadedCount} staff exceed threshold · ${rebalancingSuggestions.length} rebalance plan(s).`);
  }
  const exp30 = priorityQueue.filter((r) => r.expiringRightsAssets30d.some((a) => !a.expired));
  if (exp30.length > 0) {
    pushAlert("alert-rights-30d", "RIGHTS_BOM_EXPIRING_30D", "warn", totalExpiring - expiredTotal, exp30,
      `${horizonDays}일 내 Rights BOM 만료 예정 ${totalExpiring - expiredTotal}건`, `${totalExpiring - expiredTotal} Rights BOM asset(s) expiring within ${horizonDays}d`,
      `${exp30.length}개 작품 라이선스 ${horizonDays}일 내 만료 예정`, `Licenses across ${exp30.length} series expire within ${horizonDays} days.`);
  }
  const qaReg = priorityQueue.filter((r) => r.qaPassRatePct < 88);
  if (qaReg.length > 0) {
    pushAlert("alert-qa-regression", "QA_REGRESSION", "warn", qaReg.length, qaReg,
      `자동 QA 미달(<88%) ${qaReg.length}편`, `${qaReg.length} series below 88% auto-QA`,
      `말풍선·슬라이스·해상도 경고 집중 작품군`, `Balloon, seam-slice, or resolution warnings detected.`);
  }

  return {
    evaluatedAtIso: new Date(refMs).toISOString(), rightsExpiryHorizonDays: horizonDays,
    totalSeriesCount: priorityQueue.length, tierCounts,
    averageQaPassRatePct: priorityQueue.length > 0 ? roundTo(qaSum / priorityQueue.length, 1) : 100,
    totalExpiringRightsAssets30d: totalExpiring, expiredRightsAssetCount: expiredTotal,
    seriesWithExpiringRightsCount: seriesWithExpiring, totalAssistantCount: assistantDirectory.length,
    overloadedAssistantCount: overloadedCount, averageAssistantUtilizationPct: avgUtil,
    assistantDirectory, rebalancingSuggestions, alerts, priorityQueue,
  };
}

/** CP 스튜디오 50작품 통합 관제 데모 픽스처(마감 위험·30일 만료 Rights BOM·어시 과부하 포함)를 생성한다. */
export function createDemoStudioFleet50Series(referenceDateIso = "2026-11-23T12:00:00Z"): EvaluateFleetQaRadarInput {
  const refMs = Date.parse(referenceDateIso);
  const isoDays = (d: number): string => new Date(refMs + d * MS_PER_DAY).toISOString();
  const platforms: readonly FleetPlatformName[] = ["Naver", "Kakao", "Lezhin", "WEBTOON", "Piccoma"];
  const genres: readonly (readonly [string, string])[] = [
    ["판타지", "Fantasy"], ["로맨스판타지", "RomFan"], ["액션", "Action"],
    ["현대드라마", "Drama"], ["무협", "Murim"], ["스릴러", "Thriller"],
  ];
  const titlesKo = ["별빛 회귀자", "잿빛 공녀의 서약", "서울 지하철 9호선", "검성 학원", "심야 서점 일지", "붉은 달의 계약", "천마 재림기", "유리 정원의 비밀", "철혈 기사단", "네온 추격자"];
  const titlesEn = ["Starlight Regressor", "Ashen Duchess", "Seoul Line 9", "Sword Academy", "Midnight Bookstore", "Crimson Moon Pact", "Heavenly Demon", "Glass Garden", "Iron Knights", "Neon Chaser"];
  const qaIssues = ["balloon-overflow", "slice-seam-cut", "dpi-below-300", "c2pa-missing", "sfx-clipping"];
  const specialties: readonly AssistantSpecialty[] = ["lineart", "coloring", "bg3d", "lettering"];

  const series: FleetSeriesInput[] = Array.from({ length: 50 }, (_, idx) => {
    const num = idx + 1;
    const g = genres[idx % genres.length] ?? ["판타지", "Fantasy"];
    const season = Math.floor(idx / 10) + 1;
    const tight = num <= 4 || num === 11 || num === 23;
    const hoursToDeadline = num === 1 ? 6 : num === 2 ? 10 : tight ? 16 + (num % 5) * 3 : 36 + ((num * 11) % 108);
    const completionPct = num === 1 ? 64 : num === 2 ? 71 : tight ? 78 : clamp(84 + ((num * 7) % 16), 80, 99);
    const qaFailsCount = num === 1 || num === 3 || num === 14 ? 4 : num % 9 === 0 ? 3 : num % 5 === 0 ? 1 : 0;

    const rightsAssets: FleetRightsBomAssetInput[] = [
      { assetId: `rb-base-${num}`, assetName: `Studio Brush #${(num % 6) + 1}`, vendor: "ToonStudio Market", licenseScope: "Global Commercial", expiresAtIso: isoDays(180 + num) },
    ];
    if (num === 2 || num === 17) {
      rightsAssets.push({ assetId: `rb-exp-${num}`, assetName: `ACON3D Palace v${num}`, vendor: "ACON3D", licenseScope: "Web Serial", expiresAtIso: isoDays(-2) });
    } else if (num % 6 === 0 || num === 1 || num === 5) {
      rightsAssets.push({ assetId: `rb-warn-${num}`, assetName: `Commercial Serif #${num}`, vendor: "FoundryKR", licenseScope: "Global + Print", expiresAtIso: isoDays(4 + ((num * 5) % 24)) });
    }

    const primaryIdx = idx < 12 ? (idx % 4) + 1 : 5 + (idx % 16);
    const secondaryIdx = 17 + (idx % 8);
    return {
      seriesId: `CP-${String(num).padStart(2, "0")}`,
      titleKo: `${titlesKo[idx % titlesKo.length] ?? "연재작"} S${season}`,
      titleEn: `${titlesEn[idx % titlesEn.length] ?? "Series"} S${season}`,
      genreKo: g[0], genreEn: g[1], platform: platforms[idx % platforms.length] ?? "Naver",
      episodeNumber: 12 + ((num * 3) % 68), leadArtist: `Artist-${String((idx % 18) + 1).padStart(2, "0")}`,
      hoursToDeadline, completionPct, qaPassedChecks: 20 - qaFailsCount, qaTotalChecks: 20,
      failedQaChecks: qaIssues.slice(0, qaFailsCount), rightsAssets,
      assistantAssignments: [
        { assistantId: `AST-${String(primaryIdx).padStart(2, "0")}`, assistantName: `어시-${String(primaryIdx).padStart(2, "0")}`, specialty: specialties[idx % 4] ?? "coloring", allocatedLoadPct: idx < 12 ? 38 : 26 },
        { assistantId: `AST-${String(secondaryIdx).padStart(2, "0")}`, assistantName: `어시-${String(secondaryIdx).padStart(2, "0")}`, specialty: specialties[(idx + 2) % 4] ?? "bg3d", allocatedLoadPct: idx % 3 === 0 ? 18 : 14 },
      ],
    };
  });
  return { referenceDateIso, series, rightsExpiryHorizonDays: 30, assistantOverloadThresholdPct: 95 };
}

// === 2. 독자 반응·이탈 히트맵 원고 컷 역추적 오버레이 ===

export type ManuscriptCutRole = "opening" | "dialogue" | "action" | "reveal" | "cliffhanger";
export type ReaderHeatClass = "viral-peak" | "engaged" | "neutral" | "pacing-drag" | "dropoff-cliff";
export type HeatmapSemanticTone = "good" | "accent" | "warn" | "bad";
export type DirectingRecommendationCategory = "opening-hook" | "dialogue-pacing" | "cut-rhythm" | "cliffhanger-payoff" | "viral-callback";

export interface ManuscriptCutCoordinate {
  readonly cutId: string; readonly cutIndex: number; readonly yStartPx: number; readonly yEndPx: number;
  readonly cutRole: ManuscriptCutRole; readonly dialogueWordCount: number; readonly balloonCount: number; readonly visualComplexity01: number;
}
export interface CutReaderTelemetryInput {
  readonly cutId: string; readonly commentCount: number; readonly dropOffRatePct: number;
  readonly avgDwellSeconds: number; readonly reReadRatePct: number; readonly scrollBackCount: number; readonly topKeywords?: readonly string[];
}
export interface CorrelateReaderHeatmapInput {
  readonly episodeId: string; readonly workTitle: string; readonly episodeNumber: number;
  readonly totalCanvasHeightPx: number; readonly cuts: readonly ManuscriptCutCoordinate[]; readonly reactions: readonly CutReaderTelemetryInput[];
}
export interface CutHeatmapOverlayRecord {
  readonly cutId: string; readonly cutIndex: number; readonly cutRole: ManuscriptCutRole;
  readonly yStartPx: number; readonly yEndPx: number; readonly heightPx: number;
  readonly normalizedStartPct: number; readonly normalizedEndPct: number;
  readonly dialogueWordCount: number; readonly balloonCount: number; readonly dialogueDensityPer1000Px: number;
  readonly commentCount: number; readonly commentSurgeIndex: number; readonly commentHeatScore: number;
  readonly dropOffRatePct: number; readonly retentionBeforePct: number; readonly retentionAfterPct: number;
  readonly avgDwellSeconds: number; readonly expectedDwellSeconds: number; readonly dwellEfficiencyRatio: number;
  readonly reReadRatePct: number; readonly heatClass: ReaderHeatClass; readonly semanticTone: HeatmapSemanticTone;
  readonly heatIntensity01: number; readonly topKeywords: readonly string[]; readonly diagnosisKo: string; readonly diagnosisEn: string;
}
export interface NextEpisodeDirectingRecommendation {
  readonly id: string; readonly category: DirectingRecommendationCategory; readonly priority: "high" | "medium" | "low";
  readonly targetCutIds: readonly string[]; readonly metricEvidence: string; readonly guidanceKo: string; readonly guidanceEn: string;
}
export interface ReaderHeatmapCorrelationReport {
  readonly episodeId: string; readonly workTitle: string; readonly episodeNumber: number;
  readonly totalCanvasHeightPx: number; readonly cutCount: number; readonly totalComments: number;
  readonly medianCommentCount: number; readonly openingThreeCutRetentionPct: number; readonly endEpisodeRetentionPct: number;
  readonly peakCommentCutId: string | null; readonly peakCommentSurgeIndex: number;
  readonly worstDropOffCutId: string | null; readonly worstDropOffRatePct: number;
  readonly avgDialogueWordsPerCut: number; readonly overallPacingHealthScore: number;
  readonly cutOverlays: readonly CutHeatmapOverlayRecord[]; readonly nextEpisodeRecommendations: readonly NextEpisodeDirectingRecommendation[];
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** 연재 후 컷별 댓글 폭주·이탈률·체류 시간을 원고 컷 Y좌표에 역추적 매핑하고 차기 화 연출 권고안을 산출한다. */
export function correlateReaderReactionToCuts(input: CorrelateReaderHeatmapInput): ReaderHeatmapCorrelationReport {
  const orderedCuts = [...input.cuts].sort((a, b) => a.yStartPx - b.yStartPx || a.cutIndex - b.cutIndex);
  const reactionMap = new Map(input.reactions.map((r) => [r.cutId, r]));
  const totalHeight = Math.max(1, input.totalCanvasHeightPx, orderedCuts[orderedCuts.length - 1]?.yEndPx ?? 1);
  const commentCounts = orderedCuts.map((c) => reactionMap.get(c.cutId)?.commentCount ?? 0);
  const medianComments = Math.max(1, roundTo(medianOf(commentCounts), 1));
  const totalComments = commentCounts.reduce((s, n) => s + n, 0);

  let runningRetention = 100;
  const cutOverlays: CutHeatmapOverlayRecord[] = orderedCuts.map((cut) => {
    const react = reactionMap.get(cut.cutId) ?? { cutId: cut.cutId, commentCount: 0, dropOffRatePct: 0, avgDwellSeconds: 2, reReadRatePct: 0, scrollBackCount: 0 };
    const heightPx = Math.max(1, cut.yEndPx - cut.yStartPx);
    const commentSurgeIndex = roundTo(react.commentCount / medianComments, 2);
    const commentHeatScore = roundTo(clamp((commentSurgeIndex / 3.2) * 100, 0, 100), 1);
    const dropOffRatePct = roundTo(clamp(react.dropOffRatePct, 0, 100), 2);
    const retentionBeforePct = roundTo(runningRetention, 2);
    runningRetention = clamp(runningRetention * (1 - dropOffRatePct / 100), 0, 100);
    const retentionAfterPct = roundTo(runningRetention, 2);
    const expectedDwellSeconds = roundTo(1.3 + cut.dialogueWordCount * 0.13 + clamp(cut.visualComplexity01, 0, 1) * 2.1, 2);
    const dwellEfficiencyRatio = roundTo(react.avgDwellSeconds / Math.max(0.5, expectedDwellSeconds), 2);

    let heatClass: ReaderHeatClass = "neutral";
    let semanticTone: HeatmapSemanticTone = "accent";
    let diagnosisKo = "안정적인 스크롤 호흡과 표준 독자 반응 구간입니다.";
    let diagnosisEn = "Balanced scroll rhythm with steady reader engagement.";

    if (dropOffRatePct >= 7.5) {
      heatClass = "dropoff-cliff"; semanticTone = "bad";
      diagnosisKo = cut.dialogueWordCount >= 40 ? `대사 과밀(${cut.dialogueWordCount}어절·말풍선 ${cut.balloonCount}개) 구간 이탈률 ${dropOffRatePct}% 급등` : `이탈률 ${dropOffRatePct}% 급등 구간 · 전개 전환 보강 필요`;
      diagnosisEn = cut.dialogueWordCount >= 40 ? `Drop-off cliff (${dropOffRatePct}%) on dense dialogue (${cut.dialogueWordCount} words)` : `Drop-off cliff (${dropOffRatePct}%) · reinforce pacing hook`;
    } else if (commentSurgeIndex >= 2.0 && dropOffRatePct < 4.5) {
      heatClass = "viral-peak"; semanticTone = "good";
      diagnosisKo = `댓글 폭주 ${commentSurgeIndex}배(${react.commentCount}건) · 체류 ${react.avgDwellSeconds}초 핵심 명장면`;
      diagnosisEn = `Viral comment surge ${commentSurgeIndex}x (${react.commentCount}) · ${react.avgDwellSeconds}s dwell peak`;
    } else if ((cut.dialogueWordCount >= 42 && dropOffRatePct >= 4.0) || (dwellEfficiencyRatio >= 1.45 && commentSurgeIndex < 0.85)) {
      heatClass = "pacing-drag"; semanticTone = "warn";
      diagnosisKo = `대사 밀도(${cut.dialogueWordCount}어절) 대비 체류 정체 · 2컷 분할 호흡 권고`;
      diagnosisEn = `Pacing drag (${cut.dialogueWordCount} words) · split across 2 scroll beats`;
    } else if (commentSurgeIndex >= 1.35 || react.reReadRatePct >= 14) {
      heatClass = "engaged"; semanticTone = "good";
      diagnosisKo = `댓글 ${commentSurgeIndex}배·재열람 ${react.reReadRatePct}% 고몰입 구간입니다.`;
      diagnosisEn = `High engagement (${commentSurgeIndex}x comments, ${react.reReadRatePct}% re-read).`;
    }

    return {
      cutId: cut.cutId, cutIndex: cut.cutIndex, cutRole: cut.cutRole, yStartPx: cut.yStartPx, yEndPx: cut.yEndPx, heightPx,
      normalizedStartPct: roundTo(clamp((cut.yStartPx / totalHeight) * 100, 0, 100), 2),
      normalizedEndPct: roundTo(clamp((cut.yEndPx / totalHeight) * 100, 0, 100), 2),
      dialogueWordCount: cut.dialogueWordCount, balloonCount: cut.balloonCount,
      dialogueDensityPer1000Px: roundTo((cut.dialogueWordCount / heightPx) * 1000, 1),
      commentCount: react.commentCount, commentSurgeIndex, commentHeatScore, dropOffRatePct,
      retentionBeforePct, retentionAfterPct, avgDwellSeconds: roundTo(react.avgDwellSeconds, 2),
      expectedDwellSeconds, dwellEfficiencyRatio, reReadRatePct: roundTo(react.reReadRatePct, 1),
      heatClass, semanticTone,
      heatIntensity01: roundTo(clamp(heatClass === "dropoff-cliff" ? dropOffRatePct / 14 : heatClass === "pacing-drag" ? 0.68 : commentHeatScore / 100, 0.15, 1), 2),
      topKeywords: react.topKeywords ?? [], diagnosisKo, diagnosisEn,
    };
  });

  const openingThreeCutRetentionPct = cutOverlays[Math.min(2, cutOverlays.length - 1)]?.retentionAfterPct ?? 100;
  const endEpisodeRetentionPct = cutOverlays[cutOverlays.length - 1]?.retentionAfterPct ?? 100;
  let peakCommentCut: CutHeatmapOverlayRecord | null = null;
  let worstDropOffCut: CutHeatmapOverlayRecord | null = null;
  for (const c of cutOverlays) {
    if (!peakCommentCut || c.commentSurgeIndex > peakCommentCut.commentSurgeIndex) peakCommentCut = c;
    if (!worstDropOffCut || c.dropOffRatePct > worstDropOffCut.dropOffRatePct) worstDropOffCut = c;
  }

  const recommendations: NextEpisodeDirectingRecommendation[] = [];
  const denseDrag = cutOverlays.filter((c) => (c.heatClass === "dropoff-cliff" || c.heatClass === "pacing-drag") && c.dialogueWordCount >= 38);
  if (denseDrag.length > 0) {
    const worst = denseDrag[0];
    recommendations.push({
      id: "rec-dialogue-pacing", category: "dialogue-pacing", priority: "high",
      targetCutIds: denseDrag.map((c) => c.cutId),
      metricEvidence: `${worst?.cutId ?? ""} · ${worst?.dialogueWordCount ?? 0} words · drop-off ${worst?.dropOffRatePct ?? 0}%`,
      guidanceKo: `대사 과밀 ${denseDrag.map((c) => `#${c.cutIndex}`).join(", ")}컷에 이탈 집중 · 차기 화 컷당 28어절 이하 분할 및 리액션 컷 삽입 권고.`,
      guidanceEn: `Drop-off on text-heavy cut(s) ${denseDrag.map((c) => `#${c.cutIndex}`).join(", ")}. Cap at <= 28 words/cut and insert a reaction beat.`,
    });
  }
  if (openingThreeCutRetentionPct < 88) {
    recommendations.push({
      id: "rec-opening-hook", category: "opening-hook", priority: "high",
      targetCutIds: cutOverlays.slice(0, 3).map((c) => c.cutId),
      metricEvidence: `Opening 3-cut retention ${openingThreeCutRetentionPct}%`,
      guidanceKo: `초반 3컷 잔존율 ${openingThreeCutRetentionPct}% 저조 · 1~2컷에 핵심 갈등 비주얼 전면 배치 권고.`,
      guidanceEn: `Opening 3-cut retention ${openingThreeCutRetentionPct}% is low · front-load visual conflict in cuts 1–2.`,
    });
  }
  if (worstDropOffCut && worstDropOffCut.dropOffRatePct >= 6 && !denseDrag.some((c) => c.cutId === worstDropOffCut.cutId)) {
    recommendations.push({
      id: "rec-cut-rhythm", category: "cut-rhythm", priority: "high", targetCutIds: [worstDropOffCut.cutId],
      metricEvidence: `${worstDropOffCut.cutId} (Y ${worstDropOffCut.yStartPx}-${worstDropOffCut.yEndPx}px) · drop-off ${worstDropOffCut.dropOffRatePct}%`,
      guidanceKo: `Y=${worstDropOffCut.yStartPx}~${worstDropOffCut.yEndPx}px 구간 이탈 정점(${worstDropOffCut.dropOffRatePct}%) · 여백 호흡 및 앵글 전환 보강.`,
      guidanceEn: `Peak drop-off (${worstDropOffCut.dropOffRatePct}%) at Y=${worstDropOffCut.yStartPx}-${worstDropOffCut.yEndPx}px · tighten scroll pacing.`,
    });
  }
  if (peakCommentCut && peakCommentCut.commentSurgeIndex >= 1.8) {
    recommendations.push({
      id: "rec-viral-callback", category: "viral-callback", priority: "medium", targetCutIds: [peakCommentCut.cutId],
      metricEvidence: `${peakCommentCut.cutId} · ${peakCommentCut.commentSurgeIndex}x comments (${peakCommentCut.commentCount})`,
      guidanceKo: `${peakCommentCut.cutId}(#${peakCommentCut.cutIndex}컷) 댓글 ${peakCommentCut.commentSurgeIndex}배 폭주 · 차기 화 초반 3컷에 감정 콜백 연출 권고.`,
      guidanceEn: `${peakCommentCut.cutId} surged ${peakCommentCut.commentSurgeIndex}x in comments · carry emotional callback into next opening.`,
    });
  }
  const finalCut = cutOverlays[cutOverlays.length - 1];
  if (finalCut) {
    const strong = finalCut.commentSurgeIndex >= 1.5 || finalCut.reReadRatePct >= 15;
    recommendations.push({
      id: "rec-cliffhanger-payoff", category: "cliffhanger-payoff", priority: strong ? "low" : "medium", targetCutIds: [finalCut.cutId],
      metricEvidence: `Final ${finalCut.cutId} · ${finalCut.commentSurgeIndex}x comments · ${finalCut.reReadRatePct}% re-read`,
      guidanceKo: strong ? `엔딩 컷(#${finalCut.cutIndex}) 클리프행어 반응 우수 · 600px+ 무대사 호흡 여백 유지.` : `엔딩 컷(#${finalCut.cutIndex}) 반응 평이 · 무대사 암전 여백과 클로즈업 반전 보강.`,
      guidanceEn: strong ? `Strong cliffhanger on #${finalCut.cutIndex} · retain 600px+ silent pause.` : `Muted ending on #${finalCut.cutIndex} · add silent pause and close-up twist.`,
    });
  }

  const cliffCount = cutOverlays.filter((c) => c.heatClass === "dropoff-cliff").length;
  const viralCount = cutOverlays.filter((c) => c.heatClass === "viral-peak").length;
  return {
    episodeId: input.episodeId, workTitle: input.workTitle, episodeNumber: input.episodeNumber,
    totalCanvasHeightPx: totalHeight, cutCount: cutOverlays.length, totalComments, medianCommentCount: medianComments,
    openingThreeCutRetentionPct, endEpisodeRetentionPct,
    peakCommentCutId: peakCommentCut?.cutId ?? null, peakCommentSurgeIndex: peakCommentCut?.commentSurgeIndex ?? 0,
    worstDropOffCutId: worstDropOffCut?.cutId ?? null, worstDropOffRatePct: worstDropOffCut?.dropOffRatePct ?? 0,
    avgDialogueWordsPerCut: cutOverlays.length > 0 ? roundTo(cutOverlays.reduce((s, c) => s + c.dialogueWordCount, 0) / cutOverlays.length, 1) : 0,
    overallPacingHealthScore: roundTo(clamp(endEpisodeRetentionPct * 0.65 + openingThreeCutRetentionPct * 0.25 + viralCount * 6 - cliffCount * 11, 0, 100), 1),
    cutOverlays, nextEpisodeRecommendations: recommendations,
  };
}

/** UI·테스트용 10컷 원고 좌표 + 연재 후 독자 반응 히트맵 데모 데이터를 생성한다. */
export function createDemoReaderReactionEpisode(): CorrelateReaderHeatmapInput {
  return {
    episodeId: "ep-eclipse-042", workTitle: "별빛 회귀자", episodeNumber: 42, totalCanvasHeightPx: 14400,
    cuts: [
      { cutId: "cut-01", cutIndex: 1, yStartPx: 0, yEndPx: 1400, cutRole: "opening", dialogueWordCount: 14, balloonCount: 1, visualComplexity01: 0.72 },
      { cutId: "cut-02", cutIndex: 2, yStartPx: 1400, yEndPx: 2700, cutRole: "opening", dialogueWordCount: 22, balloonCount: 2, visualComplexity01: 0.58 },
      { cutId: "cut-03", cutIndex: 3, yStartPx: 2700, yEndPx: 4100, cutRole: "action", dialogueWordCount: 16, balloonCount: 2, visualComplexity01: 0.85 },
      { cutId: "cut-04", cutIndex: 4, yStartPx: 4100, yEndPx: 5700, cutRole: "dialogue", dialogueWordCount: 68, balloonCount: 6, visualComplexity01: 0.35 },
      { cutId: "cut-05", cutIndex: 5, yStartPx: 5700, yEndPx: 7100, cutRole: "dialogue", dialogueWordCount: 46, balloonCount: 4, visualComplexity01: 0.4 },
      { cutId: "cut-06", cutIndex: 6, yStartPx: 7100, yEndPx: 8600, cutRole: "action", dialogueWordCount: 12, balloonCount: 1, visualComplexity01: 0.9 },
      { cutId: "cut-07", cutIndex: 7, yStartPx: 8600, yEndPx: 10300, cutRole: "reveal", dialogueWordCount: 18, balloonCount: 2, visualComplexity01: 0.92 },
      { cutId: "cut-08", cutIndex: 8, yStartPx: 10300, yEndPx: 11700, cutRole: "action", dialogueWordCount: 15, balloonCount: 2, visualComplexity01: 0.78 },
      { cutId: "cut-09", cutIndex: 9, yStartPx: 11700, yEndPx: 13000, cutRole: "dialogue", dialogueWordCount: 24, balloonCount: 2, visualComplexity01: 0.52 },
      { cutId: "cut-10", cutIndex: 10, yStartPx: 13000, yEndPx: 14400, cutRole: "cliffhanger", dialogueWordCount: 9, balloonCount: 1, visualComplexity01: 0.88 },
    ],
    reactions: [
      { cutId: "cut-01", commentCount: 145, dropOffRatePct: 2.1, avgDwellSeconds: 4.8, reReadRatePct: 11.2, scrollBackCount: 88, topKeywords: ["작화", "오프닝"] },
      { cutId: "cut-02", commentCount: 118, dropOffRatePct: 1.9, avgDwellSeconds: 4.6, reReadRatePct: 8.4, scrollBackCount: 52, topKeywords: ["복선"] },
      { cutId: "cut-03", commentCount: 192, dropOffRatePct: 1.4, avgDwellSeconds: 5.2, reReadRatePct: 16.5, scrollBackCount: 140, topKeywords: ["액션", "구도"] },
      { cutId: "cut-04", commentCount: 64, dropOffRatePct: 9.8, avgDwellSeconds: 12.6, reReadRatePct: 3.1, scrollBackCount: 21, topKeywords: ["설명길다", "대사"] },
      { cutId: "cut-05", commentCount: 79, dropOffRatePct: 5.2, avgDwellSeconds: 9.4, reReadRatePct: 4.0, scrollBackCount: 30, topKeywords: ["세계관"] },
      { cutId: "cut-06", commentCount: 210, dropOffRatePct: 1.6, avgDwellSeconds: 5.1, reReadRatePct: 18.0, scrollBackCount: 175, topKeywords: ["전투", "임팩트"] },
      { cutId: "cut-07", commentCount: 540, dropOffRatePct: 0.9, avgDwellSeconds: 7.4, reReadRatePct: 31.4, scrollBackCount: 412, topKeywords: ["소름", "반전", "눈빛"] },
      { cutId: "cut-08", commentCount: 178, dropOffRatePct: 1.5, avgDwellSeconds: 4.7, reReadRatePct: 12.8, scrollBackCount: 96, topKeywords: ["추격"] },
      { cutId: "cut-09", commentCount: 132, dropOffRatePct: 2.0, avgDwellSeconds: 5.0, reReadRatePct: 7.5, scrollBackCount: 48, topKeywords: ["대화"] },
      { cutId: "cut-10", commentCount: 396, dropOffRatePct: 1.1, avgDwellSeconds: 6.9, reReadRatePct: 26.2, scrollBackCount: 318, topKeywords: ["끊기신공", "다음화"] },
    ],
  };
}
