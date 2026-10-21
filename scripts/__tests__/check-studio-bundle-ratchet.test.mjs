import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const gateScript = path.join(repoRoot, "scripts", "check-studio-bundle.mjs");
const baselineFile = path.join(repoRoot, "scripts", "bundle-baseline.json");
const gateSource = readFileSync(gateScript, "utf8");
const distManifest = path.join(repoRoot, "dist", ".vite", "manifest.json");

/**
 * The gate needs a production build. `pnpm run ci` runs Vitest before `build`,
 * so the integration half of this suite has to stand down when dist/ is absent
 * rather than fail a green tree.
 */
const hasProductionBuild = existsSync(distManifest);

function runGate(baselinePath, extraArgs = []) {
  try {
    const stdout = execFileSync(process.execPath, [gateScript, ...extraArgs], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, STUDIO_BUNDLE_BASELINE: baselinePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
    };
  }
}

describe("studio bundle ratchet gate", () => {
  it("does not veto release based on bundle bytes or chunk counts", () => {
    expect(gateSource).toContain("function evaluateRatchet(");
    expect(gateSource).toContain("return Number.POSITIVE_INFINITY;");
    expect(gateSource).toContain("bundle size ratchet: disabled");
    expect(gateSource).toContain("structural lazy-loading and worker-isolation checks remain enforced");
  });

  it("keeps reference budgets advisory and preserves baseline telemetry", () => {
    // Reference values remain useful for reporting, but bundle size and chunk
    // counts do not veto releases.
    expect(gateSource).toContain("telemetry, not release vetoes");
    expect(gateSource).toContain("references are telemetry, not release vetoes");
    expect(gateSource).toContain("UPDATE_BUNDLE_BASELINE");
    expect(gateSource).toContain("TIGHTEN_BUNDLE_BASELINE");
    expect(gateSource).toContain("const recordedAt = new Date().toISOString();");
    expect(gateSource).toMatch(/nextRuntime = \{\s*recordedAt,/u);
  });

  it("measures eager-dynamic chunks in a browser rather than trusting the manifest", () => {
    // checkDynamicBoundary only proves "absent from the static graph", which a
    // mount-time await satisfies. Only a real load can tell the difference.
    expect(gateSource).toContain("async function probeRuntimeStartup(");
    expect(gateSource).toContain("eager-dynamic requests");
    expect(gateSource).toContain("eager-dynamic decoded bytes");
    expect(gateSource).toMatch(/--runtime/u);
    expect(gateSource).toContain('const runtimeProbePath = "/studio/canvas";');
    expect(gateSource).toContain("`${baseUrl}${runtimeProbePath}`");
  });

  it("reports public-page CWV budgets for / and /discover (BLUEPRINT §6.4)", () => {
    // Perf finding 5: the gate used to measure only the Studio surface, so the
    // pages a guest meets first had no budget and no probe. The public budgets
    // must stay the §6.4 targets, the probe must stay opt-in like --runtime,
    // and overages must reach the report (observations + reference table)
    // without becoming a ratchet veto — bytes/CWV references are telemetry.
    expect(gateSource).toContain("const publicPageBudgets = {");
    expect(gateSource).toContain("lcpMs: 2_500");
    expect(gateSource).toContain("cls: 0.1");
    expect(gateSource).toContain("inpMs: 200");
    expect(gateSource).toContain('const publicProbePaths = ["/", "/discover"];');
    expect(gateSource).toContain("async function probePublicPages(");
    expect(gateSource).toContain('"--public-runtime"');
    expect(gateSource).toContain("STUDIO_BUNDLE_PUBLIC_RUNTIME");
    expect(gateSource).toContain('recordMeasurement("public"');
    expect(gateSource).toContain("function reportPublicCwvSection(");
  });

  it("ships a committed baseline with plausible measurements", () => {
    expect(existsSync(baselineFile)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
    expect(baseline.schema).toBe("toonstudio.bundle-baseline/1");
    expect(Object.keys(baseline.static).length).toBeGreaterThan(10);
    for (const [key, value] of Object.entries(baseline.static)) {
      expect(typeof value, `${key} must be numeric`).toBe("number");
      expect(value, `${key} must be positive`).toBeGreaterThan(0);
    }
    expect(baseline.static["Studio route raw"]).toBeGreaterThan(
      baseline.static["StudioPage entry raw"],
    );
    expect(baseline.runtime.metrics["eager-dynamic requests"]).toBeGreaterThan(0);
    expect(baseline.runtime.eagerDynamicChunks.length).toBe(
      baseline.runtime.metrics["eager-dynamic requests"],
    );
  });

  describe.skipIf(!hasProductionBuild)("against the current production build", () => {
    it("passes its own recorded baseline", () => {
      const result = runGate(baselineFile);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("within baseline");
      expect(result.stdout).not.toContain("REGRESSED");
      expect(result.stderr).not.toContain("regressed to");
    }, 120_000);

    it("does not block when a measurement grows past the baseline", () => {
      const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
      baseline.static["Studio route raw"] = Math.round(
        baseline.static["Studio route raw"] * 0.5,
      );
      const directory = mkdtempSync(path.join(tmpdir(), "studio-bundle-ratchet-"));
      const tightened = path.join(directory, "bundle-baseline.json");
      writeFileSync(tightened, JSON.stringify(baseline, null, 2));

      const result = runGate(tightened);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("bundle size ratchet: disabled");
      expect(result.stderr).not.toContain("Studio route raw regressed to");
    }, 120_000);

    it("does not carry temporary gzip headroom into a different accepted baseline", () => {
      const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
      baseline.static["Studio route gzip"] = Math.floor(baseline.static["Studio route gzip"] / 2);
      const directory = mkdtempSync(path.join(tmpdir(), "studio-gzip-exception-"));
      const tightened = path.join(directory, "bundle-baseline.json");
      writeFileSync(tightened, JSON.stringify(baseline));
      const result = runGate(tightened);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("bundle size ratchet: disabled");
      expect(result.stderr).not.toContain("Studio route gzip regressed to");
    }, 120_000);

    it("refuses to run without a baseline instead of silently passing", () => {
      const directory = mkdtempSync(path.join(tmpdir(), "studio-bundle-ratchet-"));
      const result = runGate(path.join(directory, "absent-baseline.json"));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("UPDATE_BUNDLE_BASELINE=1");
    }, 120_000);
  });
});
