import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

// [wave7-stage1 draft] App-shell builtins no longer compile these namespaces in.
// Their ko/en dictionaries are emitted as a separate generated bundle owned by the
// monetization domain (mirroring the Admin scope split below) and are registered
// synchronously when a monetization module is evaluated — see
// apps/web/src/domains/monetization/monetization-i18n.ts.
// Non-ko/en locales are unaffected: loadAppI18nLocale still fetches every
// APP_I18N_NAMESPACES asset from public/i18n/app at runtime.
const LAZY_APP_BUILTIN_NAMESPACES = new Set([
  "membership",
  "paywall",
  "revenue",
  "tipping",
]);

function mergeLocale(scope, locale, namespaceFilter) {
  const root = path.join(repoRoot, "apps/web/public/i18n", scope);
  const merged = {};
  for (const namespace of readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    if (namespaceFilter && !namespaceFilter(namespace)) continue;
    const file = path.join(root, namespace, locale + ".json");
    let source;
    try {
      source = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("Expected an object dictionary at " + file);
    }
    Object.assign(merged, source);
  }
  return merged;
}

function render(scope, namespaceFilter) {
  return JSON.stringify({
    en: mergeLocale(scope, "en", namespaceFilter),
    ko: mergeLocale(scope, "ko", namespaceFilter),
  }, null, 2) + "\n";
}

function sync(targetRelative, contents) {
  const target = path.join(repoRoot, targetRelative);
  if (checkOnly) {
    let current = "";
    try {
      current = readFileSync(target, "utf8");
    } catch {
      // Missing generated output is stale by definition.
    }
    if (current !== contents) {
      process.stderr.write("[i18n-builtins] stale: " + targetRelative + "\n");
      process.exitCode = 1;
    }
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
  process.stdout.write("[i18n-builtins] wrote " + targetRelative + "\n");
}

sync(
  "apps/web/src/shared/i18n/generated/i18n-app-builtins.json",
  render("app", (namespace) => !LAZY_APP_BUILTIN_NAMESPACES.has(namespace)),
);
sync(
  "apps/web/src/domains/monetization/i18n/generated/i18n-monetization-builtins.json",
  render("app", (namespace) => LAZY_APP_BUILTIN_NAMESPACES.has(namespace)),
);
sync("apps/web/src/domains/admin/i18n/generated/i18n-admin-builtins.json", render("admin"));
