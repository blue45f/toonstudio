import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveTranslation } from "@/shared/lib/i18n";

const SKIP_KEY = "app.skipToContent";
const KO_LABEL = "본문으로 건너뛰기";
const EN_LABEL = "Skip to main content";

function readText(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

function readDictionary(relative: string): Record<string, string> {
  const parsed = JSON.parse(readText(relative)) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid dictionary: ${relative}`);
  }
  return parsed as Record<string, string>;
}

describe("AppShell skip link i18n", () => {
  it("renders the skip link label through the shell i18n key, not a hardcoded label", () => {
    const source = readText("./AppShell.tsx");
    expect(source).toContain(`t("${SKIP_KEY}")`);
    expect(source).not.toContain(KO_LABEL);
  });

  it("publishes the label in the app namespace ko/en assets", () => {
    const ko = readDictionary("../../public/i18n/app/app/ko.json");
    const en = readDictionary("../../public/i18n/app/app/en.json");
    expect(ko[SKIP_KEY]).toBe(KO_LABEL);
    expect(en[SKIP_KEY]).toBe(EN_LABEL);
  });

  it("compiles the label into the app-shell built-in dictionaries", () => {
    const builtins = JSON.parse(
      readText("../shared/i18n/generated/i18n-app-builtins.json"),
    ) as { ko: Record<string, string>; en: Record<string, string> };
    expect(builtins.ko[SKIP_KEY]).toBe(KO_LABEL);
    expect(builtins.en[SKIP_KEY]).toBe(EN_LABEL);
  });

  it("resolves the label per locale with the English fallback chain", () => {
    expect(resolveTranslation("ko", SKIP_KEY)).toBe(KO_LABEL);
    expect(resolveTranslation("en", SKIP_KEY)).toBe(EN_LABEL);
    // Locales without an authored value fall back to English, never to a raw key.
    expect(resolveTranslation("ja", SKIP_KEY)).toBe(EN_LABEL);
  });
});
