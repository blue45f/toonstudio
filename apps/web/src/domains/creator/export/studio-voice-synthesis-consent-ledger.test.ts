import { describe, expect, it } from "vitest";

import {
  evaluateVoiceSynthesisConsentLedger,
  formatVoiceSynthesisConsentMarkdown,
} from "./studio-voice-synthesis-consent-ledger";

describe("studio-voice-synthesis-consent-ledger", () => {
  const sampleContracts = [
    {
      contractId: "VA-01",
      characterName: "아리아 황녀",
      voiceActorName: "김성우",
      allowedLocales: ["en-US", "ja-JP"] as const,
      allowAiVoiceClone: true,
      allowModelTrainingReuse: false,
      royaltyPerEpisodeKrw: 300_000,
      consentExpiresAtIso: "2027-12-31T23:59:59.000Z",
    },
    {
      contractId: "VA-02",
      characterName: "카일 기사단장",
      voiceActorName: "박보이스",
      allowedLocales: ["en-US", "ja-JP", "es-ES"] as const,
      allowAiVoiceClone: true,
      allowModelTrainingReuse: false,
      royaltyPerEpisodeKrw: 250_000,
      consentExpiresAtIso: "2027-12-31T23:59:59.000Z",
    },
  ];

  it("clears multi-locale AI voice synthesis within contract scope and sums episode royalties", () => {
    const ledger = evaluateVoiceSynthesisConsentLedger({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: "fnv1a-11112222",
      localizationChainHash: "fnv1a-33334444",
      contracts: sampleContracts,
      request: {
        targetLocales: ["en-US", "ja-JP"],
        usesAiVoiceClone: true,
        usesModelTrainingReuse: false,
        releaseAtIso: "2026-12-01T00:00:00.000Z",
      },
      evaluatedAtIso: "2026-11-20T11:40:00.000Z",
    });

    expect(ledger.allContractsCleared).toBe(true);
    expect(ledger.totalVoiceRoyaltyKrw).toBe(550_000);
    expect(ledger.voiceConsentLedgerHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatVoiceSynthesisConsentMarkdown(ledger);
    expect(md).toContain("550,000원");
    expect(md).toContain("전 캐릭터 음성권 승인 (PASS)");
  });

  it("blocks synthesis when unauthorized locale or model training reuse is requested", () => {
    const blocked = evaluateVoiceSynthesisConsentLedger({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: "fnv1a-11112222",
      localizationChainHash: "fnv1a-33334444",
      contracts: sampleContracts,
      request: {
        targetLocales: ["en-US", "es-ES"], // VA-01 does not allow es-ES
        usesAiVoiceClone: true,
        usesModelTrainingReuse: true, // Both forbid model training reuse
        releaseAtIso: "2026-12-01T00:00:00.000Z",
      },
    });

    expect(blocked.allContractsCleared).toBe(false);
    expect(blocked.totalVoiceRoyaltyKrw).toBe(0);
    expect(blocked.checks[0].violations).toHaveLength(2);
  });
});
