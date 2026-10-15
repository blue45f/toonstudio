import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "../apps/web/public/i18n");
const shellOnlyKeys = new Set([
  "control.language.group.englishBase",
  "control.language.group.translated",
]);

/** Keep legacy readers compatible without replacing newer authored namespace copy. */
export function synchronizeLegacyI18nAssets(directory = root, { check = false } = {}) {
  const changed = [];
  const sync = (filename, dictionary) => {
    const contents = JSON.stringify(dictionary, null, 2) + "\n";
    let current;
    try { current = readFileSync(filename, "utf8"); }
    // 신규 네임스페이스의 로케일 자산은 아직 파일이 없다. 없는 파일은 항상 갱신 대상이다.
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (current === contents) return;
    changed.push(filename);
    if (!check) writeFileSync(filename, contents);
  };
  for (const bucket of ["app", "admin", "studio"]) {
    const base = path.join(directory, bucket);
    const namespaces = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const locales = readdirSync(base).filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5)).sort();
    const dictionaries = new Map();
    const owner = new Map();
    for (const locale of locales) {
      const parts = new Map();
      for (const namespace of namespaces) {
        const filename = path.join(base, namespace, locale + ".json");
        let dictionary;
        try { dictionary = JSON.parse(readFileSync(filename, "utf8")); }
        catch (error) { if (error.code === "ENOENT") continue; throw error; }
        parts.set(namespace, dictionary);
        for (const key of Object.keys(dictionary)) owner.set(key, namespace);
      }
      dictionaries.set(locale, parts);
    }
    // Recover keys stranded by a namespace migration; existing namespace values always win.
    for (const locale of locales) {
      const parts = dictionaries.get(locale);
      const merged = Object.assign({}, ...parts.values());
      const flat = JSON.parse(readFileSync(path.join(base, locale + ".json"), "utf8"));
      for (const [key, value] of Object.entries(flat)) {
        if (key in merged) continue;
        const namespace = owner.get(key) ?? key.split(".")[0];
        const part = parts.get(namespace);
        if (!part) throw new Error(`No existing namespace owns ${bucket}/${locale}/${key}`);
        part[key] = value;
        owner.set(key, namespace);
      }
    }
    // app·studio 묶음은 모든 로케일 팩이 같은 키 집합을 가진다(미번역 키는 영어 원문 폴백).
    // studio-i18n-loader.test.ts 가 75개 팩의 키 수를 한 값으로 고정한다. admin 은 ko/en 이 정본이고
    // 나머지 로케일은 부분 팩이라 채우지 않는다.
    if (bucket === "app" || bucket === "studio") {
      const reference = Object.assign({}, ...dictionaries.get("en").values());
      for (const locale of locales) {
        if (locale === "en" || locale === "ko") continue;
        const parts = dictionaries.get(locale);
        const merged = Object.assign({}, ...parts.values());
        for (const [key, value] of Object.entries(reference)) {
          if (key in merged || shellOnlyKeys.has(key)) continue;
          // Missing authored translations use the honest English fallback. The generated
          // coverage catalogue counts identical English strings as untranslated.
          const namespace = owner.get(key);
          if (!namespace) throw new Error(`Missing fallback namespace for ${locale}/${key}`);
          // ko/en만 먼저 작성한 신규 네임스페이스는 이 로케일 파일이 아직 없다.
          // I18N_GUIDE §3 절차대로 이 스크립트가 나머지 로케일 파일을 만든다.
          let part = parts.get(namespace);
          if (!part) {
            part = {};
            parts.set(namespace, part);
          }
          part[key] = value;
        }
        // 새로 만든 파일이 있어도 병합 순서는 네임스페이스 이름순으로 유지한다
        // (다시 실행해도 평면 자산이 달라지지 않게 하는 멱등성 조건).
        dictionaries.set(
          locale,
          new Map([...parts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
        );
      }
    }
    for (const locale of locales) {
      const parts = dictionaries.get(locale);
      for (const [namespace, dictionary] of parts) {
        sync(path.join(base, namespace, locale + ".json"), dictionary);
      }
      sync(path.join(base, locale + ".json"), Object.assign({}, ...parts.values()));
    }
  }
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const changed = synchronizeLegacyI18nAssets(root, { check });
  console.log(`[i18n-legacy] ${changed.length} ${check ? "out-of-sync" : "updated"} files`);
  if (check && changed.length) process.exitCode = 1;
}
