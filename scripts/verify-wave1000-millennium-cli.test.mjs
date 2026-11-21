import assert from "node:assert/strict";

import { verifyWave1000MillenniumJson } from "./verify-wave1000-millennium-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("verifyWave1000MillenniumJson approves 1000-wave acyclic millennium gate and blocks incomplete wave count", () => {
  assert.equal(
    verifyWave1000MillenniumJson(
      JSON.stringify({
        totalWavesVerified: 1000,
        dagAcyclic: true,
        webgpuFrameTimeMs: 8.3,
        supportedLocalesCount: 30,
        activeRegionsCount: 3,
        autoReissuanceEnabled: true,
      }),
    ).ok,
    true,
  );
  assert.equal(
    verifyWave1000MillenniumJson(
      JSON.stringify({
        totalWavesVerified: 500,
        dagAcyclic: true,
        webgpuFrameTimeMs: 8.3,
        supportedLocalesCount: 30,
        activeRegionsCount: 3,
        autoReissuanceEnabled: true,
      }),
    ).ok,
    false,
  );
});
