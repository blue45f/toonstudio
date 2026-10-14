import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { APP_I18N_NAMESPACES } from "../i18n-asset-manifest";
import { APP_I18N_ASSET_LOCALES } from "../i18n-locale-catalog";
import {
  checkI18nNamespaceContract,
  checkI18nNamespaceRegistry,
  scanInlineBilingualUsage,
  type I18nNamespaceSnapshot,
} from "../i18n-namespace-contract";

/**
 * Key-based i18n approach contract (apps/web/I18N_GUIDE.md).
 *
 * New surfaces and namespaces use exactly one approach: keys authored in
 * `apps/web/public/i18n/app/<namespace>/<locale>.json` with ko/en as the
 * canonical pair, resolved through `useT()`. The inline bilingual bridges
 * (`useBilingual`, `defineBilingualText`, …) are legacy-only.
 *
 * This test enforces the contract in three places:
 *  1. Every published app namespace satisfies the namespace contract.
 *  2. The namespace directories and APP_I18N_NAMESPACES name the same set.
 *  3. Files registered as new surfaces contain no inline bilingual usage.
 *     Registering a file here is part of adding a new surface — see the guide.
 */

const ASSET_DIRECTORY = path.resolve(process.cwd(), "apps/web/public", "i18n", "app");
const ASSET_LOCALES = [...APP_I18N_ASSET_LOCALES];

/**
 * Frozen legacy exceptions: these three namespaces predate the contract and
 * publish only de/es/fr/ja/zh/zh-hant assets while ko/en live in code (the
 * reversed direction). Unifying them is tracked separately; this list may
 * only shrink. The ratchet below fails as soon as one of them satisfies the
 * contract, so a fixed namespace cannot stay exempt by accident.
 */
const LEGACY_REVERSED_NAMESPACES = ["contact", "fortune", "play"];

/**
 * Source files for surfaces created under the contract. A new surface adds
 * its files here in the same change; the scan then keeps inline bilingual
 * authoring out of them for good.
 */
const GUARDED_NEW_SURFACE_FILES = ["apps/web/src/app/AppShell.tsx"];

function readNamespaceSnapshot(namespace: string): I18nNamespaceSnapshot {
  const directory = path.join(ASSET_DIRECTORY, namespace);
  const files = readdirSync(directory).filter((name) => name.endsWith(".json"));
  const locales = files.map((name) => name.slice(0, -".json".length)).sort();
  const readDictionary = (locale: string): Record<string, string> | undefined => {
    if (!locales.includes(locale)) return undefined;
    return JSON.parse(
      readFileSync(path.join(directory, `${locale}.json`), "utf8"),
    ) as Record<string, string>;
  };
  return { namespace, locales, ko: readDictionary("ko"), en: readDictionary("en") };
}

function rulesOf(violations: { rule: string }[]): string[] {
  return [...new Set(violations.map((violation) => violation.rule))].sort();
}

describe("i18n namespace contract checker", () => {
  const options = { assetLocales: ["ko", "en", "ja"] };

  it("accepts a namespace that follows the contract", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ja", "ko"],
      ko: { "guide.title": "안내" },
      en: { "guide.title": "Guide" },
    };
    expect(checkI18nNamespaceContract(snapshot, options)).toEqual([]);
  });

  it("rejects the reversed shape: assets without the ko/en canonical pair", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "contact",
      locales: ["de", "es", "fr", "ja", "zh", "zh-hant"],
    };
    const violations = checkI18nNamespaceContract(snapshot, {
      assetLocales: ["de", "es", "fr", "ja", "zh", "zh-hant"],
    });
    expect(rulesOf(violations)).toContain("missing-canonical-locale");
  });

  it("rejects a namespace that skips a shipped locale asset", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ko"],
      ko: { "guide.title": "안내" },
      en: { "guide.title": "Guide" },
    };
    expect(rulesOf(checkI18nNamespaceContract(snapshot, options))).toContain(
      "missing-locale-asset",
    );
  });

  it("rejects keys that do not carry the namespace prefix", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ja", "ko"],
      ko: { "guide.title": "안내", "home.title": "홈" },
      en: { "guide.title": "Guide", "home.title": "Home" },
    };
    expect(rulesOf(checkI18nNamespaceContract(snapshot, options))).toContain("key-prefix");
  });

  it("rejects a key authored in only one canonical locale", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ja", "ko"],
      ko: { "guide.title": "안내", "guide.extra": "추가" },
      en: { "guide.title": "Guide" },
    };
    expect(rulesOf(checkI18nNamespaceContract(snapshot, options))).toContain(
      "canonical-key-parity",
    );
  });

  it("rejects registry drift in both directions", () => {
    const violations = checkI18nNamespaceRegistry(["guide", "toast"], ["guide", "search"]);
    expect(rulesOf(violations)).toEqual([
      "missing-namespace-directory",
      "unregistered-namespace",
    ]);
  });
});

describe("inline bilingual detector", () => {
  it("flags inline bilingual authoring in new-surface source", () => {
    const source = [
      'import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";',
      'const bt = useBilingual("checkout");',
      'const label = bt("결제하기", "Check out");',
      'const title = defineBilingualText("checkout", "title", "결제", "Checkout");',
    ].join("\n");
    expect(scanInlineBilingualUsage(source).map((usage) => usage.api)).toEqual([
      "useBilingual",
      "defineBilingualText",
    ]);
  });

  it("allows key-based resolution and non-authoring helpers", () => {
    const source = [
      'const t = useT();',
      'useBilingualI18nRevision();',
      'const label = t("guide.title");',
      'const formatted = formatI18nTemplate(t("guide.count"), { count: 3 });',
    ].join("\n");
    expect(scanInlineBilingualUsage(source)).toEqual([]);
  });

  it("honours comment lines and the i18n-exempt opt-out", () => {
    const source = [
      '// legacy note: useBilingual("old") was replaced by keys.',
      'const legacy = useBilingual("kept"); // i18n-exempt: legacy surface, see guide §5',
    ].join("\n");
    expect(scanInlineBilingualUsage(source)).toEqual([]);
  });
});

describe("published app namespaces follow the key-based contract", () => {
  const directoryNamespaces = readdirSync(ASSET_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it("keeps namespace directories and APP_I18N_NAMESPACES in sync", () => {
    expect(
      checkI18nNamespaceRegistry(directoryNamespaces, [...APP_I18N_NAMESPACES]),
    ).toEqual([]);
  });

  it("keeps every non-legacy namespace inside the contract", () => {
    const failures = new Map<string, string[]>();
    for (const namespace of directoryNamespaces) {
      if (LEGACY_REVERSED_NAMESPACES.includes(namespace)) continue;
      const violations = checkI18nNamespaceContract(readNamespaceSnapshot(namespace), {
        assetLocales: ASSET_LOCALES,
      });
      if (violations.length > 0) failures.set(namespace, rulesOf(violations));
    }
    expect(Object.fromEntries(failures)).toEqual({});
  });

  it("keeps the legacy exception list frozen and honest", () => {
    expect([...LEGACY_REVERSED_NAMESPACES].sort()).toEqual(["contact", "fortune", "play"]);
    for (const namespace of LEGACY_REVERSED_NAMESPACES) {
      const violations = checkI18nNamespaceContract(readNamespaceSnapshot(namespace), {
        assetLocales: ASSET_LOCALES,
      });
      // Still reversed: the exception is still needed. Once a namespace is
      // unified it must leave this list — remove it and this ratchet passes
      // through the full-contract assertion above instead.
      expect(rulesOf(violations)).toContain("missing-canonical-locale");
    }
  });
});

describe("new surfaces stay key-based", () => {
  it("finds no inline bilingual authoring in guarded new-surface files", () => {
    const findings = new Map<string, string[]>();
    for (const relativePath of GUARDED_NEW_SURFACE_FILES) {
      const source = readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
      const usages = scanInlineBilingualUsage(source);
      if (usages.length > 0) {
        findings.set(
          relativePath,
          usages.map((usage) => `${usage.api} (line ${usage.line})`),
        );
      }
    }
    expect(Object.fromEntries(findings)).toEqual({});
  });
});
