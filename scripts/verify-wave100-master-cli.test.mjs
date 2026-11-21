import assert from "node:assert/strict";

import { verifyWave100MasterJson } from "./verify-wave100-master-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("verifyWave100MasterJson passes Wave 100 mastery criteria and blocks single-region or burnout", () => {
  assert.equal(
    verifyWave100MasterJson(
      JSON.stringify({
        completedWavesCount: 100,
        euAiActDisclosureReady: true,
        incidentKillSwitchArmed: true,
        coldStorageRetentionYears: 10,
        replicatedRegionsCount: 3,
        creatorWeeklyHours: 40,
      }),
    ).ok,
    true,
  );
  assert.equal(
    verifyWave100MasterJson(
      JSON.stringify({
        completedWavesCount: 100,
        euAiActDisclosureReady: true,
        incidentKillSwitchArmed: true,
        coldStorageRetentionYears: 10,
        replicatedRegionsCount: 1,
        creatorWeeklyHours: 70,
      }),
    ).ok,
    false,
  );
});
