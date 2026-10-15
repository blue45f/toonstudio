import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { synchronizeLegacyI18nAssets } from "./sync-i18n-legacy-assets.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("recovers stranded translations, preserves newer namespace copy, and reports honest fallback coverage", () => {
  const root = mkdtempSync(join(tmpdir(), "i18n-legacy-contract-"));
  const write = (relative, value) => {
    const filename = join(root, relative);
    mkdirSync(join(filename, ".."), { recursive: true });
    writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
  };
  const read = (relative) => JSON.parse(readFileSync(join(root, relative), "utf8"));
  try {
    for (const locale of ["en", "ko", "ja"]) {
      write(`app/${locale}.json`, { "route.search": locale + " search", "route.home": "old" });
      write(`app/route/${locale}.json`, { "route.home": locale + " home", ...(locale === "en" ? { "route.share": "Share" } : {}) });
      write(`admin/${locale}.json`, { "admin.title": "old admin" });
      write(`admin/admin/${locale}.json`, { "admin.title": locale + " admin" });
      write(`studio/${locale}.json`, { "studio.commandBar.slot": "old slot" });
      write(`studio/commandBar/${locale}.json`, { "studio.commandBar.slot": locale + " {index}" });
      write(`studio/settings/${locale}.json`, { "studio.settings.tool.characterShaper": locale + " character shaper" });
    }
    const stale = synchronizeLegacyI18nAssets(root, { check: true });
    assert.ok(stale.length > 0);
    assert.equal(read("app/en.json")["route.home"], "old", "check mode must not write");
    synchronizeLegacyI18nAssets(root);
    assert.equal(read("app/route/ja.json")["route.search"], "ja search");
    assert.equal(read("app/ja.json")["route.home"], "ja home");
    assert.equal(read("app/ja.json")["route.share"], "Share", "English fallback must not masquerade as translated copy");
    assert.equal(read("admin/ja.json")["admin.title"], "ja admin");
    assert.deepEqual(read("studio/ja.json"), {
      "studio.commandBar.slot": "ja {index}",
      "studio.settings.tool.characterShaper": "ja character shaper",
    });
    assert.deepEqual(read("studio/commandBar/ja.json"), { "studio.commandBar.slot": "ja {index}" });
    assert.deepEqual(synchronizeLegacyI18nAssets(root, { check: true }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("I18N_GUIDE §3: ko/en만 작성한 신규 네임스페이스의 나머지 로케일 파일을 영어 폴백으로 만들고 다시 실행해도 같다", () => {
  const root = mkdtempSync(join(tmpdir(), "i18n-legacy-new-namespace-"));
  const write = (relative, value) => {
    const filename = join(root, relative);
    mkdirSync(join(filename, ".."), { recursive: true });
    writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
  };
  const read = (relative) => JSON.parse(readFileSync(join(root, relative), "utf8"));
  try {
    for (const locale of ["en", "ko", "ja"]) {
      // admin·studio 는 이 시나리오와 무관하지만 동기화는 세 묶음을 함께 훑는다.
      write(`admin/${locale}.json`, { "admin.title": locale + " admin" });
      write(`admin/admin/${locale}.json`, { "admin.title": locale + " admin" });
      write(`studio/${locale}.json`, { "studio.commandBar.slot": locale + " slot" });
      write(`studio/commandBar/${locale}.json`, { "studio.commandBar.slot": locale + " slot" });
      // 기존 네임스페이스(route)는 세 로케일 모두 파일이 있고, ja 는 이미 번역돼 있다.
      write(`app/route/${locale}.json`, { "route.home": locale === "ja" ? "ホーム" : locale + " home" });
      write(`app/${locale}.json`, { "route.home": locale === "ja" ? "ホーム" : locale + " home" });
    }
    // 신규 네임스페이스(market)는 정본 쌍(ko/en)만 있고 ja 파일이 없다. 평면 자산에는 아직 키가 없다.
    write("app/market/ko.json", { "market.title": "마켓", "market.empty": "비어 있어요" });
    write("app/market/en.json", { "market.title": "Market", "market.empty": "Nothing here" });

    // 예전에는 "Missing fallback namespace" 로 중단했다. 이제는 만들어야 할 파일로 보고한다.
    const stale = synchronizeLegacyI18nAssets(root, { check: true });
    assert.ok(stale.some((file) => file.endsWith(join("market", "ja.json"))), "누락된 ja 파일이 갱신 대상에 있어야 한다");
    assert.equal(existsSync(join(root, "app/market/ja.json")), false, "check 모드는 파일을 만들지 않는다");

    synchronizeLegacyI18nAssets(root);
    assert.deepEqual(read("app/market/ja.json"), {
      "market.title": "Market",
      "market.empty": "Nothing here",
    }, "번역이 없는 로케일은 영어 원문 폴백을 받는다");
    assert.equal(read("app/route/ja.json")["route.home"], "ホーム", "이미 번역된 값은 건드리지 않는다");
    assert.equal(read("app/ja.json")["market.title"], "Market", "평면 자산에도 새 키가 반영된다");
    assert.equal(read("app/ja.json")["route.home"], "ホーム");
    // 새로 만든 네임스페이스가 있어도 평면 자산의 병합 순서는 네임스페이스 이름순이다(다시 실행해도 변하지 않는 조건).
    assert.deepEqual(Object.keys(read("app/ja.json")), ["market.title", "market.empty", "route.home"]);
    assert.deepEqual(synchronizeLegacyI18nAssets(root, { check: true }), [], "두 번째 실행은 아무것도 바꾸지 않는다");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
