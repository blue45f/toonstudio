import assert from "node:assert/strict";
import test from "node:test";

import { verifyMovingToonPipelineJson } from "./verify-movingtoon-pipeline-cli.mjs";

test("verifyMovingToonPipelineJson approves valid MovingToon delivery and blocks uncleared stems", () => {
  const okRes = verifyMovingToonPipelineJson(
    JSON.stringify({
      keyframes: [{ cutId: "c1", startMs: 0, endMs: 12000 }],
      audioStems: [{ stemId: "BGM-1", licenseCleared: true }],
      captionsIncluded: true,
      bundleSizeMb: 10,
      maxMobileBudgetMb: 20,
    }),
  );
  assert.equal(okRes.ok, true);

  const badRes = verifyMovingToonPipelineJson(
    JSON.stringify({
      keyframes: [{ cutId: "c1", startMs: 0, endMs: 12000 }],
      audioStems: [{ stemId: "BGM-1", licenseCleared: false }],
      captionsIncluded: true,
      bundleSizeMb: 10,
      maxMobileBudgetMb: 20,
    }),
  );
  assert.equal(badRes.ok, false);
});
