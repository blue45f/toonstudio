import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

// [wave7-stage1] App-shell builtins no longer compile these namespaces in.
// Their ko/en dictionaries are emitted as a separate generated bundle owned by the
// monetization domain (mirroring the Admin scope split below) and are registered
// synchronously when a monetization module is evaluated — see
// apps/web/src/domains/monetization/monetization-i18n.ts.
// Non-ko/en locales are unaffected: loadAppI18nLocale still fetches every
// APP_I18N_NAMESPACES asset from public/i18n/app at runtime.
//
// [wave7-stage2] The same split now covers four more namespaces whose consumers
// were census-verified (2026-10-14) to live only behind lazy route chunks:
//   guide            → apps/web/src/domains/catalog/GuidePage.tsx (only consumer)
//   extreview        → apps/web/src/domains/creator/production-hub/ProductionExternalReviewPage.tsx (only consumer)
//   creatorAnalytics → apps/web/src/domains/creator/analytics/* (8 files, all imported by CreatorAnalyticsPage)
//   copyright        → apps/web/src/domains/legal/CopyrightPage.tsx (only consumer)
// Each group below is emitted as its own generated bundle owned by the consuming
// domain and registered synchronously when that domain's entry page module is
// evaluated — see the matching *-i18n.ts next to each page. Registration must use
// both registerI18nLocaleEntries and registerI18nEnglishSourceEntries so the
// machine-translation source registry (seeded from these builtins) keeps the keys.
// Rollback: remove a group here and re-run; the leftover registration module then
// re-registers keys that are also in the shell builtins, a harmless duplicate.
//
// [wave7-stage3] Three more groups, census-verified 2026-10-14 against main:
//   account trio (account·settings·userProfile) → domains/account pages only:
//     AccountPage (account.* 43키 + settings.data.cancel), SettingsPage
//     (settings.* 대부분 + DeleteAccountSection의 account.* 3키),
//     UserProfilePage (userProfile.* 25키 전부). 전부 account.routes의 lazy 페이지.
//   search → catalog SearchPage + shared/components/search-explorer 패밀리 전용.
//     셸 헤더 검색은 nav.* 키를 쓰고 커맨드 팔레트는 command.* 를 쓰므로
//     (site-header.tsx·command-palette.tsx 실측) 셸 키 분할이 필요 없어 통째 이동한다.
//   share → shared/components/share-dialog.tsx 단일 초크포인트. 소비 버튼
//     (share-button·share-page-button)은 전부 lazy 라우트(TitleDetail·Ranking·
//     UserProfile 동적 import)에서만 쓰인다.
//   page 는 이번 단계에서 제외한다: page.events.* 36키 중 리터럴 소비가 확인된
//     것은 community-events-board 3키뿐이고 나머지는 이중언어 코드 정본·미확인
//     소비처가 섞여 있어, 소비처 전수 확인이 끝나기 전에는 이동하지 않는다.
const LAZY_APP_BUILTIN_GROUPS = [
  {
    id: "monetization",
    namespaces: ["membership", "paywall", "revenue", "tipping"],
    target: "apps/web/src/domains/monetization/i18n/generated/i18n-monetization-builtins.json",
  },
  {
    id: "guide",
    namespaces: ["guide"],
    target: "apps/web/src/domains/catalog/i18n/generated/i18n-guide-builtins.json",
  },
  {
    id: "extreview",
    namespaces: ["extreview"],
    target:
      "apps/web/src/domains/creator/production-hub/i18n/generated/i18n-extreview-builtins.json",
  },
  {
    id: "creator-analytics",
    namespaces: ["creatorAnalytics"],
    target:
      "apps/web/src/domains/creator/analytics/i18n/generated/i18n-creator-analytics-builtins.json",
  },
  {
    id: "copyright",
    namespaces: ["copyright"],
    target: "apps/web/src/domains/legal/i18n/generated/i18n-copyright-builtins.json",
  },
  {
    id: "account",
    namespaces: ["account", "settings", "userProfile"],
    target: "apps/web/src/domains/account/i18n/generated/i18n-account-builtins.json",
  },
  {
    id: "search",
    namespaces: ["search"],
    target: "apps/web/src/shared/i18n/generated/i18n-search-builtins.json",
  },
  {
    id: "share",
    namespaces: ["share"],
    target: "apps/web/src/shared/i18n/generated/i18n-share-builtins.json",
  },
];

const LAZY_APP_BUILTIN_NAMESPACES = new Set(
  LAZY_APP_BUILTIN_GROUPS.flatMap((group) => group.namespaces),
);

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
for (const group of LAZY_APP_BUILTIN_GROUPS) {
  const groupNamespaces = new Set(group.namespaces);
  sync(
    group.target,
    render("app", (namespace) => groupNamespaces.has(namespace)),
  );
}
sync("apps/web/src/domains/admin/i18n/generated/i18n-admin-builtins.json", render("admin"));
