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
 * Build-free contract for Lighthouse CI telemetry. The lab run itself needs a
 * production build plus Chrome, so it lives in the workflow; this suite pins
 * public URLs, warning-only metrics, a dev-only CLI, and local report storage.
 */
describe("lighthouse CI telemetry contract", () => {
  it("measures only the public surfaces already used as CWV probe paths", () => {
    expect(config.ci.collect.url).toEqual([
      "http://127.0.0.1:4173/",
      "http://127.0.0.1:4173/discover",
    ]);
    expect(config.ci.collect.url.join(" ")).not.toMatch(/studio|account|admin/);
    expect(config.ci.collect.numberOfRuns).toBe(3);
    expect(config.ci.collect.startServerCommand).toContain("vite preview");
  });

  it("keeps CWV thresholds informational so lab variance cannot block release", () => {
    const assertions = config.ci.assert.assertions;
    expect(assertions["largest-contentful-paint"]).toEqual([
      "warn",
      { aggregationMethod: "median-run", maxNumericValue: 2500 },
    ]);
    expect(assertions["cumulative-layout-shift"]).toEqual([
      "warn",
      { aggregationMethod: "median-run", maxNumericValue: 0.1 },
    ]);
    // Lighthouse has no lab INP audit; TBT remains a warning-only proxy.
    // Field INP is owned by the web-vitals beacon.
    expect(assertions["total-blocking-time"]).toEqual([
      "warn",
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
