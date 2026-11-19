import assert from "node:assert/strict";
import test from "node:test";

import { buildStudioAdvancementScorecard } from "./audit-studio-advancement-scorecard.mjs";

test("buildStudioAdvancementScorecard reports wired multi-domain readiness, 14/14 capabilities, and 13/13 cross-domain bridges", () => {
  const scorecard = buildStudioAdvancementScorecard();
  assert.equal(scorecard.presentCapabilitiesCount, scorecard.requiredCapabilitiesCount);
  assert.equal(scorecard.requiredCapabilitiesCount, 14);
  assert.equal(
    scorecard.presentCrossDomainBridgesCount,
    scorecard.requiredCrossDomainBridgesCount,
  );
  assert.equal(scorecard.requiredCrossDomainBridgesCount, 13);
  assert.equal(scorecard.wiredRouterAndPacks, true);
  assert.equal(scorecard.domains.length, 4);
  assert.equal(scorecard.ready, true);
});
