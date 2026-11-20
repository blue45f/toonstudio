import { describe, expect, it } from "vitest";

import { buildReaderTrustSeal } from "./reader-trust-seal";
import {
  executePortfolioBatchReissuance,
  formatPortfolioBatchReissuanceMarkdown,
  scanPortfolioRevocationImpact,
  type PortfolioSealRecord,
} from "./reader-trust-seal-batch-reissuance";
import { buildSealRevocationLedger } from "./reader-trust-seal-revocation";

describe("reader-trust-seal-batch-reissuance", () => {
  const seal1 = buildReaderTrustSeal({
    seriesTitle: "황녀의 검",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash: "fnv1a-10000001",
    issuedAtIso: "2026-11-20T00:00:00.000Z",
  });
  const seal2 = buildReaderTrustSeal({
    seriesTitle: "별빛 아카데미",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash: "fnv1a-10000002",
    issuedAtIso: "2026-11-20T00:00:00.000Z",
  });
  const seal3 = buildReaderTrustSeal({
    seriesTitle: "심해의 기록",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 1,
    masterAuditHash: "fnv1a-10000003",
    issuedAtIso: "2026-11-20T00:00:00.000Z",
  });

  const records: PortfolioSealRecord[] = [
    { episodeKey: "ep-01", seal: seal1 },
    { episodeKey: "ep-02", seal: seal2 },
    { episodeKey: "ep-03", seal: seal3 },
  ];

  const ledger = buildSealRevocationLedger({
    entries: [
      {
        revocationId: "REV-FONT-01",
        sealDigestHash: seal1.sealDigestHash,
        reasonCode: "font-license-expired",
        reasonDetail: "제목 폰트 만료",
        revokedAtIso: "2026-11-21T00:00:00.000Z",
      },
      {
        revocationId: "REV-FONT-02",
        sealDigestHash: seal2.sealDigestHash,
        reasonCode: "font-license-expired",
        reasonDetail: "제목 폰트 만료",
        revokedAtIso: "2026-11-21T00:00:00.000Z",
      },
    ],
    updatedAtIso: "2026-11-21T00:00:00.000Z",
  });

  it("scans portfolio revocation impact and batch-reissues all affected episodes cleanly", () => {
    const impact = scanPortfolioRevocationImpact({
      records,
      ledger,
      asOfIso: "2026-11-22T00:00:00.000Z",
    });
    expect(impact.totalCount).toBe(3);
    expect(impact.activeCount).toBe(1);
    expect(impact.revokedCount).toBe(2);
    expect(impact.reasonBreakdown["font-license-expired"]).toBe(2);

    const batch = executePortfolioBatchReissuance({
      records,
      ledger,
      asOfIso: "2026-11-22T00:00:00.000Z",
      remediationProofsByReason: {
        "font-license-expired": {
          resolvedReasonCode: "font-license-expired",
          replacementAssetLabel: "Pretendard Commercial (OFL)",
          evidenceReferenceId: "LIC-OFL-BATCH-2026",
          verifiedBy: "Studio Legal Ops",
        },
      },
    });

    expect(batch.unchangedActiveCount).toBe(1);
    expect(batch.reissuedCount).toBe(2);
    expect(batch.unresolvedCount).toBe(0);
    expect(batch.batchReissuanceDigestHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatPortfolioBatchReissuanceMarkdown(batch);
    expect(md).toContain("ep-01");
    expect(md).toContain("ep-02");
    expect(md).toContain(batch.batchReissuanceDigestHash);
  });
});
