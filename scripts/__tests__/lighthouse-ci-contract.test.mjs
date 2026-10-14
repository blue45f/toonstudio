import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const config = JSON.parse(readFileSync(path.join(repoRoot, "lighthouserc.json"), "utf8"));
const workflow = readFileSync(
  path.join(repoRoot, ".github/workflows/lighthouse-ci.yml"),
  "utf8",
);
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));

/**
 * Build-free contract for the Lighthouse CI gate. The lab run itself needs a
 * production build plus Chrome, so it lives in the workflow; this suite pins
 * the wiring that makes that run a gate instead of a report: BLUEPRINT §6
 * budgets as `error` assertions, public URLs only, a dev-only CLI, and no
 * external upload target (reports leave CI as workflow artifacts only).
 */
describe("lighthouse CI gate contract", () => {
  it("measures only the public surfaces already used as CWV probe paths", () => {
    expect(config.ci.collect.url).toEqual([
      "http://127.0.0.1:4173/",
      "http://127.0.0.1:4173/discover",
    ]);
    expect(config.ci.collect.url.join(" ")).not.toMatch(/studio|account|admin/);
    expect(config.ci.collect.numberOfRuns).toBe(3);
    expect(config.ci.collect.startServerCommand).toContain("vite preview");
  });

  it("asserts the §6 budgets as errors: LCP 2500ms, CLS 0.1, INP proxy TBT 200ms", () => {
    const assertions = config.ci.assert.assertions;
    expect(assertions["largest-contentful-paint"]).toEqual([
      "error",
      { aggregationMethod: "median-run", maxNumericValue: 2500 },
    ]);
    expect(assertions["cumulative-layout-shift"]).toEqual([
      "error",
      { aggregationMethod: "median-run", maxNumericValue: 0.1 },
    ]);
    // Lighthouse has no lab INP audit; TBT at the INP budget is the proxy
    // gate, and field INP is owned by the web-vitals beacon.
    expect(assertions["total-blocking-time"]).toEqual([
      "error",
      { aggregationMethod: "median-run", maxNumericValue: 200 },
    ]);
  });

  it("keeps reports local to the CI run (filesystem upload, no LHCI server)", () => {
    expect(config.ci.upload).toEqual({
      outputDir: ".lighthouseci",
      target: "filesystem",
    });
  });

  it("installs @lhci/cli as a dev-only dependency and exposes one autorun script", () => {
    expect(pkg.devDependencies["@lhci/cli"]).toBe("0.15.1");
    expect(pkg.dependencies?.["@lhci/cli"]).toBeUndefined();
    expect(pkg.scripts["lhci:autorun"]).toBe(
      "lhci autorun --config=lighthouserc.json",
    );
  });

  it("runs autorun on pull requests after building the candidate bundle", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("pnpm run build:bundle");
    expect(workflow).toContain("pnpm run lhci:autorun");
    expect(workflow.indexOf("pnpm run build:bundle")).toBeLessThan(
      workflow.indexOf("pnpm run lhci:autorun"),
    );
    expect(workflow).toContain("actions/upload-artifact");
  });
});
