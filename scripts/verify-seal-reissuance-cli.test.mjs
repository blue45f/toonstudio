import assert from "node:assert/strict";

import { verifySealReissuanceRecordJson } from "./verify-seal-reissuance-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function makeReissuanceRecord() {
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
    masterAuditHash: "fnv1a-22334455",
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

  const baseRecord = {
    reissuanceSchemaVersion: 1,
    supersedesSealDigestHash: "fnv1a-00001111",
    resolvedRevocationId: "REV-FONT-01",
    remediationProof: {
      resolvedReasonCode: "font-license-expired",
      replacementAssetLabel: "Pretendard Commercial (OFL)",
      evidenceReferenceId: "LIC-OFL-2026-09",
      verifiedBy: "ToonStudio Rights Bot",
    },
    reissuedSeal,
    reissuedAtIso: "2026-11-22T00:00:00.000Z",
  };

  const reissuanceChainHash = fnv1aHex(
    JSON.stringify({
      reissuanceSchemaVersion: baseRecord.reissuanceSchemaVersion,
      supersedesSealDigestHash: baseRecord.supersedesSealDigestHash,
      resolvedRevocationId: baseRecord.resolvedRevocationId,
      remediationProof: baseRecord.remediationProof,
      reissuedSealDigestHash: reissuedSeal.sealDigestHash,
      reissuedMasterAuditHash: reissuedSeal.masterAuditHash,
      reissuedAtIso: baseRecord.reissuedAtIso,
    }),
  );

  return { ...baseRecord, reissuanceChainHash };
}

test("verifySealReissuanceRecordJson approves valid reissued record and rejects tampered chain hash", () => {
  const record = makeReissuanceRecord();
  const okRes = verifySealReissuanceRecordJson(JSON.stringify(record), "fnv1a-00001111");
  assert.equal(okRes.ok, true);

  const tampered = {
    ...record,
    remediationProof: { ...record.remediationProof, evidenceReferenceId: "FAKE-ID" },
  };
  const badRes = verifySealReissuanceRecordJson(JSON.stringify(tampered));
  assert.equal(badRes.ok, false);
  assert.match(badRes.summary, /위변조 감지/);
});
