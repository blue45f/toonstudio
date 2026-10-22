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
  buildLocaleExhaustionPlan,
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

describe("locale exhaustion plan (G7 ordering)", () => {
  it("ranks locales by measured completeness and queues namespaces partial-first, fewest remaining first", () => {
    const namespaces = fixtureNamespaces();
    const plan = buildLocaleExhaustionPlan(buildLocaleCompletenessReport(namespaces), namespaces);
    const byLocale = new Map(plan.locales.map((entry) => [entry.locale, entry]));

    // ko and en are fully translated on the fixture's key axis, ja is half, de is zero.
    expect(plan.locales.map((entry) => entry.locale)).toEqual(["en", "ko", "ja", "de"]);
    expect(byLocale.get("en")?.status).toBe("complete");
    expect(byLocale.get("en")?.namespaceQueue).toEqual([]);
    expect(byLocale.get("ko")?.completedNamespaces).toEqual(["nav"]);

    // ja: nav is partial with 2 of 4 keys left; contact has no English source, so it is
    // never queued (nothing to exhaust against the reference).
    expect(byLocale.get("ja")?.namespaceQueue).toEqual([
      {
        namespace: "nav",
        referenceKeyCount: 4,
        translatedKeyCount: 2,
        remainingKeyCount: 2,
        status: "partial",
      },
    ]);
    // de: nav is untouched with all 4 keys left.
    expect(byLocale.get("de")?.namespaceQueue).toEqual([
      {
        namespace: "nav",
        referenceKeyCount: 4,
        translatedKeyCount: 0,
        remainingKeyCount: 4,
        status: "untouched",
      },
    ]);
    expect(byLocale.get("ja")?.remainingKeyCount).toBe(2);
    expect(plan.threshold).toBe(APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD);
  });
});

describe("translation-in-progress marking (picker contract)", () => {
  it("marks locales under the completeness threshold, whatever side of the translated floor they sit on", () => {
    expect(isAppI18nTranslationInProgress("en")).toBe(false);
    expect(isAppI18nTranslationInProgress("ko")).toBe(false);
    // de sits near 0.4 completeness (the English fallback copies of the migrated namespaces), far under the 0.9
    // threshold, so it is marked. ja stopped being the example once its reviewed translations landed.
    expect(APP_I18N_LOCALE_TRANSLATED_RATIO.de).toBeLessThan(
      APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD,
    );
    expect(isAppI18nTranslationInProgress("de")).toBe(true);
    // The flag is exactly "under the completeness threshold" for every published locale, so a locale
    // that clears the 0.5 translated floor (none do since 2026-10-15) is still marked until 0.9.
    for (const [locale, ratio] of Object.entries(APP_I18N_LOCALE_TRANSLATED_RATIO)) {
      expect(isAppI18nTranslationInProgress(locale), locale).toBe(
        ratio < APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD,
      );
    }
    // No published asset at all is the extreme case of in progress, never "probably fine".
    expect(getAppI18nCompletenessRatio("cy")).toBe(0);
    expect(isAppI18nTranslationInProgress("cy")).toBe(true);
  });

  it("carries completeness and the in-progress flag onto every language option", () => {
    const options = getLanguageOptions("en");
    const byCode = new Map(options.map((option) => [option.code, option]));

    expect(byCode.get("de")?.translationInProgress).toBe(true);
    expect(byCode.get("de")?.completenessRatio).toBe(
      APP_I18N_LOCALE_TRANSLATED_RATIO.de,
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
