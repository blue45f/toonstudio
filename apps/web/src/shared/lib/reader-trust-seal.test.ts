import { describe, expect, it } from "vitest";

import {
  buildReaderTrustSeal,
  formatReaderTrustSealLabel,
  verifyReaderTrustSealDigest,
} from "./reader-trust-seal";

describe("reader-trust-seal", () => {
  it("issues verified-10-stage seal with tamper-evident digest and human-readable label", () => {
    const seal = buildReaderTrustSeal({
      seriesTitle: "황녀의 검",
      verifiedStagesCount: 10,
      totalStagesCount: 10,
      commercialAssetsCleared: true,
      aiTrainingOptOut: true,
      voiceConsentVerified: true,
      globalLocalesCount: 3,
      masterAuditHash: "fnv1a-12345678",
      issuedAtIso: "2026-11-20T11:55:00.000Z",
    });

    expect(seal.level).toBe("verified-10-stage");
    expect(verifyReaderTrustSealDigest(seal)).toBe(true);
    expect(formatReaderTrustSealLabel(seal)).toBe("클린 IP 10단계 완전 인증작");

    expect(
      verifyReaderTrustSealDigest({ ...seal, commercialAssetsCleared: false }),
    ).toBe(false);
  });

  it("downgrades to unverified when commercial assets are not cleared", () => {
    const seal = buildReaderTrustSeal({
      seriesTitle: "미검증작",
      verifiedStagesCount: 0,
      totalStagesCount: 10,
      commercialAssetsCleared: false,
      aiTrainingOptOut: false,
      voiceConsentVerified: false,
      globalLocalesCount: 0,
      masterAuditHash: "fnv1a-00000000",
    });

    expect(seal.level).toBe("unverified");
    expect(formatReaderTrustSealLabel(seal)).toBe("저작권 인증 대기");
  });
});
