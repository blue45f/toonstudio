import type { CreatorMgReadinessReport } from "./studio-creator-mg-readiness";
import type { EpisodeRightsDossier } from "./studio-episode-rights-dossier";

export type AdvanceUnderwritingDecision = "approved" | "conditional" | "declined";

export interface CreatorAdvanceUnderwritingResult {
  readonly underwritingSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly decision: AdvanceUnderwritingDecision;
  readonly declineReasons: readonly string[];
  readonly approvedAdvanceLimitKrw: number;
  readonly recommendedRecoupmentRatePercent: number;
  readonly estimatedRecoupmentEpisodes: number;
  readonly dossierHash: string;
  readonly mgReadinessDigestHash: string;
  readonly evaluatedAtIso: string;
  readonly underwritingIntegrityHash: string;
}

const TIER_A_MAX_LIMIT_KRW = 50_000_000;
const TIER_B_MAX_LIMIT_KRW = 15_000_000;

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 연재작 IP 실사 도시에(`EpisodeRightsDossier`)와 창작자 MG 신뢰도 리포트(`CreatorMgReadinessReport`)를 결합해
 * 제작비 브릿지 선정산·선인세(MG) 한도를 결정적으로 산출한다.
 */
export function evaluateCreatorAdvanceUnderwriting(params: {
  readonly dossier: EpisodeRightsDossier;
  readonly mgReport: CreatorMgReadinessReport;
  readonly evaluatedAtIso?: string;
}): CreatorAdvanceUnderwritingResult {
  const { dossier, mgReport } = params;
  const evaluatedAtIso = params.evaluatedAtIso ?? new Date().toISOString();
  const declineReasons: string[] = [];

  if (!dossier.allEpisodesCleared) {
    declineReasons.push(
      `저작권 실사 미통과 회차(${dossier.blockedEpisodes}화)가 존재해 선정산 한도를 승인할 수 없습니다.`,
    );
  }
  if (mgReport.reliabilityTier === "tier-c-review-required") {
    declineReasons.push(
      `창작자 정산 신뢰 등급이 미달(tier-c-review-required · 통과율 ${mgReport.releaseRatePercent}%)입니다.`,
    );
  }
  if (mgReport.averageGrossPerEpisodeKrw <= 0) {
    declineReasons.push("검증된 회차 평균 정산 매출이 0원 이하입니다.");
  }

  let decision: AdvanceUnderwritingDecision;
  let approvedAdvanceLimitKrw = 0;
  let recommendedRecoupmentRatePercent = 0;
  let estimatedRecoupmentEpisodes = 0;

  if (declineReasons.length > 0) {
    decision = "declined";
  } else if (mgReport.reliabilityTier === "tier-a-verified") {
    decision = "approved";
    approvedAdvanceLimitKrw = Math.min(
      TIER_A_MAX_LIMIT_KRW,
      Math.round(mgReport.averageGrossPerEpisodeKrw * 3),
    );
    recommendedRecoupmentRatePercent = 20;
    const perEpisodeRecoup = Math.max(
      1,
      Math.round((mgReport.averageGrossPerEpisodeKrw * recommendedRecoupmentRatePercent) / 100),
    );
    estimatedRecoupmentEpisodes = Math.ceil(approvedAdvanceLimitKrw / perEpisodeRecoup);
  } else {
    decision = "conditional";
    approvedAdvanceLimitKrw = Math.min(
      TIER_B_MAX_LIMIT_KRW,
      Math.round(mgReport.averageGrossPerEpisodeKrw * 1.5),
    );
    recommendedRecoupmentRatePercent = 30;
    const perEpisodeRecoup = Math.max(
      1,
      Math.round((mgReport.averageGrossPerEpisodeKrw * recommendedRecoupmentRatePercent) / 100),
    );
    estimatedRecoupmentEpisodes = Math.ceil(approvedAdvanceLimitKrw / perEpisodeRecoup);
  }

  const underwritingIntegrityHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: mgReport.seriesTitle,
      decision,
      approvedAdvanceLimitKrw,
      recommendedRecoupmentRatePercent,
      dossierHash: dossier.dossierHash,
      mgReadinessDigestHash: mgReport.readinessDigestHash,
    }),
  );

  return {
    underwritingSchemaVersion: 1,
    seriesTitle: mgReport.seriesTitle,
    decision,
    declineReasons,
    approvedAdvanceLimitKrw,
    recommendedRecoupmentRatePercent,
    estimatedRecoupmentEpisodes,
    dossierHash: dossier.dossierHash,
    mgReadinessDigestHash: mgReport.readinessDigestHash,
    evaluatedAtIso,
    underwritingIntegrityHash,
  };
}

export function formatCreatorAdvanceUnderwritingMarkdown(
  result: CreatorAdvanceUnderwritingResult,
): string {
  const statusLabel =
    result.decision === "approved"
      ? "승인 (APPROVED)"
      : result.decision === "conditional"
        ? "조건부 승인 (CONDITIONAL)"
        : "보류/거절 (DECLINED)";

  const lines = [
    `# 창작자 제작비 선정산·MG 심사 리포트 — ${result.seriesTitle}`,
    `- 심사 시각: ${result.evaluatedAtIso}`,
    `- 판정 결과: ${statusLabel}`,
    `- 승인 가능 한도: ${result.approvedAdvanceLimitKrw.toLocaleString("ko-KR")}원`,
    `- 권장 상환 비율: 회차 매출의 ${result.recommendedRecoupmentRatePercent}% (예상 회수 ${result.estimatedRecoupmentEpisodes}화)`,
    `- 검증 해시 체인: Dossier \`${result.dossierHash}\` · MG \`${result.mgReadinessDigestHash}\` · Underwriting \`${result.underwritingIntegrityHash}\``,
  ];

  if (result.declineReasons.length > 0) {
    lines.push("", "## 보류 사유", ...result.declineReasons.map((reason) => `- ${reason}`));
  }

  return lines.join("\n");
}
