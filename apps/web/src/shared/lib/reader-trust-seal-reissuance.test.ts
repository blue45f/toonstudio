import { describe, expect, it } from "vitest";

import { buildReaderTrustSeal } from "./reader-trust-seal";
import {
  buildReissuedReaderTrustSeal,
  verifySealReissuanceRecord,
} from "./reader-trust-seal-reissuance";
import type { SealRevocationEntry } from "./reader-trust-seal-revocation";

describe("reader-trust-seal-reissuance", () => {
  const previousSeal = buildReaderTrustSeal({
    seriesTitle: "황녀의 검",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash: "fnv1a-1234abcd",
    issuedAtIso: "2026-11-20T00:00:00.000Z",
  });

  const revocationEntry: SealRevocationEntry = {
    revocationId: "REV-FONT-01",
    sealDigestHash: previousSeal.sealDigestHash,
    reasonCode: "font-license-expired",
    reasonDetail: "외주 타이틀 폰트 만료",
    revokedAtIso: "2026-11-21T00:00:00.000Z",
  };

  it("reissues a clean verified seal with a tamper-evident supersedes chain hash", () => {
    const res = buildReissuedReaderTrustSeal({
      previousSeal,
      revocationEntry,
      remediationProof: {
        resolvedReasonCode: "font-license-expired",
        replacementAssetLabel: "Pretendard Commercial (OFL)",
        evidenceReferenceId: "LIC-OFL-2026-09",
        verifiedBy: "ToonStudio Rights Bot",
      },
      reissuedAtIso: "2026-11-22T00:00:00.000Z",
    });

    expect(res.ok).toBe(true);
    expect(res.record).not.toBeNull();
    expect(res.record?.supersedesSealDigestHash).toBe(previousSeal.sealDigestHash);
    expect(res.record?.reissuedSeal.sealDigestHash).not.toBe(previousSeal.sealDigestHash);
    expect(res.record?.reissuedSeal.level).toBe("verified-10-stage");
    expect(res.record ? verifySealReissuanceRecord(res.record) : false).toBe(true);
  });

  it("rejects reissuance when remediation reason does not match revocation reason", () => {
    const res = buildReissuedReaderTrustSeal({
      previousSeal,
      revocationEntry,
      remediationProof: {
        resolvedReasonCode: "asset-takedown",
        replacementAssetLabel: "CC0 배경 교체",
        evidenceReferenceId: "LIC-CC0-01",
        verifiedBy: "ToonStudio Rights Bot",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.record).toBeNull();
    expect(res.summary).toContain("일치하지 않습니다");
  });
});
