/**
 * Compares a baseline soak JSON report against a candidate soak JSON report and
 * fails closed (exit code 1) if long-session latency, heap slope, or detached VRAM
 * regresses beyond production release thresholds.
 *
 * Usage:
 *   node --experimental-strip-types scripts/compare-soak-reports.mts baseline.json candidate.json
 */

import { readFile } from "node:fs/promises";

interface SoakReportSummary {
  readonly passed: boolean;
  readonly p99RoundMs: number;
  readonly heapSlopeMbPerHour: number;
  readonly detachedVramPx: number;
  readonly finalHeapGrowthMb: number;
}

const MAX_P99_REGRESSION_RATIO = 1.2;
const P99_NOISE_FLOOR_MS = 1.0;
const MAX_ALLOWED_HEAP_SLOPE_MB_PER_HOUR = 15;
const MAX_ALLOWED_DETACHED_VRAM_PX = 4;

async function readReport(filePath: string): Promise<SoakReportSummary> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<SoakReportSummary>;
  if (
    typeof parsed.passed !== "boolean"
    || typeof parsed.p99RoundMs !== "number"
    || typeof parsed.heapSlopeMbPerHour !== "number"
    || typeof parsed.detachedVramPx !== "number"
  ) {
    throw new Error(`Invalid soak report schema: ${filePath}`);
  }
  return {
    passed: parsed.passed,
    p99RoundMs: parsed.p99RoundMs,
    heapSlopeMbPerHour: parsed.heapSlopeMbPerHour,
    detachedVramPx: parsed.detachedVramPx,
    finalHeapGrowthMb: typeof parsed.finalHeapGrowthMb === "number" ? parsed.finalHeapGrowthMb : 0,
  };
}

async function main(): Promise<void> {
  const [baselinePath, candidatePath] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    console.error("Usage: node --experimental-strip-types scripts/compare-soak-reports.mts <baseline.json> <candidate.json>");
    process.exitCode = 1;
    return;
  }

  const [baseline, candidate] = await Promise.all([
    readReport(baselinePath),
    readReport(candidatePath),
  ]);

  const failures: string[] = [];
  if (!candidate.passed) {
    failures.push("candidate soak report marked passed=false");
  }
  const p99Ceiling = Math.max(baseline.p99RoundMs * MAX_P99_REGRESSION_RATIO, baseline.p99RoundMs + P99_NOISE_FLOOR_MS);
  if (candidate.p99RoundMs > p99Ceiling) {
    failures.push(
      `p99RoundMs regressed: ${candidate.p99RoundMs}ms > allowed ${p99Ceiling.toFixed(2)}ms (baseline ${baseline.p99RoundMs}ms)`,
    );
  }
  if (candidate.heapSlopeMbPerHour > MAX_ALLOWED_HEAP_SLOPE_MB_PER_HOUR) {
    failures.push(
      `heapSlopeMbPerHour exceeded gate: ${candidate.heapSlopeMbPerHour}MB/h > ${MAX_ALLOWED_HEAP_SLOPE_MB_PER_HOUR}MB/h`,
    );
  }
  if (candidate.detachedVramPx > MAX_ALLOWED_DETACHED_VRAM_PX) {
    failures.push(
      `detachedVramPx exceeded gate: ${candidate.detachedVramPx}px² > ${MAX_ALLOWED_DETACHED_VRAM_PX}px²`,
    );
  }

  if (failures.length > 0) {
    console.error("[soak-compare] FAIL:");
    for (const reason of failures) console.error(`  - ${reason}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[soak-compare] PASS: p99RoundMs=${candidate.p99RoundMs}ms (baseline ${baseline.p99RoundMs}ms), heapSlope=${candidate.heapSlopeMbPerHour}MB/h, detachedVramPx=${candidate.detachedVramPx}`,
  );
}

main().catch((error: unknown) => {
  console.error("[soak-compare] ERROR:", error);
  process.exitCode = 1;
});
