import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { evaluateAgencySubmissionBatch } from "./studio-agency-submission-preview";
import { verifySeriesIpProvenanceChain } from "./studio-ip-provenance-chain-verifier";
import { buildIpSlateFundDdReport } from "./studio-ip-slate-fund-dd";
import { buildGlobalLocalizationRightsManifest } from "./studio-localization-rights-chain";
import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";
import { evaluateVoiceSynthesisConsentLedger } from "./studio-voice-synthesis-consent-ledger";

describe("studio-ip-provenance-chain-verifier", () => {
  it("verifies all 10 stages from Rights BOM receipt through global localization and voice synthesis consent", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const sampleLuma = new Uint8Array(72).map((_, idx) => (idx * 19) % 256);
    const ts = "2026-11-20T11:15:00.000Z";
    const participants = [{ role: "art" as const, displayName: "이작화", sharePercent: 100 }];

    const pipeline = runSeriesCommercialPipeline({
      seriesTitle: "황녀의 검",
      tier: "episode-serialization-only",
      participants,
      episodes: [1, 2, 3].map((ep) => ({
        episodeLabel: `${ep}화`,
        pack,
        cuts: [{ cutId: `SUB-1-ep${ep}-c01`, luma9x8: sampleLuma }],
        baseLicenseFeeKrw: 2_000_000,
      })),
      platformFeeBps: 500,
      timestampIso: ts,
    });

    const batch = evaluateAgencySubmissionBatch(
      [
        {
          submissionId: "SUB-1",
          seriesTitle: "황녀의 검",
          pack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          tier: "episode-serialization-only",
          participants,
        },
      ],
      ts,
    );

    const dd = buildIpSlateFundDdReport({
      fundName: "ToonStudio 1호 펀드",
      batchReport: batch,
      targetSlateBudgetKrw: 10_000_000,
      evaluatedAtIso: ts,
    });

    const receiptHash = pipeline.seriesDossier.episodes[0].integrityHash;
    const loc = buildGlobalLocalizationRightsManifest({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: receiptHash,
      sourcePackageIntegrityHash: pipeline.deliveryPackages[0].packageIntegrityHash,
      tracks: [
        {
          locale: "en-US",
          translatorLabel: "EN Team",
          letteringFontAsset: "WildWords Commercial",
          letteringFontLicense: "COMMERCIAL",
          sfxAssetLicense: "MIT",
          aiTranslationUsed: false,
          humanPostEdited: true,
          includesVoiceDubbing: true,
          voiceActorConsentVerified: true,
        },
      ],
      issuedAtIso: ts,
    });

    const voice = evaluateVoiceSynthesisConsentLedger({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: receiptHash,
      localizationChainHash: loc.localizationChainHash,
      contracts: [
        {
          contractId: "VA-1",
          characterName: "아리아",
          voiceActorName: "김성우",
          allowedLocales: ["en-US"],
          allowAiVoiceClone: true,
          allowModelTrainingReuse: false,
          royaltyPerEpisodeKrw: 300_000,
          consentExpiresAtIso: "2027-12-31T23:59:59.000Z",
        },
      ],
      request: {
        targetLocales: ["en-US"],
        usesAiVoiceClone: true,
        usesModelTrainingReuse: false,
        releaseAtIso: "2026-12-01T00:00:00.000Z",
      },
      evaluatedAtIso: ts,
    });

    const audit10 = verifySeriesIpProvenanceChain(pipeline, dd, loc, voice);
    expect(audit10.allStagesVerified).toBe(true);
    expect(audit10.stages).toHaveLength(10);
    expect(audit10.brokenStages).toHaveLength(0);
  });
});
