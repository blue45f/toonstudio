import assert from "node:assert/strict";

import { verifyReaderEcosystemJson } from "./verify-reader-ecosystem-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

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
