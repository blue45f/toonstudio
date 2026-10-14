/**
 * Key-based i18n approach contract for NEW surfaces and namespaces.
 *
 * The contract (see apps/web/I18N_GUIDE.md): every new surface authors copy
 * ONLY as keys in `apps/web/public/i18n/app/<namespace>/<locale>.json`, with
 * `ko.json` and `en.json` written by hand as the canonical pair. The inline
 * bilingual bridges in `i18n-bilingual-copy.ts` (`useBilingual`,
 * `defineBilingualText`, …) stay available for legacy surfaces but must not
 * appear in new ones, because a ko/en pair baked into code leaves the other
 * 73 locales to runtime machine translation and hides the strings from the
 * published catalog.
 *
 * This module is pure: callers feed it directory listings and parsed
 * dictionaries, and it reports contract violations. The enforcing test is
 * `__tests__/i18n-namespace-contract.test.ts`.
 */

export type I18nNamespaceContractRule =
  | "missing-canonical-locale"
  | "missing-locale-asset"
  | "key-prefix"
  | "canonical-key-parity"
  | "unregistered-namespace"
  | "missing-namespace-directory";

export interface I18nNamespaceContractViolation {
  namespace: string;
  rule: I18nNamespaceContractRule;
  detail: string;
}

export interface I18nNamespaceSnapshot {
  namespace: string;
  /** Locales that have a `<locale>.json` file in the namespace directory. */
  locales: readonly string[];
  /** Parsed canonical dictionaries; a missing locale means a missing file. */
  ko?: Readonly<Record<string, string>>;
  en?: Readonly<Record<string, string>>;
}

export interface I18nNamespaceContractOptions {
  /** Every locale a published namespace must ship an asset for. */
  assetLocales: readonly string[];
}

/** Locales whose dictionaries are authored by hand; all others are synced. */
export const CANONICAL_I18N_LOCALES = ["ko", "en"] as const;

/**
 * Validates one namespace directory against the key-based contract:
 *
 * 1. `ko.json` and `en.json` both exist — the canonical pair is authored in
 *    JSON, never only in code and never only in non-canonical locales (the
 *    reversed contact/fortune/play shape is exactly what this forbids).
 * 2. Every locale in `assetLocales` has an asset file, so the fallback chain
 *    never meets a namespace-shaped hole for a shipped locale.
 * 3. Every canonical key starts with `<namespace>.` — a key belongs to
 *    exactly one namespace, which is what makes ownership and the merged
 *    legacy assets unambiguous.
 * 4. The ko and en key sets are identical — a key authored in only one
 *    canonical locale renders as a raw fallback in the other.
 */
export function checkI18nNamespaceContract(
  snapshot: I18nNamespaceSnapshot,
  options: I18nNamespaceContractOptions,
): I18nNamespaceContractViolation[] {
  const violations: I18nNamespaceContractViolation[] = [];
  const { namespace } = snapshot;
  const presentLocales = new Set(snapshot.locales);

  for (const locale of CANONICAL_I18N_LOCALES) {
    if (!presentLocales.has(locale) || !snapshot[locale]) {
      violations.push({
        namespace,
        rule: "missing-canonical-locale",
        detail: `${namespace}/${locale}.json is missing; new namespaces must author the ko/en canonical pair as JSON assets.`,
      });
    }
  }

  for (const locale of options.assetLocales) {
    if (!presentLocales.has(locale)) {
      violations.push({
        namespace,
        rule: "missing-locale-asset",
        detail: `${namespace}/${locale}.json is missing; run scripts/sync-i18n-legacy-assets.mjs so every shipped locale has an asset.`,
      });
    }
  }

  const prefix = `${namespace}.`;
  for (const locale of CANONICAL_I18N_LOCALES) {
    const dictionary = snapshot[locale];
    if (!dictionary) continue;
    for (const key of Object.keys(dictionary)) {
      if (!key.startsWith(prefix)) {
        violations.push({
          namespace,
          rule: "key-prefix",
          detail: `${namespace}/${locale}.json key "${key}" does not start with "${prefix}".`,
        });
      }
    }
  }

  if (snapshot.ko && snapshot.en) {
    const koKeys = new Set(Object.keys(snapshot.ko));
    const enKeys = new Set(Object.keys(snapshot.en));
    for (const key of koKeys) {
      if (!enKeys.has(key)) {
        violations.push({
          namespace,
          rule: "canonical-key-parity",
          detail: `key "${key}" is authored in ko.json but missing from en.json.`,
        });
      }
    }
    for (const key of enKeys) {
      if (!koKeys.has(key)) {
        violations.push({
          namespace,
          rule: "canonical-key-parity",
          detail: `key "${key}" is authored in en.json but missing from ko.json.`,
        });
      }
    }
  }

  return violations;
}

/**
 * The namespace directories on disk and the runtime manifest
 * (`APP_I18N_NAMESPACES`) must name exactly the same set: a directory without
 * a manifest entry is never fetched at runtime, and a manifest entry without
 * a directory 404s for every locale.
 */
export function checkI18nNamespaceRegistry(
  directoryNamespaces: readonly string[],
  registeredNamespaces: readonly string[],
): I18nNamespaceContractViolation[] {
  const violations: I18nNamespaceContractViolation[] = [];
  const directories = new Set(directoryNamespaces);
  const registered = new Set(registeredNamespaces);

  for (const namespace of directories) {
    if (!registered.has(namespace)) {
      violations.push({
        namespace,
        rule: "unregistered-namespace",
        detail: `namespace directory "${namespace}" is not registered in APP_I18N_NAMESPACES, so the runtime never loads it.`,
      });
    }
  }
  for (const namespace of registered) {
    if (!directories.has(namespace)) {
      violations.push({
        namespace,
        rule: "missing-namespace-directory",
        detail: `APP_I18N_NAMESPACES registers "${namespace}" but apps/web/public/i18n/app/${namespace}/ does not exist.`,
      });
    }
  }

  return violations;
}

/**
 * Copy-authoring APIs from `i18n-bilingual-copy.ts` that new surfaces must
 * not use. Deliberately NOT listed: `useBilingualI18nRevision` (a re-render
 * subscription, authors no copy), `formatI18nTemplate` (placeholder
 * formatting for already-resolved strings), and the locale getters
 * (`getActiveI18nLocale`, `resolveUiLocale`, `getCurrentUiLocale`).
 */
export const FORBIDDEN_INLINE_BILINGUAL_APIS = [
  "useBilingual",
  "useBilingualLocalizer",
  "defineBilingualText",
  "defineBilingualAutoText",
  "defineBilingualMap",
  "defineStaticSourceText",
  "translateBilingual",
  "translateBilingualText",
  "translateBilingualPair",
  "translateBilingualMap",
  "translateBilingualValueForActiveLocale",
  "translateBilingualValueForLocale",
  "translateCurrentBilingualValue",
  "translateParallelBilingualCopy",
  "translateAuthoredSourceText",
  "translateStaticSourceTextForLocale",
  "translateCurrentStaticSourceText",
  "translateLocaleBranchForLocale",
  "translateCurrentLocaleBranch",
] as const;

export interface InlineBilingualUsage {
  api: string;
  line: number;
  snippet: string;
}

const BILINGUAL_CALL_PATTERNS = FORBIDDEN_INLINE_BILINGUAL_APIS.map(
  (api) => ({ api, pattern: new RegExp(`\\b${api}\\s*\\(`) }),
);

/**
 * Line-based scan for inline bilingual authoring in a source file, following
 * the house contract-test conventions: comment lines are ignored and a line
 * carrying `i18n-exempt` is an explicit, reviewable opt-out.
 */
export function scanInlineBilingualUsage(source: string): InlineBilingualUsage[] {
  const usages: InlineBilingualUsage[] = [];
  const lines = source.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (line.includes("i18n-exempt")) continue;

    for (const { api, pattern } of BILINGUAL_CALL_PATTERNS) {
      if (pattern.test(line)) {
        usages.push({ api, line: index + 1, snippet: trimmed.slice(0, 120) });
      }
    }
  }

  return usages;
}
