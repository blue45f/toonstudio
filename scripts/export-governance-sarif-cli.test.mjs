import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGovernanceSarifReport,
  verifyGovernanceSarifReport,
} from "./export-governance-sarif-cli.mjs";

test("buildGovernanceSarifReport emits valid SARIF 2.1.0 and catches failed governance checks", () => {
  const cleanSarif = buildGovernanceSarifReport({
    receiptHash: "fnv1a-bc0b4c27",
    passedCount: 2,
    totalCount: 2,
    checks: [
      { name: "verify-rights-bom-receipt-cli", ok: true },
      { name: "verify-reader-trust-seal-cli", ok: true },
    ],
  });
  assert.equal(verifyGovernanceSarifReport(cleanSarif).ok, true);

  const failedSarif = buildGovernanceSarifReport({
    receiptHash: "fnv1a-bc0b4c27",
    passedCount: 1,
    totalCount: 2,
    checks: [
      { name: "verify-rights-bom-receipt-cli", ok: true },
      { name: "verify-reader-trust-seal-cli", ok: false },
    ],
  });
  assert.equal(verifyGovernanceSarifReport(failedSarif).ok, false);
  assert.equal(failedSarif.runs[0].results.length, 1);
});
