import assert from "node:assert/strict";

import { verifyPortfolioBatchReissuanceJson } from "./verify-portfolio-batch-reissuance-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function makeBatchPayload() {
  const reissuedBase = {
    sealSchemaVersion: 1,
    seriesTitle: "황녀의 검",
    level: "verified-10-stage",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash: "fnv1a-55667788",
    issuedAtIso: "2026-11-22T00:00:00.000Z",
  };
  const reissuedSealDigestHash = fnv1aHex(
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
  const reissuedSeal = { ...reissuedBase, sealDigestHash: reissuedSealDigestHash };
  const recordBase = {
    reissuanceSchemaVersion: 1,
    supersedesSealDigestHash: "fnv1a-00009999",
    resolvedRevocationId: "REV-BATCH-01",
    remediationProof: {
      resolvedReasonCode: "font-license-expired",
      replacementAssetLabel: "Pretendard Commercial (OFL)",
      evidenceReferenceId: "LIC-OFL-BATCH",
      verifiedBy: "Studio Legal Ops",
    },
    reissuedSeal,
    reissuedAtIso: "2026-11-22T00:00:00.000Z",
  };
  const reissuanceChainHash = fnv1aHex(
    JSON.stringify({
      reissuanceSchemaVersion: recordBase.reissuanceSchemaVersion,
      supersedesSealDigestHash: recordBase.supersedesSealDigestHash,
      resolvedRevocationId: recordBase.resolvedRevocationId,
      remediationProof: recordBase.remediationProof,
      reissuedSealDigestHash: reissuedSeal.sealDigestHash,
      reissuedMasterAuditHash: reissuedSeal.masterAuditHash,
      reissuedAtIso: recordBase.reissuedAtIso,
    }),
  );

  const reissuedRecords = [
    {
      episodeKey: "ep-01",
      record: { ...recordBase, reissuanceChainHash },
    },
  ];
  const baseBatch = {
    batchSchemaVersion: 1,
    totalCount: 2,
    unchangedActiveCount: 1,
    reissuedCount: 1,
    unresolvedCount: 0,
    reissuedRecords,
    unresolvedRecords: [],
    executedAtIso: "2026-11-22T00:00:00.000Z",
  };
  const batchReissuanceDigestHash = fnv1aHex(
    JSON.stringify({
      batchSchemaVersion: baseBatch.batchSchemaVersion,
      totalCount: baseBatch.totalCount,
      unchangedActiveCount: baseBatch.unchangedActiveCount,
      reissuedCount: baseBatch.reissuedCount,
      unresolvedCount: baseBatch.unresolvedCount,
      reissuedChainHashes: reissuedRecords.map((r) => ({
        episodeKey: r.episodeKey,
        reissuanceChainHash: r.record.reissuanceChainHash,
      })),
      executedAtIso: baseBatch.executedAtIso,
    }),
  );
  return { ...baseBatch, batchReissuanceDigestHash };
}

test("verifyPortfolioBatchReissuanceJson approves valid batch and rejects unresolved or tampered batches", () => {
  const valid = makeBatchPayload();
  const okRes = verifyPortfolioBatchReissuanceJson(JSON.stringify(valid));
  assert.equal(okRes.ok, true);
  assert.equal(okRes.reissuedCount, 1);

  const partial = { ...valid, unresolvedCount: 1 };
  const blockedRes = verifyPortfolioBatchReissuanceJson(JSON.stringify(partial));
  assert.equal(blockedRes.ok, false);
  assert.match(blockedRes.summary, /미해결 회차/);
});
