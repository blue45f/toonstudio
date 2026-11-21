import assert from "node:assert/strict";

import { verifySealRevocationAndDerivativeJson } from "./verify-seal-revocation-and-derivative-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function makeSeal(masterAuditHash = "fnv1a-99887766") {
  const base = {
    sealSchemaVersion: 1,
    seriesTitle: "황녀의 검",
    level: "verified-10-stage",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash,
    issuedAtIso: "2026-11-20T00:00:00.000Z",
  };
  const sealDigestHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: base.seriesTitle,
      level: base.level,
      verifiedStagesCount: base.verifiedStagesCount,
      totalStagesCount: base.totalStagesCount,
      commercialAssetsCleared: base.commercialAssetsCleared,
      aiTrainingOptOut: base.aiTrainingOptOut,
      voiceConsentVerified: base.voiceConsentVerified,
      globalLocalesCount: base.globalLocalesCount,
      masterAuditHash: base.masterAuditHash,
    }),
  );
  return { ...base, sealDigestHash };
}

test("verifySealRevocationAndDerivativeJson passes active derivative requests and blocks revoked seals", () => {
  const seal = makeSeal();
  const basePayload = {
    seal,
    asOfIso: "2026-12-01T00:00:00.000Z",
    expiresAtIso: "2027-11-20T00:00:00.000Z",
    revocations: [],
    requests: [
      {
        medium: "movingtoon-shortform",
        projectTitle: "숏폼 시즌1",
        targetLocales: ["en-US"],
        requiresVoiceSynthesis: true,
      },
      {
        medium: "video-adaptation",
        projectTitle: "애니 파일럿",
        targetLocales: ["ja-JP"],
        requiresVoiceSynthesis: true,
      },
    ],
  };

  const passRes = verifySealRevocationAndDerivativeJson(
    JSON.stringify(basePayload),
    "fnv1a-99887766",
  );
  assert.equal(passRes.ok, true);
  assert.equal(passRes.clearedCount, 2);

  const revokedRes = verifySealRevocationAndDerivativeJson(
    JSON.stringify({
      ...basePayload,
      revocations: [
        {
          revocationId: "REV-1",
          sealDigestHash: seal.sealDigestHash,
          reasonCode: "font-license-expired",
          revokedAtIso: "2026-11-25T00:00:00.000Z",
        },
      ],
    }),
  );
  assert.equal(revokedRes.ok, false);
  assert.equal(revokedRes.revoked, true);
});
