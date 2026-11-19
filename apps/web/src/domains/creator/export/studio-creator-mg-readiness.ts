import type { EpisodeEscrowSettlement } from "./studio-episode-escrow-settlement";

export type CreatorReliabilityTier =
  | "tier-a-verified"
  | "tier-b-provisional"
  | "tier-c-review-required";

export interface CreatorMgReadinessReport {
  readonly reportSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly evaluatedAtIso: string;
  readonly totalEpisodesEvaluated: number;
  readonly releasedEpisodes: number;
  readonly heldEpisodes: number;
  readonly releaseRatePercent: number;
  readonly cumulativeGrossKrw: number;
  readonly cumulativeNetDistributableKrw: number;
  readonly averageGrossPerEpisodeKrw: number;
  readonly reliabilityTier: CreatorReliabilityTier;
  readonly settlementHashes: readonly string[];
  readonly readinessDigestHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 누적된 회차별 에스크로 정산 이력(`EpisodeEscrowSettlement`)을 집계해
 * 플랫폼 선인세(MG) 협상 및 창작자 신뢰도 심사용 정량 리포트를 생성한다.
 */
export function buildCreatorMgReadinessReport(params: {
  readonly seriesTitle: string;
  readonly settlements: readonly EpisodeEscrowSettlement[];
  readonly evaluatedAtIso?: string;
}): CreatorMgReadinessReport {
  const evaluatedAtIso = params.evaluatedAtIso ?? new Date().toISOString();
  const totalEpisodesEvaluated = params.settlements.length;
  const released = params.settlements.filter((s) => s.status === "ready-for-release");
  const releasedEpisodes = released.length;
  const heldEpisodes = totalEpisodesEvaluated - releasedEpisodes;
  const releaseRatePercent =
    totalEpisodesEvaluated > 0
      ? Math.round((releasedEpisodes / totalEpisodesEvaluated) * 100)
      : 0;

  const cumulativeGrossKrw = released.reduce((sum, s) => sum + s.grossAmountKrw, 0);
  const cumulativeNetDistributableKrw = released.reduce(
    (sum, s) => sum + s.netDistributableKrw,
    0,
  );
  const averageGrossPerEpisodeKrw =
    releasedEpisodes > 0 ? Math.round(cumulativeGrossKrw / releasedEpisodes) : 0;

  let reliabilityTier: CreatorReliabilityTier;
  if (releasedEpisodes >= 3 && heldEpisodes === 0) {
    reliabilityTier = "tier-a-verified";
  } else if (releaseRatePercent >= 80 && releasedEpisodes >= 1) {
    reliabilityTier = "tier-b-provisional";
  } else {
    reliabilityTier = "tier-c-review-required";
  }

  const settlementHashes = params.settlements.map((s) => s.settlementIntegrityHash);
  const readinessDigestHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: params.seriesTitle,
      totalEpisodesEvaluated,
      releasedEpisodes,
      cumulativeGrossKrw,
      reliabilityTier,
      settlementHashes,
    }),
  );

  return {
    reportSchemaVersion: 1,
    seriesTitle: params.seriesTitle,
    evaluatedAtIso,
    totalEpisodesEvaluated,
    releasedEpisodes,
    heldEpisodes,
    releaseRatePercent,
    cumulativeGrossKrw,
    cumulativeNetDistributableKrw,
    averageGrossPerEpisodeKrw,
    reliabilityTier,
    settlementHashes,
    readinessDigestHash,
  };
}

/**
 * 플랫폼 선인세(MG)·에이전시 심사용 Markdown 요약 리포트를 생성한다.
 */
export function formatCreatorMgReadinessMarkdown(report: CreatorMgReadinessReport): string {
  return [
    `# 창작자 연재 이행 및 MG 협상 신뢰 리포트 — ${report.seriesTitle}`,
    `- 평가 시각: ${report.evaluatedAtIso}`,
    `- 신뢰 등급: \`${report.reliabilityTier}\``,
    `- 정산 통과율: ${report.releaseRatePercent}% (통과 ${report.releasedEpisodes}화 / 보류 ${report.heldEpisodes}화 · 총 ${report.totalEpisodesEvaluated}화)`,
    `- 누적 총 정산액: ${report.cumulativeGrossKrw.toLocaleString("ko-KR")}원 (회차 평균 ${report.averageGrossPerEpisodeKrw.toLocaleString("ko-KR")}원)`,
    `- 누적 순 창작자 배분액: ${report.cumulativeNetDistributableKrw.toLocaleString("ko-KR")}원`,
    `- 마스터 다이제스트 해시: \`${report.readinessDigestHash}\``,
  ].join("\n");
}
