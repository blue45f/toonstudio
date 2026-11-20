import assert from "node:assert/strict";
import test from "node:test";

import { runCommercialGovernanceCliSuite } from "./run-commercial-governance-cli-suite.mjs";

test("runCommercialGovernanceCliSuite passes all 7 standalone governance CLIs on a shared receipt hash", () => {
  const res = runCommercialGovernanceCliSuite();
  assert.equal(res.ok, true);
  assert.equal(res.passedCount, 7);
  assert.equal(res.totalCount, 7);
});
