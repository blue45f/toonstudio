import assert from "node:assert/strict";
import test from "node:test";

import { verifyLocalizationManifestJson } from "./verify-localization-rights-cli.mjs";

test("verifyLocalizationManifestJson passes clean multi-locale tracks and rejects source hash mismatch or NC fonts", () => {
  const cleanManifest = {
    localizationSchemaVersion: 1,
    sourceReceiptIntegrityHash: "fnv1a-11223344",
    localizationChainHash: "fnv1a-99887766",
    tracks: [
      {
        locale: "en-US",
        translatorLabel: "EN Studio",
        letteringFontLicense: "COMMERCIAL",
        sfxAssetLicense: "MIT",
        aiTranslationUsed: true,
        humanPostEdited: true,
        includesVoiceDubbing: false,
        voiceActorConsentVerified: false,
      },
    ],
  };

  const pass = verifyLocalizationManifestJson(JSON.stringify(cleanManifest), "fnv1a-11223344");
  assert.equal(pass.ok, true);

  const hashMismatch = verifyLocalizationManifestJson(
    JSON.stringify(cleanManifest),
    "fnv1a-deadbeef",
  );
  assert.equal(hashMismatch.ok, false);

  const ncFont = verifyLocalizationManifestJson(
    JSON.stringify({
      ...cleanManifest,
      tracks: [{ ...cleanManifest.tracks[0], letteringFontLicense: "CC-BY-NC" }],
    }),
  );
  assert.equal(ncFont.ok, false);
  assert.deepEqual(ncFont.blockedLocales, ["en-US"]);
});
