/**
 * One-command local verification runner for ToonStudio long-session collaborative drawing stability.
 *
 * Runs:
 * 1. `pnpm run test:collab-stability` (web + API long-session & mobile UX regression suites)
 * 2. 10-second chaos soak smoke test writing `/tmp/toonstudio-soak-smoke.json`
 * 3. `scripts/compare-soak-reports.mts` self-parity check against the smoke report
 *
 * Usage:
 *   pnpm run verify:collab-stability
 */

import { spawnSync } from "node:child_process";

const SMOKE_REPORT_PATH = "/tmp/toonstudio-soak-smoke.json";

function runStep(label, command, args) {
  console.log(`\n[verify:collab-stability] ${label}...`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`[verify:collab-stability] FAIL at "${label}" (exit=${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

runStep("1/3 Regression unit tests (web + API)", "pnpm", ["run", "test:collab-stability"]);
runStep("2/3 10-second chaos soak smoke run", process.execPath, [
  "--experimental-strip-types",
  "scripts/soak-studio-live-collab-drawing.mts",
  "--duration-ms=10000",
  "--chaos=true",
  `--report-json=${SMOKE_REPORT_PATH}`,
]);
runStep("3/3 Soak report gate self-check", process.execPath, [
  "--experimental-strip-types",
  "scripts/compare-soak-reports.mts",
  SMOKE_REPORT_PATH,
  SMOKE_REPORT_PATH,
]);

console.log("\n[verify:collab-stability] ALL CHECKS PASSED");
