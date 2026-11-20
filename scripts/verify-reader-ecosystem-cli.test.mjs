import assert from "node:assert/strict";
import test from "node:test";

import { verifyReaderEcosystemJson } from "./verify-reader-ecosystem-cli.mjs";

test("verifyReaderEcosystemJson passes compliant reader ecosystem and blocks missing TDMRep", () => {
  assert.equal(
    verifyReaderEcosystemJson(
      JSON.stringify({
        sealActive: true,
        tdmRepHeaderEnforced: true,
        triggerTagsDeclared: true,
      }),
    ).ok,
    true,
  );
  assert.equal(
    verifyReaderEcosystemJson(
      JSON.stringify({
        sealActive: true,
        tdmRepHeaderEnforced: false,
        triggerTagsDeclared: true,
      }),
    ).ok,
    false,
  );
});
