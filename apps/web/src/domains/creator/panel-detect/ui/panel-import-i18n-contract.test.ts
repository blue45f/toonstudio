import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { APP_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";
import { APP_I18N_ASSET_LOCALES } from "@/shared/lib/i18n-locale-catalog";
import { checkI18nNamespaceContract, type I18nNamespaceSnapshot } from "@/shared/lib/i18n-namespace-contract";

import { panelImportI18nBuiltins } from "../panel-import-i18n-builtins";
import { PANEL_IMPORT_RIGHTS_STATEMENT_KO } from "../panel-import-rights";

/**
 * 컷 가져오기 화면의 문구는 키 기반 네임스페이스 `panelImport` 로만 쓴다(apps/web/I18N_GUIDE.md).
 * 이 시험은 그 사전과 소스가 어긋나지 않게 한다: 소스가 쓰는 키가 모두 사전에 있고, 사전의 키가 모두 쓰이며, 값 자리표시({name})가
 * 호출과 사전에서 같고, 한국어 문구가 받침을 가리지 않는 조사 때문에 어색해지지 않는다.
 * (공용 계약 시험은 기반 브랜치에서 이미 다른 네임스페이스 때문에 실패 중일 수 있어, 이 네임스페이스만 독립으로 확인한다.)
 */

const ui = dirname(fileURLToPath(import.meta.url));
const panelFolder = join(ui, "..");
const assetFolder = fileURLToPath(new URL("../../../../../public/i18n/app/panelImport/", import.meta.url));

type Dictionary = Readonly<Record<string, string>>;

function readDictionary(locale: string): Dictionary {
  return JSON.parse(readFileSync(join(assetFolder, `${locale}.json`), "utf8")) as Dictionary;
}

const ko = readDictionary("ko");
const en = readDictionary("en");
const KEYS = Object.keys(en);

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/gu;
const placeholdersOf = (text: string): string[] => [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ""))].sort();

function collectSources(dir: string): Array<{ readonly name: string; readonly code: string }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : collectSources(path);
    if (!/\.(ts|tsx)$/u.test(entry.name) || /\.test\.tsx?$/u.test(entry.name)) return [];
    return [{ name: relative(panelFolder, path), code: readFileSync(path, "utf8") }];
  });
}

const sources = collectSources(panelFolder);

describe("panelImport 네임스페이스 — 자산", () => {
  it("매니페스트에 등록돼 있고 공용 계약(ko/en 정본 쌍·키 접두사·모든 로케일 자산)을 지킨다", () => {
    expect(APP_I18N_NAMESPACES).toContain("panelImport");
    const locales = readdirSync(assetFolder).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length)).sort();
    const snapshot: I18nNamespaceSnapshot = { namespace: "panelImport", locales, ko, en };
    expect(checkI18nNamespaceContract(snapshot, { assetLocales: APP_I18N_ASSET_LOCALES })).toEqual([]);
    expect(KEYS.length).toBeGreaterThan(200);
  });

  it("모든 로케일 자산이 같은 키 집합과 같은 자리표시를 가진다(번역이 채워져도 자리표시를 잃지 않는다)", () => {
    const problems: string[] = [];
    for (const locale of APP_I18N_ASSET_LOCALES) {
      const dictionary = readDictionary(locale);
      const keys = Object.keys(dictionary);
      if (keys.length !== KEYS.length || keys.some((key) => !(key in en))) problems.push(`${locale}: 키 집합이 en 과 다르다`);
      for (const key of KEYS) {
        const value = dictionary[key];
        if (typeof value !== "string" || value.length === 0) problems.push(`${locale}/${key}: 값이 비었다`);
        else if (placeholdersOf(value).join() !== placeholdersOf(en[key] ?? "").join()) problems.push(`${locale}/${key}: 자리표시가 en 과 다르다`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("번역되지 않은 로케일은 영어 원문을 그대로 받는다(지어낸 번역문이 없다)", () => {
    // 지금은 ko·en 만 사람이 쓴 정본이다. 다른 로케일의 값이 영어와 다르면 누군가 번역을 채운 것이므로 이 시험은 그 값을 검사하지
    // 않고(자리표시는 위 시험이 본다), 영어와 같은 값이 한글을 담고 있지 않다는 것만 확인한다.
    for (const locale of APP_I18N_ASSET_LOCALES) {
      if (locale === "ko" || locale === "en") continue;
      for (const value of Object.values(readDictionary(locale))) expect(value).not.toMatch(/[ㄱ-ㆎ가-힣]/u);
    }
  });

  it("생성된 내장 사전(지연 등록 묶음)이 네임스페이스 정본과 정확히 같다", () => {
    // scripts/generate-i18n-builtins.mjs 가 만든 파일이 오래되면 ko/en 화면이 정본과 다른 문구를 보인다.
    expect(panelImportI18nBuiltins.ko).toEqual(ko);
    expect(panelImportI18nBuiltins.en).toEqual(en);
  });
});

describe("panelImport 네임스페이스 — 문구", () => {
  it("ko 와 en 은 같은 키와 같은 자리표시를 가지고, 값에 앞뒤 공백이 없다", () => {
    expect(Object.keys(ko)).toEqual(KEYS);
    for (const key of KEYS) {
      expect(placeholdersOf(ko[key] ?? ""), key).toEqual(placeholdersOf(en[key] ?? ""));
      expect(ko[key], key).toBe((ko[key] ?? "").trim());
      expect(en[key], key).toBe((en[key] ?? "").trim());
      expect(ko[key], key).toMatch(/[ㄱ-ㆎ가-힣]/u);
      expect(en[key], key).not.toMatch(/[ㄱ-ㆎ가-힣]/u);
    }
  });

  it("권리 확인 문구의 한글 정본이 데이터 계층(결과물에 남는 기록)의 문구와 같다", () => {
    expect(ko["panelImport.attest.statement"]).toBe(PANEL_IMPORT_RIGHTS_STATEMENT_KO);
  });

  it("값 자리표시 바로 뒤에 받침에 따라 달라지는 조사를 붙이지 않는다(‘컷 2을’·‘카드 2과 3’ 방지)", () => {
    // 값은 숫자·파일 이름이라 받침을 알 수 없다. 조사는 받침이 항상 있는 낱말(번 컷, 번째 카드, 개, 장…) 뒤에 둔다.
    const bare = /\}(?:을|를|이|가|은|는|과|와|으로|로|이라|라)(?![가-힣])/u;
    expect(KEYS.filter((key) => bare.test(ko[key] ?? ""))).toEqual([]);
    // 시험이 잡을 줄 아는지 확인한다.
    expect(bare.test("컷 {order}을 앞으로")).toBe(true);
    expect(bare.test("{order}번 컷을 앞으로")).toBe(false);
  });
});

describe("panelImport 네임스페이스 — 소스와의 일치", () => {
  const keyLiteral = /["'`](panelImport\.[A-Za-z0-9.]+)["'`]/gu;
  const used = new Set(sources.flatMap((source) => [...source.code.matchAll(keyLiteral)].map((match) => match[1] ?? "")));

  it("소스가 쓰는 키는 모두 사전에 있고, 사전의 키는 모두 소스에서 쓰인다", () => {
    expect(sources.some((source) => source.name === join("ui", "panel-import-copy.ts"))).toBe(true);
    expect([...used].filter((key) => !(key in en)).sort()).toEqual([]);
    expect(KEYS.filter((key) => !used.has(key))).toEqual([]);
  });

  it('usePanelT() 를 쓰는 화면 컴포넌트(.tsx)는 "use no memo" 로 시작한다', () => {
    // React Compiler 가 상수 키 t 호출 호출을 t 의 정체성으로 캐시하면, 번역 번들이 나중에 도착해도 첫 그리기의 영어 폴백이 남는다(use-panel-t.ts).
    const components = sources.filter((source) => source.name.endsWith(".tsx") && /\busePanelT\(\)/u.test(source.code));
    expect(components.length).toBeGreaterThanOrEqual(15);
    expect(components.filter((source) => !/^["']use no memo["'];?\s/u.test(source.code)).map((source) => source.name)).toEqual([]);
  });

  it("t(키, 값) 호출이 넘기는 값 이름이 사전의 자리표시와 같다", () => {
    interface Call { readonly where: string; readonly keys: readonly string[]; readonly provided: readonly string[] | null }
    const calls: Call[] = [];
    const literalKeys = (node: ts.Expression): string[] | null => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
      if (ts.isConditionalExpression(node)) {
        const left = literalKeys(node.whenTrue);
        const right = literalKeys(node.whenFalse);
        return left && right ? [...left, ...right] : null;
      }
      return null;
    };
    for (const source of sources) {
      const sourceFile = ts.createSourceFile(source.name, source.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t" && node.arguments[0]) {
          const keys = literalKeys(node.arguments[0]);
          if (keys) {
            const values = node.arguments[1];
            let provided: string[] | null = [];
            if (values) {
              provided = ts.isObjectLiteralExpression(values) && values.properties.every((property) => ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property))
                ? values.properties.map((property) => (ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property) ? property.name.getText(sourceFile) : ""))
                : null;
            }
            calls.push({ where: `${source.name}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`, keys, provided });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(calls.length).toBeGreaterThan(100);
    const mismatches = calls.flatMap((call) =>
      call.provided === null
        ? []
        : call.keys.filter((key) => key in en && [...call.provided ?? []].sort().join() !== placeholdersOf(en[key] ?? "").join())
          .map((key) => `${call.where} ${key}: 넘긴 값 [${[...call.provided ?? []].sort().join()}] ≠ 자리표시 [${placeholdersOf(en[key] ?? "").join()}]`));
    expect(mismatches).toEqual([]);

    // 표(코드 → 키)로만 쓰이는 키는 값을 넘길 수 없으므로 자리표시가 없어야 한다.
    const direct = new Set(calls.flatMap((call) => call.keys));
    const tableOnly = KEYS.filter((key) => !direct.has(key));
    expect(tableOnly.filter((key) => placeholdersOf(en[key] ?? "").length > 0)).toEqual([]);
  });
});
