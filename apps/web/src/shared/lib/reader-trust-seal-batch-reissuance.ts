import type { ReaderTrustSealPayload } from "./reader-trust-seal";
import {
  buildReissuedReaderTrustSeal,
  type SealRemediationProof,
  type SealReissuanceRecord,
} from "./reader-trust-seal-reissuance";
import {
  evaluateReaderTrustSealLiveStatus,
  type ReaderTrustSealLiveStatus,
  type SealRevocationLedger,
  type SealRevocationReasonCode,
} from "./reader-trust-seal-revocation";

export interface PortfolioSealRecord {
  readonly episodeKey: string;
  readonly seal: ReaderTrustSealPayload;
  readonly expiresAtIso?: string | null;
}

export interface PortfolioImpactedEpisode {
  readonly episodeKey: string;
  readonly seriesTitle: string;
  readonly sealDigestHash: string;
  readonly liveStatus: ReaderTrustSealLiveStatus;
}

export interface PortfolioRevocationImpactReport {
  readonly totalCount: number;
  readonly activeCount: number;
  readonly revokedCount: number;
  readonly expiredCount: number;
  readonly tamperedCount: number;
  readonly impactedEpisodes: readonly PortfolioImpactedEpisode[];
  readonly reasonBreakdown: Readonly<Record<string, number>>;
  readonly scannedAtIso: string;
}

export interface PortfolioBatchReissuanceUnresolved {
  readonly episodeKey: string;
  readonly seriesTitle: string;
  readonly reason: string;
}

export interface PortfolioBatchReissuanceResult {
  readonly batchSchemaVersion: 1;
  readonly totalCount: number;
  readonly unchangedActiveCount: number;
  readonly reissuedCount: number;
  readonly unresolvedCount: number;
  readonly reissuedRecords: readonly {
    readonly episodeKey: string;
    readonly record: SealReissuanceRecord;
  }[];
  readonly unresolvedRecords: readonly PortfolioBatchReissuanceUnresolved[];
  readonly executedAtIso: string;
  readonly batchReissuanceDigestHash: string;
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
 * 스튜디오·레이블 전체 연재작 포트폴리오를 철회 원장 기준으로 스캔해
 * 영향받는 회차 수와 사유별 분포를 집계한다.
 */
export function scanPortfolioRevocationImpact(params: {
  readonly records: readonly PortfolioSealRecord[];
  readonly ledger?: SealRevocationLedger | null;
  readonly asOfIso?: string;
}): PortfolioRevocationImpactReport {
  const scannedAtIso = params.asOfIso ?? new Date().toISOString();
  let activeCount = 0;
  let revokedCount = 0;
  let expiredCount = 0;
  let tamperedCount = 0;
  const impactedEpisodes: PortfolioImpactedEpisode[] = [];
  const reasonBreakdown: Record<string, number> = {};

  for (const item of params.records) {
    const liveStatus = evaluateReaderTrustSealLiveStatus({
      seal: item.seal,
      ledger: params.ledger,
      expiresAtIso: item.expiresAtIso,
      asOfIso: scannedAtIso,
    });

    if (liveStatus.effectiveStatus === "active") {
      activeCount += 1;
    } else {
      if (liveStatus.effectiveStatus === "revoked") {
        revokedCount += 1;
        const code = liveStatus.matchedRevocation?.reasonCode ?? "unknown";
        reasonBreakdown[code] = (reasonBreakdown[code] ?? 0) + 1;
      } else if (liveStatus.effectiveStatus === "expired") {
        expiredCount += 1;
        reasonBreakdown["expiry-renewed"] = (reasonBreakdown["expiry-renewed"] ?? 0) + 1;
      } else {
        tamperedCount += 1;
        reasonBreakdown.tampered = (reasonBreakdown.tampered ?? 0) + 1;
      }

      impactedEpisodes.push({
        episodeKey: item.episodeKey,
        seriesTitle: item.seal.seriesTitle,
        sealDigestHash: item.seal.sealDigestHash,
        liveStatus,
      });
    }
  }

  return {
    totalCount: params.records.length,
    activeCount,
    revokedCount,
    expiredCount,
    tamperedCount,
    impactedEpisodes,
    reasonBreakdown,
    scannedAtIso,
  };
}

/**
 * 철회·만료된 포트폴리오 회차들을 사유별 대체 에셋 증빙으로 일괄 재발급하고
 * 전체 배치 무결성 해시(batchReissuanceDigestHash)를 발급한다.
 */
export function executePortfolioBatchReissuance(params: {
  readonly records: readonly PortfolioSealRecord[];
  readonly ledger?: SealRevocationLedger | null;
  readonly remediationProofsByReason: Partial<
    Record<SealRevocationReasonCode | "expiry-renewed", SealRemediationProof>
  >;
  readonly asOfIso?: string;
}): PortfolioBatchReissuanceResult {
  const executedAtIso = params.asOfIso ?? new Date().toISOString();
  let unchangedActiveCount = 0;
  const reissuedRecords: {
    readonly episodeKey: string;
    readonly record: SealReissuanceRecord;
  }[] = [];
  const unresolvedRecords: PortfolioBatchReissuanceUnresolved[] = [];

  for (const item of params.records) {
    const liveStatus = evaluateReaderTrustSealLiveStatus({
      seal: item.seal,
      ledger: params.ledger,
      expiresAtIso: item.expiresAtIso,
      asOfIso: executedAtIso,
    });

    if (liveStatus.effectiveStatus === "active") {
      unchangedActiveCount += 1;
      continue;
    }

    if (liveStatus.effectiveStatus === "tampered") {
      unresolvedRecords.push({
        episodeKey: item.episodeKey,
        seriesTitle: item.seal.seriesTitle,
        reason: "서명 해시 위변조 상태는 자동 배치 재발급 불가 (원본 재감사 필요)",
      });
      continue;
    }

    const reasonKey: SealRevocationReasonCode | "expiry-renewed" =
      liveStatus.effectiveStatus === "revoked" && liveStatus.matchedRevocation
        ? liveStatus.matchedRevocation.reasonCode
        : "expiry-renewed";
    const proof = params.remediationProofsByReason[reasonKey];

    if (!proof) {
      unresolvedRecords.push({
        episodeKey: item.episodeKey,
        seriesTitle: item.seal.seriesTitle,
        reason: `복구 증빙 미등록 (${reasonKey})`,
      });
      continue;
    }

    const reissueRes = buildReissuedReaderTrustSeal({
      previousSeal: item.seal,
      revocationEntry: liveStatus.matchedRevocation,
      remediationProof: proof,
      reissuedAtIso: executedAtIso,
    });

    if (!reissueRes.ok || !reissueRes.record) {
      unresolvedRecords.push({
        episodeKey: item.episodeKey,
        seriesTitle: item.seal.seriesTitle,
        reason: reissueRes.summary,
      });
      continue;
    }

    reissuedRecords.push({
      episodeKey: item.episodeKey,
      record: reissueRes.record,
    });
  }

  const batchReissuanceDigestHash = fnv1aHex(
    JSON.stringify({
      batchSchemaVersion: 1,
      totalCount: params.records.length,
      unchangedActiveCount,
      reissuedCount: reissuedRecords.length,
      unresolvedCount: unresolvedRecords.length,
      reissuedChainHashes: reissuedRecords.map((r) => ({
        episodeKey: r.episodeKey,
        reissuanceChainHash: r.record.reissuanceChainHash,
      })),
      executedAtIso,
    }),
  );

  return {
    batchSchemaVersion: 1,
    totalCount: params.records.length,
    unchangedActiveCount,
    reissuedCount: reissuedRecords.length,
    unresolvedCount: unresolvedRecords.length,
    reissuedRecords,
    unresolvedRecords,
    executedAtIso,
    batchReissuanceDigestHash,
  };
}

export function formatPortfolioBatchReissuanceMarkdown(
  result: PortfolioBatchReissuanceResult,
): string {
  const lines = [
    `# ToonStudio 포트폴리오 배치 재발급 감사 리포트`,
    `- 실행 시각: ${result.executedAtIso}`,
    `- 전체 대상: ${result.totalCount}화 (유지 ${result.unchangedActiveCount} · 재발급 ${result.reissuedCount} · 미해결 ${result.unresolvedCount})`,
    `- 배치 무결성 해시: \`${result.batchReissuanceDigestHash}\``,
  ];
  for (const item of result.reissuedRecords) {
    lines.push(
      `  - [재발급 완료] ${item.episodeKey}: ${item.record.supersedesSealDigestHash} -> ${item.record.reissuedSeal.sealDigestHash} (${item.record.remediationProof.replacementAssetLabel})`,
    );
  }
  for (const u of result.unresolvedRecords) {
    lines.push(`  - [미해결] ${u.episodeKey} (${u.seriesTitle}): ${u.reason}`);
  }
  return lines.join("\n");
}
