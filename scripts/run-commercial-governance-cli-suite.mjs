#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateSlateDdFromJson } from "./evaluate-ip-slate-dd-cli.mjs";
import {
  buildGovernanceSarifReport,
  verifyGovernanceSarifReport,
} from "./export-governance-sarif-cli.mjs";
import { simulateEpisodeSettlementFromPackJson } from "./simulate-episode-settlement-cli.mjs";
import { verifyCreativeLineageJson } from "./verify-creative-lineage-cli.mjs";
import { verifyGlobalDistributionPlanJson } from "./verify-global-distribution-cli.mjs";
import { verifyIpMarketplaceSettlementJson } from "./verify-ip-marketplace-cli.mjs";
import { verifyLocalizationManifestJson } from "./verify-localization-rights-cli.mjs";
import { verifyMovingToonPipelineJson } from "./verify-movingtoon-pipeline-cli.mjs";
import { verifyPortfolioBatchReissuanceJson } from "./verify-portfolio-batch-reissuance-cli.mjs";
import { verifyReaderEcosystemJson } from "./verify-reader-ecosystem-cli.mjs";
import { verifyReaderTrustSealJson } from "./verify-reader-trust-seal-cli.mjs";
import { verifyRightsBomReceiptJson } from "./verify-rights-bom-receipt-cli.mjs";
import { verifySealReissuanceRecordJson } from "./verify-seal-reissuance-cli.mjs";
import { verifySealRevocationAndDerivativeJson } from "./verify-seal-revocation-and-derivative-cli.mjs";
import { verifyVoiceConsentLedgerJson } from "./verify-voice-consent-ledger-cli.mjs";
import { verifyWave100MasterJson } from "./verify-wave100-master-cli.mjs";

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 5대 외부 상업 거버넌스 CLI 엔진(Rights BOM, 1원 정산, 슬레이트 DD, 글로벌 현지화, 성우 AI 음성권)을
 * 단일 해시 체인 시나리오로 연속 실행·교차 검증하는 마스터 스위트 러너.
 */
export function runCommercialGovernanceCliSuite() {
  const pack = {
    schemaVersion: 2,
    id: "suite-pack-01",
    name: "통합 거버넌스 검증 팩",
    platformId: "naver-webtoon",
    rightsBom: [{ assetLabel: "CC0 궁전 조명", license: "CC0" }],
  };

  const canonical = JSON.stringify({
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    clearedForCommercialExport: true,
    assets: [{ assetLabel: "CC0 궁전 조명", license: "CC0", commercialStatus: "cleared" }],
  });
  const receiptHash = fnv1aHex(canonical);

  const receipt = {
    receiptSchemaVersion: 1,
    generatedAtIso: "2026-11-20T11:45:00.000Z",
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    clearedForCommercialExport: true,
    blockedLicenses: [],
    assets: [{ assetLabel: "CC0 궁전 조명", license: "CC0", commercialStatus: "cleared" }],
    integrityHash: receiptHash,
  };

  const c1 = verifyRightsBomReceiptJson(JSON.stringify(receipt), JSON.stringify(pack));
  const c2 = simulateEpisodeSettlementFromPackJson(JSON.stringify(pack), {
    episodeFeeKrw: 2_000_000,
    episodeCount: 3,
  });
  const c3 = evaluateSlateDdFromJson(
    JSON.stringify({
      fundName: "Suite Fund",
      targetSlateBudgetKrw: 5_000_000,
      maxSingleTitleConcentrationPercent: 100,
      submissions: [
        {
          submissionId: "S1",
          seriesTitle: "통합 테스트작",
          episodeCount: 3,
          proposedEpisodeFeeKrw: 2_000_000,
          pack,
        },
      ],
    }),
  );
  const c4 = verifyLocalizationManifestJson(
    JSON.stringify({
      localizationSchemaVersion: 1,
      sourceReceiptIntegrityHash: receiptHash,
      tracks: [
        {
          locale: "en-US",
          translatorLabel: "EN Team",
          letteringFontLicense: "MIT",
          sfxAssetLicense: "CC0",
          aiTranslationUsed: true,
          humanPostEdited: true,
          includesVoiceDubbing: true,
          voiceActorConsentVerified: true,
        },
      ],
    }),
    receiptHash,
  );
  const c5 = verifyVoiceConsentLedgerJson(
    JSON.stringify({
      sourceReceiptIntegrityHash: receiptHash,
      contracts: [
        {
          contractId: "VA-1",
          voiceActorName: "김성우",
          allowedLocales: ["en-US"],
          allowAiVoiceClone: true,
          allowModelTrainingReuse: false,
          royaltyPerEpisodeKrw: 300_000,
          consentExpiresAtIso: "2028-12-31T23:59:59.000Z",
        },
      ],
      request: {
        targetLocales: ["en-US"],
        usesAiVoiceClone: true,
        usesModelTrainingReuse: false,
        releaseAtIso: "2026-12-01T00:00:00.000Z",
      },
    }),
    receiptHash,
  );

  const sealBase = {
    sealSchemaVersion: 1,
    seriesTitle: "통합 테스트작",
    level: "verified-10-stage",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 1,
    masterAuditHash: receiptHash,
    issuedAtIso: "2026-11-20T11:45:00.000Z",
  };
  const sealDigestHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: sealBase.seriesTitle,
      level: sealBase.level,
      verifiedStagesCount: sealBase.verifiedStagesCount,
      totalStagesCount: sealBase.totalStagesCount,
      commercialAssetsCleared: sealBase.commercialAssetsCleared,
      aiTrainingOptOut: sealBase.aiTrainingOptOut,
      voiceConsentVerified: sealBase.voiceConsentVerified,
      globalLocalesCount: sealBase.globalLocalesCount,
      masterAuditHash: sealBase.masterAuditHash,
    }),
  );
  const signedSeal = { ...sealBase, sealDigestHash };
  const c6 = verifyReaderTrustSealJson(JSON.stringify(signedSeal), {
    expectedMasterHash: receiptHash,
    requireTenStage: true,
  });
  const c7 = verifySealRevocationAndDerivativeJson(
    JSON.stringify({
      seal: signedSeal,
      asOfIso: "2026-12-01T00:00:00.000Z",
      expiresAtIso: "2027-11-20T00:00:00.000Z",
      revocations: [],
      requests: [
        {
          medium: "movingtoon-shortform",
          projectTitle: "통합 테스트 숏폼",
          targetLocales: ["en-US"],
          requiresVoiceSynthesis: true,
        },
      ],
    }),
    receiptHash,
  );

  const reissuedBase = {
    ...sealBase,
    masterAuditHash: fnv1aHex(`${receiptHash}:reissued`),
    issuedAtIso: "2026-11-21T11:45:00.000Z",
  };
  const reissuedDigest = fnv1aHex(
    JSON.stringify({
      seriesTitle: reissuedBase.seriesTitle,
      level: reissuedBase.level,
      verifiedStagesCount: reissuedBase.verifiedStagesCount,
      totalStagesCount: reissuedBase.totalStagesCount,
      commercialAssetsCleared: reissuedBase.commercialAssetsCleared,
      aiTrainingOptOut: reissuedBase.aiTrainingOptOut,
      voiceConsentVerified: reissuedBase.voiceConsentVerified,
      globalLocalesCount: reissuedBase.globalLocalesCount,
      masterAuditHash: reissuedBase.masterAuditHash,
    }),
  );
  const reissuedSeal = { ...reissuedBase, sealDigestHash: reissuedDigest };
  const reissuanceBase = {
    reissuanceSchemaVersion: 1,
    supersedesSealDigestHash: signedSeal.sealDigestHash,
    resolvedRevocationId: "REV-SUITE-01",
    remediationProof: {
      resolvedReasonCode: "font-license-expired",
      replacementAssetLabel: "Pretendard Commercial (OFL)",
      evidenceReferenceId: "LIC-OFL-SUITE",
      verifiedBy: "ToonStudio Suite",
    },
    reissuedSeal,
    reissuedAtIso: "2026-11-21T11:45:00.000Z",
  };
  const reissuanceChainHash = fnv1aHex(
    JSON.stringify({
      reissuanceSchemaVersion: reissuanceBase.reissuanceSchemaVersion,
      supersedesSealDigestHash: reissuanceBase.supersedesSealDigestHash,
      resolvedRevocationId: reissuanceBase.resolvedRevocationId,
      remediationProof: reissuanceBase.remediationProof,
      reissuedSealDigestHash: reissuedSeal.sealDigestHash,
      reissuedMasterAuditHash: reissuedSeal.masterAuditHash,
      reissuedAtIso: reissuanceBase.reissuedAtIso,
    }),
  );
  const fullReissuanceRecord = { ...reissuanceBase, reissuanceChainHash };
  const c8 = verifySealReissuanceRecordJson(
    JSON.stringify(fullReissuanceRecord),
    signedSeal.sealDigestHash,
  );

  const batchRecords = [{ episodeKey: "suite-ep-01", record: fullReissuanceRecord }];
  const batchBase = {
    batchSchemaVersion: 1,
    totalCount: 2,
    unchangedActiveCount: 1,
    reissuedCount: 1,
    unresolvedCount: 0,
    reissuedRecords: batchRecords,
    unresolvedRecords: [],
    executedAtIso: "2026-11-21T11:45:00.000Z",
  };
  const batchReissuanceDigestHash = fnv1aHex(
    JSON.stringify({
      batchSchemaVersion: batchBase.batchSchemaVersion,
      totalCount: batchBase.totalCount,
      unchangedActiveCount: batchBase.unchangedActiveCount,
      reissuedCount: batchBase.reissuedCount,
      unresolvedCount: batchBase.unresolvedCount,
      reissuedChainHashes: batchRecords.map((r) => ({
        episodeKey: r.episodeKey,
        reissuanceChainHash: r.record.reissuanceChainHash,
      })),
      executedAtIso: batchBase.executedAtIso,
    }),
  );
  const c9 = verifyPortfolioBatchReissuanceJson(
    JSON.stringify({ ...batchBase, batchReissuanceDigestHash }),
  );

  const prelimChecks = [
    { name: "verify-rights-bom-receipt-cli", ok: c1.ok },
    { name: "simulate-episode-settlement-cli", ok: c2.ok },
    { name: "evaluate-ip-slate-dd-cli", ok: c3.ok },
    { name: "verify-localization-rights-cli", ok: c4.ok },
    { name: "verify-voice-consent-ledger-cli", ok: c5.ok },
    { name: "verify-reader-trust-seal-cli", ok: c6.ok },
    { name: "verify-seal-revocation-and-derivative-cli", ok: c7.ok },
    { name: "verify-seal-reissuance-cli", ok: c8.ok },
    { name: "verify-portfolio-batch-reissuance-cli", ok: c9.ok },
  ];
  const sarif = buildGovernanceSarifReport({
    receiptHash,
    passedCount: prelimChecks.filter((c) => c.ok).length,
    totalCount: prelimChecks.length,
    checks: prelimChecks,
  });
  const c10 = verifyGovernanceSarifReport(sarif);
  const c11 = verifyGlobalDistributionPlanJson(
    JSON.stringify({
      simulpubReleaseUtcIso: "2026-12-01T15:00:00.000Z",
      watermarkPolicyEnabled: true,
      targets: [
        {
          locale: "en-US",
          gutterPx: 60,
          sfxAssetsCleared: true,
          platformSpecMatched: true,
          bubbleOverflowCount: 0,
        },
      ],
    }),
  );
  const c12 = verifyMovingToonPipelineJson(
    JSON.stringify({
      keyframes: [{ cutId: "c1", startMs: 0, endMs: 18_000 }],
      audioStems: [{ stemId: "BGM-1", licenseCleared: true }],
      captionsIncluded: true,
      bundleSizeMb: 12,
      maxMobileBudgetMb: 20,
    }),
  );
  const c13 = verifyCreativeLineageJson(
    JSON.stringify({
      bg3d: { triangleCount: 120_000, textureMemoryMb: 128 },
      brushPackLocked: true,
      unresolvedCrdtConflicts: 0,
      humanStrokeRatioPercent: 92,
    }),
  );
  const c14 = verifyIpMarketplaceSettlementJson(
    JSON.stringify({
      totalGrossRevenueKrw: 70_000_000,
      advanceRecoupedKrw: 20_000_000,
      creatorPayoutKrw: 30_000_000,
      studioShareKrw: 20_000_000,
    }),
  );
  const c15 = verifyReaderEcosystemJson(
    JSON.stringify({
      sealActive: true,
      tdmRepHeaderEnforced: true,
      triggerTagsDeclared: true,
    }),
  );
  const c16 = verifyWave100MasterJson(
    JSON.stringify({
      completedWavesCount: 100,
      euAiActDisclosureReady: true,
      incidentKillSwitchArmed: true,
      coldStorageRetentionYears: 10,
      replicatedRegionsCount: 3,
      creatorWeeklyHours: 40,
    }),
  );

  const checks = [
    ...prelimChecks,
    { name: "export-governance-sarif-cli", ok: c10.ok },
    { name: "verify-global-distribution-cli", ok: c11.ok },
    { name: "verify-movingtoon-pipeline-cli", ok: c12.ok },
    { name: "verify-creative-lineage-cli", ok: c13.ok },
    { name: "verify-ip-marketplace-cli", ok: c14.ok },
    { name: "verify-reader-ecosystem-cli", ok: c15.ok },
    { name: "verify-wave100-master-cli", ok: c16.ok },
  ];

  const passedCount = checks.filter((c) => c.ok).length;
  const ok = passedCount === checks.length;
  return {
    ok,
    passedCount,
    totalCount: checks.length,
    receiptHash,
    checks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = runCommercialGovernanceCliSuite();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(
      `ToonStudio Commercial Governance 16-CLI Suite: ${res.passedCount}/${res.totalCount} PASS (${res.receiptHash})`,
    );
  }
  if (!res.ok) {
    process.exitCode = 1;
  }
}
