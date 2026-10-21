// Regenerates lib/i18n-locale-catalog.ts from the shipped app dictionaries.
//
// The catalog is the app shell's only compiled knowledge about locales it does not bundle:
// which ones have an asset, and how much of each asset is actually translated. Both facts are
// measured here from apps/web/public/i18n/app/<namespace>/<locale>.json — never authored by hand — so the language picker
// cannot advertise a locale as translated when it renders English.
//
//   node scripts/generate-app-i18n-catalog.mjs
//
// apps/web/src/shared/lib/__tests__/i18n-locale-assets.test.ts fails when the committed catalog drifts from disk.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const assetDirectory = path.join(repoRoot, "apps", "web", "public", "i18n", "app");
const catalogPath = path.join(repoRoot, "apps", "web", "src", "shared", "lib", "i18n-locale-catalog.ts");
const completenessReportPath = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "shared",
  "lib",
  "i18n-locale-completeness-report.json",
);
const exhaustionPlanPath = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "shared",
  "lib",
  "i18n-locale-exhaustion-plan.json",
);

/** Locales compiled into the app shell so the fallback chain never awaits I/O. */
const BUILT_IN_LOCALES = ["ko", "en"];
const REFERENCE_LOCALE = "en";
const TRANSLATED_LOCALE_THRESHOLD = 0.5;
/**
 * Completeness at or above this ratio may be presented without qualification. Below it the
 * locale is a work in progress — most locales clear the 0.5 "not just English" floor while
 * still rendering roughly half of the surface in English, so the picker must say so.
 */
const COMPLETENESS_IN_PROGRESS_THRESHOLD = 0.9;

/** Read the same namespace assets used by the browser; flat legacy files are not authoritative. */
export function readAppLocaleDictionaries(directory = assetDirectory) {
  const namespaces = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (namespaces.length === 0) {
    throw new Error(
      `No locale namespace directories under ${directory}. `
      + "The app dictionaries are published as <namespace>/<locale>.json.",
    );
  }

  const dictionaries = new Map();
  for (const namespace of namespaces) {
    for (const fileName of readdirSync(path.join(directory, namespace)).sort()) {
      if (!fileName.endsWith(".json")) continue;
      const locale = fileName.slice(0, -".json".length);
      const part = JSON.parse(readFileSync(path.join(directory, namespace, fileName), "utf8"));
      const existing = dictionaries.get(locale);
      if (existing) Object.assign(existing, part);
      else dictionaries.set(locale, part);
    }
  }
  return new Map([...dictionaries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Share of English keys whose value differs from the English source string.
 * A floor rather than a certificate — a legitimately identical string counts as untranslated —
 * but decisive at the extremes.
 */
export function measureTranslatedRatio(dictionary, reference) {
  const referenceKeys = Object.keys(reference);
  if (referenceKeys.length === 0) return 0;
  let distinct = 0;
  for (const key of referenceKeys) {
    const value = dictionary[key];
    if (value !== undefined && value !== reference[key]) distinct++;
  }
  return Math.round((distinct / referenceKeys.length) * 10000) / 10000;
}

/**
 * The same assets as readAppLocaleDictionaries, but kept per namespace. The flat merge cannot
 * answer "which namespaces is this locale missing", and that is exactly the shape locale
 * coverage takes in practice (a locale ships 38 of 41 namespaces, not 93% of every file).
 */
export function readAppLocaleNamespaceDictionaries(directory = assetDirectory) {
  const namespaces = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (namespaces.length === 0) {
    throw new Error(
      `No locale namespace directories under ${directory}. `
      + "The app dictionaries are published as <namespace>/<locale>.json.",
    );
  }

  const byNamespace = new Map();
  for (const namespace of namespaces) {
    const byLocale = new Map();
    for (const fileName of readdirSync(path.join(directory, namespace)).sort()) {
      if (!fileName.endsWith(".json")) continue;
      const locale = fileName.slice(0, -".json".length);
      byLocale.set(locale, JSON.parse(readFileSync(path.join(directory, namespace, fileName), "utf8")));
    }
    byNamespace.set(namespace, byLocale);
  }
  return byNamespace;
}

function roundRatio(value) {
  return Math.round(value * 10000) / 10000;
}

/**
 * Per-locale completeness report, measured — never authored — from the published assets.
 *
 * Two axes, because they fail differently:
 *  - namespace coverage: which of the published namespaces ship a file for this locale at all;
 *  - key completeness: of the reference (English) keys, how many carry a value that differs
 *    from the English source string. Key counts use the same flattened merge as
 *    readAppLocaleDictionaries, so completenessRatio here always equals the catalog's
 *    APP_I18N_LOCALE_TRANSLATED_RATIO for the same assets — the report explains the catalog
 *    number, it never contradicts it.
 * Namespaces with no English source (contact/fortune/play are authored the other way around)
 * count toward namespace coverage and missingNamespaces only; there is no English surface to
 * be complete against. The reference locale itself is definitionally complete for the keys it
 * publishes, so its translated count equals its present count.
 *
 * `translationInProgress` is the picker's contract: completeness below
 * COMPLETENESS_IN_PROGRESS_THRESHOLD must be labelled "번역 진행 중" instead of being
 * presented as a finished translation.
 */
export function buildLocaleCompletenessReport(namespaceDictionaries) {
  const namespaces = [...namespaceDictionaries.keys()].sort();
  const locales = new Set();
  for (const byLocale of namespaceDictionaries.values()) {
    for (const locale of byLocale.keys()) locales.add(locale);
  }

  // Flatten exactly like readAppLocaleDictionaries (namespaces in sorted order, later
  // namespaces win on key collisions) so the key axis matches the shipped catalog ratios.
  const flattened = new Map();
  for (const namespace of namespaces) {
    for (const [locale, part] of namespaceDictionaries.get(namespace) ?? []) {
      const existing = flattened.get(locale);
      if (existing) Object.assign(existing, part);
      else flattened.set(locale, { ...part });
    }
  }
  const reference = flattened.get(REFERENCE_LOCALE) ?? {};
  const referenceKeys = Object.keys(reference);
  const referenceKeyCount = referenceKeys.length;

  const report = [];
  for (const locale of [...locales].sort()) {
    const missingNamespaces = namespaces.filter(
      (namespace) => !namespaceDictionaries.get(namespace)?.has(locale),
    );
    const dictionary = flattened.get(locale) ?? {};
    let presentKeyCount = 0;
    let translatedKeyCount = 0;
    for (const key of referenceKeys) {
      if (dictionary[key] === undefined) continue;
      presentKeyCount++;
      if (locale === REFERENCE_LOCALE || dictionary[key] !== reference[key]) {
        translatedKeyCount++;
      }
    }
    const coverageRatio = referenceKeyCount === 0 ? 0 : roundRatio(presentKeyCount / referenceKeyCount);
    const completenessRatio = referenceKeyCount === 0
      ? 0
      : roundRatio(translatedKeyCount / referenceKeyCount);
    report.push({
      locale,
      namespaceCount: namespaces.length - missingNamespaces.length,
      namespaceTotal: namespaces.length,
      namespaceRatio: namespaces.length === 0
        ? 0
        : roundRatio((namespaces.length - missingNamespaces.length) / namespaces.length),
      missingNamespaces,
      referenceKeyCount,
      presentKeyCount,
      translatedKeyCount,
      coverageRatio,
      translatedRatio: completenessRatio,
      completenessRatio,
      translationInProgress: completenessRatio < COMPLETENESS_IN_PROGRESS_THRESHOLD,
    });
  }
  return report;
}

/** Human-readable form of the completeness report (diagnostics, PR descriptions, CI logs). */
export function formatLocaleCompletenessReport(report) {
  const lines = [
    "| locale | namespaces | key coverage | completeness | status |",
    "| --- | --- | --- | --- | --- |",
    ...report.map((entry) => [
      `| ${entry.locale}`,
      `${entry.namespaceCount}/${entry.namespaceTotal}`,
      `${Math.round(entry.coverageRatio * 100)}%`,
      `${Math.round(entry.completenessRatio * 100)}%`,
      entry.translationInProgress ? "번역 진행 중" : "완료",
    ].join(" | ") + " |"),
  ];
  return lines.join("\n");
}

/**
 * Catalog exhaustion plan (G7): in which order locales and, inside each locale, namespaces
 * should be finished, derived only from the measured completeness report — never hand-ranked.
 *
 * Locale order: completenessRatio descending (the closest locale to done goes first, so each
 * finished locale is a fully usable surface instead of 73 half-finished ones), then
 * translatedKeyCount descending, then locale code ascending for determinism.
 * Namespace order inside a locale: partially translated namespaces first (fewest remaining
 * keys first — finishing a namespace removes a whole English surface), then untouched
 * namespaces (fewest keys first), then namespace name ascending for determinism. A namespace
 * whose English source has no keys (reverse-authored) has nothing to exhaust and is skipped.
 * Namespaces already fully translated for the locale are listed as completed, not queued.
 */
export function buildLocaleExhaustionPlan(report, namespaceDictionaries) {
  const namespaces = [...namespaceDictionaries.keys()].sort();
  const rankedLocales = [...report].sort(
    (a, b) =>
      b.completenessRatio - a.completenessRatio ||
      b.translatedKeyCount - a.translatedKeyCount ||
      (a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0),
  );

  const locales = rankedLocales.map((entry, index) => {
    const queue = [];
    const completedNamespaces = [];
    for (const namespace of namespaces) {
      const byLocale = namespaceDictionaries.get(namespace);
      const reference = byLocale?.get(REFERENCE_LOCALE) ?? {};
      const referenceKeys = Object.keys(reference);
      if (referenceKeys.length === 0) continue;
      const dictionary = byLocale?.get(entry.locale) ?? {};
      let translatedKeyCount = 0;
      for (const key of referenceKeys) {
        if (dictionary[key] === undefined) continue;
        if (entry.locale === REFERENCE_LOCALE || dictionary[key] !== reference[key]) {
          translatedKeyCount++;
        }
      }
      const remainingKeyCount = referenceKeys.length - translatedKeyCount;
      if (remainingKeyCount === 0) {
        completedNamespaces.push(namespace);
      } else {
        queue.push({
          namespace,
          referenceKeyCount: referenceKeys.length,
          translatedKeyCount,
          remainingKeyCount,
          status: translatedKeyCount === 0 ? "untouched" : "partial",
        });
      }
    }
    queue.sort(
      (a, b) =>
        (a.status === b.status ? 0 : a.status === "partial" ? -1 : 1) ||
        a.remainingKeyCount - b.remainingKeyCount ||
        (a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : 0),
    );
    return {
      locale: entry.locale,
      rank: index + 1,
      completenessRatio: entry.completenessRatio,
      translatedKeyCount: entry.translatedKeyCount,
      referenceKeyCount: entry.referenceKeyCount,
      remainingKeyCount: entry.referenceKeyCount - entry.translatedKeyCount,
      status: entry.translationInProgress ? "in-progress" : "complete",
      completedNamespaces,
      namespaceQueue: queue,
    };
  });

  return {
    threshold: COMPLETENESS_IN_PROGRESS_THRESHOLD,
    referenceLocale: REFERENCE_LOCALE,
    locales,
  };
}

export function buildCatalogSource(dictionaries) {
  const reference = dictionaries.get(REFERENCE_LOCALE);
  if (!reference) {
    throw new Error(`Missing reference locale asset "${REFERENCE_LOCALE}".`);
  }
  for (const locale of BUILT_IN_LOCALES) {
    if (!dictionaries.has(locale)) {
      throw new Error(`Built-in locale "${locale}" has no published asset.`);
    }
  }

  const locales = [...dictionaries.keys()].sort();
  const ratios = new Map(
    locales.map((locale) => [
      locale,
      locale === REFERENCE_LOCALE ? 1 : measureTranslatedRatio(dictionaries.get(locale), reference),
    ]),
  );

  const lines = [
    "// GENERATED FILE — do not hand-edit.",
    "//",
    "// Source of truth: apps/web/public/i18n/app/<namespace>/<locale>.json.",
    "// Regenerate with `node scripts/generate-app-i18n-catalog.mjs`.",
    "// apps/web/src/shared/lib/__tests__/i18n-locale-assets.test.ts fails when this catalog drifts from the assets.",
    "",
    "/** Locales compiled into the app shell so the fallback chain never awaits I/O. */",
    `export const APP_I18N_BUILT_IN_LOCALES = [${BUILT_IN_LOCALES.map((locale) => JSON.stringify(locale)).join(", ")}] as const;`,
    "",
    "/** Every locale that has a `apps/web/public/i18n/app/<namespace>/<locale>.json` asset. */",
    "export const APP_I18N_ASSET_LOCALES = [",
    ...locales.map((locale) => `  ${JSON.stringify(locale)},`),
    "] as const;",
    "",
    "/**",
    " * Measured share of English keys whose value in this locale differs from the English source",
    " * string. It is a floor, not a certificate: a legitimately identical string (a brand name,",
    ' * "OK") counts as untranslated. It is still decisive at the extremes — a locale sitting at',
    " * 0.02 renders as English across 98% of the product surface.",
    " */",
    "export const APP_I18N_LOCALE_TRANSLATED_RATIO: Readonly<Record<string, number>> = {",
    ...locales.map((locale) => `  ${JSON.stringify(locale)}: ${ratios.get(locale)},`),
    "};",
    "",
    "/**",
    " * At or above this ratio a locale may be presented as a translated language. Below it the UI",
    " * must say so, because the user is really getting English with a handful of localized labels.",
    " */",
    `export const APP_I18N_TRANSLATED_LOCALE_THRESHOLD = ${TRANSLATED_LOCALE_THRESHOLD};`,
    "",
    "/**",
    " * Completeness at or above this ratio may be presented without qualification. Below it the",
    " * locale picker must label the locale as a translation in progress (\"번역 진행 중\"), even",
    " * when the locale clears the translated floor above — half-translated is not finished. The",
    " * per-locale report behind this threshold is written by the generator to",
    " * i18n-locale-completeness-report.json (buildLocaleCompletenessReport).",
    " */",
    `export const APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD = ${COMPLETENESS_IN_PROGRESS_THRESHOLD};`,
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const source = buildCatalogSource(readAppLocaleDictionaries());
  writeFileSync(catalogPath, source, "utf8");
  process.stdout.write(`wrote ${path.relative(repoRoot, catalogPath)}\n`);

  const namespaceDictionaries = readAppLocaleNamespaceDictionaries();
  const report = buildLocaleCompletenessReport(namespaceDictionaries);
  writeFileSync(completenessReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const inProgress = report.filter((entry) => entry.translationInProgress);
  process.stdout.write(
    `wrote ${path.relative(repoRoot, completenessReportPath)} `
    + `(${report.length} locales, ${inProgress.length} 번역 진행 중)\n`,
  );
  const plan = buildLocaleExhaustionPlan(report, namespaceDictionaries);
  writeFileSync(exhaustionPlanPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const nextLocale = plan.locales.find((entry) => entry.status === "in-progress");
  process.stdout.write(
    `wrote ${path.relative(repoRoot, exhaustionPlanPath)} `
    + `(소진 순서 1순위 미완료 로케일: ${nextLocale ? nextLocale.locale : "없음"})\n`,
  );
  process.stdout.write(`${formatLocaleCompletenessReport(report)}\n`);
}
