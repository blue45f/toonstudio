import assert from "node:assert/strict";

import { verifyReaderTrustSealJson } from "./verify-reader-trust-seal-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function makeSignedSeal(overrides = {}) {
  const base = {
    sealSchemaVersion: 1,
    seriesTitle: "클린 IP 대표작",
    level: "verified-10-stage",
    verifiedStagesCount: 10,
    totalStagesCount: 10,
    commercialAssetsCleared: true,
    aiTrainingOptOut: true,
    voiceConsentVerified: true,
    globalLocalesCount: 2,
    masterAuditHash: "fnv1a-12345678",
    issuedAtIso: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
  const digest = fnv1aHex(
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
  return { ...base, sealDigestHash: digest };
}

test("verifyReaderTrustSealJson approves valid signed 10-stage seal and rejects tampered digest", () => {
  const valid = makeSignedSeal();
  const okRes = verifyReaderTrustSealJson(JSON.stringify(valid), {
    expectedMasterHash: "fnv1a-12345678",
    requireTenStage: true,
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.level, "verified-10-stage");

  const tampered = { ...valid, globalLocalesCount: 7 };
  const badRes = verifyReaderTrustSealJson(JSON.stringify(tampered));
  assert.equal(badRes.ok, false);
  assert.match(badRes.summary, /위변조 감지/);
});
