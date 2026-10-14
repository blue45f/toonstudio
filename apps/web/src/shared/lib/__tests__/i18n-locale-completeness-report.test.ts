import { describe, expect, it } from "vitest";

import {
  getAppI18nCompletenessRatio,
  getLanguageOptions,
  isAppI18nTranslationInProgress,
} from "@/shared/lib/i18n";
import {
  APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD,
  APP_I18N_LOCALE_TRANSLATED_RATIO,
} from "@/shared/lib/i18n-locale-catalog";
import {
  buildLocaleCompletenessReport,
  formatLocaleCompletenessReport,
} from "../../../../../../scripts/generate-app-i18n-catalog.mjs";

/**
 * Fixture shaped like the real asset tree: `nav` has an English source, `contact` does not
 * (it is authored ko-first, like the three reverse-direction namespaces on disk).
 */
function fixtureNamespaces(): Map<string, Map<string, Record<string, string>>> {
  return new Map<string, Map<string, Record<string, string>>>([
    [
      "nav",
      new Map<string, Record<string, string>>([
        ["en", { a: "A", b: "B", c: "C", d: "D" }],
        ["ko", { a: "에이", b: "비", c: "씨", d: "디" }],
        ["ja", { a: "エー", b: "ビー", c: "C" }],
      ]),
    ],
    [
      "contact",
      new Map<string, Record<string, string>>([
        ["de", { x: "X" }],
        ["ko", { x: "엑스" }],
      ]),
    ],
  ]);
}

describe("locale completeness report (catalog generation)", () => {
  it("measures namespace coverage, key completeness, and missing namespaces per locale", () => {
    const report = buildLocaleCompletenessReport(fixtureNamespaces());
    const byLocale = new Map(report.map((entry) => [entry.locale, entry]));

    const ja = byLocale.get("ja");
    expect(ja?.namespaceCount).toBe(1);
    expect(ja?.namespaceTotal).toBe(2);
    expect(ja?.missingNamespaces).toEqual(["contact"]);
    expect(ja?.referenceKeyCount).toBe(4);
    expect(ja?.presentKeyCount).toBe(3);
    // c copies the English source and d is missing: only a and b count as translated.
    expect(ja?.translatedKeyCount).toBe(2);
    expect(ja?.coverageRatio).toBe(0.75);
    expect(ja?.completenessRatio).toBe(0.5);
    expect(ja?.translationInProgress).toBe(true);
  });

  it("treats the reference locale as complete for the keys it publishes", () => {
    const report = buildLocaleCompletenessReport(fixtureNamespaces());
    const en = report.find((entry) => entry.locale === "en");

    expect(en?.presentKeyCount).toBe(4);
    expect(en?.translatedKeyCount).toBe(4);
    expect(en?.completenessRatio).toBe(1);
    expect(en?.translationInProgress).toBe(false);
    // The reverse-direction namespace is still reported as missing for en.
    expect(en?.missingNamespaces).toEqual(["contact"]);
  });

  it("flags a locale below the completeness threshold and clears one above it", () => {
    const report = buildLocaleCompletenessReport(fixtureNamespaces());
    const ko = report.find((entry) => entry.locale === "ko");

    expect(APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD).toBe(0.9);
    expect(ko?.completenessRatio).toBe(1);
    expect(ko?.translationInProgress).toBe(false);
    expect(report.find((entry) => entry.locale === "de")?.completenessRatio).toBe(0);
    expect(report.find((entry) => entry.locale === "de")?.translationInProgress).toBe(true);
  });

  it("formats a human-readable report with the in-progress label", () => {
    const text = formatLocaleCompletenessReport(
      buildLocaleCompletenessReport(fixtureNamespaces()),
    );

    expect(text).toContain("| ja | 1/2 | 75% | 50% | 번역 진행 중 |");
    expect(text).toContain("| en | 1/2 | 100% | 100% | 완료 |");
  });
});

describe("translation-in-progress marking (picker contract)", () => {
  it("marks locales under the completeness threshold, including asset locales above the old floor", () => {
    expect(isAppI18nTranslationInProgress("en")).toBe(false);
    expect(isAppI18nTranslationInProgress("ko")).toBe(false);
    // ja clears the 0.5 translated floor but sits near half completeness.
    expect(APP_I18N_LOCALE_TRANSLATED_RATIO.ja).toBeGreaterThanOrEqual(0.5);
    expect(APP_I18N_LOCALE_TRANSLATED_RATIO.ja).toBeLessThan(
      APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD,
    );
    expect(isAppI18nTranslationInProgress("ja")).toBe(true);
    // No published asset at all is the extreme case of in progress, never "probably fine".
    expect(getAppI18nCompletenessRatio("cy")).toBe(0);
    expect(isAppI18nTranslationInProgress("cy")).toBe(true);
  });

  it("carries completeness and the in-progress flag onto every language option", () => {
    const options = getLanguageOptions("en");
    const byCode = new Map(options.map((option) => [option.code, option]));

    expect(byCode.get("ja")?.translationInProgress).toBe(true);
    expect(byCode.get("ja")?.completenessRatio).toBe(
      APP_I18N_LOCALE_TRANSLATED_RATIO.ja,
    );
    expect(byCode.get("ko")?.translationInProgress).toBe(false);
    expect(byCode.get("en")?.translationInProgress).toBe(false);
    expect(byCode.get("cy")?.translationInProgress).toBe(true);
    expect(byCode.get("cy")?.completenessRatio).toBe(0);
    // Regional variants inherit the serving asset's completeness (es-419 → es).
    expect(byCode.get("es-419")?.translationInProgress).toBe(
      isAppI18nTranslationInProgress("es"),
    );
  });
});
