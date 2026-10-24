#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * GHSA-qwww-vcr4-c8h2 now correctly lists React Router 7.18.2 as patched.
 * The temporary metadata exception is retired: audits must report every
 * advisory, including development dependencies and low-severity findings.
 */
export function verifySecurityAdvisoryExceptions({ root = REPOSITORY_ROOT } = {}) {
  const workspace = parseYaml(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  const ignored = Object.entries(workspace?.auditConfig ?? {}).filter(([key, value]) =>
    key.startsWith("ignore") && (!Array.isArray(value) || value.length > 0),
  );
  if (ignored.length > 0) {
    throw new Error(
      `Security advisory exceptions are not permitted: ${ignored.map(([key]) => key).join(", ")}.`,
    );
  }
  return Object.freeze({ ignoredGhsas: Object.freeze([]) });
}

/**
 * Dependabot(#113, #114, #116~#119, #124, #127) 및 CodeQL(#131~#171) 보안 경고 수정이
 * 회귀하지 않도록 핵심 핀과 정적 소독 불변식을 함께 검증한다.
 */
export function verifyCodeScanningAndDependabotHardening({ root = REPOSITORY_ROOT } = {}) {
  const workspace = parseYaml(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  const overrides = workspace?.overrides ?? {};
  const requiredOverrides = {
    multer: ">=2.5.0",
    undici: "7.30.1",
    "fast-uri@>=3.0.0 <3.1.9": "3.1.9",
    "body-parser@>=1.0.0 <1.20.9": "1.20.9",
    "body-parser@>=2.0.0 <2.4.0": "2.4.0",
    "zod@<4.6.6": "4.6.7",
  };
  for (const [key, expected] of Object.entries(requiredOverrides)) {
    if (String(overrides[key]) !== String(expected)) {
      throw new Error(
        `Security override regression for ${key}: expected ${String(expected)}, found ${String(overrides[key])}.`,
      );
    }
  }

  const brandFilmLock = JSON.parse(
    readFileSync(join(root, "tools/media/brand-film/package-lock.json"), "utf8"),
  );
  const brandFilmZodVersion = brandFilmLock?.packages?.["node_modules/zod"]?.version ?? "";
  if (brandFilmZodVersion !== "4.6.7") {
    throw new Error(
      `brand-film zod lockfile regression: expected 4.6.7, found ${String(brandFilmZodVersion)}.`,
    );
  }

  const userAiStore = readFileSync(
    join(root, "apps/web/src/shared/ai/user-ai-store.ts"),
    "utf8",
  );
  if (userAiStore.includes('.includes("api.anthropic.com")')) {
    throw new Error("CodeQL #171 regression: user-ai-store.ts must use isAnthropicBaseUrl instead of substring includes.");
  }

  const canonEditor = readFileSync(
    join(root, "apps/web/src/domains/creator/ai/canon/StudioCharacterCanonEditor.tsx"),
    "utf8",
  );
  if (canonEditor.includes('getElementById("canon-shaper-url")')) {
    throw new Error("CodeQL #131 regression: StudioCharacterCanonEditor.tsx must not read uncontrolled DOM text via getElementById.");
  }

  return Object.freeze({
    verifiedOverrides: Object.keys(requiredOverrides).length,
    brandFilmZodVersion,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifySecurityAdvisoryExceptions();
  verifyCodeScanningAndDependabotHardening();
  process.stdout.write("Verified that no security advisories are excluded from the audit.\n");
}
