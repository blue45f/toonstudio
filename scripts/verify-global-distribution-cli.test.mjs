import assert from "node:assert/strict";

import { verifyGlobalDistributionPlanJson } from "./verify-global-distribution-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("verifyGlobalDistributionPlanJson approves compliant simulpub plan and blocks bubble overflow", () => {
  const okRes = verifyGlobalDistributionPlanJson(
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
  assert.equal(okRes.ok, true);

  const badRes = verifyGlobalDistributionPlanJson(
    JSON.stringify({
      simulpubReleaseUtcIso: "2026-12-01T15:00:00.000Z",
      watermarkPolicyEnabled: true,
      targets: [
        {
          locale: "de-DE",
          gutterPx: 60,
          sfxAssetsCleared: true,
          platformSpecMatched: true,
          bubbleOverflowCount: 2,
        },
      ],
    }),
  );
  assert.equal(badRes.ok, false);
});
