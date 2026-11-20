import assert from "node:assert/strict";
import test from "node:test";

import { verifyVoiceConsentLedgerJson } from "./verify-voice-consent-ledger-cli.mjs";

test("verifyVoiceConsentLedgerJson approves in-scope AI voice dubbing and blocks model training reuse", () => {
  const input = {
    sourceReceiptIntegrityHash: "fnv1a-11223344",
    contracts: [
      {
        contractId: "VA-1",
        voiceActorName: "김성우",
        allowedLocales: ["en-US", "ja-JP"],
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
  };

  const pass = verifyVoiceConsentLedgerJson(JSON.stringify(input), "fnv1a-11223344");
  assert.equal(pass.ok, true);
  assert.equal(pass.totalRoyaltyKrw, 300_000);

  const blocked = verifyVoiceConsentLedgerJson(
    JSON.stringify({
      ...input,
      request: { ...input.request, usesModelTrainingReuse: true },
    }),
  );
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.blockedActors, ["김성우"]);
});
