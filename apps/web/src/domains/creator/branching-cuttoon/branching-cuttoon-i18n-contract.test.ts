import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { findForbiddenAliases, registersInFlow, violatesErrorPattern } from "@/shared/language";
import { APP_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";
import { APP_I18N_ASSET_LOCALES } from "@/shared/lib/i18n-locale-catalog";
import { checkI18nNamespaceContract, type I18nNamespaceSnapshot } from "@/shared/lib/i18n-namespace-contract";

import { branchingCuttoonI18nBuiltins } from "./branching-cuttoon-i18n-builtins";

/**
 * 분기형 컷툰 화면의 문구는 키 기반 네임스페이스 `branchingCuttoon` 으로만 쓴다(apps/web/I18N_GUIDE.md).
 * 이 시험은 그 사전과 소스가 어긋나지 않게 한다: 소스가 쓰는 키가 모두 사전에 있고, 사전의 키가 모두 쓰이며, 값 자리표시({name})가
 * 호출과 사전에서 같고, 화면 소스에 한글 문구가 하드코딩돼 있지 않고, 한국어 문구가 말투·실패 안내·용어 가드를 지킨다.
 * (apps/web/src/shared/language 의 가드는 app·studio·admin 사전만 훑는다. 이 지연 등록 사전은 여기서 같은 기준으로 확인한다.)
 */

const folder = dirname(fileURLToPath(import.meta.url));
const assetFolder = fileURLToPath(new URL("../../../../public/i18n/app/branchingCuttoon/", import.meta.url));

type Dictionary = Readonly<Record<string, string>>;

function readDictionary(locale: string): Dictionary {
  return JSON.parse(readFileSync(join(assetFolder, `${locale}.json`), "utf8")) as Dictionary;
}

const ko = readDictionary("ko");
const en = readDictionary("en");
const KEYS = Object.keys(en);

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/gu;
const placeholdersOf = (text: string): string[] => [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ""))].sort();
const HANGUL = /[ㄱ-ㆎ가-힣]/u;

/** 낱말 없이 값 자리표시와 구분 기호로만 이뤄진 서식 문구. 한국어와 영어가 같고, 한글을 담지 않는다. */
const FORMAT_ONLY_KEYS: ReadonlySet<string> = new Set(["branchingCuttoon.player.trailStep"]);

/** 시험 도구와 시험 자체(__tests__ 폴더의 시험 자료 포함)는 화면 소스가 아니다. model/ 의 순수 모듈은 문구 없이 코드만 다루므로 그대로 훑는다. */
const isScreenSource = (name: string): boolean => /\.(ts|tsx)$/u.test(name) && !/\.test\.tsx?$/u.test(name) && !/-test-kit\.ts$/u.test(name);

function collectSources(dir: string): Array<{ readonly name: string; readonly code: string }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" || entry.name === "__tests__" ? [] : collectSources(path);
    if (!isScreenSource(entry.name)) return [];
    return [{ name: relative(folder, path), code: readFileSync(path, "utf8") }];
  });
}

const sources = collectSources(folder);

describe("branchingCuttoon 네임스페이스 — 자산", () => {
  it("매니페스트에 등록돼 있고 공용 계약(ko/en 정본 쌍·키 접두사·모든 로케일 자산)을 지킨다", () => {
    expect(APP_I18N_NAMESPACES).toContain("branchingCuttoon");
    const locales = readdirSync(assetFolder).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length)).sort();
    const snapshot: I18nNamespaceSnapshot = { namespace: "branchingCuttoon", locales, ko, en };
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
    for (const locale of APP_I18N_ASSET_LOCALES) {
      if (locale === "ko" || locale === "en") continue;
      for (const value of Object.values(readDictionary(locale))) expect(value).not.toMatch(HANGUL);
    }
  });

  it("생성된 내장 사전(지연 등록 묶음)이 네임스페이스 정본과 정확히 같다", () => {
    // scripts/generate-i18n-builtins.mjs 가 만든 파일이 오래되면 ko/en 화면이 정본과 다른 문구를 보인다.
    expect(branchingCuttoonI18nBuiltins.ko).toEqual(ko);
    expect(branchingCuttoonI18nBuiltins.en).toEqual(en);
  });
});

describe("branchingCuttoon 네임스페이스 — 문구", () => {
  it("ko 와 en 은 같은 키와 같은 자리표시를 가지고, 값에 앞뒤 공백이 없다", () => {
    expect(Object.keys(ko)).toEqual(KEYS);
    for (const key of KEYS) {
      expect(placeholdersOf(ko[key] ?? ""), key).toEqual(placeholdersOf(en[key] ?? ""));
      expect(ko[key], key).toBe((ko[key] ?? "").trim());
      expect(en[key], key).toBe((en[key] ?? "").trim());
      if (FORMAT_ONLY_KEYS.has(key)) {
        expect(ko[key], key).toBe(en[key]);
        expect((ko[key] ?? "").replace(PLACEHOLDER, "").replace(/[\s·|/→:,.-]/gu, ""), key).toBe("");
      } else {
        expect(ko[key], key).toMatch(HANGUL);
        expect(en[key], key).not.toMatch(HANGUL);
      }
    }
  });

  it("값 자리표시 바로 뒤에 받침에 따라 달라지는 조사를 붙이지 않는다(‘컷 2을’·‘장면 3과’ 방지)", () => {
    // 값은 숫자·장면 이름이라 받침을 알 수 없다. 조사는 받침이 항상 있는 낱말(개, 번, 자…) 뒤에 둔다.
    const bare = /\}(?:을|를|이|가|은|는|과|와|으로|로|이라|라)(?![가-힣])/u;
    expect(KEYS.filter((key) => bare.test(ko[key] ?? ""))).toEqual([]);
    expect(bare.test("컷 {order}을 앞으로")).toBe(true);
    expect(bare.test("{order}번 컷을 앞으로")).toBe(false);
  });

  it("같은 흐름(키의 앞 두 구간) 안에서 해요체와 합니다체가 섞이지 않는다", () => {
    const flows = new Map<string, string[]>();
    for (const key of KEYS) {
      const flow = key.split(".").slice(0, 2).join(".");
      flows.set(flow, [...(flows.get(flow) ?? []), ko[key] ?? ""]);
    }
    expect(flows.size).toBeGreaterThan(10);
    const mixed = [...flows].filter(([, texts]) => registersInFlow(texts).size > 1).map(([flow]) => flow);
    expect(mixed).toEqual([]);
  });

  it("실패 계열 문구에는 다음 행동 안내가 들어 있다(원인 + 다음 행동)", () => {
    expect(KEYS.filter((key) => violatesErrorPattern(ko[key] ?? "")).map((key) => `${key} = ${ko[key]}`)).toEqual([]);
  });

  it("용어 레지스트리의 금지 별칭(에셋·보관함 등)을 쓰지 않는다", () => {
    const found = KEYS.flatMap((key) => findForbiddenAliases(ko[key] ?? "").map((violation) => `${key}: ${violation.alias} → ${violation.canonical}`));
    expect(found).toEqual([]);
  });

  it("범위 밖 약속을 하지 않는다(서버 저장·통계·정산은 아직 없다고 밝히고, 있다고 말하지 않는다)", () => {
    expect(ko["branchingCuttoon.page.limitsNote"]).toContain("서버 저장, 독자 통계, 정산은 아직 없어요");
    expect(en["branchingCuttoon.page.limitsNote"]).toMatch(/not available yet|no .*yet|do not exist yet/iu);
    for (const key of KEYS) {
      expect(ko[key], key).not.toMatch(/자동 저장|클라우드|동기화|수익|정산 내역/u);
    }
  });
});

describe("branchingCuttoon 네임스페이스 — 소스와의 일치", () => {
  const keyLiteral = /["'`](branchingCuttoon\.[A-Za-z0-9.]+)["'`]/gu;
  const used = new Set(sources.flatMap((source) => [...source.code.matchAll(keyLiteral)].map((match) => match[1] ?? "")));

  it("소스가 쓰는 키는 모두 사전에 있고, 사전의 키는 모두 소스에서 쓰인다", () => {
    expect(sources.some((source) => source.name === "branching-cuttoon-copy.ts")).toBe(true);
    expect([...used].filter((key) => !(key in en)).sort()).toEqual([]);
    expect(KEYS.filter((key) => !used.has(key))).toEqual([]);
  });

  it('useBranchingT() 를 쓰는 화면 컴포넌트(.tsx)는 "use no memo" 로 시작한다', () => {
    // React Compiler 가 상수 키 t 호출을 t 의 정체성으로 캐시하면, 번역 번들이 나중에 도착해도 첫 그리기의 영어 폴백이 남는다(use-branching-t.ts).
    const components = sources.filter((source) => source.name.endsWith(".tsx") && /\buseBranchingT\(\)/u.test(source.code));
    expect(components.length).toBeGreaterThanOrEqual(8);
    expect(components.filter((source) => !/^["']use no memo["'];?\s/u.test(source.code)).map((source) => source.name)).toEqual([]);
  });

  it("화면 소스에 한글 문구가 하드코딩돼 있지 않다(문자열·템플릿·JSX 글, 주석은 제외)", () => {
    const hardcoded: string[] = [];
    for (const source of sources) {
      const sourceFile = ts.createSourceFile(source.name, source.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
          || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node);
        if (isText && HANGUL.test(node.getText(sourceFile))) {
          hardcoded.push(`${source.name}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(hardcoded).toEqual([]);
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
    expect(calls.length).toBeGreaterThan(80);
    const mismatches = calls.flatMap((call) =>
      call.provided === null
        ? []
        : call.keys.filter((key) => key in en && [...call.provided ?? []].sort().join() !== placeholdersOf(en[key] ?? "").join())
          .map((key) => `${call.where} ${key}: 넘긴 값 [${[...call.provided ?? []].sort().join()}] ≠ 자리표시 [${placeholdersOf(en[key] ?? "").join()}]`));
    expect(mismatches).toEqual([]);

    // 표(코드 → 키)로만 쓰이는 키는 값을 한꺼번에 넘기는 도우미(branching-cuttoon-copy.ts)가 채운다. 도우미가 넘기는 이름 안에서만 자리표시를 쓴다.
    const direct = new Set(calls.flatMap((call) => call.keys));
    const allowedByPrefix: ReadonlyArray<readonly [prefix: string, names: readonly string[]]> = [
      ["branchingCuttoon.issues.", ["title", "label", "target", "value", "cutId", "count", "max", "actual"]],
      ["branchingCuttoon.transfer.parse", ["path", "max"]],
      ["branchingCuttoon.editor.block", ["max"]],
    ];
    const outOfBounds = KEYS.filter((key) => !direct.has(key)).flatMap((key) => {
      const names = allowedByPrefix.find(([prefix]) => key.startsWith(prefix))?.[1] ?? [];
      return placeholdersOf(en[key] ?? "").filter((name) => !names.includes(name)).map((name) => `${key}: {${name}}`);
    });
    expect(outOfBounds).toEqual([]);
  });
});
