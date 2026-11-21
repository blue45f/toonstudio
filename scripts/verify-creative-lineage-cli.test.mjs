import assert from "node:assert/strict";

import { verifyCreativeLineageJson } from "./verify-creative-lineage-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("verifyCreativeLineageJson approves clean lineage and blocks unresolved CRDT conflicts", () => {
  assert.equal(
    verifyCreativeLineageJson(
      JSON.stringify({
        bg3d: { triangleCount: 100_000, textureMemoryMb: 120 },
        brushPackLocked: true,
        unresolvedCrdtConflicts: 0,
        humanStrokeRatioPercent: 90,
      }),
    ).ok,
    true,
  );
  assert.equal(
    verifyCreativeLineageJson(
      JSON.stringify({
        bg3d: { triangleCount: 100_000, textureMemoryMb: 120 },
        brushPackLocked: true,
        unresolvedCrdtConflicts: 1,
        humanStrokeRatioPercent: 90,
      }),
    ).ok,
    false,
  );
});
