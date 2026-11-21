import assert from "node:assert/strict";

import { runCommercialGovernanceCliSuite } from "./run-commercial-governance-cli-suite.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("runCommercialGovernanceCliSuite passes all 17 standalone governance CLIs on a shared receipt hash", () => {
  const res = runCommercialGovernanceCliSuite();
  assert.equal(res.ok, true);
  assert.equal(res.passedCount, 17);
  assert.equal(res.totalCount, 17);
});
