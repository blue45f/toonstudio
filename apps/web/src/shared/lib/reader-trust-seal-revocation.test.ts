import { describe, expect, it } from "vitest";

import { buildReaderTrustSeal } from "./reader-trust-seal";
import {
  buildSealRevocationLedger,
  evaluateReaderTrustSealLiveStatus,
} from "./reader-trust-seal-revocation";

describe("reader-trust-seal-revocation", () => {
  const baseSeal = buildReaderTrustSeal({
    seriesTitle: "황녀의 검",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash: "fnv1a-aabbccdd",
    issuedAtIso: "2026-11-20T00:00:00.000Z",
  });

  it("returns active status when no revocation or expiry applies", () => {
    const ledger = buildSealRevocationLedger({
      entries: [],
      updatedAtIso: "2026-11-20T01:00:00.000Z",
    });
    const status = evaluateReaderTrustSealLiveStatus({
      seal: baseSeal,
      ledger,
      expiresAtIso: "2027-11-20T00:00:00.000Z",
      asOfIso: "2026-12-01T00:00:00.000Z",
    });

    expect(status.effectiveStatus).toBe("active");
    expect(status.effectiveLevel).toBe("verified-10-stage");
    expect(status.digestValid).toBe(true);
  });

  it("downgrades seal to revoked when a matching revocation entry is active", () => {
    const ledger = buildSealRevocationLedger({
      entries: [
        {
          revocationId: "REV-001",
          sealDigestHash: baseSeal.sealDigestHash,
          reasonCode: "font-license-expired",
          reasonDetail: "제목 폰트 연간 상업 라이선스 만료",
          revokedAtIso: "2026-11-25T00:00:00.000Z",
        },
      ],
      updatedAtIso: "2026-11-25T00:00:00.000Z",
    });

    const status = evaluateReaderTrustSealLiveStatus({
      seal: baseSeal,
      ledger,
      asOfIso: "2026-12-01T00:00:00.000Z",
    });

    expect(status.effectiveStatus).toBe("revoked");
    expect(status.effectiveLevel).toBe("unverified");
    expect(status.matchedRevocation?.revocationId).toBe("REV-001");
    expect(status.summary).toContain("외주 폰트 라이선스 만료");
  });

  it("flags expired and tampered seals cleanly", () => {
    const expired = evaluateReaderTrustSealLiveStatus({
      seal: baseSeal,
      expiresAtIso: "2026-11-30T00:00:00.000Z",
      asOfIso: "2026-12-01T00:00:00.000Z",
    });
    expect(expired.effectiveStatus).toBe("expired");
    expect(expired.effectiveLevel).toBe("unverified");

    const tampered = evaluateReaderTrustSealLiveStatus({
      seal: { ...baseSeal, globalLocalesCount: 9 },
      asOfIso: "2026-12-01T00:00:00.000Z",
    });
    expect(tampered.effectiveStatus).toBe("tampered");
    expect(tampered.digestValid).toBe(false);
  });
});
