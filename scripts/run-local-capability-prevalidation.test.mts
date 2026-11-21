import assert from "node:assert/strict";
import nodeTest from "node:test";

import { test as vitestTest } from "vitest";

import {
  renderLocalPrevalidationMarkdown,
  runLocalCapabilityPrevalidation,
} from "./run-local-capability-prevalidation.mts";

function registerTest(name: string, fn: () => Promise<void> | void): void {
  if (process.env.VITEST) {
    vitestTest(name, fn);
    return;
  }
  void nodeTest(name, fn);
}

registerTest("로컬 사전 검증 6/12 하네스가 6건 실측을 통과하고 외부 전용 6건과 replacementClaimAllowed=false 경계를 보존한다", async () => {
  const report = await runLocalCapabilityPrevalidation({
    executedAt: "2026-11-21T00:00:00.000Z",
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.ledgerBaseline.targetCapabilityCount, 57);
  assert.equal(report.ledgerBaseline.verifiedCount, 45);
  assert.equal(report.ledgerBaseline.externalValidationPendingCount, 12);
  assert.equal(report.ledgerBaseline.incompleteCount, 0);
  assert.equal(report.ledgerBaseline.replacementClaimAllowed, false);

  assert.equal(report.prevalidationSummary.totalPendingCount, 12);
  assert.equal(report.prevalidationSummary.localPrevalidatedCount, 6);
  assert.equal(report.prevalidationSummary.localFailedCount, 0);
  assert.equal(report.prevalidationSummary.externalOnlyBoundaryCount, 6);
  assert.equal(report.prevalidationSummary.replacementClaimAllowed, false);

  assert.deepEqual(
    report.localPrevalidations.map((item) => item.sequence),
    [31, 32, 33, 54, 55, 56],
  );
  assert.ok(report.localPrevalidations.every((item) => item.status === "local-prevalidated"));

  assert.deepEqual(
    report.externalOnlyBoundaries.map((item) => item.sequence),
    [49, 50, 51, 52, 53, 57],
  );
  assert.ok(
    report.externalOnlyBoundaries.every(
      (item) => item.status === "external-only-boundary-preserved",
    ),
  );

  const markdown = renderLocalPrevalidationMarkdown(report);
  assert.match(markdown, /6\/12/u);
  assert.match(markdown, /external-only-boundary-preserved/u);
  assert.match(markdown, /replacementClaimAllowed/u);
});
