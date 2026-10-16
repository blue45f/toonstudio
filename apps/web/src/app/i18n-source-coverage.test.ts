import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { i18nDict } from "@/shared/lib/i18n";
// 지연 사전 묶음: 셸 내장 사전에서 분리된 네임스페이스는 소비 모듈이 평가될 때 동기 등록된다
// (scripts/generate-i18n-builtins.mjs 의 LAZY_APP_BUILTIN_GROUPS 와 한 쌍이다). 분리 단계가
// 늘어나면 이 목록에도 등록 모듈을 더해야 이 테스트가 그 키들을 계속 지켜 준다.
import "@/domains/account/account-i18n";
import "@/domains/catalog/guide-i18n";
import "@/domains/creator/analytics/creator-analytics-i18n";
import "@/domains/creator/production-hub/extreview-i18n";
import "@/domains/legal/copyright-i18n";
import "@/domains/monetization/monetization-i18n";
import "@/shared/components/search-i18n";
import "@/shared/components/share-i18n";
import "@/domains/creator/studio-app-settings-center-i18n";
import "@/domains/creator/panel-detect/panel-import-i18n";
import "@/domains/creator/reader-preview/reader-preview-i18n";
import "@/domains/legal/creator-support-i18n";
import "@/domains/legal/support-us-i18n";

function collectSourceI18nKeys(): Set<string> {
  // App-level integration covers all domains without a shared-to-domain import.
  const webSrcRoot = fileURLToPath(new URL("../", import.meta.url));
  const roots = [webSrcRoot];
  const visited = new Set<string>();
  const used = new Set<string>();
  const keyRe = /\bt\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

  const walk = (dir: string): void => {
    if (visited.has(dir)) return;
    visited.add(dir);

    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === "__tests__") continue;

      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }

      if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(full))) continue;
      if (/\.(?:test|spec)\.[jt]sx?$/u.test(name)) continue;

      const text = readFileSync(full, "utf8");
      for (const match of text.matchAll(keyRe)) {
        const key = match[1];
        if (!key.includes("${")) used.add(key);
      }
    }
  };

  for (const root of roots) {
    walk(root);
  }

  return used;
}

function readRouteDictionary(relativePath: string): Record<string, string> {
  const parsed = JSON.parse(readFileSync(relativePath, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid route dictionary: ${relativePath}`);
  }
  return parsed as Record<string, string>;
}


describe("app and lazy route translation coverage", () => {
  it("keeps every t() key covered by its shell or lazy route dictionaries", () => {
    const usedKeys = collectSourceI18nKeys();
    expect(usedKeys.size).toBeGreaterThan(200);
    const shellKeys = new Set([...Object.keys(i18nDict.ko), ...Object.keys(i18nDict.en)]);
    const adminEn = readRouteDictionary("apps/web/public/i18n/admin/en.json");
    const adminKo = readRouteDictionary("apps/web/public/i18n/admin/ko.json");
    const adminKeys = [...usedKeys].filter((key) => key.startsWith("admin."));
    const shellMissing = [...usedKeys]
      .filter((key) => !key.startsWith("admin.") && !shellKeys.has(key))
      .sort();
    const adminEnMissing = adminKeys.filter((key) => !adminEn[key]).sort();
    const adminKoMissing = adminKeys.filter((key) => !adminKo[key]).sort();

    expect({ shellMissing, adminEnMissing, adminKoMissing }).toEqual({
      shellMissing: [],
      adminEnMissing: [],
      adminKoMissing: [],
    });
  });

});
