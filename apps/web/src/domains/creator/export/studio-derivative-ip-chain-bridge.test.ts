import { describe, expect, it } from "vitest";

import { buildReaderTrustSeal } from "@/shared/lib/reader-trust-seal";
import { buildSealRevocationLedger } from "@/shared/lib/reader-trust-seal-revocation";

import { buildDerivativeIpChainManifest } from "./studio-derivative-ip-chain-bridge";

describe("studio-derivative-ip-chain-bridge", () => {
  const verifiedSeal = buildReaderTrustSeal({
    seriesTitle: "황녀의 검",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash: "fnv1a-11223344",
    issuedAtIso: "2026-11-20T00:00:00.000Z",
  });

  it("clears movingtoon, merchandise, and video adaptation when source 10-stage seal is active", () => {
    const manifest = buildDerivativeIpChainManifest({
      seal: verifiedSeal,
      asOfIso: "2026-11-21T00:00:00.000Z",
      requests: [
        {
          medium: "movingtoon-shortform",
          projectTitle: "황녀의 검 숏폼 시즌1",
          partnerName: "ToonStudio Motion",
          targetLocales: ["en-US"],
          requiresVoiceSynthesis: true,
        },
        {
          medium: "merchandise-goods",
          projectTitle: "아크릴 스탠드 에디션",
          partnerName: "Studio Goods Lab",
          targetLocales: [],
          requiresVoiceSynthesis: false,
        },
        {
          medium: "video-adaptation",
          projectTitle: "황녀의 검 애니메이션 파일럿",
          partnerName: "Seoul Ani Partners",
          targetLocales: ["en-US", "ja-JP"],
          requiresVoiceSynthesis: true,
        },
      ],
    });

    expect(manifest.allDerivativesCleared).toBe(true);
    expect(manifest.items.every((i) => i.cleared)).toBe(true);
    expect(manifest.derivativeChainHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it("blocks all derivative IP inheritance immediately when source seal is revoked", () => {
    const ledger = buildSealRevocationLedger({
      entries: [
        {
          revocationId: "REV-VOICE-01",
          masterAuditHash: verifiedSeal.masterAuditHash,
          reasonCode: "voice-contract-terminated",
          reasonDetail: "주연 성우 AI 음성 계약 해지",
          revokedAtIso: "2026-11-20T12:00:00.000Z",
        },
      ],
      updatedAtIso: "2026-11-20T12:00:00.000Z",
    });

    const manifest = buildDerivativeIpChainManifest({
      seal: verifiedSeal,
      revocationLedger: ledger,
      asOfIso: "2026-11-21T00:00:00.000Z",
      requests: [
        {
          medium: "movingtoon-shortform",
          projectTitle: "황녀의 검 숏폼 시즌1",
          partnerName: "ToonStudio Motion",
          targetLocales: ["en-US"],
          requiresVoiceSynthesis: true,
        },
      ],
    });

    expect(manifest.allDerivativesCleared).toBe(false);
    expect(manifest.sourceLiveStatus.effectiveStatus).toBe("revoked");
    expect(manifest.items[0].blockedReasons[0]).toContain("성우 음성권 계약 해지");
  });
});
