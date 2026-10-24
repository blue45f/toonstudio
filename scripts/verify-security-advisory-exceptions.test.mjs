import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  verifyCodeScanningAndDependabotHardening,
  verifySecurityAdvisoryExceptions,
} from "./verify-security-advisory-exceptions.mjs";

const roots = [];

function fixture(auditConfig) {
  const root = mkdtempSync(join(tmpdir(), "toonstudio-advisory-"));
  roots.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), JSON.stringify({ packages: ["."], auditConfig }));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("security advisory audit coverage", () => {
  it.each([undefined, {}, { ignoreGhsas: [] }, { ignoreCves: [] }])(
    "accepts audits without excluded findings: %j", (auditConfig) => {
      expect(verifySecurityAdvisoryExceptions({ root: fixture(auditConfig) })).toEqual({ ignoredGhsas: [] });
    },
  );

  it.each([
    { ignoreGhsas: ["GHSA-qwww-vcr4-c8h2"] },
    { ignoreCves: ["CVE-2026-0000"] },
    { ignoreGhsas: "GHSA-qwww-vcr4-c8h2" },
    { ignoreGhsas: null },
  ])("rejects hidden advisories or malformed exclusions: %j", (auditConfig) => {
    expect(() => verifySecurityAdvisoryExceptions({ root: fixture(auditConfig) }))
      .toThrow("Security advisory exceptions are not permitted");
  });

  it("enforces Dependabot (#113, #114, #116~#119, #124, #127) and CodeQL (#131~#171) hardening invariants on the repository", () => {
    expect(verifyCodeScanningAndDependabotHardening()).toEqual({
      verifiedOverrides: 6,
      brandFilmZodVersion: "4.6.7",
    });
  });

  it("loads eslint-plugin-react-compiler cleanly under zod 4.6.7 via the zod/v3 CJS compatibility shim", async () => {
    await import("./eslint-react-compiler-zod-v3-compat.mjs");
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const reactCompilerPlugin = require("eslint-plugin-react-compiler");
    expect(reactCompilerPlugin?.rules?.["react-compiler"]).toBeDefined();
  });
});
