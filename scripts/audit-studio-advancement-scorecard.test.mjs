import assert from "node:assert/strict";
import test from "node:test";

import { buildStudioAdvancementScorecard } from "./audit-studio-advancement-scorecard.mjs";

test("buildStudioAdvancementScorecard reports wired router, workflow packs, and test parity", () => {
  const scorecard = buildStudioAdvancementScorecard();
  assert.equal(scorecard.presentCapabilitiesCount, scorecard.requiredCapabilitiesCount);
  assert.equal(scorecard.wiredRouterAndPacks, true);
  assert.equal(scorecard.ready, true);
  assert.ok(scorecard.testFileCount >= 6);
});
